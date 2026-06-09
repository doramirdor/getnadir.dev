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

    def __init__(self):
        if not settings.STRIPE_SECRET_KEY:
            logger.warning("STRIPE_SECRET_KEY not configured — Stripe operations will fail")
        elif settings.STRIPE_SECRET_KEY.startswith("sk_test_"):
            logger.warning(
                "Stripe is running in TEST/SANDBOX mode (sk_test_ key). "
                "Switch to a live key (sk_live_) and update STRIPE_PRICE_ID_BASE "
                "and STRIPE_WEBHOOK_SECRET before accepting real payments."
            )

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

        # If this user has any queued referral credits (earned before they had
        # a Stripe customer), apply them to the new customer's balance now so
        # the next invoice picks them up.
        try:
            from app.services import referral_service

            await referral_service.drain_pending_credits(user_id, customer.id)
        except Exception as e:
            logger.error(
                "Failed to drain pending referral credits for user %s: %s",
                user_id, e,
            )

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
            # The base plan is $0/mo (no base fee). We still force a card on
            # file so the monthly savings-fee invoice and any prepaid-credit
            # auto-recharge have a payment method to charge off-session.
            "payment_method_collection": "always",
            # Stripe Tax: calculate and collect sales tax / VAT / GST on the
            # subscription invoice and all future recurring + usage invoices.
            "automatic_tax": {"enabled": True},
            # automatic_tax requires a tax-eligible customer address. We're
            # reusing an existing Customer here, so let Checkout write the
            # billing address the user enters back onto the Customer record;
            # subsequent off-session invoices (usage, renewals) then have a
            # location to tax against.
            "customer_update": {"address": "auto", "name": "auto"},
            "billing_address_collection": "required",
            # B2B: collect VAT / GST / ABN so reverse-charge applies in EU/UK
            # and we stay compliant in jurisdictions that require the buyer's
            # tax ID on the invoice.
            "tax_id_collection": {"enabled": True},
        }

        # If this user signed up via a referral and hasn't redeemed the free
        # month yet, auto-apply the referral coupon.
        if "discounts" not in session_params:
            try:
                from app.services import referral_service

                referral = await referral_service.get_referral_for_referee(user_id)
                if referral and not referral.get("referee_rewarded_at"):
                    referral_service._ensure_referee_coupon()
                    session_params.pop("allow_promotion_codes", None)
                    session_params["discounts"] = [
                        {"coupon": referral_service.REFERRAL_REFEREE_COUPON_ID}
                    ]
                    # Threaded into Checkout metadata so the webhook handler
                    # for checkout.session.completed can mark the row.
                    session_params["metadata"]["nadir_referral_id"] = referral["id"]
                    logger.info(
                        "Applying referral free-month coupon for referee %s (referral=%s)",
                        user_id, referral["id"],
                    )
            except Exception as e:
                logger.error(
                    "Failed to apply referral coupon for user %s: %s", user_id, e
                )

        session = stripe.checkout.Session.create(**session_params)

        logger.info("Created checkout session %s for user %s", session.id, user_id)
        return session.url

    async def create_credit_topup_session(
        self,
        user_id: str,
        amount_usd: float,
        success_url: str,
        cancel_url: str,
    ) -> str:
        """
        Create a one-time Stripe Checkout session to buy prepaid Nadir credits.

        Hosted-mode usage is drawn down from this prepaid balance. The webhook
        for `checkout.session.completed` (purpose=credit_topup) credits the
        balance once payment clears.

        Returns the Checkout URL.
        """
        customer_id = await self.get_customer_id(user_id)
        if not customer_id:
            profile = await asyncio.to_thread(
                lambda: supabase.table("user_profiles")
                .select("email").eq("id", user_id).execute()
            )
            email = profile.data[0]["email"] if profile.data else f"{user_id}@unknown"
            customer_id = await self.create_customer(user_id, email)

        amount_cents = int(round(amount_usd * 100))
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": "Nadir credits (Hosted usage)"},
                    "unit_amount": amount_cents,
                    "tax_behavior": "exclusive",
                },
                "quantity": 1,
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"purpose": "credit_topup", "nadir_user_id": user_id},
            payment_intent_data={
                "metadata": {"purpose": "credit_topup", "nadir_user_id": user_id},
                "setup_future_usage": "off_session",
            },
            automatic_tax={"enabled": True},
            customer_update={"address": "auto", "name": "auto"},
            billing_address_collection="required",
            tax_id_collection={"enabled": True},
            saved_payment_method_options={"payment_method_save": "enabled"},
        )
        logger.info(
            "Created credit top-up session %s ($%.2f) for user %s",
            session.id, amount_usd, user_id,
        )
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

        # discountable=False so any subscription-level coupon (e.g. the
        # referral free-month coupon) can NEVER discount the savings-fee usage
        # item. Coupons should only ever apply to the base subscription line.
        # Safe default; coupons that legitimately should cover usage can be
        # reverted on a case-by-case basis.
        item = stripe.InvoiceItem.create(
            customer=customer_id,
            amount=amount_cents,
            currency="usd",
            description=description,
            discountable=False,
            # Required for Stripe Tax to compute tax on this line. "exclusive"
            # = the $ amount above is pre-tax and tax is added on top, which
            # matches how the subscription is priced.
            tax_behavior="exclusive",
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
