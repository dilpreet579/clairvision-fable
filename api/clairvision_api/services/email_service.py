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
                "reply_to": settings.resend_from_address,
                "to": [to],
                "subject": subject,
                "text": text,
                "html": html,
            }
        )
    except Exception as exc:
        raise EmailSendError(str(exc)) from exc


def _wrap_html(content: str) -> str:
    """Wraps email content in a dark-mode ClairVision branded HTML template with inline styles."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f0d0a; color: #ede8e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 40px;">
                <span style="font-family: Georgia, serif; font-size: 24px; font-style: italic; letter-spacing: 1px; color: #ede8e1;">ClairVision</span>
            </div>
            <div style="background-color: #1b1712; border: 1px solid #2e2921; border-radius: 12px; padding: 40px; text-align: center;">
                {content}
            </div>
            <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #6f685f;">
                <p style="margin: 0;">This email was sent by ClairVision.</p>
                <p style="margin: 4px 0 0 0;">If you didn't request this, you can safely ignore it.</p>
            </div>
        </div>
    </body>
    </html>
    """

def send_invite_email(to: str, raw_token: str) -> None:
    url = f"{get_settings().public_app_url}/accept-invite?token={raw_token}"
    days = get_settings().invite_token_ttl_seconds // 86400
    
    html_content = (
        "<p style='margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #9a9189;'>"
        "You've been invited to join <strong style='color: #ede8e1; font-weight: 500;'>ClairVision</strong> as an event organizer."
        "</p>"
        f"<a href='{url}' style='display: inline-block; background-color: #d9a05b; color: #0f0d0a; text-decoration: none; font-size: 14px; font-weight: 500; padding: 12px 24px; border-radius: 99px; margin-bottom: 24px;'>Accept Invitation</a>"
        f"<p style='margin: 0; font-size: 13px; color: #6f685f;'>This link expires in {days} days.</p>"
    )

    _send(
        to,
        subject="You're invited to ClairVision",
        text=(
            "You've been invited to join ClairVision as an event organizer.\n\n"
            f"Set your password to activate your account:\n{url}\n\n"
            f"This link expires in {days} days. If you weren't expecting this "
            "invitation, you can ignore this email."
        ),
        html=_wrap_html(html_content),
    )


def send_password_reset_email(to: str, raw_token: str) -> None:
    url = f"{get_settings().public_app_url}/reset-password?token={raw_token}"
    minutes = get_settings().password_reset_token_ttl_seconds // 60

    html_content = (
        "<p style='margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #9a9189;'>"
        "A password reset was requested for your <strong style='color: #ede8e1; font-weight: 500;'>ClairVision</strong> account."
        "</p>"
        f"<a href='{url}' style='display: inline-block; background-color: #d9a05b; color: #0f0d0a; text-decoration: none; font-size: 14px; font-weight: 500; padding: 12px 24px; border-radius: 99px; margin-bottom: 24px;'>Reset Password</a>"
        f"<p style='margin: 0; font-size: 13px; color: #6f685f;'>This link expires in {minutes} minutes.</p>"
    )

    _send(
        to,
        subject="Reset your ClairVision password",
        text=(
            "A password reset was requested for your ClairVision account.\n\n"
            f"Choose a new password here:\n{url}\n\n"
            f"This link expires in {minutes} minutes. If you didn't request "
            "this, you can ignore this email — your password is unchanged."
        ),
        html=_wrap_html(html_content),
    )
