"""
Hosted token budget enforcement (per-user + global).

When users use Nadir's hosted Bedrock keys (not BYOK), every request spends
Nadir's own AWS Bedrock budget, so we gate it at two levels:

  1. Per-user daily cap — one user can't burn the budget on their own.
       - All tiers: $50/day (adjustable per-user via profile.hosted_budget_usd)
       - $5/day for the first 30 days. Contact support to increase.
  2. Global daily circuit breaker — a swarm of accounts (Sybil / stolen-card
     abuse) or a pricing bug can't collectively run up the bill, because no
     single per-user cap sees the aggregate. Trips before the Bedrock call
     when total hosted spend for the UTC day crosses NADIR_GLOBAL_HOSTED_DAILY_USD.

The global breaker is the in-app early valve; the authoritative hard backstop
is the AWS Budgets action that detaches the Bedrock IAM policy (configured
outside this repo).

Budget is tracked via the existing usage_logs table (cost column) and
checked in-memory with periodic DB sync to avoid per-request DB queries.
"""
import asyncio
import logging
import os
import time
from typing import Dict, Optional, Tuple

from app.auth.supabase_auth import supabase

logger = logging.getLogger(__name__)

# Default DAILY budget for hosted keys (same for all plans)
DEFAULT_DAILY_HOSTED_BUDGET = 50.0  # $50/day

# Tightened budget for users in their first 30 days. Hosted usage is now
# prepaid (credits drawn down at cost + 20%), but a daily cap during the early
# window still bounds worst-case AWS Bedrock exposure as a second line of
# defense behind the prepaid balance gate.
TRIAL_DAILY_HOSTED_BUDGET = 5.0  # $5/day for first 30 days
TRIAL_WINDOW_DAYS = 30

# NOTE: There is no free no-card hosted allowance. Hosted usage draws Nadir's
# own Bedrock spend, and a stolen card passes the $0 SetupIntent "healthy"
# check (see payment_health.validate_payment_method), so a card-on-file is not
# an abuse-proof signal. The only safe gate is a real captured charge: hosted
# requests require a positive prepaid balance, enforced in
# enforce_hosted_budget_or_402 below. BYOK is unaffected (it costs us nothing).

# Global daily Bedrock spend ceiling across ALL hosted users. A fast, graceful
# safety valve: when total hosted spend for the current UTC day crosses this,
# we 503 hosted requests until midnight UTC (BYOK is unaffected). Per-user caps
# can't see the aggregate, so this is what stops a Sybil swarm or a pricing bug
# from running up Nadir's AWS bill. Set <= 0 to disable. Tune via env without a
# redeploy. The authoritative hard stop remains the AWS Budgets IAM action.
#
# COVERAGE CAVEAT: the 503 gate runs on every endpoint that calls
# enforce_hosted_budget_or_402, but the *counter* feeding it is currently sourced
# only from the canonical production completion path (in-memory record_hosted_spend
# + savings_tracking reconciliation). The legacy /v1/chat/completions, /v1/messages,
# and /playground paths gate on this breaker but do NOT yet record hosted spend or
# draw down credits, so their hosted usage is bounded only by the per-user balance
# gate and the AWS Budgets backstop — not by this aggregate. Route those paths'
# post-response accounting through record_hosted_spend to close the evasion gap.
GLOBAL_DAILY_HOSTED_BUDGET = float(os.getenv("NADIR_GLOBAL_HOSTED_DAILY_USD", "200") or 0)

# In-memory spend tracker: user_id -> (total_spent_usd, last_db_sync_ts)
_spend_cache: Dict[str, Tuple[float, float]] = {}
_SYNC_INTERVAL = 300  # Re-sync from DB every 5 minutes

# Aggregate hosted spend for the current UTC day. In-memory + periodic DB
# reconciliation so the counter self-heals after an app restart instead of
# resetting to zero (which would hand an attacker a fresh global budget).
#   day:       UTC day-start ISO this total belongs to (rolls over at midnight)
#   spent:     running total USD
#   last_sync: time.monotonic() of the last DB reconciliation (0 = force resync)
_global_spend: Dict[str, object] = {"day": "", "spent": 0.0, "last_sync": 0.0}


def _get_day_start_iso() -> str:
    """Get the start of the current UTC day as ISO string."""
    from datetime import datetime
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _get_month_start_iso() -> str:
    """Get the start of the current UTC month as ISO string."""
    from datetime import datetime
    now = datetime.utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


