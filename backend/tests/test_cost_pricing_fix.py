"""Regression tests for the routing/pricing bug discovered with Sufian's
account: Bedrock Claude variants were resolving to GPT-4 pricing because
``_find_model_key`` partial-matched on a single ``"4"`` token, and the
tier-name parser was promoting trivial prompts to "complex".
"""

from __future__ import annotations

import pytest

from app.services.cost_calculation_service import CostCalculationService


# ---------- _find_model_key ----------

@pytest.fixture
def svc() -> CostCalculationService:
    return CostCalculationService()


def test_bedrock_claude_does_not_match_gpt4(svc: CostCalculationService):
    """The classic bug: ``"4" in "...claude-opus-4-6..."`` matched ``gpt-4``."""
    key = svc._find_model_key("bedrock/us.anthropic.claude-opus-4-6-v1")
    assert key != "gpt-4"
    assert "claude" in key


def test_bedrock_strip_resolves_to_anthropic_entry(svc: CostCalculationService):
    """Bedrock-prefixed Claude 4.6 should price out the same as the Anthropic-direct entry."""
    assert svc._find_model_key("bedrock/us.anthropic.claude-opus-4-6-v1") == "claude-opus-4-6"
    assert svc._find_model_key("bedrock/us.anthropic.claude-sonnet-4-6") == "claude-sonnet-4-6"
    assert svc._find_model_key(
        "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0"
    ) == "claude-haiku-4-5"


def test_direct_anthropic_names_resolve(svc: CostCalculationService):
    assert svc._find_model_key("claude-opus-4-6") == "claude-opus-4-6"
    assert svc._find_model_key("claude-sonnet-4-6") == "claude-sonnet-4-6"
    assert svc._find_model_key("claude-haiku-4-5") == "claude-haiku-4-5"


def test_short_token_does_not_pollute(svc: CostCalculationService):
    """``o3`` is two chars and used to fuzz-match unrelated models."""
    key = svc._find_model_key("claude-opus-4-6")
    # Should not bleed into gpt/o3/gemini families
    assert not key.startswith("gpt")
    assert not key.startswith("o3")
    assert not key.startswith("gemini")


# ---------- Cost parity: same model, two backends ----------

def test_bedrock_and_anthropic_opus_4_6_price_identically(svc: CostCalculationService):
    """A single Hosted user must not be billed at GPT-4 rates because their
    request was sent through Bedrock instead of Anthropic-direct.
    """
    direct = svc._calculate_llm_cost("claude-opus-4-6", 8, 24)
    bedrock = svc._calculate_llm_cost(
        "bedrock/us.anthropic.claude-opus-4-6-v1", 8, 24
    )
    assert direct == bedrock, (
        f"Bedrock and Anthropic variants of the same model must price the same; "
        f"got direct=${direct:.6f} vs bedrock=${bedrock:.6f}"
    )


def test_bedrock_opus_not_priced_as_gpt4(svc: CostCalculationService):
    """Concrete numeric guard against the regression: GPT-4 = $30/$60 per M
    would yield $0.00168 for 8/24 tokens. We must be cheaper than that.
    """
    cost = svc._calculate_llm_cost("bedrock/us.anthropic.claude-opus-4-6-v1", 8, 24)
    gpt4_cost = (8 * 0.03 / 1000) + (24 * 0.06 / 1000)  # 0.00168
    assert cost < gpt4_cost, (
        f"Bedrock Claude must not price as GPT-4 ($30/$60/M); "
        f"got ${cost:.6f}, GPT-4 would be ${gpt4_cost:.6f}"
    )


def test_sonnet_and_haiku_bedrock_parity(svc: CostCalculationService):
    sonnet_d = svc._calculate_llm_cost("claude-sonnet-4-6", 1000, 1000)
    sonnet_b = svc._calculate_llm_cost("bedrock/us.anthropic.claude-sonnet-4-6", 1000, 1000)
    haiku_d = svc._calculate_llm_cost("claude-haiku-4-5", 1000, 1000)
    haiku_b = svc._calculate_llm_cost(
        "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0", 1000, 1000
    )
    assert sonnet_d == sonnet_b
    assert haiku_d == haiku_b


# ---------- Tier resolution (the routing half) ----------

def _resolve_tier(complexity_analysis_result):
    """Mirror of the resolution block in production_completion.py so we can
    unit-test it without spinning up the request pipeline."""
    complexity_score = complexity_analysis_result.get("complexity_score", 0)
    reasoning = complexity_analysis_result.get("reasoning", "").lower()
    extracted_metrics = complexity_analysis_result.get("extracted_metrics") or {}
    extracted_tier = (
        extracted_metrics.get("tier") if isinstance(extracted_metrics, dict) else None
    )

    try:
        tier_int = int(extracted_tier) if extracted_tier is not None else None
    except (TypeError, ValueError):
        tier_int = None

    if tier_int is not None:
        if tier_int <= 1:
            return "simple"
        if tier_int == 2:
            return "medium"
        return "complex"
    if "complex" in reasoning and "simple" not in reasoning.split("complex")[0][-10:]:
        return "complex"
    if "medium" in reasoning or "moderate" in reasoning:
        return "medium"
    if "simple" in reasoning:
        return "simple"
    if complexity_score >= 0.7:
        return "complex"
    if complexity_score >= 0.3:
        return "medium"
    return "simple"


def test_extracted_tier_2_routes_to_medium_even_if_reasoning_says_complex():
    """Sufian's repro: classifier emits tier=2 but reasoning text contains
    the word 'complex' (e.g. 'not particularly complex'). Old parser routed
    to Opus; new parser must trust the structured tier."""
    result = {
        "extracted_metrics": {"tier": 2},
        "reasoning": "Although the prompt mentions complex topics, it is short.",
        "complexity_score": 0.85,  # would also push old logic to "complex"
    }
    assert _resolve_tier(result) == "medium"


def test_extracted_tier_1_routes_to_simple():
    assert _resolve_tier({"extracted_metrics": {"tier": 1}, "reasoning": ""}) == "simple"


def test_extracted_tier_3_routes_to_complex():
    assert _resolve_tier({"extracted_metrics": {"tier": 3}, "reasoning": ""}) == "complex"


def test_extracted_tier_4_routes_to_complex():
    """4-tier classifier (simple/mid/complex/reasoning) — tier 4 still routes
    to the highest-cost bucket since we only expose 3 tier_models slots."""
    assert _resolve_tier({"extracted_metrics": {"tier": 4}, "reasoning": ""}) == "complex"


def test_falls_back_to_text_when_no_extracted_tier():
    result = {"reasoning": "This is a simple greeting.", "complexity_score": 0.1}
    assert _resolve_tier(result) == "simple"


def test_falls_back_to_score_when_no_text_or_extracted():
    assert _resolve_tier({"complexity_score": 0.75}) == "complex"
    assert _resolve_tier({"complexity_score": 0.5}) == "medium"
    assert _resolve_tier({"complexity_score": 0.1}) == "simple"


def test_string_tier_is_accepted():
    """Some classifiers stringify the tier; numeric coercion should still work."""
    assert _resolve_tier({"extracted_metrics": {"tier": "2"}}) == "medium"
