"""
Minimal server-side PostHog capture.

Used for events that the browser-side snippet can't see — primarily
Stripe webhook signals (checkout.session.expired, invoice.payment_failed)
where the user has left our domain.

Design notes:
- httpx is already a backend dependency; avoid adding posthog-python
  just for one endpoint.
- capture() is fire-and-forget: it never raises, it logs on failure.
  Webhook handlers must stay responsive even if PostHog is down.
- When POSTHOG_API_KEY is unset (e.g. dev/test), capture() is a no-op.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

# Short timeout — we'd rather lose an analytics event than slow the
# webhook handler and trigger Stripe's retry logic.
_CAPTURE_TIMEOUT_SECONDS = 3.0


async def capture(
    distinct_id: str,
    event: str,
    properties: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Send a single event to PostHog's /capture endpoint.

    Args:
        distinct_id: The PostHog identity. Use the Supabase user_id for
            logged-in users so events merge with the client-side identity
            set by `posthog.identify()` in analytics.ts.
        event: Event name, e.g. "checkout_abandon".
        properties: Arbitrary JSON-serializable payload.
    """
    api_key = settings.POSTHOG_API_KEY
    if not api_key:
        logger.debug("POSTHOG_API_KEY unset — skipping capture of %s", event)
        return

    payload = {
        "api_key": api_key,
        "event": event,
        "distinct_id": distinct_id,
        "properties": properties or {},
    }
    url = f"{settings.POSTHOG_HOST.rstrip('/')}/capture/"

    try:
        async with httpx.AsyncClient(timeout=_CAPTURE_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code >= 400:
                logger.warning(
                    "PostHog capture %s returned %d: %s",
                    event, resp.status_code, resp.text[:200],
                )
    except Exception as e:  # noqa: BLE001 — never let analytics break a webhook
        logger.warning("PostHog capture %s failed: %s", event, e)
