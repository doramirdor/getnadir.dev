"""
Referral service.

Each user gets a unique code (e.g. AMIR12345). When they share it and a new
user signs up via that link:
  - The referee gets nothing extra; they just need to fund their account.
  - The referrer earns $5 in Nadir credit the first time that referee tops up
    $10 or more in prepaid credit. Triggered from the credit_topup branch of
    stripe_webhooks._handle_checkout_session_completed.
"""

import asyncio
import logging
from decimal import Decimal
from typing import Optional

import stripe

from app.auth.supabase_auth import supabase
from app.settings import settings

logger = logging.getLogger(__name__)

# Mirror stripe_service.py: set the API key at module load. We can't rely on
# stripe_service.py to have been imported first — main.py imports
# stripe_webhooks (which imports this file) before billing_api/stripe_service.
if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY


# Credit granted to the referrer once their referee makes a qualifying top-up.
REFERRAL_REWARD_USD = Decimal("5.00")
# Minimum referee prepaid-credit top-up that unlocks the referrer's reward.
REFERRAL_MIN_TOPUP_USD = Decimal("10.00")


async def _db(fn):
    return await asyncio.to_thread(fn)


async def get_or_create_code(user_id: str, email: Optional[str] = None) -> Optional[str]:
    """
    Return the user's referral code. Code is normally seeded by the
    handle_new_user trigger; this is a safety net for older accounts.
    """
    try:
        result = await _db(
            lambda: supabase.table("referral_codes")
            .select("code")
            .eq("user_id", user_id)
            .execute()
        )
        if result.data:
            return result.data[0]["code"]

        # Fallback: generate a code via the Postgres helper.
        rpc = await _db(
            lambda: supabase.rpc(
                "generate_referral_code", {"email": email or ""}
            ).execute()
        )
        code = rpc.data if isinstance(rpc.data, str) else None
        if not code:
            logger.error("generate_referral_code returned empty for user %s", user_id)
            return None

        await _db(
            lambda: supabase.table("referral_codes")
            .insert({"user_id": user_id, "code": code})
            .execute()
        )
        return code
    except Exception as e:
        logger.error("get_or_create_code failed for %s: %s", user_id, e)
        return None


async def find_referrer_by_code(code: str) -> Optional[str]:
    """Look up the referrer user_id for a given code, or None."""
    if not code:
        return None
    code = code.strip().upper()
    try:
        result = await _db(
            lambda: supabase.table("referral_codes")
            .select("user_id")
            .eq("code", code)
            .execute()
        )
        if result.data:
            return result.data[0]["user_id"]
    except Exception as e:
        logger.error("find_referrer_by_code(%s) failed: %s", code, e)
    return None


