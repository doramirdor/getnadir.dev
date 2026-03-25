"""
Cost anomaly detection service.

Computes rolling average cost per user per hour and flags when
current cost exceeds 2x the rolling average. Also provides
projected daily/weekly cost based on current trend.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

ANOMALY_MULTIPLIER = 2.0  # Flag when current > 2x rolling avg
ROLLING_WINDOW_HOURS = 24


class CostAnomalyService:
    """Detects cost anomalies and provides cost forecasts."""

    def __init__(self):
        from app.auth.supabase_auth import supabase
        self.supabase = supabase

    async def get_anomalies(
        self,
        user_id: str,
        lookback_hours: int = 24,
    ) -> List[Dict[str, Any]]:
        """
        Detect cost anomalies for a user.

        Computes hourly cost buckets, rolling average over the lookback
        window, and flags hours where cost > ANOMALY_MULTIPLIER * rolling avg.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=lookback_hours + ROLLING_WINDOW_HOURS)).isoformat()

        try:
            response = (
                self.supabase.table("usage_events")
                .select("cost, created_at")
                .eq("user_id", user_id)
                .gte("created_at", cutoff)
                .order("created_at", desc=False)
                .limit(10000)
                .execute()
            )
            events = response.data or []
        except Exception as e:
            logger.error("Error fetching events for anomaly detection: %s", e)
            return []

        if not events:
            return []

        # Bucket costs by hour
        hourly_costs: Dict[str, float] = defaultdict(float)
        for event in events:
            cost = float(event.get("cost") or 0)
            ts = event.get("created_at", "")
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                hour_key = dt.strftime("%Y-%m-%dT%H:00:00Z")
                hourly_costs[hour_key] += cost
            except Exception:
                continue

        if not hourly_costs:
            return []

        # Sort by time
        sorted_hours = sorted(hourly_costs.keys())
        costs_list = [hourly_costs[h] for h in sorted_hours]

        # Compute rolling average and detect anomalies
        anomalies: List[Dict[str, Any]] = []
        window_size = min(ROLLING_WINDOW_HOURS, len(costs_list))

        for i in range(window_size, len(costs_list)):
            window = costs_list[max(0, i - window_size):i]
            rolling_avg = sum(window) / len(window) if window else 0
            current = costs_list[i]

            if rolling_avg > 0 and current > ANOMALY_MULTIPLIER * rolling_avg:
                anomalies.append({
                    "hour": sorted_hours[i],
                    "cost": round(current, 6),
                    "rolling_avg": round(rolling_avg, 6),
                    "multiplier": round(min(current / rolling_avg, 999.0), 2),
                    "threshold": ANOMALY_MULTIPLIER,
                })

        return anomalies

    async def get_forecast(
        self,
        user_id: str,
    ) -> Dict[str, Any]:
        """
        Project daily and weekly cost based on recent trend.

        Uses the last 24 hours of spending to project forward.
        """
        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cutoff_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        try:
            # Last 24h
            resp_24h = (
                self.supabase.table("usage_events")
                .select("cost")
                .eq("user_id", user_id)
                .gte("created_at", cutoff_24h)
                .limit(10000)
                .execute()
            )
            costs_24h = [float(e.get("cost") or 0) for e in (resp_24h.data or [])]
            total_24h = sum(costs_24h)
            request_count_24h = len(costs_24h)

            # Last 7 days
            resp_7d = (
                self.supabase.table("usage_events")
                .select("cost")
                .eq("user_id", user_id)
                .gte("created_at", cutoff_7d)
                .limit(50000)
                .execute()
            )
            costs_7d = [float(e.get("cost") or 0) for e in (resp_7d.data or [])]
            total_7d = sum(costs_7d)
            daily_avg_7d = total_7d / 7 if total_7d > 0 else 0

        except Exception as e:
            logger.error("Error computing cost forecast: %s", e)
            return {"error": str(e)}

        return {
            "last_24h_cost": round(total_24h, 4),
            "last_24h_requests": request_count_24h,
            "last_7d_cost": round(total_7d, 4),
            "daily_avg_7d": round(daily_avg_7d, 4),
            "projected_daily": round(total_24h, 4),  # Current 24h rate
            "projected_weekly": round(total_24h * 7, 4),
            "projected_monthly": round(total_24h * 30, 4),
            "trend": (
                "increasing" if total_24h > daily_avg_7d * 1.2
                else "decreasing" if total_24h < daily_avg_7d * 0.8
                else "stable"
            ),
        }
