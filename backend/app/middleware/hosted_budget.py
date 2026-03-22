"""
Per-user hosted token budget enforcement.

When users use Nadir's hosted Bedrock keys (not BYOK), we need to cap
their spend so one user can't burn through our AWS budget.

Defaults:
  - Free tier: $5/month
  - Pro tier: $500/month (adjustable per-user via profile.hosted_budget_usd)

Budget is tracked via the existing usage_logs table (cost column) and
checked in-memory with periodic DB sync to avoid per-request DB queries.
"""
import asyncio
import logging
import time
from collections import defaultdict
from typing import Dict, Optional, Tuple

from app.auth.supabase_auth import supabase

logger = logging.getLogger(__name__)

# Default monthly budgets by plan
DEFAULT_HOSTED_BUDGET = {
    "free": 5.0,     # $5/month for free tier
    "pro": 500.0,    # $500/month for pro
    "enterprise": 5000.0,
}

# In-memory spend tracker: user_id -> (total_spent_usd, last_db_sync_ts)
_spend_cache: Dict[str, Tuple[float, float]] = {}
_SYNC_INTERVAL = 300  # Re-sync from DB every 5 minutes


def _get_month_start_iso() -> str:
    """Get the start of the current UTC month as ISO string."""
    from datetime import datetime
    now = datetime.utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


async def _load_monthly_spend(user_id: str) -> float:
    """Load total spend this month from usage_logs for hosted requests."""
    try:
        month_start = _get_month_start_iso()
        result = await asyncio.to_thread(
            lambda: supabase.table("usage_logs")
            .select("cost")
            .eq("user_id", user_id)
            .gte("created_at", month_start)
            .execute()
        )
        if result.data:
            return sum(float(row.get("cost", 0) or 0) for row in result.data)
        return 0.0
    except Exception as e:
        logger.warning("Failed to load hosted spend for user %s: %s", user_id, e)
        return 0.0


async def get_hosted_spend(user_id: str) -> float:
    """Get cached monthly spend, syncing from DB periodically."""
    now = time.monotonic()
    if user_id in _spend_cache:
        spent, last_sync = _spend_cache[user_id]
        if now - last_sync < _SYNC_INTERVAL:
            return spent

    # Sync from DB
    spent = await _load_monthly_spend(user_id)
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
    Check if a hosted-mode user is within their monthly spend budget.

    Args:
        user_id: User ID
        plan: Subscription plan (free, pro, enterprise)
        custom_budget: Per-user custom budget override (from profile.hosted_budget_usd)

    Returns:
        (allowed, spent, budget_limit)
    """
    budget = custom_budget or DEFAULT_HOSTED_BUDGET.get(plan, DEFAULT_HOSTED_BUDGET["free"])
    spent = await get_hosted_spend(user_id)

    if spent >= budget:
        logger.warning(
            "Hosted budget exceeded for user %s: $%.2f / $%.2f (%s plan)",
            user_id, spent, budget, plan,
        )
        return False, spent, budget

    return True, spent, budget
