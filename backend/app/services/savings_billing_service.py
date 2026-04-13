"""
Savings-based billing service.

Pricing model:
  - $9/month base fee (covers hosting costs)
  - 25% of first $2,000 saved per month
  - 10% of savings above $2,000 per month

The savings are calculated per request as:
  savings = benchmark_cost - routed_cost

Where benchmark_cost is what the user would have paid using their
default model (e.g., Claude Opus 4.6) for every request, and
routed_cost is what they actually paid after Nadir's routing +
context optimization.
"""

import logging
from datetime import date, datetime
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SavingsInvoice:
    user_id: str
    period_start: date
    period_end: date
    total_savings_usd: float
    base_fee_usd: float
    savings_fee_usd: float
    total_invoice_usd: float


def calculate_savings_fee(total_savings: float) -> float:
    """Calculate the savings-based fee component.

    25% on first $2,000 saved, 10% on amounts above $2,000.

    Examples:
        $500 saved  -> $125 fee
        $2,000 saved -> $500 fee
        $5,000 saved -> $500 + $300 = $800 fee
        $10,000 saved -> $500 + $800 = $1,300 fee
    """
    fee_on_first_2k = min(total_savings, 2000.0) * 0.25
    fee_above_2k = max(total_savings - 2000.0, 0.0) * 0.10
    return round(fee_on_first_2k + fee_above_2k, 2)


class SavingsBillingService:
    """Handles monthly savings-based billing calculations and invoice generation."""

    BASE_FEE = 9.00

    def __init__(self, supabase_client):
        self.supabase = supabase_client

    async def calculate_monthly_invoice(
        self, user_id: str, period_start: date, period_end: date
    ) -> SavingsInvoice:
        """Calculate the invoice for a billing period."""
        import asyncio
        result = await asyncio.to_thread(
            lambda: self.supabase.table("savings_tracking")
            .select("savings_usd")
            .eq("user_id", user_id)
            .gte("created_at", period_start.isoformat())
            .lt("created_at", period_end.isoformat())
            .execute()
        )

        rows = result.data or []
        # Only count positive savings toward the billable fee.
        # Negative savings (inverted tier pricing) are tracked for
        # transparency but must not reduce the user's bill.
        total_savings = sum(
            s for r in rows if (s := r.get("savings_usd", 0) or 0) > 0
        )
        savings_fee = calculate_savings_fee(total_savings)
        total_invoice = self.BASE_FEE + savings_fee

        return SavingsInvoice(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            total_savings_usd=round(total_savings, 2),
            base_fee_usd=self.BASE_FEE,
            savings_fee_usd=savings_fee,
            total_invoice_usd=round(total_invoice, 2),
        )

    async def generate_and_store_invoice(
        self, user_id: str, period_start: date, period_end: date
    ) -> SavingsInvoice:
        """Calculate invoice and store it in the database."""
        invoice = await self.calculate_monthly_invoice(user_id, period_start, period_end)

        import asyncio
        await asyncio.to_thread(
            lambda: self.supabase.table("savings_invoices").insert({
                "user_id": user_id,
                "billing_period_start": period_start.isoformat(),
                "billing_period_end": period_end.isoformat(),
                "total_savings_usd": invoice.total_savings_usd,
                "base_fee_usd": invoice.base_fee_usd,
                "savings_fee_usd": invoice.savings_fee_usd,
                "total_invoice_usd": invoice.total_invoice_usd,
                "status": "draft",
            }).execute()
        )

        logger.info(
            f"Generated invoice for user {user_id}: "
            f"savings=${invoice.total_savings_usd}, "
            f"fee=${invoice.total_invoice_usd}"
        )

        return invoice

    async def track_request_savings(
        self,
        user_id: str,
        request_id: str,
        benchmark_model: str,
        benchmark_cost: float,
        routed_model: str,
        routed_cost: float,
        prompt_tokens: int,
        completion_tokens: int,
        complexity_tier: str,
        api_key_id: Optional[str] = None,
    ):
        """Track savings for a single request. Call this after each completion.

        Tracks both positive savings (routing saved money) and negative savings
        (routing cost more — e.g. inverted tier pricing). Negative values are
        stored so the dashboard can show the real picture. Only positive savings
        count toward the savings-based billing fee.
        """
        savings = benchmark_cost - routed_cost

        # Skip zero-diff (same model routed to benchmark)
        if savings == 0:
            return

        if savings < 0:
            logger.warning(
                "Negative savings for request %s: routed %s ($%.6f) > benchmark %s ($%.6f). "
                "User's tier config may have inverted pricing.",
                request_id, routed_model, routed_cost, benchmark_model, benchmark_cost,
            )

        import asyncio
        await asyncio.to_thread(
            lambda: self.supabase.table("savings_tracking").insert({
                "user_id": user_id,
                "request_id": request_id,
                "api_key_id": api_key_id,
                "benchmark_model": benchmark_model,
                "benchmark_cost_usd": round(benchmark_cost, 6),
                "routed_model": routed_model,
                "routed_cost_usd": round(routed_cost, 6),
                "savings_usd": round(savings, 6),
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "complexity_tier": complexity_tier,
            }).execute()
        )