async def get_monthly_request_count(user_id: str) -> int:
    """Count this user's requests this calendar month (all modes).

    Matches the frontend DailyQuotaBar semantics: a plain count of usage_logs
    rows since the start of the UTC month. Used by the BYOK free-trial gate in
    subscription_guard.require_active_subscription.
    """
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("usage_logs")
            .select("id", count="exact", head=True)
            .eq("user_id", user_id)
            .gte("created_at", _get_month_start_iso())
            .execute()
        )
        return int(result.count or 0)
    except Exception as e:
        logger.warning("Failed to count monthly requests for user %s: %s", user_id, e)
        # Fail closed: return a count high enough to exceed any free-trial limit
        # so we don't hand out free usage when the DB is unavailable.
        return 1_000_000_000


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
    """Add to in-memory spend trackers after a hosted request completes.

    Updates both the per-user cache and the global daily aggregate. Called from
    a background task after the LLM response, so it doesn't block.
    """
    now = time.monotonic()
    if user_id in _spend_cache:
        current, last_sync = _spend_cache[user_id]
        _spend_cache[user_id] = (current + cost_usd, last_sync)
    else:
        _spend_cache[user_id] = (cost_usd, now)

    _bump_global_spend(cost_usd)


def _bump_global_spend(cost_usd: float) -> None:
    """Increment the global daily aggregate, rolling over at UTC midnight."""
    day = _get_day_start_iso()
    if _global_spend["day"] != day:
        # New UTC day — reset and force a DB resync on the next read.
        _global_spend["day"] = day
        _global_spend["spent"] = 0.0
        _global_spend["last_sync"] = 0.0
    _global_spend["spent"] = float(_global_spend["spent"]) + cost_usd


async def _load_global_daily_spend() -> float:
    """Sum hosted-mode Bedrock spend across all users for the current UTC day.

    Sourced from savings_tracking.routed_cost_usd filtered to key_mode='hosted'
    — the same column the monthly Hosted markup rollup uses — so it counts only
    Nadir's AWS Bedrock cost and excludes BYOK rows (which cost Nadir nothing).
    """
    try:
        day_start = _get_day_start_iso()
        result = await asyncio.to_thread(
            lambda: supabase.table("savings_tracking")
            .select("routed_cost_usd")
            .eq("key_mode", "hosted")
            .gte("created_at", day_start)
            .execute()
        )
        if result.data:
            return sum(float(r.get("routed_cost_usd", 0) or 0) for r in result.data)
        return 0.0
    except Exception as e:
        logger.warning("Failed to load global hosted spend: %s", e)
        # Fail OPEN: a DB hiccup shouldn't take down hosted routing. The AWS
        # Budgets IAM action is the hard backstop if spend is genuinely runaway.
        return 0.0


async def get_global_hosted_spend_today() -> float:
    """Cached aggregate hosted spend for the current UTC day.

    Reconciles against the DB every _SYNC_INTERVAL so the in-memory counter
    self-heals after a restart. We take max(in-memory, DB): the in-memory total
    may lead the DB (savings_tracking is written from a background task), while
    the DB total leads after a restart. Same requests, so max() never
    double-counts — it just keeps whichever source is ahead.
    """
    now = time.monotonic()
    day = _get_day_start_iso()
    if _global_spend["day"] != day:
        _global_spend["day"] = day
        _global_spend["spent"] = 0.0
        _global_spend["last_sync"] = 0.0
    if now - float(_global_spend["last_sync"]) >= _SYNC_INTERVAL:
        db_spent = await _load_global_daily_spend()
        _global_spend["spent"] = max(float(_global_spend["spent"]), db_spent)
        _global_spend["last_sync"] = now
    return float(_global_spend["spent"])