async def record_referral(
    *, code: str, referee_user_id: str
) -> Optional[dict]:
    """
    Record a new referral when a referee signs up with a code.

    Idempotent: if the referee already has a referral row, returns it.
    Self-referrals are stored with status='rejected'.
    Returns the referral row dict, or None on error.
    """
    if not code:
        return None
    code = code.strip().upper()

    # Already have a row for this referee?
    existing = await _db(
        lambda: supabase.table("referrals")
        .select("*")
        .eq("referee_user_id", referee_user_id)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    referrer_user_id = await find_referrer_by_code(code)
    if not referrer_user_id:
        logger.info("No referrer found for code %s", code)
        return None

    status = "pending"
    rejected_reason: Optional[str] = None
    if referrer_user_id == referee_user_id:
        status = "rejected"
        rejected_reason = "self_referral"

    try:
        result = await _db(
            lambda: supabase.table("referrals")
            .insert(
                {
                    "referrer_user_id": referrer_user_id,
                    "referee_user_id": referee_user_id,
                    "code": code,
                    "status": status,
                    "rejected_reason": rejected_reason,
                }
            )
            .execute()
        )
        if result.data:
            logger.info(
                "Recorded referral: referrer=%s referee=%s code=%s status=%s",
                referrer_user_id,
                referee_user_id,
                code,
                status,
            )
            return result.data[0]
    except Exception as e:
        logger.error("record_referral failed: %s", e)
    return None


async def get_referral_for_referee(referee_user_id: str) -> Optional[dict]:
    """Return the active (non-rejected) referral row for a referee, if any."""
    try:
        result = await _db(
            lambda: supabase.table("referrals")
            .select("*")
            .eq("referee_user_id", referee_user_id)
            .neq("status", "rejected")
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error("get_referral_for_referee failed: %s", e)
    return None


async def grant_referrer_reward_for_topup(
    referee_user_id: str, topup_amount_usd
) -> None:
    """
    Grant the referrer REFERRAL_REWARD_USD in Nadir credit the first time
    their referee tops up at least REFERRAL_MIN_TOPUP_USD in prepaid credit.

    Called from the credit_topup branch of
    stripe_webhooks._handle_checkout_session_completed.

    Idempotent: a referral row whose referrer_rewarded_at is already set is
    skipped, so only the first qualifying top-up pays out. Below-threshold
    top-ups are a no-op and leave the referral pending for a later one.
    """
    from datetime import datetime, timezone

    referral = await get_referral_for_referee(referee_user_id)
    if not referral:
        return
    if referral.get("referrer_rewarded_at"):
        return  # Already rewarded.

    if Decimal(str(topup_amount_usd)) < REFERRAL_MIN_TOPUP_USD:
        logger.info(
            "Referee %s top-up below $%s threshold — referral stays pending",
            referee_user_id[:8],
            REFERRAL_MIN_TOPUP_USD,
        )
        return

    referrer_user_id = referral["referrer_user_id"]

    # Reward is spendable Nadir credit, matching the prepaid-credit the referee
    # just bought. Idempotency is enforced by referrer_rewarded_at below, so we
    # don't pass a payment_intent id (the credits ledger would otherwise dedupe
    # against the referee's top-up intent, not this reward).
    try:
        from app.services.credits_service import credits_service

        await credits_service.add_credits(
            referrer_user_id,
            REFERRAL_REWARD_USD,
            description=f"Referral reward (referee={referee_user_id[:8]})",
        )
    except Exception as e:
        logger.error("Failed to credit referrer %s: %s", referrer_user_id, e)
        return  # Leave the row un-rewarded so a retry can pay out.

    try:
        await _db(
            lambda: supabase.table("referrals")
            .update(
                {
                    "status": "rewarded",
                    "referrer_rewarded_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", referral["id"])
            .execute()
        )
    except Exception as e:
        logger.error("Failed to mark referrer_rewarded: %s", e)

    logger.info(
        "Granted referrer reward: user=%s amount=$%s referee=%s",
        referrer_user_id,
        REFERRAL_REWARD_USD,
        referee_user_id[:8],
    )


async def drain_pending_credits(user_id: str, customer_id: str) -> int:
    """
    Apply any queued referral credits to the user's Stripe balance.

    Called when stripe_customers gets a new row (i.e. the referrer just
    started a subscription). Returns the number of credits applied.
    """
    pending = await _db(
        lambda: supabase.table("referral_pending_credits")
        .select("*")
        .eq("user_id", user_id)
        .is_("applied_at", None)
        .execute()
    )
    if not pending.data:
        return 0

    from datetime import datetime, timezone

    applied = 0
    for row in pending.data:
        try:
            await asyncio.to_thread(
                lambda r=row: stripe.Customer.create_balance_transaction(
                    customer_id,
                    amount=-r["amount_cents"],
                    currency="usd",
                    description="Nadir referral reward (queued)",
                )
            )
            await _db(
                lambda r=row: supabase.table("referral_pending_credits")
                .update({"applied_at": datetime.now(timezone.utc).isoformat()})
                .eq("id", r["id"])
                .execute()
            )
            applied += 1
        except Exception as e:
            logger.error("Failed to drain pending credit %s: %s", row["id"], e)

    if applied:
        logger.info("Drained %d pending referral credits for user %s", applied, user_id)
    return applied


async def get_referrer_summary(user_id: str) -> dict:
    """
    Aggregate referrer stats for the dashboard page:
      - code: their referral code
      - signed_up: referees who signed up but haven't made a qualifying top-up
      - subscribed: legacy free-month state; ~0 for referrals under the credit
        model (kept so old rows still tally)
      - rewarded: referees whose qualifying top-up paid out the referrer
      - credit_earned_usd: total Nadir credit earned (rewarded x REFERRAL_REWARD_USD)
    """
    code = await get_or_create_code(user_id)

    rows = await _db(
        lambda: supabase.table("referrals")
        .select("status, created_at, referee_user_id")
        .eq("referrer_user_id", user_id)
        .neq("status", "rejected")
        .order("created_at", desc=True)
        .execute()
    )

    counts = {"pending": 0, "subscribed": 0, "rewarded": 0}
    for row in rows.data or []:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    return {
        "code": code,
        "total": sum(counts.values()),
        "signed_up": counts["pending"],
        "subscribed": counts["subscribed"],
        "rewarded": counts["rewarded"],
        "credit_earned_usd": float(counts["rewarded"] * REFERRAL_REWARD_USD),
        "recent": rows.data[:10] if rows.data else [],
    }
