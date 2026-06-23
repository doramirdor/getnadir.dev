"""
Payment-method health check.

Validates a subscriber's saved card by running a zero-charge SetupIntent
confirm with ``usage=off_session`` against their default Stripe
PaymentMethod. This pings the issuer the same way an actual recurring
invoice would, so a dead/blocked/expired card surfaces *before* the
end-of-trial bill arrives — giving the user time to update their card
instead of getting silently flipped to ``past_due`` and locked out.

Called from two places:
  1. ``checkout.session.completed`` → ``customer.subscription.created``
     webhook — validates right after the user attaches a card in Stripe
     Checkout. This path is race-prone: the PaymentMethod attach can lag a
     beat behind the subscription event, so the lookup retries with backoff
     before concluding anything.
  2. ``payment_health_scheduler_loop`` — daily cron that re-validates 4–6
     days before the next invoice posts.

The verdict is written to ``user_subscriptions.payment_method_health`` as
one of three states, and only the first is the user's fault:

  * ``"failing"`` — a genuine card problem: the issuer declined the
    off-session verification (``stripe.error.CardError``) or required
    interactive auth (SetupIntent ``requires_action`` /
    ``requires_payment_method``). We mark ``"failing"`` and email the user a
    card-update link via Resend.
  * ``"unknown"`` — a transient / internal hiccup on *our* side: the PM
    lookup raced the attach, a non-card Stripe error, or a customer/PM row
    not written yet. We do NOT email and do NOT mark ``"failing"`` (which
    would scare a brand-new user with a perfectly good card). The daily
    scheduler re-validates before renewal, so a real bad card is still caught.
  * ``"healthy"`` — the SetupIntent succeeded.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import stripe

from app.auth.supabase_auth import supabase
from app.services.email_service import EmailServiceError, send_email

logger = logging.getLogger(__name__)

_BILLING_URL = os.getenv(
    "BILLING_RETURN_URL", "https://getnadir.com/dashboard/billing"
)

# The checkout.session.completed / subscription.created webhook can fire
# before Stripe has finished attaching the PaymentMethod to the customer.
# A naive lookup then races the attach and sees "no card" (or a transient
# API blip), which previously got recorded as a *card failure* and emailed
# the user a dunning notice moments after a successful signup. Retry briefly
# so the attach settles before we conclude anything about the card.
_PM_LOOKUP_ATTEMPTS = 3
_PM_LOOKUP_BACKOFF_SECONDS = 1.0


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
    # NB: use attribute access, not ``.get()``. As of stripe-python v15 a
    # StripeObject is no longer a dict subclass and exposes no ``.get`` method,
    # so ``customer.get("invoice_settings")`` raises ``AttributeError: get``.
    invoice_settings = getattr(customer, "invoice_settings", None)
    default = getattr(invoice_settings, "default_payment_method", None)
    if default:
        # Expanded -> PaymentMethod object with ``.id``; unexpanded -> id str.
        return default if isinstance(default, str) else getattr(default, "id", None)

    pms = stripe.PaymentMethod.list(customer=customer_id, type="card", limit=1)
    if pms.data:
        return pms.data[0].id
    return None


def _resolve_default_payment_method_resilient(customer_id: str) -> Optional[str]:
    """Resolve the default PaymentMethod, tolerant of the post-Checkout race.

    Retries on *both* a transient exception and a ``None`` result, since both
    can mean "the card hasn't finished attaching yet" rather than "no card on
    file". Re-raises the last exception only if *every* attempt errored;
    returns ``None`` when the lookups succeeded but genuinely found no card.
    """
    last_exc: Optional[Exception] = None
    for attempt in range(_PM_LOOKUP_ATTEMPTS):
        try:
            pm_id = _resolve_default_payment_method(customer_id)
            if pm_id:
                return pm_id
            last_exc = None  # a clean "no card attached" answer
        except Exception as e:  # noqa: BLE001 — transient Stripe/network blip
            last_exc = e
        if attempt < _PM_LOOKUP_ATTEMPTS - 1:
            time.sleep(_PM_LOOKUP_BACKOFF_SECONDS)
    if last_exc is not None:
        raise last_exc
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


async def _mark_health_unknown(user_id: str, error: str) -> None:
    """Record a non-conclusive check caused by *our* side (transient Stripe
    error, attach race, network blip) — not a verdict on the card.

    Deliberately writes ``"unknown"`` rather than ``"failing"`` so the billing
    UI shows no card-failure banner (it keys strictly on ``"failing"``), and
    callers must NOT email the user: we don't dun a customer for our own
    glitch. The daily scheduler re-validates before renewal regardless of this
    value, so a genuinely bad card is still caught in time.

    A transient blip must never *override a definitive verdict*: a card we
    last confirmed ``"healthy"`` stays healthy, and one we last saw
    ``"failing"`` stays failing — otherwise a single flaky daily-cron run
    would silently clear a legitimately red banner. Only an as-yet
    undetermined row (``"unchecked"`` / ``"unknown"`` / brand-new) takes the
    soft ``"unknown"`` marker.
    """
    current = await _db(
        lambda: supabase.table("user_subscriptions")
        .select("payment_method_health")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    cur = current.data[0]["payment_method_health"] if current.data else None
    if cur in ("healthy", "failing"):
        logger.info(
            "payment_health: transient for %s (%s); keeping existing verdict '%s'",
            user_id, error, cur,
        )
        return

    row = {
        "payment_method_health": "unknown",
        "payment_method_health_checked_at": datetime.now(timezone.utc).isoformat(),
        "payment_method_health_last_error": error,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await _db(
            lambda: supabase.table("user_subscriptions")
            .update(row)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        # Most likely the CHECK constraint hasn't been migrated to allow
        # 'unknown' yet. Don't crash the validation flow over a diagnostic
        # write — the row simply keeps its prior (non-failing) value.
        logger.error(
            "payment_health: could not record 'unknown' for %s (%s) — is the "
            "payment_method_health 'unknown' migration applied?",
            user_id, e,
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
    False otherwise. Always writes a result to ``user_subscriptions``.

    Only a genuine card problem — issuer decline (``CardError``) or a
    SetupIntent that ends needing interactive auth — marks the card
    ``"failing"`` and emails the user a card-update link. Our own transient
    failures (attach race after Checkout, Stripe API/network errors) are
    recorded as ``"unknown"`` and never email the customer; the daily
    scheduler re-validates before renewal, so a real bad card is still
    caught in time.

    Safe to call repeatedly. Never raises.
    """
    customer_id, email = await _get_customer_and_email(user_id)
    if not customer_id:
        # No stripe_customers row yet. On the post-signup path this is just
        # the row not having been written, not a card problem — record
        # "unknown" (never "failing") so we don't dun the user for our race.
        logger.warning("payment_health: user %s has no stripe_customers row", user_id)
        await _mark_health_unknown(user_id, "no_customer_record")
        return False

    try:
        pm_id = await asyncio.to_thread(
            _resolve_default_payment_method_resilient, customer_id
        )
    except Exception as e:
        # We couldn't read the PaymentMethod from Stripe even after retries.
        # That's our side failing (API/network/attach race), NOT a declined
        # card — so do not flag the card "failing" and do not email the user.
        # Record "unknown"; the daily scheduler re-checks before renewal.
        logger.error(
            "payment_health: PM lookup failed for %s after retries: %s", user_id, e
        )
        await _mark_health_unknown(user_id, f"pm_lookup_failed: {e}")
        return False

    if not pm_id:
        # The resilient lookup retried and still found no card. This is not a
        # card *decline* (the issuer never said no) and, on the post-signup
        # path, usually means the attach simply hasn't settled within our
        # retry budget. Don't email "no card on file" to someone who just
        # added one — record "unknown" and let the daily cron re-check.
        logger.warning("payment_health: no payment method resolved for user %s", user_id)
        await _mark_health_unknown(user_id, "no_payment_method")
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
        # Non-card Stripe error (rate limit, API/connection, invalid request).
        # This is an infrastructure problem, not a card decline — treat it as
        # inconclusive rather than dunning the customer for our outage.
        msg = getattr(e, "user_message", None) or str(e)
        logger.error("payment_health: Stripe error for %s: %s", user_id, msg)
        await _mark_health_unknown(user_id, f"setup_intent_error: {msg}")
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
