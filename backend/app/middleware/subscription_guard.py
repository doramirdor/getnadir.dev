"""
Subscription enforcement middleware.

Gates completion requests behind an active subscription OR a free BYOK tier.

- Subscribed users: full access (hosted + BYOK), 60 RPM
- Unsubscribed BYOK users: 15 requests/day, 10 RPM, no fallback/optimize
- Unsubscribed hosted users: blocked (must subscribe to use Nadir's keys)
"""
import logging
import time
from typing import Dict, Tuple

from fastapi import HTTPException, Request, Depends

from app.auth.supabase_auth import validate_api_key, UserSession

logger = logging.getLogger(__name__)

# Free tier limits (BYOK only)
FREE_TIER_DAILY_LIMIT = 15
FREE_TIER_RPM = 10

# In-memory daily usage tracker: user_id -> (count, day_start_ts)
_free_usage: Dict[str, Tuple[int, float]] = {}


def _get_day_start() -> float:
    """Get the start of the current UTC day as a timestamp."""
    import datetime
    now = datetime.datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


def _check_free_daily_limit(user_id: str) -> Tuple[bool, int]:
    """Check if a free-tier user is within their daily limit.

    Returns (allowed, remaining).
    """
    day_start = _get_day_start()

    if user_id in _free_usage:
        count, tracked_day = _free_usage[user_id]
        if tracked_day < day_start:
            _free_usage[user_id] = (1, day_start)
            return True, FREE_TIER_DAILY_LIMIT - 1
        if count >= FREE_TIER_DAILY_LIMIT:
            return False, 0
        _free_usage[user_id] = (count + 1, tracked_day)
        return True, FREE_TIER_DAILY_LIMIT - count - 1
    else:
        _free_usage[user_id] = (1, day_start)
        return True, FREE_TIER_DAILY_LIMIT - 1


async def require_active_subscription(
    request: Request,
    current_user: UserSession = Depends(validate_api_key),
):
    """
    FastAPI dependency that enforces subscription status.

    - Active subscription: full access (hosted + BYOK), 60 RPM
    - past_due: allow with warning (grace period)
    - Inactive/canceled + BYOK: free tier (15 req/day, 10 RPM)
    - Inactive/canceled + hosted: reject with 402
    """
    sub_status = current_user.subscription_status

    if sub_status == "active":
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60
        return current_user

    if sub_status == "past_due":
        # Hosted mode is usage-billed against our AWS Bedrock account.
        # We do NOT extend grace to Hosted: a declining card means we'd be
        # paying Bedrock costs for ~3 weeks of Stripe smart retries with no
        # revenue. BYOK gets the grace period (no cost to us).
        if current_user.key_mode == "hosted":
            logger.warning(
                "User %s past_due on Hosted — rejecting until card is updated",
                current_user.id,
            )
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "payment_past_due",
                    "message": (
                        "Your payment is past due. Update your payment method to "
                        "continue using Nadir's hosted API keys, or switch to BYOK "
                        "(bring your own keys) to keep going for free."
                    ),
                    "upgrade_url": "https://getnadir.com/dashboard/billing",
                },
            )
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60
        request.state.subscription_warning = "Your payment is past due. Please update your payment method."
        logger.warning("User %s has past_due subscription on BYOK — allowing with grace period", current_user.id)
        return current_user

    # ── Unsubscribed user ──────────────────────────────────────────

    # Hosted keys require a subscription
    if current_user.key_mode == "hosted":
        raise HTTPException(
            status_code=402,
            detail={
                "error": "subscription_required",
                "message": (
                    "An active subscription is required to use Nadir's hosted API keys. "
                    "Subscribe at https://getnadir.com/dashboard/billing, "
                    "or switch to BYOK (bring your own keys) for free access."
                ),
                "upgrade_url": "https://getnadir.com/dashboard/billing",
            },
        )

    # BYOK — allow with daily limit
    allowed, remaining = _check_free_daily_limit(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "free_tier_limit_exceeded",
                "message": (
                    f"Free tier limit of {FREE_TIER_DAILY_LIMIT} requests/day exceeded. "
                    "Subscribe to Pro for unlimited access."
                ),
                "upgrade_url": "https://getnadir.com/dashboard/billing",
            },
        )

    request.state.subscription_plan = "free"
    request.state.rate_limit_rpm = FREE_TIER_RPM
    request.state.free_tier_remaining = remaining
    return current_user
