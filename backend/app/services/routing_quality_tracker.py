"""
Routing quality tracker.

Detects routing accuracy from available signals:
- Override detection: same user sends same prompt to a different model within 60s
- Latency mismatch: response > 10s for a "simple" prompt
- Explicit feedback from classifier_feedback table

Runs periodically and writes implicit feedback + computes accuracy metrics.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

OVERRIDE_WINDOW_SECONDS = 60
LATENCY_THRESHOLD_MS = 10_000  # 10s


class RoutingQualityTracker:
    """Tracks routing accuracy from implicit and explicit signals."""

    def __init__(self):
        from app.auth.supabase_auth import supabase
        self.supabase = supabase

    async def detect_overrides(self, lookback_minutes: int = 30) -> List[Dict[str, Any]]:
        """Find cases where a user re-sent the same prompt to a different model within 60s."""
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)).isoformat()
        try:
            response = (
                self.supabase.table("usage_events")
                .select("request_id, user_id, prompt, model_name, created_at, metadata")
                .gte("created_at", cutoff)
                .order("created_at", desc=False)
                .limit(2000)
                .execute()
            )
            events = response.data or []
        except Exception as e:
            logger.error("Error fetching events for override detection: %s", e)
            return []

        # Group by (user_id, prompt) and detect model changes within window
        overrides: List[Dict[str, Any]] = []
        seen: Dict[str, Dict[str, Any]] = {}  # key = "user_id:prompt_hash"

        for event in events:
            user_id = event.get("user_id", "")
            prompt = (event.get("prompt") or "")[:200]
            model = event.get("model_name", "")
            created_at = event.get("created_at", "")
            key = f"{user_id}:{hash(prompt)}"

            if key in seen:
                prev = seen[key]
                if prev["model"] != model:
                    try:
                        t_prev = datetime.fromisoformat(prev["created_at"].replace("Z", "+00:00"))
                        t_curr = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                        delta = (t_curr - t_prev).total_seconds()
                        if delta <= OVERRIDE_WINDOW_SECONDS:
                            overrides.append({
                                "user_id": user_id,
                                "original_request_id": prev["request_id"],
                                "override_request_id": event.get("request_id"),
                                "original_model": prev["model"],
                                "override_model": model,
                                "delta_seconds": delta,
                            })
                    except Exception:
                        pass

            seen[key] = {
                "request_id": event.get("request_id"),
                "model": model,
                "created_at": created_at,
            }

        return overrides

    async def detect_latency_mismatches(self, lookback_minutes: int = 30) -> List[Dict[str, Any]]:
        """Find cases where a 'simple' prompt had very high latency."""
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)).isoformat()
        try:
            response = (
                self.supabase.table("usage_events")
                .select("request_id, user_id, model_name, latency_ms, metadata")
                .gte("created_at", cutoff)
                .order("created_at", desc=True)
                .limit(1000)
                .execute()
            )
            events = response.data or []
        except Exception as e:
            logger.error("Error fetching events for latency mismatch: %s", e)
            return []

        mismatches: List[Dict[str, Any]] = []
        for event in events:
            meta = event.get("metadata") or {}
            tier = meta.get("classifier_tier") or meta.get("complexity_name")
            latency = event.get("latency_ms") or 0
            if tier == "simple" and latency > LATENCY_THRESHOLD_MS:
                mismatches.append({
                    "request_id": event.get("request_id"),
                    "user_id": event.get("user_id"),
                    "model": event.get("model_name"),
                    "latency_ms": latency,
                    "tier": tier,
                })
        return mismatches

    async def compute_accuracy_metrics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Compute routing accuracy metrics."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        try:
            query = (
                self.supabase.table("usage_events")
                .select("request_id, user_id, model_name, latency_ms, metadata, created_at")
                .gte("created_at", cutoff)
                .order("created_at", desc=True)
                .limit(5000)
            )
            if user_id:
                query = query.eq("user_id", user_id)
            response = query.execute()
            events = response.data or []
        except Exception as e:
            logger.error("Error computing accuracy metrics: %s", e)
            return {"error": str(e)}

        total = 0
        overrides_count = 0
        latency_mismatches = 0
        confidence_when_overridden: List[float] = []
        total_binary = 0

        # Simple per-user+prompt dedup for override detection
        seen: Dict[str, Dict] = {}
        for event in events:
            meta = event.get("metadata") or {}
            if meta.get("analyzer_type") != "binary":
                continue
            total_binary += 1
            total += 1

            user = event.get("user_id", "")
            prompt = (event.get("prompt") or "")[:200]
            key = f"{user}:{hash(prompt)}"

            if key in seen:
                prev = seen[key]
                if prev["model"] != event.get("model_name"):
                    overrides_count += 1
                    conf = meta.get("confidence") or meta.get("classifier_confidence")
                    if conf is not None:
                        confidence_when_overridden.append(float(conf))

            seen[key] = {"model": event.get("model_name"), "created_at": event.get("created_at")}

            tier = meta.get("classifier_tier") or meta.get("complexity_name")
            latency = event.get("latency_ms") or 0
            if tier == "simple" and latency > LATENCY_THRESHOLD_MS:
                latency_mismatches += 1

        override_rate = overrides_count / total if total > 0 else 0.0
        correct_routing_rate = 1.0 - override_rate
        avg_conf_overridden = (
            sum(confidence_when_overridden) / len(confidence_when_overridden)
            if confidence_when_overridden
            else None
        )

        return {
            "total_routed_requests": total,
            "total_binary_classified": total_binary,
            "correct_routing_rate": round(correct_routing_rate, 4),
            "override_rate": round(override_rate, 4),
            "override_count": overrides_count,
            "latency_mismatch_count": latency_mismatches,
            "avg_confidence_when_overridden": round(avg_conf_overridden, 4) if avg_conf_overridden else None,
            "lookback_days": 7,
        }

    async def write_implicit_feedback(self) -> int:
        """Detect overrides and write them as implicit feedback to classifier_feedback."""
        overrides = await self.detect_overrides(lookback_minutes=30)
        written = 0
        for ov in overrides:
            try:
                user_id = ov.get("user_id")
                if not user_id:
                    continue
                self.supabase.table("classifier_feedback").upsert({
                    "request_id": ov["original_request_id"],
                    "user_id": user_id,
                    "is_correct": False,
                    "notes": (
                        f"Auto-detected override: user switched from "
                        f"{ov['original_model']} to {ov['override_model']} "
                        f"after {ov['delta_seconds']:.0f}s"
                    ),
                }, on_conflict="request_id").execute()
                written += 1
            except Exception as e:
                logger.debug("Failed to write implicit feedback: %s", e)
        return written

    async def run_periodic_check(self) -> None:
        """Run periodic quality check — call from scheduled task."""
        written = await self.write_implicit_feedback()
        if written > 0:
            logger.info("Routing quality tracker: wrote %d implicit feedback entries", written)


# Module-level singleton
_tracker: Optional[RoutingQualityTracker] = None


def get_routing_quality_tracker() -> RoutingQualityTracker:
    global _tracker
    if _tracker is None:
        _tracker = RoutingQualityTracker()
    return _tracker
