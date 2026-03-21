"""
Billing API endpoints for the Nadir SaaS platform.

Exposes subscription management, checkout, invoices, and Stripe portal.
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.supabase_auth import supabase, validate_api_key, UserSession
from app.services.stripe_service import stripe_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["billing"])


# ── Request / Response schemas ──────────────────────────────────────────


class CheckoutRequest(BaseModel):
    plan_id: str = "pro"  # "pro" or "enterprise"
    success_url: str = "https://getnadir.com/dashboard/billing?status=success"
    cancel_url: str = "https://getnadir.com/dashboard/billing?status=cancelled"


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
            lambda: supabase.table("user_subscriptions")
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
    current_user: UserSession = Depends(validate_api_key),
):
    """Create a Stripe checkout session for subscription signup."""
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
    """Cancel user's subscription at period end."""
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("user_subscriptions")
            .select("stripe_subscription_id, status")
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data or result.data[0]["status"] != "active":
            raise HTTPException(status_code=400, detail="No active subscription to cancel")

        sub_id = result.data[0]["stripe_subscription_id"]
        if not sub_id:
            raise HTTPException(status_code=400, detail="No Stripe subscription found")

        await stripe_service.cancel_subscription(sub_id)

        # Mark in our DB
        await asyncio.to_thread(
            lambda: supabase.table("user_subscriptions")
            .update({"cancel_at_period_end": True})
            .eq("user_id", current_user.id)
            .execute()
        )

        return CancelResponse(
            status="canceling",
            message="Subscription will cancel at the end of the current billing period",
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
            return_url="https://getnadir.com/dashboard/billing",
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
