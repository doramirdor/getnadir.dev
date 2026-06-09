"""
Prepaid credits service for Hosted-mode (Nadir-managed Bedrock) usage.

Hosted requests draw down a prepaid balance at (AWS Bedrock cost + 20%).
Users top the balance up in $5 multiples via a one-time Stripe Checkout, and
may enable auto-recharge so requests don't fail when the balance runs low.

Tables (Supabase):
  - user_credits         one row per user: balance + auto-recharge config
  - credit_transactions  append-only debit/credit ledger

Money is handled with Decimal throughout. Balance reads/writes use a simple
read-modify-write; the ledger's unique index on stripe_payment_intent_id makes
top-up crediting idempotent against webhook retries.
"""

import asyncio
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import stripe

from app.auth.supabase_auth import supabase
from app.settings import settings

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

# Markup applied to raw Bedrock cost when drawing down prepaid credits for a
# Hosted request. Kept in sync with HOSTED_COST_MARKUP in savings_billing_service.
HOSTED_COST_MARKUP = Decimal("0.20")

# Top-ups must be a positive multiple of this amount.
TOPUP_INCREMENT_USD = Decimal("5")

_CENTS = Decimal("0.01")
_MICRO = Decimal("0.0001")


def _q(amount: Decimal, exp: Decimal = _MICRO) -> Decimal:
    return amount.quantize(exp, rounding=ROUND_HALF_UP)


def is_valid_topup_amount(amount_usd: Decimal) -> bool:
    """True when amount is a positive whole multiple of $5."""
    return amount_usd > 0 and (amount_usd % TOPUP_INCREMENT_USD == 0)


def hosted_charge_for_cost(routed_cost_usd: float) -> Decimal:
    """Credit amount to draw down for a hosted request: cost + 20% markup."""
    cost = Decimal(str(routed_cost_usd or 0))
    return _q(cost * (Decimal("1") + HOSTED_COST_MARKUP))


