"""Savings tracking and billing API endpoints."""

import asyncio
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from ..auth.supabase_auth import get_current_user, supabase
from ..services.savings_billing_service import calculate_savings_fee, SavingsBillingService

router = APIRouter(prefix="/v1/savings", tags=["savings"])


class SavingsSummary(BaseModel):
    total_savings_usd: float
    total_spent_usd: float
    total_benchmark_usd: float
    savings_rate: float
    requests_routed: int
    base_fee: float = 9.00
    savings_fee: float
    total_fee: float
    net_savings: float
    period_start: date
    period_end: date


class MonthlySaving(BaseModel):
    month: str
    savings_usd: float
    spent_usd: float
    benchmark_usd: float
    fee_usd: float
    net_savings_usd: float


class SavingsBreakdown(BaseModel):
    tier: str
    requests: int
    savings_usd: float
    avg_savings_per_request: float


def _parse_period(period: str) -> tuple[date, date]:
    """Parse a period string into (start, end) dates.

    Supports:
      - "current_month"
      - "last_month"
      - "YYYY-MM" (e.g. "2026-01")
    Falls back to current month for unrecognised values.
    """
    now = datetime.utcnow()

    if period == "last_month":
        # Go back one month
        month = now.month - 1
        year = now.year
        if month <= 0:
            month += 12
            year -= 1
        period_start = date(year, month, 1)
        next_month = month + 1 if month < 12 else 1
        next_year = year if month < 12 else year + 1
        period_end = date(next_year, next_month, 1)
        return period_start, period_end

    # Try YYYY-MM format
    match = re.match(r"^(\d{4})-(\d{2})$", period)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        if 1 <= month <= 12:
            period_start = date(year, month, 1)
            next_month = month + 1 if month < 12 else 1
            next_year = year if month < 12 else year + 1
            period_end = date(next_year, next_month, 1)
            return period_start, period_end

    # Default: current_month (also handles period == "current_month")
    period_start = date(now.year, now.month, 1)
    period_end = date(now.year, now.month + 1, 1) if now.month < 12 else date(now.year + 1, 1, 1)
    return period_start, period_end


@router.get("/summary", response_model=SavingsSummary)
async def get_savings_summary(
    period: str = "current_month",
    user=Depends(get_current_user),
):
    """Get savings summary for the current billing period."""
    period_start, period_end = _parse_period(period)

    # Query savings_tracking for this user and period
    result = await asyncio.to_thread(
        lambda: supabase.table("savings_tracking")
        .select("benchmark_cost_usd, routed_cost_usd, savings_usd, complexity_tier")
        .eq("user_id", user.id)
        .gte("created_at", period_start.isoformat())
        .lt("created_at", period_end.isoformat())
        .execute()
    )

    rows = result.data or []

    total_benchmark = sum(r.get("benchmark_cost_usd", 0) or 0 for r in rows)
    total_spent = sum(r.get("routed_cost_usd", 0) or 0 for r in rows)
    total_savings = sum(r.get("savings_usd", 0) or 0 for r in rows)
    savings_rate = total_savings / total_benchmark if total_benchmark > 0 else 0

    base_fee = SavingsBillingService.BASE_FEE
    savings_fee = calculate_savings_fee(total_savings)
    total_fee = base_fee + savings_fee

    return SavingsSummary(
        total_savings_usd=round(total_savings, 6),
        total_spent_usd=round(total_spent, 6),
        total_benchmark_usd=round(total_benchmark, 6),
        savings_rate=round(savings_rate, 6),
        requests_routed=len(rows),
        base_fee=base_fee,
        savings_fee=round(savings_fee, 6),
        total_fee=round(total_fee, 6),
        net_savings=round(total_savings - total_fee, 6),
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/history")
async def get_savings_history(
    months: int = 6,
    user=Depends(get_current_user),
):
    """Get monthly savings history."""
    now = datetime.utcnow()
    results = []

    for i in range(months):
        month = now.month - i
        year = now.year
        while month <= 0:
            month += 12
            year -= 1

        period_start = date(year, month, 1)
        next_month = month + 1 if month < 12 else 1
        next_year = year if month < 12 else year + 1
        period_end = date(next_year, next_month, 1)

        result = await asyncio.to_thread(
            lambda ps=period_start, pe=period_end: supabase.table("savings_tracking")
            .select("benchmark_cost_usd, routed_cost_usd, savings_usd")
            .eq("user_id", user.id)
            .gte("created_at", ps.isoformat())
            .lt("created_at", pe.isoformat())
            .execute()
        )

        rows = result.data or []
        total_savings = sum(r.get("savings_usd", 0) or 0 for r in rows)
        total_spent = sum(r.get("routed_cost_usd", 0) or 0 for r in rows)
        total_benchmark = sum(r.get("benchmark_cost_usd", 0) or 0 for r in rows)
        savings_fee = calculate_savings_fee(total_savings)
        total_fee = SavingsBillingService.BASE_FEE + savings_fee

        results.append(MonthlySaving(
            month=period_start.strftime("%B %Y"),
            savings_usd=round(total_savings, 2),
            spent_usd=round(total_spent, 2),
            benchmark_usd=round(total_benchmark, 2),
            fee_usd=round(total_fee, 2),
            net_savings_usd=round(total_savings - total_fee, 2),
        ))

    return {"history": list(reversed(results))}


@router.get("/breakdown")
async def get_savings_breakdown(
    user=Depends(get_current_user),
):
    """Get savings breakdown by complexity tier."""
    now = datetime.utcnow()
    period_start = date(now.year, now.month, 1)

    result = await asyncio.to_thread(
        lambda: supabase.table("savings_tracking")
        .select("complexity_tier, savings_usd")
        .eq("user_id", user.id)
        .gte("created_at", period_start.isoformat())
        .execute()
    )

    rows = result.data or []

    tier_map: dict = {}
    for r in rows:
        tier = r.get("complexity_tier", "unknown") or "unknown"
        if tier not in tier_map:
            tier_map[tier] = {"requests": 0, "savings": 0.0}
        tier_map[tier]["requests"] += 1
        tier_map[tier]["savings"] += r.get("savings_usd", 0) or 0

    breakdown = [
        SavingsBreakdown(
            tier=tier,
            requests=data["requests"],
            savings_usd=round(data["savings"], 2),
            avg_savings_per_request=round(data["savings"] / data["requests"], 4) if data["requests"] > 0 else 0,
        )
        for tier, data in sorted(tier_map.items(), key=lambda x: x[1]["savings"], reverse=True)
    ]

    return {"breakdown": breakdown}
