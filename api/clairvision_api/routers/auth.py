"""Organizer authentication: login/logout/me, forgot/reset password,
accept-invite. Invite issuance itself lives in routers/organizers.py."""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete
from sqlalchemy.orm import Session

from clairvision_shared.auth.passwords import hash_password, verify_password
from clairvision_shared.auth.tokens import generate_raw_token, hash_token
from clairvision_shared.config import get_settings
from clairvision_shared.db.enums import AuthTokenPurpose
from clairvision_shared.db.models import AuthToken, Organizer, OrganizerSession
from clairvision_shared.schemas import (
    AcceptInviteRequest,
    ForgotPasswordRequest,
    LoginRequest,
    OrganizerRead,
    ResetPasswordRequest,
)

from ..auth_deps import get_current_organizer_optional, require_organizer
from ..deps import get_db
from ..services.email_service import EmailSendError, send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# Simple in-process brute-force limiter for /auth/login — consistent with
# this codebase's existing "simple in-process limiter is fine" posture.
# Not distributed (per-process), which is acceptable for a single-instance
# API; revisit only if the API ever scales horizontally.
_LOGIN_MAX_FAILURES = 5
_LOGIN_WINDOW_SECONDS = 300
_login_failures: dict[str, list[float]] = {}


def _login_blocked(key: str) -> bool:
    import time

    now = time.monotonic()
    failures = [t for t in _login_failures.get(key, []) if now - t < _LOGIN_WINDOW_SECONDS]
    _login_failures[key] = failures
    return len(failures) >= _LOGIN_MAX_FAILURES


def _record_login_failure(key: str) -> None:
    import time

    _login_failures.setdefault(key, []).append(time.monotonic())


def _set_session_cookie(response: Response, session_id: uuid.UUID) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=str(session_id),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.session_cookie_samesite,
        max_age=settings.session_ttl_seconds,
        path="/",
    )


def _consume_token(db: Session, raw_token: str, purpose: AuthTokenPurpose) -> AuthToken:
    """Shared verify-and-consume logic for both invite and reset tokens."""
    token = (
        db.query(AuthToken)
        .filter(AuthToken.token_hash == hash_token(raw_token), AuthToken.purpose == purpose)
        .one_or_none()
    )
    if (
        token is None
        or token.used_at is not None
        or token.expires_at <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=400, detail="invalid or expired token")
    token.used_at = datetime.now(timezone.utc)
    return token


@router.post("/login", response_model=OrganizerRead)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> Organizer:
    email = payload.email.lower().strip()
    if _login_blocked(email):
        raise HTTPException(
            status_code=429, detail="too many failed attempts — try again later"
        )

    organizer = db.query(Organizer).filter(Organizer.email == email).one_or_none()
    # Generic error for both wrong-email and wrong-password — no
    # enumeration via the login form itself.
    if (
        organizer is None
        or not organizer.is_active
        or organizer.password_hash is None
        or not verify_password(payload.password, organizer.password_hash)
    ):
        _record_login_failure(email)
        raise HTTPException(status_code=401, detail="invalid email or password")

    settings = get_settings()
    session = OrganizerSession(
        organizer_id=organizer.id,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.session_ttl_seconds),
    )
    db.add(session)
    db.commit()
    _set_session_cookie(response, session.id)
    return organizer


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    _organizer: Organizer = Depends(require_organizer),
    db: Session = Depends(get_db),
) -> None:
    settings = get_settings()
    session_id = request.cookies.get(settings.session_cookie_name)
    if session_id:
        db.execute(delete(OrganizerSession).where(OrganizerSession.id == session_id))
        db.commit()
    response.delete_cookie(key=settings.session_cookie_name, path="/")
    return None


@router.get("/me", response_model=OrganizerRead)
def me(organizer: Organizer | None = Depends(get_current_organizer_optional)) -> Organizer:
    if organizer is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return organizer


@router.post("/forgot-password", status_code=202)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> None:
    settings = get_settings()
    organizer = (
        db.query(Organizer).filter(Organizer.email == payload.email.lower().strip()).one_or_none()
    )
    # Always 202 regardless of match — anti-enumeration.
    if organizer is not None:
        raw = generate_raw_token()
        db.add(
            AuthToken(
                organizer_id=organizer.id,
                token_hash=hash_token(raw),
                purpose=AuthTokenPurpose.PASSWORD_RESET,
                expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=settings.password_reset_token_ttl_seconds),
            )
        )
        db.commit()
        try:
            send_password_reset_email(organizer.email, raw)
        except EmailSendError:
            # Unlike invite, a send failure here must NOT surface: the
            # response must be indistinguishable from the no-such-email
            # case (anti-enumeration), so log and stay 202.
            logger.exception("password-reset email send failed")
    return None


@router.post("/reset-password", status_code=204)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> None:
    token = _consume_token(db, payload.token, AuthTokenPurpose.PASSWORD_RESET)
    organizer = db.get(Organizer, token.organizer_id)
    organizer.password_hash = hash_password(payload.new_password)
    # Resetting successfully proves email ownership just as validly as
    # accepting an invite would — activate a still-pending invitee too.
    organizer.is_active = True
    db.execute(delete(OrganizerSession).where(OrganizerSession.organizer_id == organizer.id))
    db.commit()
    return None


@router.post("/accept-invite", status_code=204)
def accept_invite(payload: AcceptInviteRequest, db: Session = Depends(get_db)) -> None:
    token = _consume_token(db, payload.token, AuthTokenPurpose.INVITE)
    organizer = db.get(Organizer, token.organizer_id)
    organizer.password_hash = hash_password(payload.password)
    organizer.is_active = True
    db.commit()
    return None
