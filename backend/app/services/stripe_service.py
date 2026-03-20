"""
Stripe billing service for Nadir SaaS platform.

Handles customer management, checkout sessions, usage-based invoicing,
and subscription lifecycle.
"""

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

    def __init__(self):
        if not settings.STRIPE_SECRET_KEY:
            logger.warning("STRIPE_SECRET_KEY not configured — Stripe operations will fail")

    # ------------------------------------------------------------------
    # Customer management
    # ------------------------------------------------------------------

    async def create_customer(self, user_id: str, email: str) -> str:
        """
        Create a Stripe customer and store the mapping in Supabase.

        Returns the Stripe customer ID.
        """
        # Check if customer already exists
        existing = (
            supabase.table("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user_id)
            .execute()
        )
        if existing.data:
            return existing.data[0]["stripe_customer_id"]

        customer = stripe.Customer.create(
            email=email,
            metadata={"nadir_user_id": user_id},
        )

        supabase.table("stripe_customers").insert(
            {
                "user_id": user_id,
                "stripe_customer_id": customer.id,
                "email": email,
            }
        ).execute()

        logger.info("Created Stripe customer %s for user %s", customer.id, user_id)
        return customer.id

    async def get_customer_id(self, user_id: str) -> Optional[str]:
        """Look up the Stripe customer ID for a Nadir user."""
        result = (
            supabase.table("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user_id)
            .execute()
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
    ) -> str:
        """
        Create a Stripe Checkout session for the base subscription plan.

        Returns the Checkout URL the frontend should redirect the user to.
        """
        customer_id = await self.get_customer_id(user_id)
        if not customer_id:
            # Auto-create customer from profile
            profile = (
                supabase.table("profiles")
                .select("email")
                .eq("id", user_id)
                .execute()
            )
            email = profile.data[0]["email"] if profile.data else f"{user_id}@unknown"
            customer_id = await self.create_customer(user_id, email)

        price_id = plan_id or settings.STRIPE_PRICE_ID_BASE
        if not price_id:
            raise ValueError("No Stripe price ID configured (STRIPE_PRICE_ID_BASE)")

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"nadir_user_id": user_id},
        )

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
        supabase.table("user_subscriptions").update(
            {"cancel_at_period_end": True}
        ).eq("stripe_subscription_id", subscription_id).execute()

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
