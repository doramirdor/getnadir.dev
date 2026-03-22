"""Savings tracking and billing API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from ..auth.supabase_auth import get_current_user

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


def calculate_savings_fee(total_savings: float) -> float:
    """Calculate Nadir fee: 25% on first $2K saved, 10% above $2K, plus $9 base."""
    base = 9.00
    fee_on_first_2k = min(total_savings, 2000) * 0.25
    fee_above_2k = max(total_savings - 2000, 0) * 0.10
    return base + fee_on_first_2k + fee_above_2k


@router.get("/summary", response_model=SavingsSummary)
async def get_savings_summary(
    period: str = "current_month",
    user=Depends(get_current_user),
):
    """Get savings summary for the current billing period."""
    from ..auth.supabase_auth import supabase


    now = datetime.utcnow()
    if period == "current_month":
        period_start = date(now.year, now.month, 1)
        period_end = date(now.year, now.month + 1, 1) if now.month < 12 else date(now.year + 1, 1, 1)
    else:
        period_start = date(now.year, now.month, 1)
        period_end = date(now.year, now.month + 1, 1) if now.month < 12 else date(now.year + 1, 1, 1)

    # Query savings_tracking for this user and period
    result = supabase.table("savings_tracking") \
        .select("benchmark_cost_usd, routed_cost_usd, savings_usd, complexity_tier") \
        .eq("user_id", user.id) \
        .gte("created_at", period_start.isoformat()) \
        .lt("created_at", period_end.isoformat()) \
        .execute()

    rows = result.data or []

    total_benchmark = sum(r.get("benchmark_cost_usd", 0) or 0 for r in rows)
    total_spent = sum(r.get("routed_cost_usd", 0) or 0 for r in rows)
    total_savings = sum(r.get("savings_usd", 0) or 0 for r in rows)
    savings_rate = total_savings / total_benchmark if total_benchmark > 0 else 0

    fee = calculate_savings_fee(total_savings)

    return SavingsSummary(
        total_savings_usd=round(total_savings, 2),
        total_spent_usd=round(total_spent, 2),
        total_benchmark_usd=round(total_benchmark, 2),
        savings_rate=round(savings_rate, 4),
        requests_routed=len(rows),
        base_fee=9.00,
        savings_fee=round(fee - 9.00, 2),
        total_fee=round(fee, 2),
        net_savings=round(total_savings - fee, 2),
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/history")
async def get_savings_history(
    months: int = 6,
    user=Depends(get_current_user),
):
    """Get monthly savings history."""
    from ..auth.supabase_auth import supabase


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

        result = supabase.table("savings_tracking") \
            .select("benchmark_cost_usd, routed_cost_usd, savings_usd") \
            .eq("user_id", user.id) \
            .gte("created_at", period_start.isoformat()) \
            .lt("created_at", period_end.isoformat()) \
            .execute()

        rows = result.data or []
        total_savings = sum(r.get("savings_usd", 0) or 0 for r in rows)
        total_spent = sum(r.get("routed_cost_usd", 0) or 0 for r in rows)
        total_benchmark = sum(r.get("benchmark_cost_usd", 0) or 0 for r in rows)
        fee = calculate_savings_fee(total_savings)

        results.append(MonthlySaving(
            month=period_start.strftime("%B %Y"),
            savings_usd=round(total_savings, 2),
            spent_usd=round(total_spent, 2),
            benchmark_usd=round(total_benchmark, 2),
            fee_usd=round(fee, 2),
            net_savings_usd=round(total_savings - fee, 2),
        ))

    return {"history": list(reversed(results))}


@router.get("/breakdown")
async def get_savings_breakdown(
    user=Depends(get_current_user),
):
    """Get savings breakdown by complexity tier."""
    from ..auth.supabase_auth import supabase


    now = datetime.utcnow()
    period_start = date(now.year, now.month, 1)

    result = supabase.table("savings_tracking") \
        .select("complexity_tier, savings_usd") \
        .eq("user_id", user.id) \
        .gte("created_at", period_start.isoformat()) \
        .execute()

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
