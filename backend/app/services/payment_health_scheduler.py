"""
Daily payment-method health scheduler.

Once a day, finds every active subscriber whose ``current_period_end``
lands 4-6 days from now and re-runs the card validation. This catches
cards that died between signup and the upcoming renewal — issuer fraud
hold, expired, replaced, frozen — and gives the user time to update the
card before Stripe actually fails the invoice and we have to flip them
to ``past_due``.

The 4-6 day window is deliberately three days wide: if a daily run
misses (deploy restart, scheduler crash), the next run still catches
the same user the day after — they don't fall through.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.auth.supabase_auth import supabase
from app.services.payment_health import validate_payment_method

logger = logging.getLogger(__name__)

# Run daily at 09:00 UTC. Late enough that Stripe's nightly retry
# attempts have already cleared, early enough that an alerted user has
# the whole business day to update their card.
_RUN_HOUR_UTC = 9
_RUN_MINUTE_UTC = 0

# Window: 4–6 days before period_end. Three-day spread tolerates one
# missed run without dropping any user.
_LOOKAHEAD_MIN_DAYS = 4
_LOOKAHEAD_MAX_DAYS = 6


async def run_payment_health_check() -> dict:
    """
    Re-validate cards for every active subscriber whose next invoice
    posts in the configured lookahead window.

    Returns a summary dict for logging.
    """
    now = datetime.now(timezone.utc)
    window_start_epoch = int((now + timedelta(days=_LOOKAHEAD_MIN_DAYS)).timestamp())
    window_end_epoch = int((now + timedelta(days=_LOOKAHEAD_MAX_DAYS)).timestamp())

    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("user_subscriptions")
            .select("user_id, current_period_end")
            .eq("status", "active")
            .gte("current_period_end", window_start_epoch)
            .lte("current_period_end", window_end_epoch)
            .execute()
        )
    except Exception as e:
        logger.error("payment_health: failed to query subscribers: %s", e)
        return {"checked": 0, "healthy": 0, "failing": 0, "error": str(e)}

    users = result.data or []
    logger.info(
        "payment_health: checking %d subs (period_end between %s and %s)",
        len(users),
        datetime.fromtimestamp(window_start_epoch, tz=timezone.utc).isoformat(),
        datetime.fromtimestamp(window_end_epoch, tz=timezone.utc).isoformat(),
    )

    healthy = 0
    failing = 0
    for row in users:
        user_id = row["user_id"]
        try:
            ok = await validate_payment_method(user_id)
            if ok:
                healthy += 1
            else:
                failing += 1
        except Exception as e:
            # validate_payment_method already swallows its own errors,
            # but defense in depth: a bug here must not abort the loop.
            logger.error("payment_health: unexpected error for %s: %s", user_id, e)
            failing += 1

    summary = {
        "checked": len(users),
        "healthy": healthy,
        "failing": failing,
    }
    logger.info("payment_health daily run complete: %s", summary)
    return summary


def _seconds_until_next_run() -> float:
    """Return seconds until the next 09:00 UTC tick."""
    now = datetime.now(timezone.utc)
    target = now.replace(
        hour=_RUN_HOUR_UTC, minute=_RUN_MINUTE_UTC, second=0, microsecond=0
    )
    if target <= now:
        target = target + timedelta(days=1)
    return max((target - now).total_seconds(), 0)


async def payment_health_scheduler_loop():
    """Long-running asyncio loop that fires the health check daily."""
    while True:
        wait_seconds = _seconds_until_next_run()
        next_run = datetime.now(timezone.utc) + timedelta(seconds=wait_seconds)
        logger.info(
            "payment_health scheduler: next run at %s UTC (in %.1f hours)",
            next_run.strftime("%Y-%m-%d %H:%M:%S"),
            wait_seconds / 3600,
        )
        await asyncio.sleep(wait_seconds)

        try:
            await run_payment_health_check()
        except Exception as e:
            logger.error("payment_health scheduler iteration failed: %s", e, exc_info=True)
