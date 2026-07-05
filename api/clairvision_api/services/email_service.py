"""Transactional email via Resend — invite and password-reset links only.

Plain inline HTML+text, no template engine (matches the minimalist
ethos). The auth-token row is always committed BEFORE the send is
attempted, so a failed send never strands a half-issued invite: the
caller surfaces the error and the operation is safely re-triggerable.
"""
import logging

import resend

from clairvision_shared.config import get_settings

logger = logging.getLogger(__name__)


class EmailSendError(Exception):
    """Send failed (bad config, Resend outage, rejected address)."""


def _send(to: str, subject: str, text: str, html: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        raise EmailSendError("RESEND_API_KEY is not configured")
    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.resend_from_address,
                "to": [to],
                "subject": subject,
                "text": text,
                "html": html,
            }
        )
    except Exception as exc:
        raise EmailSendError(str(exc)) from exc


def send_invite_email(to: str, raw_token: str) -> None:
    url = f"{get_settings().public_app_url}/accept-invite?token={raw_token}"
    days = get_settings().invite_token_ttl_seconds // 86400
    _send(
        to,
        subject="You're invited to ClairVision",
        text=(
            "You've been invited to join ClairVision as an event organizer.\n\n"
            f"Set your password to activate your account:\n{url}\n\n"
            f"This link expires in {days} days. If you weren't expecting this "
            "invitation, you can ignore this email."
        ),
        html=(
            "<p>You've been invited to join <strong>ClairVision</strong> as an "
            "event organizer.</p>"
            f'<p><a href="{url}">Set your password to activate your account</a></p>'
            f"<p>This link expires in {days} days. If you weren't expecting "
            "this invitation, you can ignore this email.</p>"
        ),
    )


def send_password_reset_email(to: str, raw_token: str) -> None:
    url = f"{get_settings().public_app_url}/reset-password?token={raw_token}"
    minutes = get_settings().password_reset_token_ttl_seconds // 60
    _send(
        to,
        subject="Reset your ClairVision password",
        text=(
            "A password reset was requested for your ClairVision account.\n\n"
            f"Choose a new password here:\n{url}\n\n"
            f"This link expires in {minutes} minutes. If you didn't request "
            "this, you can ignore this email — your password is unchanged."
        ),
        html=(
            "<p>A password reset was requested for your ClairVision account.</p>"
            f'<p><a href="{url}">Choose a new password</a></p>'
            f"<p>This link expires in {minutes} minutes. If you didn't request "
            "this, you can ignore this email — your password is unchanged.</p>"
        ),
    )
