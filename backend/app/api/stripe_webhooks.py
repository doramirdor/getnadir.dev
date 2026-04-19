"""
Stripe webhook handler for Nadir SaaS platform.

Receives and processes Stripe events for subscription lifecycle,
payment processing, and credit management.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.auth.supabase_auth import supabase
from app.services import posthog_client
from app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stripe"])


async def _db(fn):
    """Run a synchronous Supabase call in a thread to avoid blocking the event loop."""
    return await asyncio.to_thread(fn)


def _ts(epoch):
    """
    Convert a Unix epoch (int/float) to an ISO-8601 timestamptz string.

    Stripe sends subscription period boundaries as Unix integers, but the
    `subscriptions.current_period_{start,end}` columns are `timestamptz`.
    Return None if the input is falsy so null columns stay null.
    """
    if not epoch:
        return None
    return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()


def _period(sub: dict, key: str):
    """
    Read a subscription period boundary from a Stripe subscription object.

    On Stripe API version <= 2025-04-30, `current_period_start` / `_end`
    live on the root of the subscription. Starting with 2025-07-30 they
    moved to each entry in `items.data[]` (to support mixed billing
    cycles). Try the root first, then fall back to items[0] so this works
    on both API versions.
    """
    v = sub.get(key)
    if v is not None:
        return v
    items = (sub.get("items") or {}).get("data") or []
    if items:
        return items[0].get(key)
    return None


# Stripe price ID -> internal plan name. When we add more tiers, extend this
# map (or read from billing_plans table). Unknown prices default to "pro"
# since that's currently the only paid tier.
_PRICE_TO_PLAN = {
    # Add explicit mappings here as new prices are created, e.g.:
    # "price_1TLT5WE5pNFif9nQmmQTOlNh": "pro",
}


def _plan_from_subscription(sub: dict) -> str:
    """Derive the internal plan name ('pro', 'enterprise', etc.) from a Stripe sub."""
    items = (sub.get("items") or {}).get("data") or []
    if items:
        price_id = (items[0].get("price") or {}).get("id")
        if price_id and price_id in _PRICE_TO_PLAN:
            return _PRICE_TO_PLAN[price_id]
    # Any paid Stripe subscription without an explicit mapping is Pro today.
    return "pro"


async def _upsert_subscription_tables(
    *,
    user_id: str,
    customer_id: str | None,
    subscription_id: str | None,
    status_: str,
    period_start_epoch: int | None = None,
    period_end_epoch: int | None = None,
    cancel_at_period_end: bool = False,
    plan: str | None = None,
) -> None:
    """
    Write subscription state to BOTH backing tables.

    `subscriptions` (timestamptz periods, has `plan` column) is read by the
    backend auth path. `user_subscriptions` (bigint epoch periods, no plan
    column) is read directly by the frontend via RLS.

    Keeping them in sync is required — until 2026-04 they drifted silently
    and a paying customer (felipe.truman) was stuck on the free plan in
    the UI despite a live Stripe subscription. Route every mutation
    through this helper so that bug can't recur.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    subscriptions_row = {
        "user_id": user_id,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": subscription_id,
        "status": status_,
        "cancel_at_period_end": cancel_at_period_end,
        "updated_at": now_iso,
    }
    if plan is not None:
        subscriptions_row["plan"] = plan
    if period_start_epoch is not None:
        subscriptions_row["current_period_start"] = _ts(period_start_epoch)
    if period_end_epoch is not None:
        subscriptions_row["current_period_end"] = _ts(period_end_epoch)

    user_subscriptions_row = {
        "user_id": user_id,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": subscription_id,
        "status": status_,
        "cancel_at_period_end": cancel_at_period_end,
        "updated_at": now_iso,
    }
    # user_subscriptions stores periods as bigint epoch seconds, not timestamptz.
    if period_start_epoch is not None:
        user_subscriptions_row["current_period_start"] = int(period_start_epoch)
    if period_end_epoch is not None:
        user_subscriptions_row["current_period_end"] = int(period_end_epoch)

    await _db(lambda: supabase.table("subscriptions").upsert(
        subscriptions_row, on_conflict="user_id"
    ).execute())
    await _db(lambda: supabase.table("user_subscriptions").upsert(
        user_subscriptions_row, on_conflict="user_id"
    ).execute())


