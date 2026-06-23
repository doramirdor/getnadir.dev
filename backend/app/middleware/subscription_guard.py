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

from fastapi import HTTPException, Request, Depends

from app.auth.supabase_auth import validate_api_key, UserSession

logger = logging.getLogger(__name__)

# Free tier (BYOK only): a monthly trial allowance, after which the user must
# add a payment method so the monthly savings fee can be billed. Counted from
# usage_logs (same source as the dashboard quota bar) so the limit survives
# process restarts and is consistent across workers.
FREE_BYOK_MONTHLY_REQUESTS = 50
FREE_TIER_RPM = 10


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

    # BYOK — monthly free trial, then require billing setup. Users who've added
    # a payment method have subscription_status "active" and were handled above
    # (full access), so this branch only sees not-yet-billing-enabled users.
    from app.middleware.hosted_budget import get_monthly_request_count

    used = await get_monthly_request_count(str(current_user.id))
    if used >= FREE_BYOK_MONTHLY_REQUESTS:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "free_trial_exhausted",
                "message": (
                    f"You've used your {FREE_BYOK_MONTHLY_REQUESTS} free requests this "
                    "month. Add a payment method to keep routing with your own keys — "
                    "you're only billed on the savings Nadir finds, never a base fee."
                ),
                "free_requests_used": used,
                "free_requests_limit": FREE_BYOK_MONTHLY_REQUESTS,
                "billing_url": "https://getnadir.com/dashboard/billing",
            },
        )

    request.state.subscription_plan = "free"
    request.state.rate_limit_rpm = FREE_TIER_RPM
    request.state.free_tier_remaining = FREE_BYOK_MONTHLY_REQUESTS - used - 1
    return current_user
