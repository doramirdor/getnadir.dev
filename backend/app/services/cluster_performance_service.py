"""
Cluster-level model performance tracking.

Queries usage_events grouped by (cluster_id, model_name) to show
which models perform best per cluster.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ClusterPerformanceService:
    """Computes per-cluster, per-model performance stats."""

    def __init__(self):
        from app.auth.supabase_auth import supabase
        self.supabase = supabase

    async def compute_cluster_model_stats(
        self,
        user_id: str,
        cluster_id: Optional[str] = None,
        lookback_days: int = 30,
    ) -> Dict[str, Any]:
        """
        Compute per-(cluster, model) stats from usage_events.

        Returns:
            Dict with cluster_id keys, each containing model-level stats.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()

        try:
            query = (
                self.supabase.table("usage_events")
                .select("model_name, cluster_id, cost, latency_ms, metadata, created_at")
                .eq("user_id", user_id)
                .gte("created_at", cutoff)
                .order("created_at", desc=True)
                .limit(5000)
            )
            if cluster_id:
                query = query.eq("cluster_id", cluster_id)

            response = query.execute()
            events = response.data or []
        except Exception as e:
            logger.error("Error querying cluster performance data: %s", e)
            return {}

        # Accumulate stats per (cluster_id, model_name)
        stats: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(lambda: defaultdict(lambda: {
            "request_count": 0,
            "total_cost": 0.0,
            "total_latency_ms": 0,
            "override_count": 0,
        }))

        for event in events:
            cid = event.get("cluster_id")
            model = event.get("model_name")
            if not cid or not model:
                continue

            bucket = stats[cid][model]
            bucket["request_count"] += 1
            bucket["total_cost"] += float(event.get("cost") or 0)
            bucket["total_latency_ms"] += int(event.get("latency_ms") or 0)

            meta = event.get("metadata") or {}
            if meta.get("model_changed"):
                bucket["override_count"] += 1

        # Compute averages
        result: Dict[str, Any] = {}
        for cid, models in stats.items():
            model_stats = []
            for model, s in models.items():
                count = s["request_count"]
                model_stats.append({
                    "model_name": model,
                    "request_count": count,
                    "avg_cost": round(s["total_cost"] / count, 6) if count else 0,
                    "avg_latency_ms": round(s["total_latency_ms"] / count) if count else 0,
                    "override_rate": round(s["override_count"] / count, 4) if count else 0,
                })
            # Sort by request count descending
            model_stats.sort(key=lambda m: m["request_count"], reverse=True)
            result[cid] = {"cluster_id": cid, "models": model_stats}

        return result

    async def get_best_model_for_cluster(
        self,
        user_id: str,
        cluster_id: str,
    ) -> Optional[str]:
        """Return the best-performing model for a cluster based on historical data."""
        stats = await self.compute_cluster_model_stats(user_id, cluster_id=cluster_id)
        cluster_stats = stats.get(cluster_id, {})
        models = cluster_stats.get("models", [])

        if not models:
            return None

        # Score: request_count * (1 - override_rate) — most used and least overridden
        best = max(models, key=lambda m: m["request_count"] * (1 - m["override_rate"]))
        if best["request_count"] >= 5:
            return best["model_name"]
        return None


# Module-level singleton
_service: Optional[ClusterPerformanceService] = None


def get_cluster_performance_service() -> ClusterPerformanceService:
    global _service
    if _service is None:
        _service = ClusterPerformanceService()
    return _service
