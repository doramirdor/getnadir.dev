"""
Resend email service for Nadir (getnadir.com).

Keep this isolated from any other project's email config. The sender domain
must be a getnadir.com address verified in this account's Resend dashboard.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
_FORBIDDEN_FROM_SUBSTRINGS = ("commareports",)


class EmailServiceError(Exception):
    """Raised when the email provider rejects the send."""


def _validate_from_address(from_addr: str) -> None:
    lowered = from_addr.lower()
    for needle in _FORBIDDEN_FROM_SUBSTRINGS:
        if needle in lowered:
            raise EmailServiceError(
                f"Refusing to send: from-address '{from_addr}' belongs to another project."
            )


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
    from_address: Optional[str] = None,
) -> str:
    """Send a transactional email via Resend. Returns the Resend message id."""
    if not settings.RESEND_API_KEY:
        raise EmailServiceError("RESEND_API_KEY is not configured")

    sender = from_address or settings.RESEND_FROM_EMAIL
    _validate_from_address(sender)

    payload: dict = {
        "from": sender,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            RESEND_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code >= 400:
        logger.error("Resend send failed: %s %s", resp.status_code, resp.text)
        raise EmailServiceError(f"Resend returned {resp.status_code}: {resp.text}")

    data = resp.json()
    message_id = data.get("id", "")
    logger.info("Resend send ok id=%s to=%s subject=%s", message_id, to, subject)
    return message_id
