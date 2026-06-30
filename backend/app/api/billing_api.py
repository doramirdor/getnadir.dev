"""
Billing API endpoints for the Nadir SaaS platform.

Exposes subscription management, checkout, invoices, and Stripe portal.
"""
import asyncio
import logging
import os
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.supabase_auth import supabase, validate_api_key, validate_jwt, UserSession
from app.services.stripe_service import stripe_service
from app.services.savings_billing_service import SavingsBillingService
from app.services.credits_service import (
    credits_service,
    is_valid_topup_amount,
    TOPUP_INCREMENT_USD,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["billing"])


# ── Request / Response schemas ──────────────────────────────────────────


_BILLING_BASE = os.getenv("BILLING_RETURN_URL", "https://getnadir.com/dashboard/billing")


class CheckoutRequest(BaseModel):
    plan_id: str = "pro"  # "pro" or "enterprise"
    success_url: str = f"{_BILLING_BASE}?status=success"
    cancel_url: str = f"{_BILLING_BASE}?status=cancelled"


class CheckoutResponse(BaseModel):
    checkout_url: str


class SubscriptionResponse(BaseModel):
    status: str  # active, past_due, canceled, inactive
    plan: str  # free, pro, enterprise
    current_period_end: Optional[int] = None
    cancel_at_period_end: bool = False
    stripe_subscription_id: Optional[str] = None


class InvoiceItem(BaseModel):
    id: str
    billing_period_start: str
    billing_period_end: str
    total_savings_usd: float
    base_fee_usd: float
    savings_fee_usd: float
    # Raw AWS Bedrock cost we paid for the user's Hosted-mode requests in
    # this period. Zero for BYOK-only users. Pass-through, not margin.
    hosted_cost_usd: float = 0.0
    # 20% markup on hosted_cost_usd — our margin on Hosted usage.
    hosted_markup_fee_usd: float = 0.0
    total_invoice_usd: float
    status: str
    created_at: str


class CancelResponse(BaseModel):
    status: str
    message: str


# ── Endpoints ───────────────────────────────────────────────────────────


@router.get("/v1/billing/subscription", response_model=SubscriptionResponse)
async def get_subscription(current_user: UserSession = Depends(validate_api_key)):
    """Get current user's subscription status."""
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("subscriptions")
            .select("*")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            return SubscriptionResponse(status="inactive", plan="free")

        sub = result.data[0]
        # Derive plan from status — all paid users are "pro" for now
        plan = "pro" if sub["status"] == "active" else "free"
        return SubscriptionResponse(
            status=sub["status"],
            plan=plan,
            current_period_end=sub.get("current_period_end"),
            cancel_at_period_end=sub.get("cancel_at_period_end", False),
            stripe_subscription_id=sub.get("stripe_subscription_id"),
        )
    except Exception as e:
        logger.error("Error fetching subscription for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to fetch subscription")


