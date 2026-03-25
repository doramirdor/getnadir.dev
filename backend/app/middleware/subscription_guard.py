"""
Subscription enforcement middleware.

Gates completion requests behind an active subscription.
Free tier users get a limited number of requests per day.
"""
import asyncio
import logging
import time
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import HTTPException, Request, Depends

from app.auth.supabase_auth import validate_api_key, UserSession

logger = logging.getLogger(__name__)

# Free tier limits
FREE_TIER_DAILY_LIMIT = 50  # requests per day
FREE_TIER_RPM = 10  # requests per minute (vs 60 for paid)

# In-memory daily usage tracker for free tier (resets daily)
_free_usage: Dict[str, Tuple[int, float]] = {}  # user_id -> (count, day_start_ts)


def _get_day_start() -> float:
    """Get the start of the current UTC day as a timestamp."""
    import datetime
    now = datetime.datetime.utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return day_start.timestamp()


def _check_free_daily_limit(user_id: str) -> Tuple[bool, int]:
    """Check if a free-tier user is within their daily limit.

    Returns (allowed, remaining).
    """
    day_start = _get_day_start()

    if user_id in _free_usage:
        count, tracked_day = _free_usage[user_id]
        if tracked_day < day_start:
            # New day — reset
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

    - Active subscription (pro/enterprise): full access
    - past_due: allow with warning header (grace period)
    - canceled/inactive: free tier limits (50 req/day, 10 RPM)
    """
    sub_status = current_user.subscription_status

    if sub_status == "active":
        # Full access — store plan info for rate limiter
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60  # paid RPM
        return current_user

    if sub_status == "past_due":
        # Grace period: allow but warn
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60
        request.state.subscription_warning = "Your payment is past due. Please update your payment method."
        logger.warning("User %s has past_due subscription — allowing with grace period", current_user.id)
        return current_user

    # Free tier (inactive or canceled)
    allowed, remaining = _check_free_daily_limit(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "free_tier_limit_exceeded",
                "message": f"Free tier limit of {FREE_TIER_DAILY_LIMIT} requests/day exceeded. Upgrade to Pro for unlimited access.",
                "upgrade_url": "https://getnadir.com/pricing",
            },
        )

    request.state.subscription_plan = "free"
    request.state.rate_limit_rpm = FREE_TIER_RPM
    request.state.free_tier_remaining = remaining
    return current_user
