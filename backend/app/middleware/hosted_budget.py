"""
Per-user hosted token budget enforcement.

When users use Nadir's hosted Bedrock keys (not BYOK), we need to cap
their daily spend so one user can't burn through our AWS budget.

Defaults:
  - All tiers: $50/day (adjustable per-user via profile.hosted_budget_usd)
  - Contact support to increase.

Budget is tracked via the existing usage_logs table (cost column) and
checked in-memory with periodic DB sync to avoid per-request DB queries.
"""
import asyncio
import logging
import time
from typing import Dict, Optional, Tuple

from app.auth.supabase_auth import supabase

logger = logging.getLogger(__name__)

# Default DAILY budget for hosted keys (same for all plans)
DEFAULT_DAILY_HOSTED_BUDGET = 50.0  # $50/day

# Tightened budget for users in their first 30 days of subscription. FIRST1
# zeroes the first invoice, so a determined user can use Hosted for ~30 days
# without paying us anything. Capping daily spend during this window bounds
# our worst-case AWS Bedrock exposure on trial users.
TRIAL_DAILY_HOSTED_BUDGET = 5.0  # $5/day for first 30 days
TRIAL_WINDOW_DAYS = 30

# In-memory spend tracker: user_id -> (total_spent_usd, last_db_sync_ts)
_spend_cache: Dict[str, Tuple[float, float]] = {}
_SYNC_INTERVAL = 300  # Re-sync from DB every 5 minutes


def _get_day_start_iso() -> str:
    """Get the start of the current UTC day as ISO string."""
    from datetime import datetime
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


async def _load_daily_spend(user_id: str) -> float:
    """Load total spend today from usage_logs for hosted requests."""
    try:
        day_start = _get_day_start_iso()
        result = await asyncio.to_thread(
            lambda: supabase.table("usage_logs")
            .select("cost")
            .eq("user_id", user_id)
            .gte("created_at", day_start)
            .execute()
        )
        if result.data:
            return sum(float(row.get("cost", 0) or 0) for row in result.data)
        return 0.0
    except Exception as e:
        logger.warning("Failed to load hosted spend for user %s: %s", user_id, e)
        return 0.0


async def get_hosted_spend(user_id: str) -> float:
    """Get cached daily spend, syncing from DB periodically."""
    now = time.monotonic()
    if user_id in _spend_cache:
        spent, last_sync = _spend_cache[user_id]
        if now - last_sync < _SYNC_INTERVAL:
            return spent

    # Sync from DB
    spent = await _load_daily_spend(user_id)
    _spend_cache[user_id] = (spent, now)
    return spent


def record_hosted_spend(user_id: str, cost_usd: float):
    """Add to in-memory spend tracker after a hosted request completes.

    Called from background task after LLM response, so it doesn't block.
    """
    now = time.monotonic()
    if user_id in _spend_cache:
        current, last_sync = _spend_cache[user_id]
        _spend_cache[user_id] = (current + cost_usd, last_sync)
    else:
        _spend_cache[user_id] = (cost_usd, now)


async def check_hosted_budget(user_id: str, plan: str, custom_budget: Optional[float] = None) -> Tuple[bool, float, float]:
    """
    Check if a hosted-mode user is within their daily spend budget.

    Args:
        user_id: User ID
        plan: Subscription plan (free, pro, enterprise)
        custom_budget: Per-user custom budget override (from profile.hosted_budget_usd)

    Returns:
        (allowed, spent_today, daily_budget_limit)
    """
    budget = custom_budget or DEFAULT_DAILY_HOSTED_BUDGET
    spent = await get_hosted_spend(user_id)

    if spent >= budget:
        logger.warning(
            "Hosted daily budget exceeded for user %s: $%.2f / $%.2f (%s plan)",
            user_id, spent, budget, plan,
        )
        return False, spent, budget

    return True, spent, budget


def _is_in_trial_window(subscription_created_at: Optional[str]) -> bool:
    """True if the subscription was created within TRIAL_WINDOW_DAYS days.

    First-month FIRST1 users pay $0 on their first invoice. We tighten the
    daily Hosted budget while they're in this window so a single user can't
    abuse the trial for $1500+ in AWS Bedrock spend before cancelling.
    """
    if not subscription_created_at:
        return False
    try:
        from datetime import datetime, timezone, timedelta
        # Supabase returns ISO timestamps — normalize trailing Z if present.
        ts = subscription_created_at.replace("Z", "+00:00") if subscription_created_at.endswith("Z") else subscription_created_at
        created = datetime.fromisoformat(ts)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - created) < timedelta(days=TRIAL_WINDOW_DAYS)
    except Exception as e:
        logger.debug("Could not parse subscription_created_at=%r: %s", subscription_created_at, e)
        return False


async def enforce_hosted_budget_or_402(current_user) -> None:
    """
    Convenience wrapper used by completion endpoints — raises HTTP 402 with a
    structured error body when the user has exceeded their daily Hosted spend
    budget. No-op for BYOK users. Centralized so legacy /v1/chat/completions
    and /v1/production/completions stay in lockstep.

    Budget resolution priority:
      1. Per-user `hosted_budget_usd` override (admin can lift the cap for VIPs)
      2. Trial-window cap ($5/day) if subscription < 30 days old
      3. Default $50/day
    """
    if current_user.key_mode != "hosted":
        return

    explicit_override = (
        current_user.raw_data.get("hosted_budget_usd")
        or (current_user.api_key_config or {}).get("hosted_budget_usd")
    )
    if explicit_override:
        custom_budget = explicit_override
    elif _is_in_trial_window(getattr(current_user, "subscription_created_at", None)):
        custom_budget = TRIAL_DAILY_HOSTED_BUDGET
        logger.debug("User %s in trial window — using $%.0f/day cap", current_user.id, TRIAL_DAILY_HOSTED_BUDGET)
    else:
        custom_budget = None  # falls through to DEFAULT_DAILY_HOSTED_BUDGET in check_hosted_budget

    allowed, spent, budget = await check_hosted_budget(
        current_user.id, current_user.subscription_plan, custom_budget
    )
    if not allowed:
        # Lazy import to avoid circular deps (FastAPI imports app routes,
        # routes import this middleware).
        from fastapi import HTTPException
        raise HTTPException(
            status_code=402,
            detail={
                "error": "hosted_budget_exceeded",
                "message": (
                    f"Daily hosted budget of ${budget:.0f} exceeded "
                    f"(spent today: ${spent:.2f}). Add your own provider keys "
                    "(BYOK) for unlimited usage, or contact support to increase "
                    "your limit."
                ),
                "spent": spent,
                "budget": budget,
                "upgrade_url": "https://getnadir.com/pricing",
            },
        )