@router.post("/v1/billing/checkout", response_model=CheckoutResponse)
async def create_checkout(
    req: CheckoutRequest,
    current_user: UserSession = Depends(validate_jwt),
):
    """Create a Stripe checkout session for subscription signup.

    Accepts a Supabase JWT (Authorization: Bearer <token>) so the user
    doesn't need an API key yet (e.g. during onboarding).
    """
    try:
        # Get or create Stripe customer
        email = current_user.email or ""
        customer_id = await stripe_service.get_customer_id(current_user.id)
        if not customer_id:
            customer_id = await stripe_service.create_customer(current_user.id, email)

        url = await stripe_service.create_checkout_session(
            user_id=current_user.id,
            plan_id=req.plan_id,
            success_url=req.success_url,
            cancel_url=req.cancel_url,
        )
        return CheckoutResponse(checkout_url=url)
    except Exception as e:
        logger.error("Checkout error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail=f"Failed to create checkout: {str(e)}")


@router.post("/v1/billing/cancel", response_model=CancelResponse)
async def cancel_subscription(current_user: UserSession = Depends(validate_api_key)):
    """Cancel user's subscription at period end.

    Before cancellation, any pending savings fees for the current period
    are calculated and attached as a Stripe invoice item so the user is
    billed for usage up to the cancellation date.
    """
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("subscriptions")
            .select("stripe_subscription_id, status")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data or result.data[0]["status"] != "active":
            raise HTTPException(status_code=400, detail="No active subscription to cancel")

        sub_id = result.data[0]["stripe_subscription_id"]
        if not sub_id:
            raise HTTPException(status_code=400, detail="No Stripe subscription found")
        # A `billing_active:<uid>` marker is a card-on-file flag with no Stripe
        # subscription behind it (credit model). Only real `sub_...` ids can be
        # canceled via the Stripe subscription API.
        is_real_sub = sub_id.startswith("sub_")

        # ── Charge pending savings fee before cancellation ──────────
        # Attach the partial-month savings fee so the user is billed for the
        # savings delivered up to the cancellation date. Hosted Bedrock usage
        # is already prepaid (drawn down in real time), so there's nothing to
        # settle for it here.
        try:
            from datetime import date, timedelta

            today = date.today()
            period_start = today.replace(day=1)
            period_end = today + timedelta(days=1)  # up to today

            billing_service = SavingsBillingService(supabase)
            invoice = await billing_service.calculate_monthly_invoice(
                current_user.id, period_start, period_end
            )

            period_label = period_start.strftime('%b %Y')
            stored_invoice = False

            if invoice.savings_fee_usd > 0:
                amount_cents = int(round(invoice.savings_fee_usd * 100))
                description = (
                    f"Nadir savings fee (partial {period_label}): "
                    f"${invoice.total_savings_usd:.2f} saved, "
                    f"${invoice.savings_fee_usd:.2f} fee"
                )
                item_id = await stripe_service.create_usage_invoice_item(
                    user_id=current_user.id,
                    amount_cents=amount_cents,
                    description=description,
                )
                logger.info(
                    "Attached pending savings fee $%.2f for user %s before cancellation",
                    invoice.savings_fee_usd, current_user.id,
                )
                # A marker has no subscription whose final invoice would sweep
                # this pending item, so finalize a standalone invoice to charge it.
                if item_id and not is_real_sub:
                    await stripe_service.create_savings_invoice(current_user.id)

            # Hosted Bedrock usage is prepaid (drawn down in real time), so
            # there is no markup line to settle on cancellation.

            if invoice.savings_fee_usd > 0:
                # Store the partial-month invoice for audit trail.
                await billing_service.generate_and_store_invoice(
                    current_user.id, period_start, period_end
                )
                stored_invoice = True

            if not stored_invoice:
                logger.info(
                    "User %s: no pending fees to charge before cancellation",
                    current_user.id,
                )
        except Exception as fee_err:
            # Log but don't block cancellation — user still has the right to cancel
            logger.error(
                "Failed to attach pending fees for user %s: %s",
                current_user.id, fee_err,
            )

        # ── Proceed with cancellation ──────────────────────────────
        if is_real_sub:
            await stripe_service.cancel_subscription(sub_id)

            # Mark in our DB
            await asyncio.to_thread(
                lambda: supabase.table("subscriptions")
                .update({"cancel_at_period_end": True})
                .eq("user_id", current_user.id)
                .execute()
            )

            return CancelResponse(
                status="canceling",
                message="Subscription will cancel at the end of the current billing period. Any outstanding savings fees have been applied.",
            )

        # Card-on-file marker: nothing to cancel in Stripe. Clear the
        # billing-active flag in both tables and downgrade to free; any partial
        # savings fee was already charged via the standalone invoice above.
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        await asyncio.to_thread(
            lambda: supabase.table("subscriptions")
            .update({"status": "canceled", "plan": "free", "cancel_at_period_end": False, "updated_at": now_iso})
            .eq("user_id", current_user.id)
            .execute()
        )
        await asyncio.to_thread(
            lambda: supabase.table("user_subscriptions")
            .update({"status": "canceled", "cancel_at_period_end": False, "updated_at": now_iso})
            .eq("user_id", current_user.id)
            .execute()
        )
        return CancelResponse(
            status="canceled",
            message="Billing turned off. Any outstanding savings fees have been charged.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Cancel error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to cancel subscription")


@router.post("/v1/billing/portal")
async def create_portal_session(current_user: UserSession = Depends(validate_api_key)):
    """Create a Stripe Customer Portal session for self-service billing management."""
    try:
        import stripe

        customer_id = await stripe_service.get_customer_id(current_user.id)
        if not customer_id:
            raise HTTPException(status_code=400, detail="No billing account found. Subscribe first.")

        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{_BILLING_BASE}",
        )
        return {"portal_url": session.url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Portal error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to create billing portal")


@router.get("/v1/billing/invoices")
async def list_invoices(current_user: UserSession = Depends(validate_api_key)):
    """List user's savings invoices."""
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("savings_invoices")
            .select("*")
            .eq("user_id", current_user.id)
            .order("billing_period_start", desc=True)
            .limit(24)
            .execute()
        )
        return {"invoices": result.data or []}
    except Exception as e:
        logger.error("Invoice list error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to fetch invoices")


