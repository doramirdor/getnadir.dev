"""
Stripe billing service for Nadir SaaS platform.

Handles customer management, checkout sessions, usage-based invoicing,
and subscription lifecycle.
"""

import asyncio
import logging
from typing import Optional, Dict, Any

import stripe

from app.auth.supabase_auth import supabase
from app.settings import settings

logger = logging.getLogger(__name__)

# Configure Stripe API key at module level
stripe.api_key = settings.STRIPE_SECRET_KEY


class StripeService:
    """Service for Stripe billing operations."""

    PROMO_COUPON_ID = "free-first-month"
    PROMO_CODE = "FIRST1"

    def __init__(self):
        if not settings.STRIPE_SECRET_KEY:
            logger.warning("STRIPE_SECRET_KEY not configured — Stripe operations will fail")
        elif settings.STRIPE_SECRET_KEY.startswith("sk_test_"):
            logger.warning(
                "Stripe is running in TEST/SANDBOX mode (sk_test_ key). "
                "Switch to a live key (sk_live_) and update STRIPE_PRICE_ID_BASE "
                "and STRIPE_WEBHOOK_SECRET before accepting real payments."
            )
        if settings.STRIPE_SECRET_KEY:
            self._ensure_promotion_code()

    # ------------------------------------------------------------------
    # Promotion code setup
    # ------------------------------------------------------------------

    def _ensure_promotion_code(self) -> None:
        """Create the free-first-month coupon and FIRST1 promo code if they don't exist."""
        try:
            # Ensure coupon exists
            try:
                stripe.Coupon.retrieve(self.PROMO_COUPON_ID)
                logger.info("Stripe coupon '%s' already exists", self.PROMO_COUPON_ID)
            except stripe.error.InvalidRequestError:
                stripe.Coupon.create(
                    id=self.PROMO_COUPON_ID,
                    percent_off=100,  # 100% off → $0 first month base fee
                    duration="once",
                    name="Free First Month",
                )
                logger.info("Created Stripe coupon '%s'", self.PROMO_COUPON_ID)

            # Ensure promotion code exists
            existing = stripe.PromotionCode.list(code=self.PROMO_CODE, limit=1)
            if existing.data:
                logger.info("Stripe promo code '%s' already exists", self.PROMO_CODE)
            else:
                # stripe SDK v14 rejects the `coupon` kwarg in
                # PromotionCode.create due to a param-mapping bug.
                # Fall back to a direct HTTP POST.
                import urllib.request
                import urllib.parse
                import json as _json

                data = urllib.parse.urlencode({
                    "coupon": self.PROMO_COUPON_ID,
                    "code": self.PROMO_CODE,
                }).encode()
                req = urllib.request.Request(
                    "https://api.stripe.com/v1/promotion_codes", data=data
                )
                req.add_header("Authorization", f"Bearer {settings.STRIPE_SECRET_KEY}")
                resp = urllib.request.urlopen(req)
                result = _json.loads(resp.read())
                logger.info("Created Stripe promo code '%s': %s", self.PROMO_CODE, result["id"])
        except Exception as e:
            logger.error("Failed to ensure promotion code: %s", e)

    # ------------------------------------------------------------------
    # Customer management
    # ------------------------------------------------------------------

    async def create_customer(self, user_id: str, email: str) -> str:
        """
        Create a Stripe customer and store the mapping in Supabase.

        Returns the Stripe customer ID.
        """
        # Check if customer already exists
        existing = await asyncio.to_thread(
            lambda: supabase.table("stripe_customers")
            .select("stripe_customer_id").eq("user_id", user_id).execute()
        )
        if existing.data:
            return existing.data[0]["stripe_customer_id"]

        customer = stripe.Customer.create(
            email=email,
            metadata={"nadir_user_id": user_id},
        )

        await asyncio.to_thread(
            lambda: supabase.table("stripe_customers").insert(
                {"user_id": user_id, "stripe_customer_id": customer.id, "email": email}
            ).execute()
        )

        logger.info("Created Stripe customer %s for user %s", customer.id, user_id)
        return customer.id

    async def get_customer_id(self, user_id: str) -> Optional[str]:
        """Look up the Stripe customer ID for a Nadir user."""
        result = await asyncio.to_thread(
            lambda: supabase.table("stripe_customers")
            .select("stripe_customer_id").eq("user_id", user_id).execute()
        )
        if result.data:
            return result.data[0]["stripe_customer_id"]
        return None

    # ------------------------------------------------------------------
    # Checkout & subscriptions
    # ------------------------------------------------------------------

    async def create_checkout_session(
        self,
        user_id: str,
        plan_id: Optional[str] = None,
        success_url: str = "https://getnadir.com/billing?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: str = "https://getnadir.com/billing?canceled=true",
        promo_code: Optional[str] = None,
    ) -> str:
        """
        Create a Stripe Checkout session for the base subscription plan.

        Returns the Checkout URL the frontend should redirect the user to.
        """
        customer_id = await self.get_customer_id(user_id)
        if not customer_id:
            # Auto-create customer from profile
            profile = (
                await asyncio.to_thread(
                    lambda: supabase.table("user_profiles")
                    .select("email").eq("id", user_id).execute()
                )
            )
            email = profile.data[0]["email"] if profile.data else f"{user_id}@unknown"
            customer_id = await self.create_customer(user_id, email)

        # plan_id is a logical name ("pro", "enterprise"), not a Stripe price ID.
        # Always use the configured Stripe price ID.
        price_id = settings.STRIPE_PRICE_ID_BASE
        if not price_id:
            raise ValueError("No Stripe price ID configured (STRIPE_PRICE_ID_BASE)")

        session_params: Dict[str, Any] = {
            "customer": customer_id,
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": {"nadir_user_id": user_id},
            "allow_promotion_codes": True,
        }

        # Apply promo code if provided
        if promo_code:
            promo = stripe.PromotionCode.list(code=promo_code, limit=1)
            if promo.data and promo.data[0].active:
                session_params.pop("allow_promotion_codes", None)
                session_params["discounts"] = [{"promotion_code": promo.data[0].id}]
                logger.info("Applying promo code '%s' to checkout for user %s", promo_code, user_id)
            else:
                logger.warning("Invalid or inactive promo code '%s' for user %s", promo_code, user_id)

        session = stripe.checkout.Session.create(**session_params)

        logger.info("Created checkout session %s for user %s", session.id, user_id)
        return session.url

    async def cancel_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """
        Cancel a Stripe subscription at period end.

        Returns the updated subscription object as a dict.
        """
        sub = stripe.Subscription.modify(
            subscription_id,
            cancel_at_period_end=True,
        )
        logger.info("Subscription %s set to cancel at period end", subscription_id)

        # Update local record
        await asyncio.to_thread(
            lambda: supabase.table("subscriptions").update(
                {"cancel_at_period_end": True}
            ).eq("stripe_subscription_id", subscription_id).execute()
        )

        return {
            "subscription_id": sub.id,
            "status": sub.status,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "current_period_end": sub.current_period_end,
        }

    # ------------------------------------------------------------------
    # Usage-based invoicing (savings fee)
    # ------------------------------------------------------------------

    async def create_usage_invoice_item(
        self,
        user_id: str,
        amount_cents: int,
        description: str,
    ) -> Optional[str]:
        """
        Create a pending invoice item on the customer's next invoice.

        Args:
            user_id: Nadir user ID
            amount_cents: Amount in cents (e.g. 80000 = $800.00)
            description: Line-item description shown on the invoice

        Returns the invoice item ID, or None if the customer has no Stripe record.
        """
        customer_id = await self.get_customer_id(user_id)
        if not customer_id:
            logger.warning(
                "Cannot create invoice item — no Stripe customer for user %s",
                user_id,
            )
            return None

        item = stripe.InvoiceItem.create(
            customer=customer_id,
            amount=amount_cents,
            currency="usd",
            description=description,
        )

        logger.info(
            "Created invoice item %s ($%.2f) for user %s: %s",
            item.id,
            amount_cents / 100,
            user_id,
            description,
        )
        return item.id


# Global singleton
stripe_service = StripeService()
