"""
Payment-method health check.

Validates a subscriber's saved card by running a zero-charge SetupIntent
confirm with ``usage=off_session`` against their default Stripe
PaymentMethod. This pings the issuer the same way an actual recurring
invoice would, so a dead/blocked/expired card surfaces *before* the
end-of-trial bill arrives — giving the user time to update their card
instead of getting silently flipped to ``past_due`` and locked out.

Called from two places:
  1. ``checkout.session.completed`` webhook — validates immediately after
     the user attaches a card in Stripe Checkout.
  2. ``payment_health_scheduler_loop`` — daily cron that re-validates 4–6
     days before the next invoice posts.

Result is written to ``user_subscriptions.payment_method_health`` and a
failure email is sent via Resend.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import stripe

from app.auth.supabase_auth import supabase
from app.services.email_service import EmailServiceError, send_email

logger = logging.getLogger(__name__)

_BILLING_URL = os.getenv(
    "BILLING_RETURN_URL", "https://getnadir.com/dashboard/billing"
)


async def _db(fn):
    return await asyncio.to_thread(fn)


async def _get_customer_and_email(user_id: str) -> tuple[Optional[str], Optional[str]]:
    row = await _db(
        lambda: supabase.table("stripe_customers")
        .select("stripe_customer_id, email")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not row.data:
        return None, None
    return row.data[0].get("stripe_customer_id"), row.data[0].get("email")


def _resolve_default_payment_method(customer_id: str) -> Optional[str]:
    """
    Return the PaymentMethod id we'd charge for the next invoice.

    Prefers ``invoice_settings.default_payment_method`` (what Stripe will
    actually use for off-session subscription charges). Falls back to the
    customer's first attached card, mirroring Stripe's own fallback.
    """
    customer = stripe.Customer.retrieve(
        customer_id, expand=["invoice_settings.default_payment_method"]
    )
    default = (customer.get("invoice_settings") or {}).get("default_payment_method")
    if default:
        return default["id"] if isinstance(default, dict) else default

    pms = stripe.PaymentMethod.list(customer=customer_id, type="card", limit=1)
    if pms.data:
        return pms.data[0].id
    return None


async def _mark_health(
    user_id: str,
    *,
    healthy: bool,
    error: Optional[str] = None,
) -> None:
    row = {
        "payment_method_health": "healthy" if healthy else "failing",
        "payment_method_health_checked_at": datetime.now(timezone.utc).isoformat(),
        "payment_method_health_last_error": None if healthy else (error or "unknown"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db(
        lambda: supabase.table("user_subscriptions")
        .update(row)
        .eq("user_id", user_id)
        .execute()
    )


async def _send_failure_email(to: str, error: str) -> None:
    subject = "Action needed: your card on file isn't going through"
    update_url = _BILLING_URL
    text = (
        "We tried to verify the card you have on file for Nadir and the "
        "issuer declined the check. To keep your access active when your "
        "first month ends, please update your card on file:\n\n"
        f"{update_url}\n\n"
        f"Reason from the bank: {error}\n\n"
        "If you don't update the card before the next invoice, your "
        "account will be paused.\n\n"
        "— Nadir"
    )
    html = f"""\
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color: #111; line-height: 1.5;">
    <p>Hi,</p>
    <p>We tried to verify the card you have on file for Nadir and the issuer declined the check.</p>
    <p>To keep your access active when your first month ends, please update your card on file:</p>
    <p>
      <a href="{update_url}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 600;">
        Update card
      </a>
    </p>
    <p style="color: #444; font-size: 14px;"><strong>Reason from the bank:</strong> {error}</p>
    <p style="color: #666; font-size: 13px;">If you don't update the card before the next invoice, your account will be paused.</p>
    <p style="color: #666; font-size: 13px;">Nadir, getnadir.com</p>
  </body>
</html>
"""
    try:
        await send_email(to=to, subject=subject, html=html, text=text)
    except EmailServiceError as e:
        logger.error("Failed to send payment-health failure email to %s: %s", to, e)


async def validate_payment_method(user_id: str) -> bool:
    """
    Run a SetupIntent off-session confirm against the user's default card.

    Returns True if the issuer accepts the verification (card healthy),
    False otherwise. Always writes the result to ``user_subscriptions``;
    on failure, also emails the user a card-update link.

    Safe to call repeatedly. Never raises — internal Stripe / network
    errors are logged and reported as "card unhealthy" so the user gets
    a chance to fix things rather than being silently passed.
    """
    customer_id, email = await _get_customer_and_email(user_id)
    if not customer_id:
        logger.warning("payment_health: user %s has no stripe_customers row", user_id)
        await _mark_health(user_id, healthy=False, error="no_customer_record")
        return False

    try:
        pm_id = await asyncio.to_thread(_resolve_default_payment_method, customer_id)
    except Exception as e:
        logger.error("payment_health: PM lookup failed for %s: %s", user_id, e)
        await _mark_health(user_id, healthy=False, error=f"pm_lookup_failed: {e}")
        if email:
            await _send_failure_email(email, "Could not read your payment method.")
        return False

    if not pm_id:
        logger.warning("payment_health: no payment method attached for user %s", user_id)
        await _mark_health(user_id, healthy=False, error="no_payment_method")
        if email:
            await _send_failure_email(
                email, "No card on file. Please add a payment method."
            )
        return False

    try:
        setup_intent = await asyncio.to_thread(
            lambda: stripe.SetupIntent.create(
                customer=customer_id,
                payment_method=pm_id,
                usage="off_session",
                confirm=True,
                # Hint Stripe that this is a non-interactive verification.
                # If the issuer requires action (e.g. 3DS), off_session
                # confirm will fail with ``requires_action`` and we treat
                # that as "card cannot be charged at end of trial."
                automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
                metadata={"nadir_user_id": user_id, "purpose": "health_check"},
            )
        )
    except stripe.error.CardError as e:
        msg = e.user_message or str(e)
        logger.info("payment_health: card declined for %s: %s", user_id, msg)
        await _mark_health(user_id, healthy=False, error=msg)
        if email:
            await _send_failure_email(email, msg)
        return False
    except stripe.error.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        logger.error("payment_health: Stripe error for %s: %s", user_id, msg)
        await _mark_health(user_id, healthy=False, error=msg)
        if email:
            await _send_failure_email(email, msg)
        return False

    if setup_intent.status == "succeeded":
        await _mark_health(user_id, healthy=True)
        logger.info("payment_health: %s is healthy (pm=%s)", user_id, pm_id)
        return True

    # ``requires_action`` / ``requires_payment_method`` / etc — issuer
    # won't let us use this card without interactive auth. That means it
    # won't work for the unattended renewal charge either.
    msg = (
        f"Card requires further verification (status={setup_intent.status}). "
        "Please update the card on file."
    )
    logger.info("payment_health: %s unhealthy (status=%s)", user_id, setup_intent.status)
    await _mark_health(user_id, healthy=False, error=msg)
    if email:
        await _send_failure_email(email, msg)
    return False
