"""
Monthly invoice scheduler for savings-based billing.

Runs on the 1st of each month at 00:05 UTC. For each active subscriber,
calculates the savings fee for the previous month, stores an invoice
record, and attaches a usage-based line item to their next Stripe invoice.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta

from app.auth.supabase_auth import supabase
from app.services.savings_billing_service import SavingsBillingService
from app.services.stripe_service import stripe_service

logger = logging.getLogger(__name__)


async def run_monthly_invoicing() -> dict:
    """
    Run monthly invoicing for all active subscribers.

    Calculates the previous calendar month's savings fee for each user,
    stores an invoice record in the database, and creates a Stripe
    usage invoice item so the fee appears on their next bill.

    Returns a summary dict with counts of processed / skipped / failed users.
    """
    today = date.today()
    # Billing period = previous calendar month
    period_end = today.replace(day=1)  # 1st of current month
    period_start = (period_end - timedelta(days=1)).replace(day=1)  # 1st of previous month

    logger.info(
        "Starting monthly invoicing for period %s to %s",
        period_start.isoformat(),
        period_end.isoformat(),
    )

    # Fetch all active subscribers
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("user_subscriptions")
            .select("user_id")
            .eq("status", "active")
            .execute()
        )
    except Exception as e:
        logger.error("Failed to query active subscribers: %s", e)
        return {"processed": 0, "skipped": 0, "failed": 0, "error": str(e)}

    users = result.data or []
    logger.info("Found %d active subscribers to invoice", len(users))

    billing_service = SavingsBillingService(supabase)

    processed = 0
    skipped = 0
    failed = 0

    for row in users:
        user_id = row["user_id"]
        try:
            # Calculate the invoice for this period
            invoice = await billing_service.calculate_monthly_invoice(
                user_id, period_start, period_end
            )

            if invoice.savings_fee_usd <= 0:
                logger.info(
                    "User %s: no savings fee (savings=$%.2f) — skipping",
                    user_id,
                    invoice.total_savings_usd,
                )
                skipped += 1
                continue

            # Store invoice record in the database
            await billing_service.generate_and_store_invoice(
                user_id, period_start, period_end
            )

            # Attach usage-based line item to their next Stripe invoice
            amount_cents = int(round(invoice.savings_fee_usd * 100))
            description = (
                f"Nadir savings fee ({period_start.strftime('%b %Y')}): "
                f"${invoice.total_savings_usd:.2f} saved, "
                f"${invoice.savings_fee_usd:.2f} fee"
            )

            item_id = await stripe_service.create_usage_invoice_item(
                user_id=user_id,
                amount_cents=amount_cents,
                description=description,
            )

            if item_id:
                logger.info(
                    "User %s: invoiced $%.2f savings fee (Stripe item %s)",
                    user_id,
                    invoice.savings_fee_usd,
                    item_id,
                )
            else:
                logger.warning(
                    "User %s: invoice stored but no Stripe customer — "
                    "savings fee $%.2f not attached to Stripe",
                    user_id,
                    invoice.savings_fee_usd,
                )

            processed += 1

        except Exception as e:
            logger.error("Failed to invoice user %s: %s", user_id, e, exc_info=True)
            failed += 1

    summary = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_users": len(users),
        "processed": processed,
        "skipped": skipped,
        "failed": failed,
    }
    logger.info("Monthly invoicing complete: %s", summary)
    return summary


def _seconds_until_next_first_of_month() -> float:
    """Return seconds from now until the 1st of the next month at 00:05 UTC."""
    now = datetime.utcnow()
    if now.month == 12:
        next_first = datetime(now.year + 1, 1, 1, 0, 5, 0)
    else:
        next_first = datetime(now.year, now.month + 1, 1, 0, 5, 0)
    delta = (next_first - now).total_seconds()
    return max(delta, 0)


async def invoice_scheduler_loop():
    """
    Long-running loop that fires ``run_monthly_invoicing`` on the 1st of
    each month at 00:05 UTC, then sleeps until the next 1st.
    """
    while True:
        wait_seconds = _seconds_until_next_first_of_month()
        next_run = datetime.utcnow() + timedelta(seconds=wait_seconds)
        logger.info(
            "Invoice scheduler: next run at %s UTC (in %.1f hours)",
            next_run.strftime("%Y-%m-%d %H:%M:%S"),
            wait_seconds / 3600,
        )
        await asyncio.sleep(wait_seconds)

        try:
            await run_monthly_invoicing()
        except Exception as e:
            logger.error("Invoice scheduler run failed: %s", e, exc_info=True)