class CreditsService:
    """Manages the prepaid credit balance and ledger for Hosted usage."""

    def __init__(self, supabase_client=None):
        self.supabase = supabase_client or supabase

    async def _db(self, fn):
        return await asyncio.to_thread(fn)

    async def _get_or_create_row(self, user_id: str) -> dict:
        result = await self._db(
            lambda: self.supabase.table("user_credits")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]

        # Lazily create a zero-balance row. Tolerate a concurrent insert by
        # re-reading on conflict.
        try:
            inserted = await self._db(
                lambda: self.supabase.table("user_credits")
                .insert({"user_id": user_id, "balance": 0})
                .execute()
            )
            if inserted.data:
                return inserted.data[0]
        except Exception as e:
            logger.warning("user_credits insert race for %s: %s", user_id, e)

        result = await self._db(
            lambda: self.supabase.table("user_credits")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else {"user_id": user_id, "balance": 0}

    async def get_balance(self, user_id: str) -> Decimal:
        row = await self._get_or_create_row(user_id)
        return Decimal(str(row.get("balance", 0) or 0))

    async def get_status(self, user_id: str) -> dict:
        """Balance + auto-recharge config for the billing UI / API."""
        row = await self._get_or_create_row(user_id)
        return {
            "balance": float(row.get("balance", 0) or 0),
            "auto_charge_enabled": bool(row.get("auto_charge_enabled", False)),
            "auto_charge_threshold": float(row.get("auto_charge_threshold", 0) or 0),
            "auto_charge_amount": float(row.get("auto_charge_amount", 0) or 0),
            "upper_limit": (
                float(row["upper_limit"]) if row.get("upper_limit") is not None else None
            ),
        }

    async def _write_balance(self, user_id: str, new_balance: Decimal) -> None:
        await self._db(
            lambda: self.supabase.table("user_credits")
            .update({"balance": float(_q(new_balance))})
            .eq("user_id", user_id)
            .execute()
        )

    async def _record_tx(
        self,
        user_id: str,
        *,
        transaction_type: str,
        amount: Decimal,
        balance_after: Decimal,
        description: str,
        stripe_payment_intent_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
    ) -> None:
        row = {
            "user_id": user_id,
            "transaction_type": transaction_type,
            "amount": float(_q(amount)),
            "balance_after": float(_q(balance_after)),
            "description": description,
            "stripe_payment_intent_id": stripe_payment_intent_id,
            "api_key_id": api_key_id,
        }
        await self._db(
            lambda: self.supabase.table("credit_transactions").insert(row).execute()
        )

    async def add_credits(
        self,
        user_id: str,
        amount_usd: Decimal,
        *,
        stripe_payment_intent_id: Optional[str] = None,
        description: str = "Credit top-up",
    ) -> Decimal:
        """Increment the balance and append a credit ledger row.

        Idempotent on `stripe_payment_intent_id`: if a credit row already exists
        for that payment intent, this is a no-op and returns the current balance.
        Returns the new balance.
        """
        amount_usd = Decimal(str(amount_usd))
        if amount_usd <= 0:
            return await self.get_balance(user_id)

        if stripe_payment_intent_id:
            existing = await self._db(
                lambda: self.supabase.table("credit_transactions")
                .select("id")
                .eq("stripe_payment_intent_id", stripe_payment_intent_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                logger.info(
                    "Top-up for payment_intent %s already credited — skipping",
                    stripe_payment_intent_id,
                )
                return await self.get_balance(user_id)

        balance = await self.get_balance(user_id)
        new_balance = balance + amount_usd
        await self._write_balance(user_id, new_balance)
        await self._record_tx(
            user_id,
            transaction_type="credit",
            amount=amount_usd,
            balance_after=new_balance,
            description=description,
            stripe_payment_intent_id=stripe_payment_intent_id,
        )
        logger.info(
            "Credited $%.4f to user %s (balance $%.4f)", amount_usd, user_id, new_balance
        )
        return new_balance

    async def deduct(
        self,
        user_id: str,
        amount_usd: Decimal,
        *,
        api_key_id: Optional[str] = None,
        request_id: Optional[str] = None,
        description: str = "Hosted usage",
    ) -> Decimal:
        """Decrement the balance for a hosted request and append a debit row.

        Best-effort: never raises into the request path. Balance may go slightly
        negative on the final request before gating kicks in; we floor the
        recorded balance at the actual computed value (can be negative) so the
        ledger stays truthful.
        """
        amount_usd = Decimal(str(amount_usd))
        if amount_usd <= 0:
            return await self.get_balance(user_id)
        try:
            balance = await self.get_balance(user_id)
            new_balance = balance - amount_usd
            await self._write_balance(user_id, new_balance)
            desc = description if not request_id else f"{description} ({request_id})"
            await self._record_tx(
                user_id,
                transaction_type="debit",
                amount=amount_usd,
                balance_after=new_balance,
                description=desc,
                api_key_id=api_key_id,
            )
            return new_balance
        except Exception as e:
            logger.error("Failed to deduct credits for user %s: %s", user_id, e)
            return await self.get_balance(user_id)

    async def update_auto_recharge(
        self,
        user_id: str,
        *,
        enabled: bool,
        threshold_usd: Decimal,
        amount_usd: Decimal,
        upper_limit_usd: Optional[Decimal] = None,
    ) -> dict:
        await self._get_or_create_row(user_id)
        row = {
            "auto_charge_enabled": bool(enabled),
            "auto_charge_threshold": float(_q(Decimal(str(threshold_usd)))),
            "auto_charge_amount": float(_q(Decimal(str(amount_usd)))),
            "upper_limit": (
                float(_q(Decimal(str(upper_limit_usd))))
                if upper_limit_usd is not None
                else None
            ),
        }
        await self._db(
            lambda: self.supabase.table("user_credits")
            .update(row)
            .eq("user_id", user_id)
            .execute()
        )
        return await self.get_status(user_id)

    async def maybe_auto_recharge(self, user_id: str) -> bool:
        """Charge the saved card off-session if the balance fell below threshold.

        Returns True if a recharge succeeded. Never raises.
        """
        try:
            row = await self._get_or_create_row(user_id)
            if not row.get("auto_charge_enabled"):
                return False

            balance = Decimal(str(row.get("balance", 0) or 0))
            threshold = Decimal(str(row.get("auto_charge_threshold", 0) or 0))
            if balance >= threshold:
                return False

            amount = Decimal(str(row.get("auto_charge_amount", 0) or 0))
            if not is_valid_topup_amount(amount):
                logger.warning(
                    "Auto-recharge amount $%s for user %s is not a $5 multiple — skipping",
                    amount, user_id,
                )
                return False

            upper = row.get("upper_limit")
            if upper is not None and (balance + amount) > Decimal(str(upper)):
                logger.info(
                    "Auto-recharge for user %s would exceed upper_limit $%s — skipping",
                    user_id, upper,
                )
                return False

            from app.services.stripe_service import stripe_service
            from app.services.payment_health import _resolve_default_payment_method

            customer_id = await stripe_service.get_customer_id(user_id)
            if not customer_id:
                logger.warning("Auto-recharge: no Stripe customer for user %s", user_id)
                return False

            payment_method = await asyncio.to_thread(
                _resolve_default_payment_method, customer_id
            )
            if not payment_method:
                logger.warning("Auto-recharge: no card on file for user %s", user_id)
                return False

            intent = await asyncio.to_thread(
                lambda: stripe.PaymentIntent.create(
                    amount=int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP)),
                    currency="usd",
                    customer=customer_id,
                    payment_method=payment_method,
                    off_session=True,
                    confirm=True,
                    description=f"Nadir credits auto-recharge (${amount})",
                    metadata={"purpose": "credit_topup", "nadir_user_id": user_id},
                )
            )
            if intent.status == "succeeded":
                await self.add_credits(
                    user_id,
                    amount,
                    stripe_payment_intent_id=intent.id,
                    description="Auto-recharge",
                )
                logger.info("Auto-recharged $%s for user %s", amount, user_id)
                return True
            logger.warning(
                "Auto-recharge PaymentIntent for user %s ended in status %s",
                user_id, intent.status,
            )
            return False
        except Exception as e:
            logger.error("Auto-recharge failed for user %s: %s", user_id, e)
            return False


# Global singleton
credits_service = CreditsService()