async def _store_event(event_id: str, event_type: str, payload: dict) -> None:
    """
    Record the event so we never process it twice.

    Uses the stripe_event_id UNIQUE constraint for atomic idempotency.
    Must be called BEFORE the handler runs — if insert fails with a
    duplicate-key error (Postgres 23505), the caller knows another
    worker already claimed this event.
    """
    await asyncio.to_thread(
        lambda: supabase.table("stripe_events").insert(
            {
                "stripe_event_id": event_id,
                "event_type": event_type,
                "payload": payload,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    )


# ------------------------------------------------------------------
# Event handlers
# ------------------------------------------------------------------


async def _handle_checkout_session_completed(data: dict) -> None:
    """
    Handle checkout.session.completed — the user finished Checkout.

    Create or update the user_subscriptions row so the app knows
    the user has an active plan.
    """
    session = data.get("object", {})
    user_id = session.get("metadata", {}).get("nadir_user_id")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if not user_id:
        logger.warning("checkout.session.completed missing nadir_user_id in metadata")
        return

    # We don't have the subscription period yet — `customer.subscription.created`
    # fires right after and fills it in. But we must set plan='pro' here so the
    # UI flips immediately; otherwise the row stays at whatever onboarding
    # seeded (usually 'free') until the next subscription.* event lands.
    await _upsert_subscription_tables(
        user_id=user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        status_="active",
        cancel_at_period_end=False,
        plan="pro",
    )

    logger.info(
        "Checkout completed: user=%s subscription=%s", user_id, subscription_id
    )


async def _handle_subscription_created(data: dict) -> None:
    """Handle customer.subscription.created."""
    sub = data.get("object", {})
    customer_id = sub.get("customer")
    subscription_id = sub.get("id")
    sub_status = sub.get("status", "active")

    # Resolve user_id from stripe_customers table
    customer_row = await _db(lambda: supabase.table("stripe_customers")
        .select("user_id").eq("stripe_customer_id", customer_id).execute())
    if not customer_row.data:
        logger.warning("subscription.created for unknown customer %s", customer_id)
        return

    user_id = customer_row.data[0]["user_id"]

    await _upsert_subscription_tables(
        user_id=user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        status_=sub_status,
        period_start_epoch=_period(sub, "current_period_start"),
        period_end_epoch=_period(sub, "current_period_end"),
        cancel_at_period_end=sub.get("cancel_at_period_end", False),
        plan=_plan_from_subscription(sub),
    )

    logger.info("Subscription created: user=%s sub=%s status=%s", user_id, subscription_id, sub_status)


async def _handle_subscription_deleted(data: dict) -> None:
    """Handle customer.subscription.deleted — subscription ended."""
    sub = data.get("object", {})
    customer_id = sub.get("customer")
    subscription_id = sub.get("id")

    # Resolve user_id
    customer_row = await _db(lambda: supabase.table("stripe_customers")
        .select("user_id").eq("stripe_customer_id", customer_id).execute())
    if not customer_row.data:
        logger.warning("subscription.deleted for unknown customer %s", customer_id)
        return

    user_id = customer_row.data[0]["user_id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Mark canceled in both tables. Downgrade plan back to 'free' so the UI
    # stops claiming Pro after cancellation.
    await _db(lambda: supabase.table("subscriptions").update(
        {"status": "canceled", "plan": "free", "updated_at": now_iso}
    ).eq("stripe_subscription_id", subscription_id).execute())
    await _db(lambda: supabase.table("user_subscriptions").update(
        {"status": "canceled", "updated_at": now_iso}
    ).eq("stripe_subscription_id", subscription_id).execute())

    logger.info("Subscription deleted: user=%s sub=%s", user_id, subscription_id)


async def _handle_invoice_paid(data: dict) -> None:
    """
    Handle invoice.paid — successful payment.

    Logs the payment and marks the subscription as active.
    Does NOT credit user_credits — the hosted budget is enforced
    via usage_logs (see hosted_budget.py), not a prepaid credit
    balance.  The subscription payment covers the service fee,
    not prepaid API credits.
    """
    invoice = data.get("object", {})
    customer_id = invoice.get("customer")
    amount_paid = invoice.get("amount_paid", 0)  # in cents
    subscription_id = invoice.get("subscription")

    # Resolve user_id
    customer_row = await _db(lambda: supabase.table("stripe_customers")
        .select("user_id").eq("stripe_customer_id", customer_id).execute())
    if not customer_row.data:
        logger.warning("invoice.paid for unknown customer %s", customer_id)
        return

    user_id = customer_row.data[0]["user_id"]
    amount_usd = amount_paid / 100.0

    # Update subscription status if applicable. Update both tables so the
    # frontend (user_subscriptions) and backend auth (subscriptions) stay
    # in sync — e.g. when a past_due sub recovers via successful retry.
    if subscription_id:
        now_iso = datetime.now(timezone.utc).isoformat()
        await _db(lambda: supabase.table("subscriptions").update(
            {"status": "active", "updated_at": now_iso}
        ).eq("stripe_subscription_id", subscription_id).execute())
        await _db(lambda: supabase.table("user_subscriptions").update(
            {"status": "active", "updated_at": now_iso}
        ).eq("stripe_subscription_id", subscription_id).execute())

    logger.info(
        "Invoice paid: user=%s amount=$%.2f invoice=%s",
        user_id,
        amount_usd,
        invoice.get("id"),
    )


async def _handle_subscription_updated(data: dict) -> None:
    """
    Handle customer.subscription.updated — plan change, renewal, payment failure recovery.

    Updates the subscription status and period in our DB to stay in sync with Stripe.
    """
    sub = data.get("object", {})
    customer_id = sub.get("customer")
    subscription_id = sub.get("id")
    sub_status = sub.get("status", "active")  # active, past_due, unpaid, canceled, etc.

    customer_row = await _db(lambda: supabase.table("stripe_customers")
        .select("user_id").eq("stripe_customer_id", customer_id).execute())
    if not customer_row.data:
        logger.warning("subscription.updated for unknown customer %s", customer_id)
        return

    user_id = customer_row.data[0]["user_id"]

    # Preserve 'pro' through status transitions (active <-> past_due <-> unpaid);
    # only flip to 'free' on terminal cancel (handled in _handle_subscription_deleted).
    plan = "free" if sub_status in ("canceled", "incomplete_expired") else _plan_from_subscription(sub)

    await _upsert_subscription_tables(
        user_id=user_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
        status_=sub_status,
        period_start_epoch=_period(sub, "current_period_start"),
        period_end_epoch=_period(sub, "current_period_end"),
        cancel_at_period_end=sub.get("cancel_at_period_end", False),
        plan=plan,
    )

    logger.info("Subscription updated: user=%s sub=%s status=%s", user_id, subscription_id, sub_status)


async def _handle_invoice_payment_failed(data: dict) -> None:
    """
    Handle invoice.payment_failed — payment attempt failed.

    Marks the subscription as past_due so the subscription guard
    allows a grace period but warns the user.
    """
    invoice = data.get("object", {})
    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")

    if not subscription_id:
        return  # One-off invoice, not subscription-related

    customer_row = await _db(lambda: supabase.table("stripe_customers")
        .select("user_id").eq("stripe_customer_id", customer_id).execute())
    if not customer_row.data:
        logger.warning("invoice.payment_failed for unknown customer %s", customer_id)
        return

    user_id = customer_row.data[0]["user_id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Mark past_due in both tables so the subscription guard allows the
    # grace period (see subscription_guard.py) and the UI shows the
    # payment-method-update prompt.
    await _db(lambda: supabase.table("subscriptions").update(
        {"status": "past_due", "updated_at": now_iso}
    ).eq("stripe_subscription_id", subscription_id).execute())
    await _db(lambda: supabase.table("user_subscriptions").update(
        {"status": "past_due", "updated_at": now_iso}
    ).eq("stripe_subscription_id", subscription_id).execute())

    logger.warning(
        "Payment failed: user=%s sub=%s — marked as past_due",
        user_id, subscription_id,
    )

    # Capture a server-side PostHog event so the funnel shows this
    # drop-off. The browser-side snippet can't see Stripe-side payment
    # failures because the user isn't on our domain when they happen.
    await posthog_client.capture(
        distinct_id=user_id,
        event="payment_failed",
        properties={"subscription_id": subscription_id},
    )


async def _handle_checkout_session_expired(data: dict) -> None:
    """
    Handle checkout.session.expired — the user opened Stripe Checkout and
    never completed it (default expiry is 24h).

    We can't track this client-side because Stripe Checkout runs on
    checkout.stripe.com, so PostHog's browser snippet never sees the
    abandonment. Capture the event here so the funnel from
    `checkout_start` (client) -> `checkout_abandon` (server) is visible.
    """
    session = data.get("object", {})
    user_id = session.get("metadata", {}).get("nadir_user_id")
    if not user_id:
        logger.debug("checkout.session.expired without nadir_user_id — skipping")
        return

    await posthog_client.capture(
        distinct_id=user_id,
        event="checkout_abandon",
        properties={
            "reason": "expired",
            "session_id": session.get("id"),
            "amount_total": session.get("amount_total"),
        },
    )
    logger.info("Checkout abandoned: user=%s session=%s", user_id, session.get("id"))


# ------------------------------------------------------------------
# Webhook endpoint
# ------------------------------------------------------------------

EVENT_HANDLERS = {
    "checkout.session.completed": _handle_checkout_session_completed,
    "checkout.session.expired": _handle_checkout_session_expired,
    "customer.subscription.created": _handle_subscription_created,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
    "invoice.paid": _handle_invoice_paid,
    "invoice.payment_failed": _handle_invoice_payment_failed,
}


@router.post("/v1/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Receive and process Stripe webhook events.

    Verifies the webhook signature, checks for duplicate events,
    and dispatches to the appropriate handler.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )

    webhook_secret = settings.STRIPE_WEBHOOK_SECRET
    if not webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook secret not configured",
        )

    # Verify signature
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload",
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        )

    # Parse the raw payload as plain JSON. construct_event() already
    # verified the signature, so we trust the bytes. Using the StripeObject
    # it returns is painful — in recent stripe-python versions it overrides
    # __getattr__ to redirect to __getitem__, breaking `.get()`, and it has
    # no reliable way to convert back to a plain dict across SDK versions.
    # A plain dict also makes the Supabase jsonb insert safe.
    event_dict = json.loads(payload)
    event_id = event_dict.get("id", "unknown")
    event_type = event_dict.get("type", "unknown")

    logger.info("Received Stripe event: %s (%s)", event_type, event_id)

    # Atomic idempotency: insert the event FIRST.
    # The stripe_event_id UNIQUE constraint ensures only one worker
    # can claim a given event — all others get a duplicate-key error.
    try:
        await _store_event(event_id, event_type, event_dict)
    except Exception as e:
        if "duplicate" in str(e).lower() or "23505" in str(e):
            logger.info("Duplicate event %s — skipping", event_id)
            return {"status": "already_processed"}
        raise

    # Now safe to run the handler (we hold the unique row)
    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            await handler(event_dict.get("data", {}))
        except Exception as e:
            logger.error(
                "Error processing Stripe event %s (%s): %s",
                event_type,
                event_id,
                e,
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing event: {event_type}",
            )
    else:
        logger.debug("Unhandled Stripe event type: %s", event_type)

    return {"status": "ok"}