def account_hosted_usage(current_user, cost_usd, request_id, background_tasks) -> None:
    """Record and bill a completed hosted request. No-op for BYOK or zero cost.

    Every endpoint that serves a hosted (Nadir-keyed) completion MUST call this
    after the response — otherwise that usage is BOTH free (the prepaid balance
    is never drawn down) AND invisible to the per-user daily cap and the global
    circuit breaker. Centralized here so a new or legacy endpoint can't silently
    skip it:

      1. record_hosted_spend — feeds the per-user cap + global breaker
         (in-memory, immediate).
      2. credit drawdown — bills the prepaid balance at Bedrock cost + 20%, then
         maybe auto-recharges. Runs in the background so it never blocks the
         response, matching the production path's behavior.

    Callers that also have benchmark/token data should still write their own
    savings_tracking row (the production path does) for the monthly invoice
    rollup; this helper intentionally omits it so it stays callable from
    endpoints that lack that context.
    """
    if getattr(current_user, "key_mode", None) != "hosted":
        return
    try:
        cost = float(cost_usd or 0)
    except (TypeError, ValueError):
        return
    if cost <= 0:
        return

    uid = str(current_user.id)
    record_hosted_spend(uid, cost)

    async def _draw_down_credits():
        try:
            from app.services.credits_service import (
                credits_service,
                hosted_charge_for_cost,
            )

            await credits_service.deduct(
                uid,
                hosted_charge_for_cost(cost),
                request_id=request_id,
                description="Hosted usage",
            )
            await credits_service.maybe_auto_recharge(uid)
        except Exception as draw_err:
            logger.warning("Credit drawdown failed for %s: %s", request_id, draw_err)

    background_tasks.add_task(_draw_down_credits)


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

    New accounts get a tighter daily Hosted cap so a single user can't run up
    a large AWS Bedrock bill before their prepaid balance and usage patterns
    are established.
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
    structured error body when a Hosted user can't pay for the request. No-op
    for BYOK users. Centralized so legacy /v1/chat/completions and
    /v1/production/completions stay in lockstep.

    Hosted usage is strictly prepaid: the user must hold a positive credit
    balance (topped up in $5 multiples, drawn down at Bedrock cost + 20%). When
    the balance hits zero we try auto-recharge; if that can't cover it, we 402.
    There is NO free no-card allowance — a stolen card passes the $0 SetupIntent
    "healthy" check, so the only abuse-proof gate is a real captured charge.
    BYOK is exempt entirely (the user pays their own provider).

    A daily spend cap still applies as defense-in-depth for paying users:
      1. Per-user `hosted_budget_usd` override (admin can lift the cap for VIPs)
      2. $5/day for the first 30 days, then $50/day
    """
    if current_user.key_mode != "hosted":
        return

    # Lazy imports to avoid circular deps (FastAPI imports app routes, routes
    # import this middleware).
    from fastapi import HTTPException
    from app.services.credits_service import credits_service

    # ── Global daily Bedrock circuit breaker ────────────────────────
    # Aggregate safety valve across ALL hosted users. Per-user caps can't see
    # the total, so this is what stops a swarm of accounts (or a pricing bug)
    # from collectively running up Nadir's AWS Bedrock bill. Returns 503, not
    # 402 — it isn't this user's fault, the condition is service-side and
    # transient (resets at UTC midnight), and BYOK users bypass it entirely.
    if GLOBAL_DAILY_HOSTED_BUDGET > 0:
        global_spent = await get_global_hosted_spend_today()
        if global_spent >= GLOBAL_DAILY_HOSTED_BUDGET:
            logger.critical(
                "GLOBAL hosted Bedrock budget tripped: $%.2f / $%.2f for UTC day "
                "%s — pausing hosted routing (user %s blocked). Investigate for "
                "abuse and confirm the AWS Budgets action did not also fire.",
                global_spent, GLOBAL_DAILY_HOSTED_BUDGET,
                _get_day_start_iso(), current_user.id,
            )
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "hosted_capacity_paused",
                    "message": (
                        "Nadir-hosted routing is temporarily paused while we "
                        "review unusually high usage. This resets shortly. To "
                        "keep routing now, switch to your own provider keys "
                        "(BYOK) — BYOK is unaffected."
                    ),
                    "retry_after_seconds": 3600,
                },
                headers={"Retry-After": "3600"},
            )

    # ── Prepaid credit balance gate ─────────────────────────────────
    balance = await credits_service.get_balance(str(current_user.id))
    if balance <= 0:
        # Last-ditch: if auto-recharge is enabled, try to top up now.
        recharged = await credits_service.maybe_auto_recharge(str(current_user.id))
        if recharged:
            balance = await credits_service.get_balance(str(current_user.id))

    if balance <= 0:
        # No prepaid balance and nothing to auto-charge. Block until the user
        # buys credits (a real, captured charge). We deliberately do NOT hand
        # out a free monthly allowance here: hosted spend is Nadir's own AWS
        # Bedrock cost, and a card-on-file is not proof of a real customer
        # (stolen cards pass the $0 verification). BYOK users never reach this
        # gate — they can route on their own keys with no prepaid balance.
        logger.info(
            "Hosted request blocked for user %s: zero credit balance, no auto-recharge",
            current_user.id,
        )
        raise HTTPException(
            status_code=402,
            detail={
                "error": "payment_required",
                "message": (
                    "Hosted keys require a prepaid balance. Add credits to start "
                    "routing on Nadir-hosted models, or switch to your own provider "
                    "keys (BYOK) — BYOK has no prepaid requirement, you're only "
                    "billed on the savings Nadir finds."
                ),
                "balance": float(balance),
                "topup_url": "https://getnadir.com/dashboard/billing",
            },
        )

    # ── Daily spend cap (defense-in-depth for paying users) ─────────
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
