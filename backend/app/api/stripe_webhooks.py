"""
Stripe webhook handler for Nadir SaaS platform.

Receives and processes Stripe events for subscription lifecycle,
payment processing, and credit management.
"""

import asyncio
import json
import logging
from datetime import date, datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.auth.supabase_auth import supabase
from app.services import posthog_client, referral_service
from app.services.payment_health import validate_payment_method
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

    # One-time prepaid credit top-up (mode=payment) — credit the balance and
    # stop. This is NOT a subscription, so don't touch the subscription tables.
    if session.get("metadata", {}).get("purpose") == "credit_topup":
        from app.services.credits_service import credits_service
        from decimal import Decimal

        # Credit the pre-tax amount (automatic_tax adds tax on top of the
        # credits they bought). amount_subtotal is in cents.
        subtotal_cents = session.get("amount_subtotal")
        if subtotal_cents is None:
            subtotal_cents = session.get("amount_total", 0)
        amount_usd = Decimal(str(subtotal_cents or 0)) / Decimal("100")
        payment_intent_id = session.get("payment_intent")
        try:
            await credits_service.add_credits(
                user_id,
                amount_usd,
                stripe_payment_intent_id=payment_intent_id,
                description="Credit top-up",
            )
            logger.info(
                "Credited $%.2f to user %s from top-up session %s",
                amount_usd, user_id, session.get("id"),
            )
        except Exception as e:
            logger.error("Failed to credit top-up for user %s: %s", user_id, e)
            raise
        # Referral conversion: if this user was referred and this top-up clears
        # the threshold, credit the referrer. Idempotent per referral row, so
        # only the referee's first qualifying top-up pays out.
        try:
            await referral_service.grant_referrer_reward_for_topup(user_id, amount_usd)
        except Exception as e:
            logger.error(
                "Failed to grant referrer reward for referee %s: %s", user_id, e
            )
        await posthog_client.capture(
            distinct_id=user_id,
            event="credit_topup_success",
            properties={
                "amount_usd": float(amount_usd),
                "session_id": session.get("id"),
            },
        )
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

    # Server-side conversion event. Pairs with the client-side
    # `checkout_start` to close the funnel. The browser PostHog snippet
    # can't see this moment because the user is on checkout.stripe.com
    # when Stripe confirms payment.
    await posthog_client.capture(
        distinct_id=user_id,
        event="checkout_success",
        properties={
            "plan": "pro",
            "subscription_id": subscription_id,
            "session_id": session.get("id"),
            "amount_total": session.get("amount_total"),
            "currency": session.get("currency"),
        },
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

    plan = _plan_from_subscription(sub)

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

    logger.info("Subscription created: user=%s sub=%s status=%s", user_id, subscription_id, sub_status)

    # Validate the card right after signup. Stripe Checkout already did
    # an attach-time verification, but we re-run a SetupIntent off_session
    # to specifically confirm the issuer will accept the unattended
    # charge at end of trial — that's the channel we'll use for the next
    # invoice.
    try:
        await validate_payment_method(user_id)
    except Exception as e:
        logger.error("payment_health post-signup check failed for %s: %s", user_id, e)

    # Funnel event — user is now a paying subscriber. `checkout_success`
    # fires first (payment confirmed); this fires right after with the
    # plan + billing interval attached so we can segment the cohort.
    items = (sub.get("items") or {}).get("data") or []
    price = items[0].get("price", {}) if items else {}
    recurring = price.get("recurring") or {}
    await posthog_client.capture(
        distinct_id=user_id,
        event="subscription_created",
        properties={
            "plan": plan,
            "status": sub_status,
            "subscription_id": subscription_id,
            "price_id": price.get("id"),
            "billing_interval": recurring.get("interval"),
            "unit_amount": price.get("unit_amount"),
            "currency": price.get("currency"),
        },
    )


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

    # Final churn signal — subscription is actually terminated, not just
    # scheduled to cancel at period end. Captures cancellation reasons
    # provided via Stripe Billing Portal when available.
    cancellation = sub.get("cancellation_details") or {}
    await posthog_client.capture(
        distinct_id=user_id,
        event="subscription_canceled",
        properties={
            "subscription_id": subscription_id,
            "reason": cancellation.get("reason"),
            "feedback": cancellation.get("feedback"),
            "canceled_at": sub.get("canceled_at"),
        },
    )


async def _handle_invoice_paid(data: dict) -> None:
    """
    Handle invoice.paid — successful payment.

    Logs the payment and marks the subscription as active.
    Does NOT credit user_credits — this invoice is the monthly savings fee,
    not a prepaid credit top-up. Prepaid balances are credited separately by
    the credit_topup branch in checkout.session.completed.
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

    # Flip any pending savings_invoices for this user to 'paid'. The monthly
    # scheduler attaches savings + Hosted markup as line items on the next
    # Stripe invoice and inserts a draft savings_invoices row; this is where
    # that row settles. Scoping to billing_period_end <= today avoids racing
    # a row the scheduler is mid-creating.
    if amount_paid > 0:
        paid_at_epoch = (invoice.get("status_transitions") or {}).get("paid_at")
        paid_at_iso = (
            datetime.fromtimestamp(paid_at_epoch, tz=timezone.utc).isoformat()
            if paid_at_epoch
            else datetime.now(timezone.utc).isoformat()
        )
        update_row = {"status": "paid", "paid_at": paid_at_iso}
        stripe_invoice_id = invoice.get("id")
        if stripe_invoice_id:
            update_row["stripe_invoice_id"] = stripe_invoice_id
        await _db(lambda: supabase.table("savings_invoices")
            .update(update_row)
            .eq("user_id", user_id)
            .eq("status", "draft")
            .lte("billing_period_end", date.today().isoformat())
            .execute())

    logger.info(
        "Invoice paid: user=%s amount=$%.2f invoice=%s",
        user_id,
        amount_usd,
        invoice.get("id"),
    )
    # Referral rewards no longer trigger on invoices — they fire from the
    # credit_topup branch of checkout.session.completed (referee funds $10+).


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


async def _flag_payment_failure(
    *,
    user_id: str,
    invoice: dict,
    customer_id: str,
    subscription_id: str | None,
) -> None:
    """
    Insert a structured row into flagged_payment_failures for human review.

    Captures the decline reason from the charge's outcome, the card BIN/country,
    and the user's signup age in days. The unique constraint on
    (stripe_invoice_id, attempt_count) means duplicate webhook deliveries for
    the same attempt are silently deduped.
    """
    charge_id = invoice.get("charge")
    decline_code = failure_code = failure_message = network_decline_code = None
    card_brand = card_last4 = card_country = None
    if charge_id:
        try:
            charge = await asyncio.to_thread(stripe.Charge.retrieve, charge_id)
            failure_code = charge.get("failure_code")
            failure_message = charge.get("failure_message")
            outcome = charge.get("outcome") or {}
            network_decline_code = outcome.get("network_decline_code")
            decline_code = outcome.get("reason") or failure_code
            pm = charge.get("payment_method_details") or {}
            card = pm.get("card") or {}
            card_brand = card.get("brand")
            card_last4 = card.get("last4")
            card_country = card.get("country")
        except Exception as e:
            logger.warning("failed to retrieve charge %s for flag enrichment: %s", charge_id, e)

    signup_age = None
    try:
        profile = await _db(lambda: supabase.table("profiles")
            .select("created_at").eq("id", user_id).single().execute())
        if profile.data and profile.data.get("created_at"):
            created = datetime.fromisoformat(profile.data["created_at"].replace("Z", "+00:00"))
            signup_age = (datetime.now(timezone.utc) - created).days
    except Exception as e:
        logger.debug("could not compute signup age for %s: %s", user_id, e)

    row = {
        "user_id": user_id,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": subscription_id,
        "stripe_invoice_id": invoice.get("id"),
        "stripe_charge_id": charge_id,
        "amount_cents": invoice.get("amount_due"),
        "attempt_count": invoice.get("attempt_count"),
        "decline_code": decline_code,
        "failure_code": failure_code,
        "failure_message": failure_message,
        "network_decline_code": network_decline_code,
        "card_brand": card_brand,
        "card_last4": card_last4,
        "card_country": card_country,
        "user_signup_age_days": signup_age,
    }
    try:
        await _db(lambda: supabase.table("flagged_payment_failures").insert(row).execute())
    except Exception as e:
        # 23505 = unique violation on (invoice_id, attempt_count) — duplicate webhook, expected
        if "23505" in str(e) or "duplicate" in str(e).lower():
            logger.debug("flag row already exists for invoice=%s attempt=%s", invoice.get("id"), invoice.get("attempt_count"))
        else:
            logger.error("failed to insert flagged_payment_failures row: %s", e)


async def _handle_invoice_payment_failed(data: dict) -> None:
    """
    Handle invoice.payment_failed — payment attempt failed.

    Marks the subscription as past_due so the subscription guard
    allows a grace period but warns the user. Also writes a structured
    row to flagged_payment_failures for human review (fraud detection).
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

    await _flag_payment_failure(
        user_id=user_id,
        invoice=invoice,
        customer_id=customer_id,
        subscription_id=subscription_id,
    )

    # Capture a server-side PostHog event so the funnel shows this
    # drop-off. The browser-side snippet can't see Stripe-side payment
    # failures because the user isn't on our domain when they happen.
    await posthog_client.capture(
        distinct_id=user_id,
        event="payment_failed",
        properties={"subscription_id": subscription_id},
    )


async def _handle_payment_method_attached(data: dict) -> None:
    """
    Handle payment_method.attached — user added/updated a card.

    Re-run the health check so a previously ``failing`` row clears back
    to ``healthy`` once the user replaces the dead card via the Customer
    Portal. Without this, the dashboard banner would stay red until the
    next daily cron run.
    """
    pm = data.get("object", {})
    customer_id = pm.get("customer")
    if not customer_id:
        return

    customer_row = await _db(lambda: supabase.table("stripe_customers")
        .select("user_id").eq("stripe_customer_id", customer_id).execute())
    if not customer_row.data:
        logger.debug("payment_method.attached for unknown customer %s", customer_id)
        return

    user_id = customer_row.data[0]["user_id"]
    try:
        await validate_payment_method(user_id)
    except Exception as e:
        logger.error("payment_health on PM-attach failed for %s: %s", user_id, e)


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


async def _reverse_referral_for_payment_intent(payment_intent_id: str, reason: str) -> None:
    """
    Map a refunded / disputed top-up payment_intent back to the referee who
    paid it, then claw back any referral reward that top-up unlocked.
    """
    if not payment_intent_id:
        return
    row = await _db(
        lambda: supabase.table("credit_transactions")
        .select("user_id")
        .eq("stripe_payment_intent_id", payment_intent_id)
        .limit(1)
        .execute()
    )
    if not row.data:
        return  # Not a credit top-up we recorded — nothing to reverse.
    referee_user_id = row.data[0]["user_id"]
    try:
        await referral_service.reverse_referrer_reward(referee_user_id, reason)
    except Exception as e:
        logger.error("Failed to reverse referral for referee %s: %s", referee_user_id[:8], e)


async def _handle_charge_refunded(data: dict) -> None:
    """Handle charge.refunded — claw back a referral reward if the refunded
    charge was a referee's qualifying credit top-up."""
    charge = data.get("object", {})
    await _reverse_referral_for_payment_intent(charge.get("payment_intent"), "refund")


async def _handle_dispute_funds_withdrawn(data: dict) -> None:
    """Handle charge.dispute.funds_withdrawn — we lost a dispute and funds were
    pulled. Claw back any referral reward the disputed top-up unlocked."""
    dispute = data.get("object", {})
    await _reverse_referral_for_payment_intent(dispute.get("payment_intent"), "chargeback")


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
    "payment_method.attached": _handle_payment_method_attached,
    # Referral clawback: reverse the $5 if the referee's funding falls through.
    "charge.refunded": _handle_charge_refunded,
    "charge.dispute.funds_withdrawn": _handle_dispute_funds_withdrawn,
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
