"""
Referral service.

Each user gets a unique code (e.g. AMIR12345). When they share it and a new
user signs up via that link:
  - The referee gets 1 month of Pro Base free, applied as a 100%-off coupon
    on their first checkout.
  - The referrer earns 1 month free when the referee's first paid invoice
    clears (handled in stripe_webhooks._handle_invoice_paid).
"""

import asyncio
import logging
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


# Stripe coupon used for the referee's free first month. Distinct from FIRST1
# so we can report referral redemptions separately and so it isn't subject to
# the first_time_transaction restriction (referrals are by definition
# first-time customers, but we don't need to gate on it: the referee_user_id
# uniqueness in referrals already prevents double-claim).
REFERRAL_REFEREE_COUPON_ID = "referral-free-month"

_coupon_ensured = False


def _ensure_referee_coupon() -> None:
    """
    Create the referral coupon if it doesn't exist. Lazy-fired on first
    use so any Stripe-side failure can't crash module import or worker boot.
    Idempotent: only attempts once per process.
    """
    global _coupon_ensured
    if _coupon_ensured or not settings.STRIPE_SECRET_KEY:
        return
    _coupon_ensured = True  # set first so a single transient failure doesn't retry forever
    try:
        stripe.Coupon.retrieve(REFERRAL_REFEREE_COUPON_ID)
    except stripe.error.InvalidRequestError:
        try:
            stripe.Coupon.create(
                id=REFERRAL_REFEREE_COUPON_ID,
                percent_off=100,
                duration="once",
                name="Referral - Free Month",
            )
            logger.info("Created Stripe coupon '%s'", REFERRAL_REFEREE_COUPON_ID)
        except Exception as e:
            logger.error("Failed to create referral coupon: %s", e)
    except Exception as e:
        logger.error("Failed to verify referral coupon: %s", e)


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


async def mark_referee_rewarded(referral_id: str) -> None:
    """Mark that the referee has redeemed their free-month coupon."""
    from datetime import datetime, timezone

    try:
        await _db(
            lambda: supabase.table("referrals")
            .update(
                {
                    "status": "subscribed",
                    "referee_rewarded_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", referral_id)
            .execute()
        )
    except Exception as e:
        logger.error("mark_referee_rewarded failed: %s", e)


async def grant_referrer_reward(referee_user_id: str) -> None:
    """
    Grant the referrer their free month when the referee's first real
    paid invoice clears.

    Idempotent: only fires if status='subscribed' (referee_rewarded_at is set
    but referrer_rewarded_at is not).
    """
    from datetime import datetime, timezone

    referral = await get_referral_for_referee(referee_user_id)
    if not referral:
        return
    if referral.get("referrer_rewarded_at"):
        return  # Already rewarded.

    referrer_user_id = referral["referrer_user_id"]
    amount_cents = _base_price_cents()

    customer_row = await _db(
        lambda: supabase.table("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", referrer_user_id)
        .execute()
    )

    granted_via = "queued"
    if customer_row.data:
        customer_id = customer_row.data[0]["stripe_customer_id"]
        try:
            # Negative amount = credit owed to the customer. Auto-applies to
            # the next invoice. Stacking N of these accumulates N free months.
            await asyncio.to_thread(
                lambda: stripe.Customer.create_balance_transaction(
                    customer_id,
                    amount=-amount_cents,
                    currency="usd",
                    description=f"Nadir referral reward (referee={referee_user_id[:8]})",
                )
            )
            granted_via = "stripe_balance"
        except Exception as e:
            logger.error("Failed to credit referrer %s: %s", referrer_user_id, e)
            granted_via = "queued"

    if granted_via == "queued":
        # No Stripe customer yet (or credit failed) — queue the credit.
        # stripe_service.create_customer drains pending credits when the
        # referrer eventually starts a subscription.
        try:
            await _db(
                lambda: supabase.table("referral_pending_credits")
                .insert(
                    {
                        "user_id": referrer_user_id,
                        "referral_id": referral["id"],
                        "amount_cents": amount_cents,
                    }
                )
                .execute()
            )
        except Exception as e:
            logger.error("Failed to queue referral credit: %s", e)

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
        "Granted referrer reward: user=%s amount_cents=%d via=%s",
        referrer_user_id,
        amount_cents,
        granted_via,
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


def _base_price_cents() -> int:
    """
    Read the unit_amount of STRIPE_PRICE_ID_BASE so the credit equals one
    full month of the base subscription. Falls back to 900 ($9) if Stripe
    isn't reachable. Cached on the function object after the first call.
    """
    cached = getattr(_base_price_cents, "_cached", None)
    if cached is not None:
        return cached
    try:
        price = stripe.Price.retrieve(settings.STRIPE_PRICE_ID_BASE)
        amount = int(price.unit_amount or 900)
    except Exception as e:
        logger.warning(
            "Could not fetch base price, defaulting to $9 credit: %s", e
        )
        amount = 900
    _base_price_cents._cached = amount  # type: ignore[attr-defined]
    return amount


async def get_referrer_summary(user_id: str) -> dict:
    """
    Aggregate referrer stats for the dashboard page:
      - code: their referral code
      - signed_up: referees who have a row but haven't subscribed yet
      - subscribed: referees in free month, not yet converted
      - rewarded: conversions where the referrer was credited
      - months_earned: count of rewarded referrals (== free months earned)
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
        "months_earned": counts["rewarded"],
        "recent": rows.data[:10] if rows.data else [],
    }
