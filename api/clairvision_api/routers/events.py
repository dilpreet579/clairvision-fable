import uuid
from datetime import datetime, timezone

import redis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from clairvision_shared.db.enums import EventStatus, EventVisibility
from clairvision_shared.db.models import Event, Organizer
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

router = APIRouter(prefix="/events", tags=["events"])


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


@router.post("", response_model=EventRead, status_code=201)
def create_event(
    payload: EventCreate,
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
    db: Session = Depends(get_db),
    r: redis.Redis = Depends(get_redis),
    _organizer: Organizer = Depends(require_organizer),
) -> None:
    """Full teardown. Order matters: Redis purge, then enqueue the FAISS
    directory removal (worker-only — the API's faiss_indexes mount is
    read-only), then evict the in-memory index, and only then commit the
    DB delete. If the enqueue fails we abort before the commit so the
    event row survives for a retry."""
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
    db.delete(event)  # FK ondelete=CASCADE sweeps images/faces/embeddings/errors
    db.commit()
