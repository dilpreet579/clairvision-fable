"""Organizer session dependencies — sibling to deps.py, kept separate
since this is auth-specific and grows independently.

Session is DB-backed (organizer_sessions table): deleting a row is an
instant, real revocation, at the cost of one indexed PK lookup per
authenticated request — negligible at this team's scale. See
LESSONS/plan for why this beats a self-contained JWT here.
"""
import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from clairvision_shared.config import get_settings
from clairvision_shared.db.enums import EventVisibility
from clairvision_shared.db.models import Event, Organizer, OrganizerSession

from .deps import get_db


def get_current_organizer_optional(
    request: Request, db: Session = Depends(get_db)
) -> Organizer | None:
    """Reads the session cookie; returns None (never raises) if
    absent/invalid/expired — the building block both the hard organizer
    gate and the published-or-organizer gate compose from."""
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        return None
    session = (
        db.query(OrganizerSession)
        .filter(OrganizerSession.id == token, OrganizerSession.expires_at > func.now())
        .one_or_none()
    )
    if session is None:
        return None
    organizer = db.get(Organizer, session.organizer_id)
    if organizer is None or not organizer.is_active:
        return None
    return organizer


def require_organizer(
    organizer: Organizer | None = Depends(get_current_organizer_optional),
) -> Organizer:
    """Hard-gates organizer-only endpoints."""
    if organizer is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return organizer


def require_published_or_organizer(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    organizer: Organizer | None = Depends(get_current_organizer_optional),
) -> Event:
    """The core rule for every viewer-facing endpoint: 404 (not 403) for
    unpublished/archived events unless the requester is an authenticated
    organizer previewing it — never reveal that an unpublished event
    exists to an anonymous prober."""
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    if event.visibility == EventVisibility.PUBLISHED or organizer is not None:
        return event
    raise HTTPException(status_code=404, detail="event not found")
