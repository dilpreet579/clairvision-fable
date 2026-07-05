"""Structurally-public endpoints: the published-events directory and the
slug resolver. Deliberately a separate router from events.py so the public
surface can never leak drafts via an auth-branching bug — the directory
query is published-only by construction, and the response model
(PublicEventSummary) has no source_url/error_message/pipeline fields.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from clairvision_shared.db.enums import EventVisibility
from clairvision_shared.db.models import Event, Organizer
from clairvision_shared.schemas import PublicEventSummary

from ..auth_deps import get_current_organizer_optional
from ..deps import get_db

router = APIRouter(tags=["public"])


@router.get("/events/directory", response_model=list[PublicEventSummary])
def public_directory(db: Session = Depends(get_db)) -> list[Event]:
    return (
        db.query(Event)
        .filter(Event.visibility == EventVisibility.PUBLISHED)
        .order_by(Event.published_at.desc())
        .all()
    )


@router.get("/e/{slug}", response_model=PublicEventSummary)
def resolve_slug(
    slug: str,
    db: Session = Depends(get_db),
    organizer: Organizer | None = Depends(get_current_organizer_optional),
) -> Event:
    """Public pages call this once at load to turn the shared link's slug
    into an event id; everything downstream stays on the id-based
    endpoints. Same 404-not-403 rule as require_published_or_organizer."""
    event = db.query(Event).filter(Event.slug == slug).one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    if event.visibility == EventVisibility.PUBLISHED or organizer is not None:
        return event
    raise HTTPException(status_code=404, detail="event not found")
