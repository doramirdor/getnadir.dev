"""
Stripe webhook handler for Nadir SaaS platform.

Receives and processes Stripe events for subscription lifecycle,
payment processing, and credit management.
"""

import asyncio
import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.auth.supabase_auth import supabase
from app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stripe"])


async def _db(fn):
    """Run a synchronous Supabase call in a thread to avoid blocking the event loop."""
    return await asyncio.to_thread(fn)


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

    # Upsert subscription record
    await _db(lambda: supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id,
            "stripe_customer_id": customer_id,
            "stripe_subscription_id": subscription_id,
            "status": "active",
            "cancel_at_period_end": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute())

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

    await _db(lambda: supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id, "stripe_customer_id": customer_id,
            "stripe_subscription_id": subscription_id, "status": sub_status,
            "current_period_start": sub.get("current_period_start"),
            "current_period_end": sub.get("current_period_end"),
            "cancel_at_period_end": sub.get("cancel_at_period_end", False),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id",
    ).execute())

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

    await _db(lambda: supabase.table("user_subscriptions").update(
        {"status": "canceled", "updated_at": datetime.now(timezone.utc).isoformat()}
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

    # Update subscription status if applicable
    if subscription_id:
        await _db(lambda: supabase.table("user_subscriptions").update(
            {"status": "active", "updated_at": datetime.now(timezone.utc).isoformat()}
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

    await _db(lambda: supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id, "stripe_customer_id": customer_id,
            "stripe_subscription_id": subscription_id, "status": sub_status,
            "current_period_start": sub.get("current_period_start"),
            "current_period_end": sub.get("current_period_end"),
            "cancel_at_period_end": sub.get("cancel_at_period_end", False),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id",
    ).execute())

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

    await _db(lambda: supabase.table("user_subscriptions").update(
        {"status": "past_due", "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("stripe_subscription_id", subscription_id).execute())

    logger.warning(
        "Payment failed: user=%s sub=%s — marked as past_due",
        user_id, subscription_id,
    )


# ------------------------------------------------------------------
# Webhook endpoint
# ------------------------------------------------------------------

EVENT_HANDLERS = {
    "checkout.session.completed": _handle_checkout_session_completed,
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

    event_id = event.get("id", "unknown")
    event_type = event.get("type", "unknown")

    logger.info("Received Stripe event: %s (%s)", event_type, event_id)

    # Atomic idempotency: insert the event FIRST.
    # The stripe_event_id UNIQUE constraint ensures only one worker
    # can claim a given event — all others get a duplicate-key error.
    try:
        await _store_event(event_id, event_type, event)
    except Exception as e:
        if "duplicate" in str(e).lower() or "23505" in str(e):
            logger.info("Duplicate event %s — skipping", event_id)
            return {"status": "already_processed"}
        raise

    # Now safe to run the handler (we hold the unique row)
    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            await handler(event.get("data", {}))
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
