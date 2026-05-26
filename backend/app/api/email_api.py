"""
Email-related API endpoints.

Currently exposes one endpoint used by the mobile onboarding flow to email the
signed-in user a link to resume onboarding on a larger screen.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.supabase_auth import UserSession, validate_jwt
from app.services.email_service import EmailServiceError, send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/email", tags=["email"])

_ALLOWED_LINK_HOSTS = {
    "getnadir.com",
    "www.getnadir.com",
    "app.getnadir.com",
    "getnadir.dev",
    "app.getnadir.dev",
    "localhost",
    "127.0.0.1",
}


class OnboardingContinueRequest(BaseModel):
    continue_url: str = Field(..., min_length=1, max_length=2000)


class OnboardingContinueResponse(BaseModel):
    sent: bool
    message_id: str = ""


def _is_safe_continue_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("https", "http"):
        return False
    host = (parsed.hostname or "").lower()
    return host in _ALLOWED_LINK_HOSTS


@router.post(
    "/onboarding-continue-link",
    response_model=OnboardingContinueResponse,
)
async def send_onboarding_continue_link(
    req: OnboardingContinueRequest,
    user: UserSession = Depends(validate_jwt),
):
    """Email the signed-in user a link to resume onboarding on desktop."""
    if not user.email:
        raise HTTPException(status_code=400, detail="No email on account")
    if not _is_safe_continue_url(req.continue_url):
        raise HTTPException(status_code=400, detail="Invalid continue URL")

    subject = "Finish setting up Nadir on your computer"
    text = (
        "Open this link on your desktop to pick up where you left off:\n\n"
        f"{req.continue_url}\n\n"
        "— Nadir"
    )
    html = f"""\
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color: #111; line-height: 1.5;">
    <p>Hi,</p>
    <p>Open this link on your computer to pick up where you left off setting up Nadir:</p>
    <p>
      <a href="{req.continue_url}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 600;">
        Continue onboarding
      </a>
    </p>
    <p style="color: #666; font-size: 13px;">Or copy this URL: <br/>{req.continue_url}</p>
    <p style="color: #666; font-size: 13px;">— Nadir &middot; getnadir.com</p>
  </body>
</html>
"""

    try:
        message_id = await send_email(
            to=user.email,
            subject=subject,
            html=html,
            text=text,
        )
    except EmailServiceError as e:
        logger.error("Failed to send onboarding continue email to %s: %s", user.email, e)
        raise HTTPException(status_code=502, detail="Failed to send email") from e

    return OnboardingContinueResponse(sent=True, message_id=message_id)
