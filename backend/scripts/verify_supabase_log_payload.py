"""Verify exactly what would land in Supabase usage_events.metadata
when COMPLEXITY_ANALYZER_TYPE=wide_deep_asym is active.

We monkey-patch the Supabase writer (`log_usage_event`) to capture its args
instead of sending anything remote, then call through the real analytics
service + metadata builders so the output reflects the production code path.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from unittest.mock import AsyncMock, patch

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

os.environ.setdefault("COMPLEXITY_ANALYZER_TYPE", "wide_deep_asym")
os.environ.setdefault("WIDE_DEEP_ASYM_DECISION_RULE", "cost_sensitive")
os.environ.setdefault("WIDE_DEEP_ASYM_COST_LAMBDA", "3")

from app.complexity.analyzer_factory import ComplexityAnalyzerFactory  # noqa: E402
from app.services.analytics_service import (  # noqa: E402
    AnalyticsService,
    CostAnalytics,
    ModelAnalytics,
    PerformanceAnalytics,
    RequestAnalytics,
)
from app.services.supabase_unified_llm_service import (  # noqa: E402
    SupabaseUnifiedLLMService,
)


async def main():
    # --- 1) run the real analyzer end-to-end to get a production-shape result
    analyzer = ComplexityAnalyzerFactory.create_analyzer("wide_deep_asym")
    analysis_result = await analyzer.analyze(
        text="Design a horizontally-scalable rate-limiting system for a multi-region API gateway."
    )
    print("--- analyzer.analyze() keys ---")
    print(sorted(analysis_result.keys()))

    # --- 2) reproduce the `complexity_analysis` dict _select_best_model builds
    complexity_analysis = {
        "model_selection_type": "analyzer_recommendation",
        "selected_model": analysis_result.get("recommended_model"),
        "task_type": analysis_result.get("task_type", "unknown"),
        "complexity_score": analysis_result.get("complexity_score", 0.5),
        "benchmark_model": None,
        "reasoning": analysis_result.get("reasoning", ""),
        "allowed_providers": [],
        "allowed_models": [],
        "analyzer_type": "wide_deep_asym",
        "analysis_metadata": analysis_result.get("metadata", {}),
        "full_analysis": analysis_result,
        "errors": [],
        "tier_name": analysis_result.get("tier_name"),
        "tier": analysis_result.get("tier"),
        "tier_probabilities": analysis_result.get("tier_probabilities"),
        "confidence": analysis_result.get("confidence"),
        "classifier_version": analysis_result.get("analyzer_version"),
        "decision_rule": analysis_result.get("decision_rule"),
        "cost_lambda": analysis_result.get("cost_lambda"),
        "analyzer_latency_ms": analysis_result.get("analyzer_latency_ms"),
    }

    # --- 3) run the real metadata builder
    additional_metadata = SupabaseUnifiedLLMService._build_classifier_metadata(
        "wide_deep_asym", complexity_analysis
    )
    print("\n--- additional_metadata keys ---")
    print(sorted(additional_metadata.keys()))

    # --- 4) now actually call the analytics service, with the Supabase writer
    #        stubbed so we can inspect what it would have sent
    model_analytics = ModelAnalytics(
        recommended_model=analysis_result.get("recommended_model"),
        selected_model=analysis_result.get("recommended_model"),
        selection_reason=analysis_result.get("reasoning"),
        benchmark_model=None,
        alternatives=[],
        complexity_score=analysis_result.get("complexity_score"),
        complexity_reasoning=analysis_result.get("reasoning"),
        task_type="unknown",
        analyzer_type="wide_deep_asym",
        analyzer_latency_ms=analysis_result.get("analyzer_latency_ms"),
    )
    request_analytics = RequestAnalytics(
        request_id="test-req-001",
        user_id="test-user-001",
        prompt="Design a horizontally-scalable rate-limiting system.",
        model_analytics=model_analytics,
        cost_analytics=CostAnalytics(
            total_cost_usd=0.01, cost_per_token=1e-6,
            input_cost_usd=0.003, output_cost_usd=0.007,
        ),
        performance_analytics=PerformanceAnalytics(
            latency_ms=800, total_tokens=500, prompt_tokens=100, completion_tokens=400,
        ),
        additional_metadata=additional_metadata,
    )

    captured = {}
    async def _fake_log_usage_event(**kwargs):
        captured.update(kwargs)

    with patch(
        "app.services.analytics_service.log_usage_event",
        new=AsyncMock(side_effect=_fake_log_usage_event),
    ):
        await AnalyticsService().log_request_analytics(request_analytics)

    metadata = captured.get("metadata") or {}
    print("\n--- SUPABASE usage_events ROW (captured args) ---")
    print(f"  model_name : {captured.get('model_name')}")
    print(f"  provider   : {captured.get('provider')}")
    print(f"  cost_usd   : {captured.get('cost')}")
    print(f"  latency_ms : {captured.get('latency_ms')}")
    print()
    print("--- SUPABASE usage_events.metadata (classifier-relevant keys) ---")
    keys_of_interest = [
        "analyzer_type",
        "complexity_analyzer",
        "classifier_tier",
        "classifier_confidence",
        "classifier_version",
        "confidence",
        "tier_probabilities",
        "decision_rule",
        "cost_lambda",
        "analyzer_latency_ms",
        "complexity_score",
        "recommended_model",
        "selected_model",
        "model_was_overridden",
    ]
    for k in keys_of_interest:
        v = metadata.get(k)
        if isinstance(v, dict):
            v = json.dumps(v)
        print(f"  {k:<24} = {v}")

    # Hard assertions — if these fail the logging pipeline regressed.
    assert metadata.get("analyzer_type") == "wide_deep_asym", metadata.get("analyzer_type")
    assert metadata.get("classifier_version") == "wide_deep_asym_v3", metadata.get("classifier_version")
    assert metadata.get("classifier_tier") in {"simple", "medium", "complex"}, metadata.get("classifier_tier")
    assert isinstance(metadata.get("tier_probabilities"), dict), metadata.get("tier_probabilities")
    assert metadata.get("decision_rule") == "cost_sensitive", metadata.get("decision_rule")
    assert float(metadata.get("cost_lambda")) == 3.0, metadata.get("cost_lambda")
    assert metadata.get("complexity_analyzer") == "wide_deep_asym"

    print("\nAll assertions passed — Supabase row will include analyzer_type,")
    print("classifier_version, tier_name, tier_probabilities, decision_rule,")
    print("and cost_lambda for the wide_deep_asym analyzer.")


if __name__ == "__main__":
    asyncio.run(main())