# ── Prepaid credits (Hosted usage) ──────────────────────────────────────


class CreditCheckoutRequest(BaseModel):
    amount_usd: float
    success_url: str = f"{_BILLING_BASE}?status=topup_success"
    cancel_url: str = f"{_BILLING_BASE}?status=topup_cancelled"


class CreditStatusResponse(BaseModel):
    balance: float
    auto_charge_enabled: bool
    auto_charge_threshold: float
    auto_charge_amount: float
    upper_limit: Optional[float] = None


class AutoRechargeRequest(BaseModel):
    enabled: bool
    threshold_usd: float
    amount_usd: float
    upper_limit_usd: Optional[float] = None


@router.get("/v1/billing/credits", response_model=CreditStatusResponse)
async def get_credits(current_user: UserSession = Depends(validate_jwt)):
    """Return the user's prepaid credit balance + auto-recharge config."""
    try:
        return CreditStatusResponse(**await credits_service.get_status(current_user.id))
    except Exception as e:
        logger.error("Credit status error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to fetch credit balance")


@router.post("/v1/billing/credits/checkout", response_model=CheckoutResponse)
async def create_credit_checkout(
    req: CreditCheckoutRequest,
    current_user: UserSession = Depends(validate_jwt),
):
    """Create a one-time Stripe Checkout to buy prepaid Nadir credits.

    Amount must be a positive multiple of $5.
    """
    amount = Decimal(str(req.amount_usd))
    if not is_valid_topup_amount(amount):
        raise HTTPException(
            status_code=400,
            detail=f"Top-up amount must be a positive multiple of ${int(TOPUP_INCREMENT_USD)}.",
        )
    try:
        url = await stripe_service.create_credit_topup_session(
            user_id=current_user.id,
            amount_usd=float(amount),
            success_url=req.success_url,
            cancel_url=req.cancel_url,
        )
        return CheckoutResponse(checkout_url=url)
    except Exception as e:
        logger.error("Credit checkout error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail=f"Failed to create top-up: {str(e)}")


@router.post("/v1/billing/credits/auto-recharge", response_model=CreditStatusResponse)
async def update_auto_recharge(
    req: AutoRechargeRequest,
    current_user: UserSession = Depends(validate_jwt),
):
    """Enable/disable and configure prepaid credit auto-recharge."""
    if req.enabled:
        amount = Decimal(str(req.amount_usd))
        threshold = Decimal(str(req.threshold_usd))
        if not is_valid_topup_amount(amount):
            raise HTTPException(
                status_code=400,
                detail=f"Recharge amount must be a positive multiple of ${int(TOPUP_INCREMENT_USD)}.",
            )
        if threshold < 0:
            raise HTTPException(status_code=400, detail="Threshold must be non-negative.")
    try:
        status_dict = await credits_service.update_auto_recharge(
            current_user.id,
            enabled=req.enabled,
            threshold_usd=Decimal(str(req.threshold_usd)),
            amount_usd=Decimal(str(req.amount_usd)),
            upper_limit_usd=(
                Decimal(str(req.upper_limit_usd)) if req.upper_limit_usd is not None else None
            ),
        )
        return CreditStatusResponse(**status_dict)
    except Exception as e:
        logger.error("Auto-recharge update error for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to update auto-recharge")
