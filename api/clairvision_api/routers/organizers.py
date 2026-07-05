"""Team management: invite a new organizer, list the team.

Invite flow: create (or reuse) a pending Organizer row, commit an invite
token, THEN attempt the Resend send. A failed send surfaces a real error
to the inviting organizer — re-inviting the same still-pending email
refreshes the token rather than piling up duplicates, so retry is safe.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.orm import Session

from clairvision_shared.auth.tokens import generate_raw_token, hash_token
from clairvision_shared.config import get_settings
from clairvision_shared.db.enums import AuthTokenPurpose
from clairvision_shared.db.models import AuthToken, Organizer
from clairvision_shared.schemas import InviteOrganizerRequest, OrganizerRead

from ..auth_deps import require_organizer
from ..deps import get_db
from ..services.email_service import EmailSendError, send_invite_email

router = APIRouter(prefix="/organizers", tags=["organizers"])


@router.get("", response_model=list[OrganizerRead])
def list_organizers(
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> list[Organizer]:
    return db.query(Organizer).order_by(Organizer.created_at).all()


@router.post("/invite", response_model=OrganizerRead, status_code=202)
def invite_organizer(
    payload: InviteOrganizerRequest,
    db: Session = Depends(get_db),
    inviter: Organizer = Depends(require_organizer),
) -> Organizer:
    email = payload.email.lower().strip()
    existing = db.query(Organizer).filter(Organizer.email == email).one_or_none()
    if existing is not None and existing.is_active:
        raise HTTPException(status_code=409, detail="organizer already active")

    if existing is None:
        invitee = Organizer(email=email, is_active=False, invited_by_id=inviter.id)
        db.add(invitee)
        db.flush()
    else:
        invitee = existing  # pending re-invite: refresh the token below

    # One live invite token per invitee: sweep unused older ones so a
    # re-invite invalidates the previous link instead of stacking links.
    db.execute(
        delete(AuthToken).where(
            AuthToken.organizer_id == invitee.id,
            AuthToken.purpose == AuthTokenPurpose.INVITE,
            AuthToken.used_at.is_(None),
        )
    )
    raw = generate_raw_token()
    db.add(
        AuthToken(
            organizer_id=invitee.id,
            token_hash=hash_token(raw),
            purpose=AuthTokenPurpose.INVITE,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=get_settings().invite_token_ttl_seconds),
        )
    )
    # Commit BEFORE the send: a failed send must never strand a
    # half-issued invite — the token survives and retry just works.
    db.commit()

    try:
        send_invite_email(email, raw)
    except EmailSendError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"invite created but the email failed to send ({exc}) — "
            "re-invite to retry",
        )
    return invitee
