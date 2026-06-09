"""
Subscription enforcement middleware.

Pricing model: no base subscription fee. BYOK is billed monthly on savings;
Hosted is prepaid (credits drawn down at Bedrock cost + 20%) and gated on the
credit balance in hosted_budget.enforce_hosted_budget_or_402.

- Billing account active ($0 plan w/ card on file): full access, 60 RPM
- Unsubscribed BYOK users: 15 requests/day, 10 RPM, no fallback/optimize
- Hosted users: allowed here; the prepaid balance gate enforces payment
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
    FastAPI dependency that enforces access tier.

    - Active billing account: full access (hosted + BYOK), 60 RPM
    - past_due: allow with warning (the past-due item is the monthly savings
      fee; Hosted AWS cost is already prepaid, so no hard cutoff here)
    - Inactive/canceled + BYOK: free tier (15 req/day, 10 RPM)
    - Hosted: always allowed here — the prepaid balance gate in
      hosted_budget.enforce_hosted_budget_or_402 enforces payment
    """
    sub_status = current_user.subscription_status

    if sub_status == "active":
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60
        return current_user

    if sub_status == "past_due":
        # The past-due item is the monthly savings fee. Hosted AWS cost is
        # covered by the prepaid balance, so there's no Bedrock exposure to
        # protect against — allow both modes with a warning and let dunning
        # recover the savings invoice.
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60
        request.state.subscription_warning = "Your payment is past due. Please update your payment method."
        logger.warning("User %s has past_due subscription — allowing with grace period", current_user.id)
        return current_user

    # ── Unsubscribed user ──────────────────────────────────────────

    # Hosted is prepaid — allow through; the credit-balance gate in
    # hosted_budget.enforce_hosted_budget_or_402 blocks if the balance is empty.
    if current_user.key_mode == "hosted":
        request.state.subscription_plan = current_user.subscription_plan
        request.state.rate_limit_rpm = 60
        return current_user

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
