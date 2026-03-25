"""
Routing replay / what-if analysis service.

Re-runs the binary classifier on stored prompts from usage_events
with a hypothetical config override, comparing original routing vs
hypothetical routing. No LLM calls needed.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.settings import settings

logger = logging.getLogger(__name__)


class RoutingReplayService:
    """Replays past routing decisions against an alternative configuration."""

    def __init__(self):
        from app.auth.supabase_auth import supabase
        self.supabase = supabase

    async def replay(
        self,
        user_id: str,
        last_n_requests: int = 100,
        config_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Replay recent routing decisions with a config override.

        Args:
            user_id: The user to replay for.
            last_n_requests: How many recent requests to replay.
            config_override: Dict with keys like 'allowed_models', 'benchmark_model',
                             'analyzer_type' to override for the hypothetical run.

        Returns:
            Summary with per-request comparison and total cost delta.
        """
        config_override = config_override or {}

        # 1. Fetch recent events
        try:
            response = (
                self.supabase.table("usage_events")
                .select("request_id, prompt, model_name, cost, metadata, created_at")
                .eq("user_id", user_id)
                .not_.is_("prompt", "null")
                .order("created_at", desc=True)
                .limit(last_n_requests)
                .execute()
            )
            events = response.data or []
        except Exception as e:
            logger.error("Error fetching events for replay: %s", e)
            return {"error": str(e)}

        if not events:
            return {"replayed": 0, "results": [], "total_cost_delta": 0.0}

        # 2. Build hypothetical classifier
        allowed_models = config_override.get("allowed_models")
        allowed_providers = config_override.get("allowed_providers")
        analyzer_type = config_override.get("analyzer_type", "binary")

        from app.complexity.analyzer_factory import ComplexityAnalyzerFactory

        analyzer = ComplexityAnalyzerFactory.create_analyzer(
            analyzer_type,
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
        )

        # 3. Replay each event
        results: List[Dict[str, Any]] = []
        total_original_cost = 0.0
        total_hypothetical_cost = 0.0

        # Load model cost lookup
        cost_lookup = self._build_cost_lookup()

        for event in events:
            prompt = event.get("prompt", "")
            original_model = event.get("model_name", "")
            original_cost = float(event.get("cost") or 0)

            try:
                hypo_result = await analyzer.analyze(text=prompt)
                hypo_model = hypo_result.get("recommended_model", original_model)
            except Exception:
                hypo_model = original_model

            # Estimate hypothetical cost (proportional to original cost by model cost ratio)
            hypo_cost = self._estimate_cost(
                original_model, original_cost, hypo_model, cost_lookup
            )

            total_original_cost += original_cost
            total_hypothetical_cost += hypo_cost

            results.append({
                "request_id": event.get("request_id"),
                "original_model": original_model,
                "hypothetical_model": hypo_model,
                "original_cost": round(original_cost, 6),
                "hypothetical_cost": round(hypo_cost, 6),
                "cost_delta": round(hypo_cost - original_cost, 6),
                "model_changed": original_model != hypo_model,
            })

        return {
            "replayed": len(results),
            "config_override": config_override,
            "total_original_cost": round(total_original_cost, 6),
            "total_hypothetical_cost": round(total_hypothetical_cost, 6),
            "total_cost_delta": round(total_hypothetical_cost - total_original_cost, 6),
            "models_changed_count": sum(1 for r in results if r["model_changed"]),
            "results": results,
        }

    def _build_cost_lookup(self) -> Dict[str, float]:
        """Build a rough cost-per-1M-tokens lookup from model performance data."""
        try:
            import json, os
            path = os.path.join(
                os.path.dirname(__file__), "..", "reference_data", "model_performance_clean.json"
            )
            with open(path) as f:
                data = json.load(f)
            lookup = {}
            for m in data.get("models", []):
                api_id = m.get("api_id", "")
                pricing = m.get("other", {}).get("pricing", {})
                cost = pricing.get("blended_usd1m_tokens", 1.0)
                try:
                    lookup[api_id] = float(cost)
                except (ValueError, TypeError):
                    lookup[api_id] = 1.0
            return lookup
        except Exception:
            return {}

    @staticmethod
    def _estimate_cost(
        original_model: str,
        original_cost: float,
        hypo_model: str,
        cost_lookup: Dict[str, float],
    ) -> float:
        """Estimate hypothetical cost by ratio of per-token costs."""
        if original_model == hypo_model or original_cost == 0:
            return original_cost

        orig_rate = cost_lookup.get(original_model, 1.0)
        hypo_rate = cost_lookup.get(hypo_model, 1.0)
        if orig_rate == 0:
            return original_cost

        return original_cost * (hypo_rate / orig_rate)
