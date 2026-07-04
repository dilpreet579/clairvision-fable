import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from clairvision_shared.db.models import Event
from clairvision_shared.io.source_fetcher import (
    BlockedURLError,
    SourceFetchError,
    validate_source_url,
)
from clairvision_shared.schemas import EventCreate, EventRead

from ..celery_client import enqueue_orchestrate_event
from ..deps import get_db

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventRead, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db)) -> Event:
    # SSRF gate before anything touches the URL — reject at the door, not
    # after the worker has already tried to fetch it.
    try:
        validate_source_url(payload.source_url)
    except BlockedURLError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except SourceFetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    event = Event(name=payload.name, source_url=payload.source_url)
    db.add(event)
    db.commit()
    enqueue_orchestrate_event(str(event.id))
    return event


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db)) -> list[Event]:
    return db.query(Event).order_by(Event.created_at.desc()).all()


@router.get("/{event_id}", response_model=EventRead)
def get_event(event_id: uuid.UUID, db: Session = Depends(get_db)) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event
