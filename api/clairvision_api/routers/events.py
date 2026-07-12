import shutil
import uuid
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from clairvision_shared.db.enums import EventStatus, EventVisibility
from clairvision_shared.db.models import Event, Organizer
from clairvision_shared.faiss_paths import event_index_dir
from clairvision_shared.faiss_s3 import delete_face_index
from clairvision_shared.io.source_fetcher import (
    BlockedURLError,
    SourceFetchError,
    validate_source_url,
)
from clairvision_shared.schemas import EventCreate, EventRead, EventUpdate
from clairvision_shared.slugs import slugify, unique_slug

from ..auth_deps import require_organizer
from ..celery_client import enqueue_delete_event_index, enqueue_orchestrate_event
from ..deps import get_db, get_redis
from ..services import image_cache_service as cache
from ..services.faiss_manager import get_manager
from ..services.pipeline_vm_service import ensure_pipeline_worker_running

router = APIRouter(prefix="/events", tags=["events"])


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


@router.post("", response_model=EventRead, status_code=201)
def create_event(
    payload: EventCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> Event:
    # SSRF gate before anything touches the URL — reject at the door, not
    # after the worker has already tried to fetch it.
    try:
        validate_source_url(payload.source_url)
    except BlockedURLError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except SourceFetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    event = Event(
        name=payload.name,
        source_url=payload.source_url,
        slug=unique_slug(db, slugify(payload.name)),
    )
    db.add(event)
    db.commit()
    enqueue_orchestrate_event(str(event.id))
    # Runs after the response is sent — zero added latency, and any
    # exception stays isolated here (the function itself never raises too).
    background_tasks.add_task(ensure_pipeline_worker_running)
    return event


@router.get("", response_model=list[EventRead])
def list_events(
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> list[Event]:
    """Dashboard listing — all visibilities. The public directory is the
    separate, structurally-public /events/directory path (Phase D)."""
    return db.query(Event).order_by(Event.created_at.desc()).all()


@router.get("/{event_id}", response_model=EventRead)
def get_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> Event:
    return _get_event_or_404(db, event_id)


@router.patch("/{event_id}", response_model=EventRead)
def update_event(
    event_id: uuid.UUID,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> Event:
    """Rename and/or explicit slug edit. A name-only rename never silently
    reslugs — that would break a public link someone already shared."""
    event = _get_event_or_404(db, event_id)
    if payload.name is not None:
        event.name = payload.name
    if payload.slug is not None:
        # Re-slugify the submitted slug: guarantees URL-safety even when
        # the organizer hand-types it (slugify falls back to "event" for
        # all-symbol input, so base is never empty).
        base = slugify(payload.slug)
        if base != event.slug:
            event.slug = unique_slug(db, base, exclude_event_id=event.id)
    db.commit()
    return event


@router.post("/{event_id}/publish", response_model=EventRead)
def publish_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> Event:
    event = _get_event_or_404(db, event_id)
    # Pipeline `ready` is a prerequisite for publishing, not a synonym —
    # visibility is the organizer's explicit call (plan decision 8).
    if event.status != EventStatus.READY:
        raise HTTPException(status_code=409, detail="event pipeline is not ready")
    if event.visibility != EventVisibility.PUBLISHED:
        event.visibility = EventVisibility.PUBLISHED
        event.published_at = datetime.now(timezone.utc)
        db.commit()
    return event


@router.post("/{event_id}/archive", response_model=EventRead)
def archive_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> Event:
    event = _get_event_or_404(db, event_id)
    if event.visibility != EventVisibility.ARCHIVED:
        event.visibility = EventVisibility.ARCHIVED
        db.commit()
    return event


@router.post("/{event_id}/unarchive", response_model=EventRead)
def unarchive_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> Event:
    """Back to DRAFT, deliberately not straight to PUBLISHED — re-exposing
    to the public should always be an explicit publish click."""
    event = _get_event_or_404(db, event_id)
    if event.visibility == EventVisibility.ARCHIVED:
        event.visibility = EventVisibility.DRAFT
        db.commit()
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    r: redis.Redis = Depends(get_redis),
    _organizer: Organizer = Depends(require_organizer),
) -> None:
    """Full teardown. Order matters: Redis purge, then enqueue the pipeline-
    side FAISS directory removal (still useful when a worker happens to be
    up — e.g. local dev), then evict the in-memory index, then clear both
    durable copies directly from the API itself (local dir + S3 object) so
    cleanup doesn't silently depend on a pipeline worker being alive — the
    on-demand worker is usually NOT running by the time an organizer gets
    around to deleting an old event, since it self-terminates once idle.
    Discovered live: a deleted event left its FAISS index orphaned in S3
    because the enqueued Celery task just sat in an empty queue forever.
    If the enqueue fails we abort before the commit so the event row
    survives for a retry."""
    event = _get_event_or_404(db, event_id)
    cache.purge_event_cache(r, event.id)
    try:
        enqueue_delete_event_index(str(event.id))
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="could not schedule index cleanup; event not deleted — retry",
        )
    get_manager().invalidate(str(event.id))
    shutil.rmtree(event_index_dir(str(event.id)), ignore_errors=True)
    background_tasks.add_task(delete_face_index, str(event.id))
    db.delete(event)  # FK ondelete=CASCADE sweeps images/faces/embeddings/errors
    db.commit()
