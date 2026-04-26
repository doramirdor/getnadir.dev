"""
Production-ready completion endpoint for Nadir API.
Handles API key authentication, user configuration lookup, and intelligent model recommendation.
Enterprise-grade endpoint with comprehensive analytics and cost management.
"""

import asyncio
import logging
import time
import uuid
from typing import Dict, Any, Optional, List, Tuple, Literal
from fastapi import APIRouter, BackgroundTasks, HTTPException, status, Header, Depends, Request
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, UserSession


# ── Tier-to-model mapping (auto-sort by price) ──────────────────────────


def _get_model_input_cost(model: str) -> float:
    """Get the input cost per token for a model using litellm's pricing data."""
    try:
        from litellm import model_cost
        for key in (model, model.split("/")[-1]):
            info = model_cost.get(key, {})
            cost = info.get("input_cost_per_token", 0)
            if cost:
                return float(cost)
        # Substring match
        model_lower = model.lower()
        candidates = []
        for k, v in model_cost.items():
            if model_lower in k.lower():
                c = v.get("input_cost_per_token", 0)
                if c:
                    candidates.append((len(k), c))
        if candidates:
            candidates.sort()
            return float(candidates[0][1])
    except Exception:
        pass
    return 0.0


# Cache-read multipliers on base input price (provider-published).
# Used only for routing comparisons; actual billing flows through litellm.completion_cost.
# Keyed by the values extract_provider() actually returns — Claude-on-Bedrock comes back
# as "anthropic" because the model string contains "claude".
_CACHE_READ_MULTIPLIER = {
    "anthropic": 0.1,
    "openai": 0.5,
    "google": 0.25,
}


def _effective_input_cost(model: str, expect_cache_hit: bool) -> float:
    """Input cost per token adjusted for expected cache behavior.

    When expect_cache_hit is True we blend a conservative 70% hit rate against the
    provider's cache-read multiplier. Only used to compare routing candidates — not
    to calculate billed cost.
    """
    base = _get_model_input_cost(model)
    if not expect_cache_hit or base <= 0:
        return base
    mult = _CACHE_READ_MULTIPLIER.get(_provider_of(model), 1.0)
    if mult >= 1.0:
        return base
    hit_rate = 0.7
    return base * ((1 - hit_rate) + hit_rate * mult)


# Providers whose caches we can mark via cache_control. Claude-on-Bedrock is covered
# by "anthropic" because extract_provider() returns "anthropic" for any model name
# containing "claude", including bedrock/us.anthropic.claude-*.
# (OpenAI caches automatically without markup; Gemini/others don't support it.)
_CACHE_CONTROL_PROVIDERS = {"anthropic"}


def _min_cache_tokens(model: str) -> int:
    """Minimum prompt length for the provider to cache. Haiku needs 2048, others 1024."""
    return 2048 if "haiku" in model.lower() else 1024


def _approx_token_count(text: str) -> int:
    """Cheap length-based estimate (~4 chars/token) sufficient for threshold checks."""
    return len(text) // 4 if text else 0


def _has_cache_control(messages_dicts: List[Dict[str, Any]]) -> bool:
    for msg in messages_dicts:
        if msg.get("cache_control"):
            return True
        content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("cache_control"):
                    return True
    return False


def _maybe_inject_cache_control(
    messages_dicts: List[Dict[str, Any]],
    model: str,
    user_id: str,
    preset_slug: Optional[str],
    sticky_provider: Optional[str],
) -> bool:
    """Mark the system prompt as cacheable when the math clearly wins.

    Conditions (all must hold):
      - chosen model is Anthropic or Bedrock
      - request has no cache_control already
      - sticky provider matches the chosen model's provider (likely warm cache)
      - identical system prompt was seen from this (user, preset) within TTL
      - system prompt meets the provider's min-cacheable token threshold

    Mutates messages_dicts in place. Returns True if a marker was added. Always records
    the current system prompt so a later call can detect repetition.
    """
    if not preset_slug or _provider_of(model) not in _CACHE_CONTROL_PROVIDERS:
        return False
    if _has_cache_control(messages_dicts):
        return False

    system_msg = next((m for m in messages_dicts if m.get("role") == "system"), None)
    if not system_msg:
        return False
    system_text = system_msg.get("content")
    if not isinstance(system_text, str) or not system_text:
        return False
    if _approx_token_count(system_text) < _min_cache_tokens(model):
        sticky_provider_cache.record_prompt(user_id, preset_slug, system_text)
        return False

    seen = sticky_provider_cache.seen_prompt(user_id, preset_slug, system_text)
    sticky_provider_cache.record_prompt(user_id, preset_slug, system_text)

    sp_match = sticky_provider and sticky_provider.lower() == _provider_of(model)
    if not (seen and sp_match):
        return False

    system_msg["content"] = [
        {
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    return True


def _map_tier_to_model(
    tier_name: str,
    selected_models: List[str],
    model_parameters: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Map a complexity tier (simple/medium/complex) to the right model
    from the user's selected_models, sorted by price.

    Priority:
      1. Explicit overrides in model_parameters.tier_models.{simple,medium,complex}
         or model_parameters.{simple,medium,complex}_model
      2. Auto-sort by input cost:
         1 model → all tiers use it
         2 models → simple→cheapest, complex→expensive
         3+ → simple→cheapest, medium→middle, complex→most expensive
    """
    if not selected_models:
        return None

    # 1. Manual overrides
    if model_parameters:
        tier_models = model_parameters.get("tier_models", {})
        override = tier_models.get(tier_name)
        if override and override in selected_models:
            return override
        flat_override = model_parameters.get(f"{tier_name}_model")
        if flat_override and flat_override in selected_models:
            return flat_override

    # 1b. Validate manual overrides — warn if tier pricing is inverted
    if model_parameters:
        tier_models = model_parameters.get("tier_models", {})
        simple_m = tier_models.get("simple")
        medium_m = tier_models.get("medium")
        complex_m = tier_models.get("complex")

        if simple_m and complex_m:
            simple_cost = _get_model_input_cost(simple_m)
            complex_cost = _get_model_input_cost(complex_m)
            if simple_cost > 0 and complex_cost > 0 and simple_cost > complex_cost:
                logger.warning(
                    "Inverted tier pricing: simple=%s ($%.6f/tok) > complex=%s ($%.6f/tok). "
                    "Routing may increase costs instead of reducing them.",
                    simple_m, simple_cost, complex_m, complex_cost,
                )

        if medium_m and complex_m:
            medium_cost = _get_model_input_cost(medium_m)
            complex_cost = _get_model_input_cost(complex_m)
            if medium_cost > 0 and complex_cost > 0 and medium_cost > complex_cost:
                logger.warning(
                    "Inverted tier pricing: medium=%s ($%.6f/tok) > complex=%s ($%.6f/tok).",
                    medium_m, medium_cost, complex_m, complex_cost,
                )

    # 2. Auto-sort by price
    if len(selected_models) == 1:
        return selected_models[0]

    sorted_models = sorted(selected_models, key=_get_model_input_cost)

    if len(sorted_models) == 2:
        mapping = {"simple": sorted_models[0], "medium": sorted_models[1], "complex": sorted_models[1]}
    else:
        mid = len(sorted_models) // 2
        mapping = {"simple": sorted_models[0], "medium": sorted_models[mid], "complex": sorted_models[-1]}

    return mapping.get(tier_name)
from app.database.supabase_db import supabase_db
from app.settings import settings
from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
from app.processors.request_processor import get_processed_request
from app.middleware.rate_limiter import check_rate_limit
from app.middleware.subscription_guard import require_active_subscription
from app.middleware.hosted_budget import check_hosted_budget, record_hosted_spend
from app.services.preset_router_service import PresetRouterService

from app.complexity.model_registry import extract_provider as _provider_of
from app.services.sticky_provider_cache import sticky_provider_cache

logger = logging.getLogger(__name__)
router = APIRouter()


def _apply_provider_preferences(
    models: List[str],
    prefs: Optional["ProviderPreferences"],
    sticky_provider: Optional[str] = None,
) -> List[str]:
    """
    Filter and reorder models based on ProviderPreferences and sticky provider affinity.

    Priority: ignore (hard filter) -> order (explicit sort) -> sticky_provider (soft boost for cache affinity).
    Returns a new list; never mutates the input.
    """
    result = list(models)

    # Warn about unimplemented preferences
    if prefs and prefs.sort:
        logger.warning("provider.sort='%s' requested but not yet implemented — ignored", prefs.sort)
    if prefs and prefs.require_parameters:
        logger.warning("provider.require_parameters requested but not yet implemented — ignored")

    # Step 1: Remove ignored providers (hard filter)
    if prefs and prefs.ignore:
        ignore_set = {p.lower() for p in prefs.ignore}
        result = [m for m in result if _provider_of(m) not in ignore_set]

    # Step 2: Apply explicit provider order
    if prefs and prefs.order:
        ordered = []
        remaining = list(result)
        for provider in prefs.order:
            prov_lower = provider.lower()
            group = [m for m in remaining if _provider_of(m) == prov_lower]
            ordered.extend(group)
            for m in group:
                remaining.remove(m)
        ordered.extend(remaining)  # append providers not in the order list
        result = ordered

    # Step 3: Cache-aware affinity. Compare effective prices assuming the sticky
    # provider is warm vs. alternatives cold; sticky wins only when its cached
    # price actually beats the cheapest cold alternative. Stable on ties so the
    # existing order from step 2 is preserved.
    if sticky_provider and not (prefs and prefs.order):
        sp = sticky_provider.lower()
        indexed = list(enumerate(result))

        def _score(item):
            idx, m = item
            warm = _provider_of(m) == sp
            return (_effective_input_cost(m, expect_cache_hit=warm), idx)

        result = [m for _, m in sorted(indexed, key=_score)]

    return result


class ChatMessage(BaseModel):
    """Chat message structure."""
    role: Literal["user", "assistant", "system", "tool"] = Field(..., description="Message role (user, assistant, system)")
    content: str = Field(..., max_length=500_000, description="Message content")
    cache_control: Optional[Dict[str, Any]] = Field(None, description="Cache control for prompt caching (Anthropic/OpenAI)")

class ReasoningConfig(BaseModel):
    """Configuration for reasoning/thinking tokens (o-series, Claude thinking, Gemini 2.5)."""
    effort: Optional[Literal["low", "medium", "high"]] = Field(None, description="Reasoning effort level")
    max_tokens: Optional[int] = Field(None, ge=1, le=128_000, description="Max reasoning/thinking tokens budget")

class ProviderPreferences(BaseModel):
    """Per-request provider filtering and ordering preferences (OpenRouter-compatible)."""
    order: Optional[List[str]] = Field(None, description="Preferred provider order, e.g. ['anthropic', 'openai']")
    ignore: Optional[List[str]] = Field(None, description="Providers to exclude from selection")
    sort: Optional[Literal["price", "throughput", "latency"]] = Field(None, description="Sort strategy for provider selection")
    require_parameters: Optional[bool] = Field(None, description="Only use providers that support all request parameters")

class ProductionCompletionRequest(BaseModel):
    """Production completion request matching industry standards."""
    messages: List[ChatMessage] = Field(..., description="Chat messages")
    model: Optional[str] = Field(None, description="Optional model override (uses API key preset by default)")
    temperature: Optional[float] = Field(None, ge=0, le=2, description="Sampling temperature")
    max_tokens: Optional[int] = Field(None, ge=1, le=128_000, description="Maximum tokens to generate")
    top_p: Optional[float] = Field(None, ge=0, le=1, description="Top-p sampling parameter")
    frequency_penalty: Optional[float] = Field(None, ge=-2, le=2, description="Frequency penalty")
    presence_penalty: Optional[float] = Field(None, ge=-2, le=2, description="Presence penalty")
    stream: Optional[bool] = Field(False, description="Enable streaming")
    response_format: Optional[Dict[str, Any]] = Field(None, description="Response format (e.g. json_object, json_schema)")
    reasoning: Optional[ReasoningConfig] = Field(None, description="Reasoning/thinking token configuration")
    # P0 gap features
    provider: Optional[ProviderPreferences] = Field(None, description="Per-request provider filtering/ordering preferences")
    route: Optional[str] = Field(None, description="Routing mode: 'fallback' enables automatic fallback chain")
    fallback_models: Optional[List[str]] = Field(None, description="Explicit fallback model chain (used with route='fallback')")
    transforms: Optional[List[str]] = Field(None, description="Message transforms to apply, e.g. ['middle-out']")
    # Per-request layer overrides (override preset defaults)
    layers: Optional[Dict[str, Any]] = Field(None, description="Feature layer overrides: {routing: bool, fallback: bool, optimize: 'off'|'safe'|'aggressive'}")

class ProductionCompletionResponse(BaseModel):
    """Production completion response."""
    id: str = Field(..., description="Request ID")
    object: str = Field(default="chat.completion", description="Response object type")
    created: int = Field(..., description="Unix timestamp")
    model: str = Field(..., description="Model used for completion")
    choices: List[Dict[str, Any]] = Field(..., description="Completion choices")
    usage: Dict[str, Any] = Field(..., description="Token usage statistics")
    nadir_metadata: Dict[str, Any] = Field(..., description="Nadir-specific metadata")

def _resolve_layers(model_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolve feature layers from preset model_parameters.

    Layers control which features are active per-preset:
      - routing: bool (default True) — intelligent complexity-based model selection
      - fallback: bool (default True) — auto-retry with fallback chain on failure
      - optimize: "off"|"safe"|"aggressive" (default "off") — context optimization

    Always-on (not toggleable): token tracking, savings tracking, response healing, rate limiting.
    """
    layers_raw = model_params.get("layers", {})
    return {
        "routing": layers_raw.get("routing", True),
        "fallback": layers_raw.get("fallback", True),
        "optimize": layers_raw.get("optimize", "off"),  # "off", "safe", "aggressive"
    }


async def get_user_config_from_api_key(current_user: UserSession, model_override: Optional[str] = None) -> Dict[str, Any]:
    """
    Get user configuration from their API key preset.

    Args:
        current_user: Current user session (contains API key configuration)
        model_override: Optional model override

    Returns:
        Dict containing user configuration and selected model
    """
    try:
        # Use the API key configuration that was loaded during authentication
        api_key_config = current_user.api_key_config
        
        # If model override is provided, handle it
        # "auto" means "let Nadir decide" — treat it like no override
        if model_override and model_override != "auto":
            if model_override.startswith("@preset/"):
                slug = model_override.replace("@preset/", "")
                # Look for specific preset in presets table
                from app.auth.supabase_auth import supabase
                preset_response = supabase.table("presets").select("*").eq(
                    "user_id", current_user.id
                ).execute()
                
                # Find preset by slug from model_parameters
                preset_data = None
                for preset in preset_response.data:
                    model_params = preset.get("model_parameters", {})
                    if model_params.get("slug") == slug:
                        preset_data = preset
                        break
                
                if preset_data:
                    # Convert preset data to api_key_config format
                    model_params = preset_data.get("model_parameters", {})
                    api_key_config = {
                        "selected_models": preset_data.get("selected_models", []),
                        "benchmark_model": model_params.get("benchmarkModel"),
                        "load_balancing_policy": model_params.get("loadBalancingPolicy", "round-robin"),
                        "use_fallback": model_params.get("useFallback", True),
                        "model_parameters": model_params,
                        "slug": slug,
                        "name": preset_data.get("name", slug),
                        "sort_strategy": model_params.get("sort", "smart-routing"),
                        "layers": _resolve_layers(model_params),
                    }
                else:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Preset configuration '{slug}' not found"
                    )
            else:
                # Direct model specification
                user_config = {
                    "selected_models": [model_override],
                    "benchmark_model": api_key_config.get("benchmark_model"),
                    "load_balancing_policy": "direct",
                    "use_fallback": api_key_config.get("use_fallback", True),
                    "model_parameters": api_key_config.get("model_parameters", {}),
                    "slug": None,
                    "api_key_name": api_key_config.get("name", "default"),
                    "layers": _resolve_layers(api_key_config.get("model_parameters", {})),
                }
                logger.debug(f"Using direct model override '{model_override}' for user {current_user.id}")
                return user_config
        
        # Use configuration from the current API key
        user_config = {
            "selected_models": api_key_config.get("selected_models", []),
            "benchmark_model": api_key_config.get("benchmark_model"),
            "load_balancing_policy": api_key_config.get("load_balancing_policy", "round-robin"),
            "use_fallback": api_key_config.get("use_fallback", True),
            "model_parameters": api_key_config.get("model_parameters", {}),
            "slug": api_key_config.get("slug"),
            "api_key_name": api_key_config.get("name", "default"),
            "sort_strategy": api_key_config.get("sort_strategy", "smart-routing"),
            "layers": _resolve_layers(api_key_config.get("model_parameters", {})),
        }
        
        logger.debug(f"Using API key preset '{api_key_config.get('slug', 'default')}' for user {current_user.id}")
        return user_config
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user config from API key: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to resolve user configuration"
        )

async def get_intelligent_model_recommendation_with_analysis(
    messages: List[ChatMessage],
    user_config: Dict[str, Any],
    current_user: UserSession,
    provider_prefs: Optional["ProviderPreferences"] = None,
    sticky_provider: Optional[str] = None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Get intelligent model recommendation based on prompt complexity and user preferences.

    Args:
        messages: Chat messages for complexity analysis
        user_config: User configuration from API key or profile
        current_user: Current user session
        provider_prefs: Optional per-request provider preferences (P0 #1)
        sticky_provider: Optional sticky provider for cache affinity (P0 #4)

    Returns:
        Tuple of (recommended_model, complexity_analysis_result)
    """
    try:
        # Extract the latest user message for analysis
        user_messages = [msg.content for msg in messages if msg.role == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="No user messages found")
        
        latest_prompt = user_messages[-1]
        
        # Get available models from user config
        available_models = user_config.get("selected_models", [])
        if not available_models:
            available_models = current_user.allowed_models or []
        
        if not available_models:
            # Fallback to default models if none configured
            available_models = ["gpt-4o-mini", "claude-3-haiku-20240307"]

        # P0 #1 + #4: Apply per-request provider preferences and sticky provider boost
        if provider_prefs or sticky_provider:
            original_models = list(available_models)
            available_models = _apply_provider_preferences(available_models, provider_prefs, sticky_provider)
            if not available_models:
                logger.warning("Provider preferences filtered out all models, reverting to original list")
                available_models = original_models

        # Check if this is a load balancing strategy
        sort_strategy = user_config.get("sort_strategy", "smart-routing")

        if sort_strategy == "load-balancing":
            # Use load balancing policy
            load_balancing_policy = user_config.get("load_balancing_policy", "round-robin")
            logger.debug(f"Using load balancing strategy '{load_balancing_policy}' for user {current_user.id}")
            
            if load_balancing_policy == "round-robin":
                # Simple round-robin: use first available model (could be enhanced with state)
                recommended_model = available_models[0] if available_models else "gpt-4o-mini"
            elif load_balancing_policy == "random":
                # Random selection from available models
                import random
                recommended_model = random.choice(available_models) if available_models else "gpt-4o-mini"
            elif load_balancing_policy == "weighted":
                # For now, fallback to first model (could be enhanced with weights)
                recommended_model = available_models[0] if available_models else "gpt-4o-mini"
            else:
                # Default fallback
                recommended_model = available_models[0] if available_models else "gpt-4o-mini"
            
            logger.info(f"🎯 Load Balance: {recommended_model} | Policy: {load_balancing_policy} | User: {current_user.id}")
            
            # Create load balancing analysis result
            complexity_analysis = {
                "model_selection_type": "load_balancing",
                "strategy": "load-balancing", 
                "policy": load_balancing_policy,
                "selected_model": recommended_model,
                "reasoning": f"Load balancing using {load_balancing_policy} policy"
            }
            
            return recommended_model, complexity_analysis
        
        # Smart routing — check for expert model first
        _resolved_cluster_id = None
        try:
            from app.services.expert_model_service import ExpertModelService
            from app.clusters.supabase_clustering import local_clustering_service

            # Classify prompt to get cluster
            cluster_id, cluster_confidence = await local_clustering_service.classify(latest_prompt)
            _resolved_cluster_id = cluster_id
            if cluster_id:
                expert_service = ExpertModelService()
                should_use_expert, expert_model_id = await expert_service.should_route_to_expert(
                    str(current_user.id), cluster_id
                )
                if should_use_expert and expert_model_id:
                    logger.info(f"Routing to expert model {expert_model_id} for cluster {cluster_id}")
                    return expert_model_id, {
                        "model_selection_type": "smart_export",
                        "strategy": "smart-export",
                        "selected_model": expert_model_id,
                        "cluster_id": cluster_id,
                        "cluster_confidence": cluster_confidence,
                        "reasoning": f"Expert model active for cluster {cluster_id}",
                    }
        except Exception as expert_err:
            logger.debug(f"Expert model check skipped: {expert_err}")

        # Check cluster routing policy (user-defined per-cluster rules)
        try:
            from app.services.cluster_routing_policy_service import get_cluster_routing_policy_service
            from app.clusters.supabase_clustering import local_clustering_service as _lcs

            # Reuse cluster classification from expert model check, or classify now
            _cluster_id = _resolved_cluster_id
            if _cluster_id is None:
                _cluster_id, _ = await _lcs.classify(latest_prompt)

            if _cluster_id:
                policy_service = get_cluster_routing_policy_service()
                has_policy, policy_model, policy_meta = await policy_service.resolve_model(
                    user_id=str(current_user.id),
                    cluster_id=_cluster_id,
                    available_models=available_models,
                )
                if has_policy and policy_model:
                    logger.info(f"Cluster policy routing to {policy_model} for cluster {_cluster_id}")
                    return policy_model, {
                        "model_selection_type": "cluster_routing_policy",
                        "strategy": "cluster-policy",
                        "selected_model": policy_model,
                        "cluster_id": _cluster_id,
                        "reasoning": f"Per-cluster routing policy: {policy_model} for cluster {_cluster_id}",
                        **(policy_meta or {}),
                    }
        except Exception as policy_err:
            logger.debug(f"Cluster routing policy check skipped: {policy_err}")

        # Smart routing - perform complexity analysis using configured analyzer
        import time as _time
        from app.metrics import ANALYZER_DURATION_SECONDS, ANALYZER_TIER_TOTAL

        # Create analyzer based on settings (defaults to BERT for speed/reliability)
        complexity_analyzer = ComplexityAnalyzerFactory.create_analyzer(
            settings.COMPLEXITY_ANALYZER_TYPE,
            allowed_providers=current_user.allowed_providers,
            allowed_models=available_models
        )

        # Perform complexity analysis (timed for Prometheus, with timeout)
        _analyze_start = _time.perf_counter()
        try:
            complexity_result = await asyncio.wait_for(
                complexity_analyzer.analyze(
                    text=latest_prompt,
                    system_message=next((msg.content for msg in messages if msg.role == "system"), "")
                ),
                timeout=settings.COMPLEXITY_ANALYSIS_TIMEOUT,
            )
        except asyncio.TimeoutError:
            _elapsed = _time.perf_counter() - _analyze_start
            logger.warning(
                "Complexity analysis timed out after %.1fs (limit %ds), using fallback for user %s",
                _elapsed, settings.COMPLEXITY_ANALYSIS_TIMEOUT, current_user.id,
            )
            ANALYZER_DURATION_SECONDS.labels(
                analyzer_type=settings.COMPLEXITY_ANALYZER_TYPE
            ).observe(_elapsed)
            # Fallback: pick first available model with a neutral complexity score
            fallback_model = available_models[0] if available_models else "gpt-4o-mini"
            return fallback_model, {
                "model_selection_type": "timeout_fallback",
                "strategy": "smart-routing",
                "selected_model": fallback_model,
                "reasoning": f"Complexity analysis timed out after {settings.COMPLEXITY_ANALYSIS_TIMEOUT}s, using fallback",
                "error": "analysis_timeout",
            }
        ANALYZER_DURATION_SECONDS.labels(
            analyzer_type=settings.COMPLEXITY_ANALYZER_TYPE
        ).observe(_time.perf_counter() - _analyze_start)
        ANALYZER_TIER_TOTAL.labels(
            analyzer_type=settings.COMPLEXITY_ANALYZER_TYPE,
            tier=str(complexity_result.get("tier", "unknown")),
        ).inc()

        # Extract detailed information from the complexity analysis
        recommended_model = complexity_result.get("recommended_model", available_models[0] if available_models else "gpt-4o-mini")
        complexity_score = complexity_result.get("complexity_score", 0.5)
        
        # Create detailed analysis result
        analyzer_name = f"{settings.COMPLEXITY_ANALYZER_TYPE}_analysis"
        complexity_analysis = {
            "model_selection_type": analyzer_name,
            "strategy": "smart-routing", 
            "analyzer_used": settings.COMPLEXITY_ANALYZER_TYPE,
            "selected_model": recommended_model,
            "complexity_score": complexity_score,
            "reasoning": complexity_result.get("reasoning", "Model selected based on complexity analysis"),
            "raw_response": complexity_result.get("detailed_analysis", complexity_result.get("reasoning", "Analysis completed")),
            "extracted_metrics": {
                "complexity_score": complexity_score,
                "reasoning_depth": complexity_result.get("tier_name", "moderate"),
                "tier": complexity_result.get("tier", 2),
                "confidence": complexity_result.get("confidence", 0.8),
                "selection_method": complexity_result.get("selection_method", "gemini_analysis"),
                "model_type": complexity_result.get("model_type", "llm_analysis")
            }
        }
        
        logger.info(f"🎯 Smart Route: {recommended_model} | Score: {complexity_score:.2f} | User: {current_user.id}")
        return recommended_model, complexity_analysis
        
    except Exception as e:
        logger.error(f"Error in model recommendation: {e}")
        # Fallback: use BinaryComplexityClassifier (centroid-based, same algorithm as NadirClaw)
        try:
            from app.complexity.binary_classifier import BinaryComplexityClassifier
            binary_clf = BinaryComplexityClassifier(
                allowed_providers=current_user.allowed_providers,
                allowed_models=available_models,
            )
            binary_result = await binary_clf.analyze(text=latest_prompt)
            fallback_model = binary_result.get("recommended_model", available_models[0] if available_models else "gpt-4o-mini")
            fallback_analysis = {
                "model_selection_type": "binary_centroid_fallback",
                "strategy": "smart-routing",
                "selected_model": fallback_model,
                "reasoning": f"ML analyzer failed ({e}), routed via binary centroid classifier (NadirClaw algorithm)",
                "error": str(e),
                "binary_result": binary_result,
            }
            logger.info(f"Binary centroid fallback routed to {fallback_model} (tier={binary_result.get('tier_name')})")
            return fallback_model, fallback_analysis
        except Exception as heuristic_err:
            logger.error(f"Heuristic fallback also failed: {heuristic_err}")
            fallback_models = user_config.get("selected_models", current_user.allowed_models)
            fallback_model = fallback_models[0] if fallback_models else "gpt-4o-mini"
            fallback_analysis = {
                "model_selection_type": "error_fallback",
                "strategy": "fallback",
                "selected_model": fallback_model,
                "reasoning": f"All analyzers failed: {str(e)}, using first available model",
                "error": str(e),
            }
            return fallback_model, fallback_analysis

@router.post("/v1/chat/completions", response_model=ProductionCompletionResponse, dependencies=[Depends(check_rate_limit)])
async def create_completion(
    request: ProductionCompletionRequest,
    background_tasks: BackgroundTasks,
    current_user: UserSession = Depends(require_active_subscription),
) -> ProductionCompletionResponse:
    """
    Create a chat completion using intelligent model selection.
    
    This endpoint mimics the OpenAI API format while providing:
    - API key authentication with user-specific configurations
    - Intelligent model recommendation based on prompt complexity
    - User benchmark comparison and cost optimization
    - Comprehensive usage tracking and analytics
    """
    start_time = time.time()
    request_id = str(uuid.uuid4())
    
    try:
        logger.debug(f"Processing completion request {request_id} for user {current_user.id}")
        
        # Get user configuration from API key
        user_config = await get_user_config_from_api_key(current_user, request.model)

        # Resolve active layers (per-request overrides take priority over preset)
        layers = user_config.get("layers", {"routing": True, "fallback": True, "optimize": "off"})
        if request.layers:
            layers = {**layers, **request.layers}

        # Free tier (BYOK, unsubscribed): routing only — no fallback or optimize
        if current_user.is_free_tier:
            layers["fallback"] = False
            layers["optimize"] = "off"

        layer_routing = layers.get("routing", True)
        layer_fallback = layers.get("fallback", True)
        layer_optimize = layers.get("optimize", "off")

        # HOSTED MODE: Check per-user spend budget before making LLM call
        if current_user.key_mode == "hosted":
            custom_budget = (current_user.raw_data.get("hosted_budget_usd") or
                             (current_user.api_key_config or {}).get("hosted_budget_usd"))
            allowed, spent, budget = await check_hosted_budget(
                current_user.id, current_user.subscription_plan, custom_budget
            )
            if not allowed:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error": "hosted_budget_exceeded",
                        "message": f"Daily hosted budget of ${budget:.0f} exceeded (spent today: ${spent:.2f}). Add your own provider keys (BYOK) for unlimited usage, or contact support to increase your limit.",
                        "spent": spent,
                        "budget": budget,
                        "upgrade_url": "https://getnadir.com/pricing",
                    },
                )

        # P0 #4: Read sticky provider for cache-hit affinity. Fetched unconditionally
        # when a preset slug exists so auto-injection can decide to mark repeat prompts
        # even if the client didn't send cache_control itself.
        sticky_provider: Optional[str] = None
        preset_slug = user_config.get("slug")
        if preset_slug:
            try:
                sticky_provider = sticky_provider_cache.get(str(current_user.id), preset_slug)
                if sticky_provider:
                    logger.debug(f"Sticky provider found: {sticky_provider} for preset {preset_slug}")
            except Exception as sp_err:
                logger.debug(f"Sticky provider read failed: {sp_err}")

        # LAYER: Intelligent routing — complexity analysis → model selection
        if layer_routing:
            recommended_model, complexity_analysis_result = await get_intelligent_model_recommendation_with_analysis(
                request.messages, user_config, current_user,
                provider_prefs=request.provider,
                sticky_provider=sticky_provider,
            )

            # Map complexity tier → appropriate model from user's selected_models
            # The ranker may overwrite the classifier's tier, so extract from
            # the raw reasoning string or complexity_score as authoritative source.
            complexity_score = complexity_analysis_result.get("complexity_score", 0)
            reasoning = complexity_analysis_result.get("reasoning", "").lower()

            # Primary: parse tier from the classifier's reasoning text
            if "complex" in reasoning and "simple" not in reasoning.split("complex")[0][-10:]:
                tier_name = "complex"
            elif "medium" in reasoning or "moderate" in reasoning:
                tier_name = "medium"
            elif "simple" in reasoning:
                tier_name = "simple"
            # Fallback: use complexity_score (0.0=simple, 0.5=medium, 1.0=complex)
            elif complexity_score >= 0.7:
                tier_name = "complex"
            elif complexity_score >= 0.3:
                tier_name = "medium"
            else:
                tier_name = "simple"

            selected_models = user_config.get("selected_models", [])
            model_params = user_config.get("model_parameters", {})
            tier_model = _map_tier_to_model(tier_name, selected_models, model_params)

            if tier_model and tier_model != recommended_model:
                logger.info(
                    "Tier mapping: %s (tier=%s) → %s (was %s)",
                    tier_name, tier_name, tier_model, recommended_model,
                )
                recommended_model = tier_model
                complexity_analysis_result["tier_mapped"] = True
                complexity_analysis_result["tier_mapped_from"] = tier_name

            complexity_analysis_result["tier"] = tier_name
        else:
            # Routing disabled — use first selected model or request model directly
            selected = user_config.get("selected_models", [])
            recommended_model = selected[0] if selected else (request.model or "gpt-4o-mini")
            complexity_analysis_result = {
                "model_selection_type": "direct",
                "strategy": "layer_routing_disabled",
                "selected_model": recommended_model,
                "reasoning": "Routing layer disabled — using specified model directly",
            }

        # LAYER: Fallback chain — only resolve when layer is enabled
        resolved_fallback_models: Optional[List[str]] = None
        if layer_fallback and request.route == "fallback":
            if request.fallback_models:
                # Priority 1: Explicit per-request override (dedup primary model)
                resolved_fallback_models = [m for m in request.fallback_models if m != recommended_model]
            else:
                # Priority 2: Preset-defined fallback models
                model_params = user_config.get("model_parameters", {})
                preset_fallbacks = model_params.get("fallbackModels", [])
                if preset_fallbacks:
                    resolved_fallback_models = [m for m in preset_fallbacks if m != recommended_model]
                else:
                    # Priority 3: Auto-derive from selected_models, sorted by health score
                    try:
                        from app.middleware.provider_health_monitor import health_monitor
                        candidates = [
                            m for m in user_config.get("selected_models", [])
                            if m != recommended_model
                        ]
                        resolved_fallback_models = sorted(
                            candidates,
                            key=lambda m: health_monitor.get_health_score(_provider_of(m)),
                            reverse=True,
                        )
                    except Exception as fb_err:
                        logger.debug(f"Auto-derive fallback chain failed: {fb_err}")
                        resolved_fallback_models = None
            if resolved_fallback_models:
                logger.debug(f"Fallback chain: {resolved_fallback_models}")

        # Extract prompt and system message from messages
        prompt = request.messages[-1].content if request.messages else ""
        system_message = None
        for msg in request.messages:
            if msg.role == "system":
                system_message = msg.content
                break

        # Inject preset system_prompt if available and user didn't provide one
        preset_system_prompt = user_config.get("model_parameters", {}).get("system_prompt") or user_config.get("system_prompt")
        if not preset_system_prompt:
            # Check api_key_config for system_prompt
            api_key_config = current_user.api_key_config or {}
            preset_system_prompt = api_key_config.get("system_prompt")

        if preset_system_prompt and not system_message:
            system_message = preset_system_prompt
            logger.debug(f"Injected preset system_prompt for user {current_user.id}")

        # Build messages dicts once, preserving cache_control for prompt caching.
        # Mirror the preset-router path: if a preset system_prompt is active and no
        # system role exists yet, insert it so downstream consumers (auto-inject,
        # optimize, logging) all see the real system prompt.
        messages_dicts = [msg.dict(exclude_none=True) for msg in request.messages]
        if preset_system_prompt and not any(m.get("role") == "system" for m in messages_dicts):
            messages_dicts.insert(0, {"role": "system", "content": preset_system_prompt})

        # LAYER: Context Optimize — apply optimization + truncation
        # Activated by: layer setting ("safe"/"aggressive") OR per-request transforms
        # Safe:       5 lossless transforms (whitespace, dedup, JSON minify, trim)
        # Aggressive: Safe + semantic deduplication via sentence embeddings
        transforms_applied = False
        optimize_result = None
        optimize_mode = layer_optimize
        # Per-request transforms override layer setting
        if request.transforms and "middle-out" in request.transforms:
            optimize_mode = "safe"  # middle-out = safe mode
        if optimize_mode in ("safe", "aggressive"):
            from app.services.context_optimizer import optimize_messages
            original_tokens = sum(len(m.get("content", "")) // 4 for m in messages_dicts)
            optimize_result = optimize_messages(messages_dicts, mode=optimize_mode)
            messages_dicts = optimize_result.messages
            if optimize_result.tokens_saved > 0:
                transforms_applied = True
                logger.info(
                    "context optimize (%s): %d → %d tokens (-%d, %.1f%% saved) | transforms: %s",
                    optimize_mode,
                    optimize_result.original_tokens,
                    optimize_result.optimized_tokens,
                    optimize_result.tokens_saved,
                    (optimize_result.tokens_saved / max(optimize_result.original_tokens, 1)) * 100,
                    ", ".join(optimize_result.optimizations_applied),
                )

        # Auto-inject cache_control for repeat system prompts on Anthropic/Bedrock.
        # Runs AFTER optimize so the content string we hash and mark matches exactly
        # what the provider sees. Guards inside the helper ensure we only mark when
        # a cache hit is likely (repeat + sticky match + min-token threshold).
        try:
            if _maybe_inject_cache_control(
                messages_dicts,
                recommended_model,
                str(current_user.id),
                preset_slug,
                sticky_provider,
            ):
                logger.debug(
                    "Auto-injected cache_control for user=%s preset=%s model=%s",
                    current_user.id, preset_slug, recommended_model,
                )
        except Exception as ci_err:
            logger.debug("cache_control auto-inject skipped: %s", ci_err)

        # Determine routing strategy
        sort_strategy = user_config.get("sort_strategy", "smart-routing")
        use_preset_router = (
            sort_strategy == "load-balancing"
            or (request.model and request.model.startswith("@preset/"))
        )

        if use_preset_router:
            # Use PresetRouterService for load-balancing and @preset/ requests
            preset_service = PresetRouterService(current_user)

            # Inject system_prompt if we have one and it's not already in messages
            if preset_system_prompt and not any(m.get("role") == "system" for m in messages_dicts):
                messages_dicts.insert(0, {"role": "system", "content": preset_system_prompt})

            response = await preset_service.completion(
                messages=messages_dicts,
                model=request.model or f"@preset/{user_config.get('slug', 'default')}",
                temperature=request.temperature or 0.7,
                max_tokens=request.max_tokens,
                stream=request.stream or False,
                request_id=request_id
            )

            # Normalize response format to match SupabaseUnifiedLLMService output
            if "error" in response and not response.get("response"):
                raise HTTPException(status_code=500, detail=response["error"])

            # Map PresetRouterService response to expected format
            if "choices" in response:
                # Already in OpenAI format from EnhancedLiteLLMRouter
                response_content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
                response = {
                    "response": response_content,
                    "model_used": response.get("model", recommended_model),
                    "provider": response.get("provider", "unknown"),
                    "usage": response.get("usage", {}),
                    "cost": response.get("cost", {}),
                    "fallback_info": response.get("fallback_info", {}),
                    "timestamp": response.get("timestamp", time.time()),
                    "latency_ms": response.get("latency_ms", 0)
                }
            elif not response.get("response"):
                response.setdefault("response", response.get("content", ""))
                response.setdefault("model_used", recommended_model)
                response.setdefault("provider", "unknown")
                response.setdefault("usage", {})
                response.setdefault("cost", {})
                response.setdefault("fallback_info", {})
        else:
            # Standard flow: use SupabaseUnifiedLLMService
            from app.services.supabase_unified_llm_service import SupabaseUnifiedLLMService
            llm_service = SupabaseUnifiedLLMService(current_user)

            # Build extra_kwargs from optional params (fixes bug: these were parsed but never forwarded)
            extra_kwargs: Dict[str, Any] = {}
            if request.top_p is not None:
                extra_kwargs["top_p"] = request.top_p
            if request.frequency_penalty is not None:
                extra_kwargs["frequency_penalty"] = request.frequency_penalty
            if request.presence_penalty is not None:
                extra_kwargs["presence_penalty"] = request.presence_penalty
            if request.response_format is not None:
                extra_kwargs["response_format"] = request.response_format
            if request.reasoning is not None:
                extra_kwargs["reasoning"] = request.reasoning.dict(exclude_none=True)

            # KEY MODE: inject per-user API keys
            if current_user.key_mode == "byok" and current_user.provider_api_keys:
                # Resolve which provider key to use based on the model
                from app.complexity.model_registry import extract_provider as _prov
                model_provider = _prov(recommended_model).lower()
                # Map provider names to key names in provider_keys table
                provider_key_map = {
                    "openai": "openai",
                    "anthropic": "anthropic",
                    "google": "google",
                    "aws": "aws",
                    "bedrock": "aws",
                    "xai": "xai",
                    "together_ai": "together_ai",
                    "mistral": "mistral",
                    "cohere": "cohere",
                    "openrouter": "openrouter",
                    "groq": "groq",
                }
                key_name = provider_key_map.get(model_provider, model_provider)
                user_key = current_user.provider_api_keys.get(key_name)
                if user_key:
                    extra_kwargs["api_key"] = user_key
                    logger.debug("BYOK: using user's %s key for model %s", key_name, recommended_model)
            elif current_user.key_mode == "hosted":
                # Hosted mode: use Nadir's provider keys from server env.
                # Only remap to Bedrock if AWS keys are configured AND the direct
                # provider key (e.g., ANTHROPIC_API_KEY) is NOT set. This allows
                # operators to use either direct API keys or Bedrock depending on
                # what's configured in the server environment.
                from app.complexity.model_registry import extract_provider as _get_provider
                model_provider = _get_provider(recommended_model) or ""
                has_direct_key = (
                    (model_provider in ("anthropic",) and settings.ANTHROPIC_API_KEY)
                    or (model_provider in ("openai",) and settings.OPENAI_API_KEY)
                    or (model_provider in ("google", "gemini") and settings.GOOGLE_API_KEY)
                )
                use_bedrock = settings.AWS_ACCESS_KEY_ID and not has_direct_key
                logger.info("Hosted mode check: model=%s provider=%s has_direct_key=%s use_bedrock=%s aws_key=%s",
                            recommended_model, model_provider, has_direct_key, use_bedrock, bool(settings.AWS_ACCESS_KEY_ID))

                if use_bedrock and not recommended_model.startswith("bedrock/"):
                    bedrock_map = {
                        "claude-opus-4-6": "bedrock/us.anthropic.claude-opus-4-6-v1",
                        "claude-sonnet-4-6": "bedrock/us.anthropic.claude-sonnet-4-6",
                        "claude-haiku-4-5": "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0",
                        "claude-opus-4-5": "bedrock/us.anthropic.claude-opus-4-5-20251101-v1:0",
                        "claude-sonnet-4-5": "bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                        "claude-3-5-haiku-20241022": "bedrock/us.anthropic.claude-3-5-haiku-20241022-v1:0",
                    }
                    bedrock_model = bedrock_map.get(recommended_model)
                    if bedrock_model:
                        logger.info("Hosted mode (Bedrock): remapping %s → %s", recommended_model, bedrock_model)
                        recommended_model = bedrock_model
                else:
                    logger.debug("Hosted mode (direct): using server env key for %s", recommended_model)

            response = await llm_service.process_prompt(
                prompt=prompt,
                system_message=system_message,
                model=recommended_model,
                temperature=request.temperature or 0.7,
                max_tokens=request.max_tokens,
                messages=messages_dicts,
                fallback_models=resolved_fallback_models if layer_fallback else None,
                **extra_kwargs
            )

        # P0 #4: Store sticky provider after any successful standard-routing call so
        # the next request can use it for cache-aware routing and auto-injection.
        if preset_slug and not use_preset_router:
            try:
                actual_provider = response.get("provider", "")
                if actual_provider and actual_provider != "unknown":
                    sticky_provider_cache.set(str(current_user.id), preset_slug, actual_provider)
            except Exception as e:
                logger.debug("Failed to store sticky provider: %s", e)

        # Calculate response time
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Extract response text and apply response healing if needed
        response_text = response.get("response", "")
        healed = False
        heal_details = None
        if request.response_format and not request.stream:
            fmt = (request.response_format.get("type", "") if isinstance(request.response_format, dict) else "")
            if fmt in ("json_object", "json_schema") and settings.ENABLE_RESPONSE_HEALING:
                from app.middleware.response_healer import heal_json_response
                response_text, healed, heal_details = heal_json_response(response_text)
                if healed:
                    response["response"] = response_text

        # Extract comprehensive cost and usage information
        usage_info = response.get("usage", {})
        cost_info = response.get("cost", {})
        
        # Determine if fallback was used
        fallback_info = response.get("fallback_info", {})
        is_fallback = fallback_info.get("fallback_used", False)
        
        # Determine routing strategy
        routing_strategy = complexity_analysis_result.get("strategy", "smart-routing")
        if routing_strategy == "load-balancing":
            routing_strategy = f"load-balancing ({user_config.get('load_balancing_policy', 'round-robin')})"
        
        # Create benchmark comparison if available
        benchmark_comparison = None
        benchmark_model = user_config.get("benchmark_model") or current_user.benchmark_model
        if benchmark_model and response.get("model_used") != benchmark_model and routing_strategy.startswith("smart-routing"):
            # Calculate actual benchmark cost using the same service as background savings
            benchmark_cost_usd = 0.0
            try:
                from app.services.cost_calculation_service import cost_service
                prompt_tokens = usage_info.get("prompt_tokens", cost_info.get("prompt_tokens", 0))
                completion_tokens = usage_info.get("completion_tokens", cost_info.get("completion_tokens", 0))
                benchmark_breakdown = cost_service.calculate_comprehensive_cost(
                    model=benchmark_model,
                    tokens_in=prompt_tokens,
                    tokens_out=completion_tokens,
                )
                benchmark_cost_usd = benchmark_breakdown.total_cost
            except Exception as bc_err:
                logger.debug("Benchmark cost calculation failed: %s", bc_err)

            routed_cost_usd = cost_info.get("total_cost_usd", 0.0)
            benchmark_comparison = {
                "benchmark_model": benchmark_model,
                "selected_model": response.get("model_used"),
                "benchmark_cost_usd": round(benchmark_cost_usd, 6),
                "routed_cost_usd": round(routed_cost_usd, 6),
                "savings_usd": round(max(benchmark_cost_usd - routed_cost_usd, 0), 6),
                "cost_difference": "Model selected based on complexity analysis vs benchmark",
                "performance_trade_off": complexity_analysis_result.get("reasoning", "Optimized for task complexity"),
                "is_benchmark_used": False
            }
        elif benchmark_model and response.get("model_used") == benchmark_model:
            routed_cost_usd = cost_info.get("total_cost_usd", 0.0)
            benchmark_comparison = {
                "benchmark_model": benchmark_model,
                "selected_model": response.get("model_used"),
                "benchmark_cost_usd": round(routed_cost_usd, 6),
                "routed_cost_usd": round(routed_cost_usd, 6),
                "savings_usd": 0.0,
                "cost_difference": "Using benchmark model",
                "performance_trade_off": "Using user's preferred benchmark model",
                "is_benchmark_used": True
            }
        
        # Check for zero completion
        is_zero_completion = response.get("zero_completion", False)

        # Build usage dict with optional reasoning tokens
        usage_dict = {
            "prompt_tokens": usage_info.get("prompt_tokens", cost_info.get("prompt_tokens", 0)),
            "completion_tokens": usage_info.get("completion_tokens", cost_info.get("completion_tokens", 0)),
            "total_tokens": usage_info.get("total_tokens",
                (usage_info.get("prompt_tokens", cost_info.get("prompt_tokens", 0)) +
                 usage_info.get("completion_tokens", cost_info.get("completion_tokens", 0))))
        }
        # Include reasoning tokens if present
        if usage_info.get("reasoning_tokens"):
            usage_dict["reasoning_tokens"] = usage_info["reasoning_tokens"]
        # Include cache metrics if present
        if usage_info.get("cache_read_input_tokens"):
            usage_dict["cache_read_input_tokens"] = usage_info["cache_read_input_tokens"]
            usage_dict["cache_creation_input_tokens"] = usage_info.get("cache_creation_input_tokens", 0)

        # Build cost section — override for zero completion insurance
        if is_zero_completion:
            cost_section = {
                "total_cost_usd": 0.0,
                "zero_completion_insurance": True,
                "litellm_tracked": True,
                "cost_calculation_method": "litellm_callback"
            }
        else:
            cost_section = {
                **cost_info,
                "litellm_tracked": True,
                "cost_calculation_method": "litellm_callback"
            }

        # Build optional metadata additions
        optional_metadata: Dict[str, Any] = {}
        if healed:
            optional_metadata["response_healed"] = True
            if heal_details:
                optional_metadata["heal_details"] = heal_details
        if is_zero_completion:
            optional_metadata["zero_completion"] = True
        # Prompt caching info
        if usage_info.get("cache_read_input_tokens") or usage_info.get("cache_creation_input_tokens"):
            optional_metadata["prompt_caching"] = {
                "cached_tokens": usage_info.get("cache_read_input_tokens", 0),
                "cache_creation_tokens": usage_info.get("cache_creation_input_tokens", 0),
            }
        # Provider health score
        try:
            from app.middleware.provider_health_monitor import health_monitor
            provider_name = response.get("provider", "unknown")
            optional_metadata["provider_health"] = health_monitor.get_health_score(provider_name)
        except Exception as e:
            logger.debug("Failed to fetch provider health score: %s", e)

        # P0 feature metadata
        if request.provider:
            optional_metadata["provider_preferences_applied"] = request.provider.dict(exclude_none=True)
        if request.route == "fallback" and resolved_fallback_models:
            optional_metadata["fallback_chain"] = resolved_fallback_models
        if request.transforms:
            optional_metadata["transforms_applied"] = request.transforms
            optional_metadata["transforms_executed"] = transforms_applied
        if optimize_result and optimize_result.tokens_saved > 0:
            optional_metadata["context_optimize"] = {
                "mode": optimize_result.mode,
                "original_tokens": optimize_result.original_tokens,
                "optimized_tokens": optimize_result.optimized_tokens,
                "tokens_saved": optimize_result.tokens_saved,
                "savings_pct": round((optimize_result.tokens_saved / max(optimize_result.original_tokens, 1)) * 100, 1),
                "optimizations": optimize_result.optimizations_applied,
            }
        if sticky_provider:
            optional_metadata["sticky_provider"] = sticky_provider

        # Format response in OpenAI-compatible format
        formatted_response = ProductionCompletionResponse(
            id=request_id,
            object="chat.completion",
            created=int(time.time()),
            model=response.get("model_used", "unknown"),
            choices=[{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }],
            usage=usage_dict,
            nadir_metadata={
                # Request Information
                "request_id": request_id,
                "response_time_ms": response_time_ms,
                "timestamp": response.get("timestamp"),

                # Model Selection & Routing
                "model_override": request.model,
                "recommended_model": response.get("model_used"),
                "routing_strategy": routing_strategy,
                "model_selection_reasoning": complexity_analysis_result.get("reasoning", ""),
                "is_fallback": is_fallback,
                "fallback_info": fallback_info if is_fallback else None,

                # User Configuration
                "preset_config": {
                    "api_key_name": user_config.get("api_key_name"),
                    "api_key_slug": user_config.get("slug"),
                    "selected_models": user_config.get("selected_models", []),
                    "benchmark_model": benchmark_model,
                    "load_balancing_policy": user_config.get("load_balancing_policy"),
                    "use_fallback": user_config.get("use_fallback", True),
                    "sort_strategy": user_config.get("sort_strategy", "smart-routing"),
                },

                # Active feature layers
                "layers": layers,

                # Complexity Analysis (full details)
                "complexity_analysis": complexity_analysis_result,

                # Benchmark Comparison
                "benchmark_comparison": benchmark_comparison,

                # Cost Breakdown (comprehensive from LiteLLM callback)
                "cost": cost_section,

                # Provider Information
                "provider": response.get("provider", "unknown"),
                "model_capabilities": {
                    "supports_tools": bool(request.tools if hasattr(request, 'tools') else False),
                    "supports_streaming": bool(request.stream),
                    "context_length": "determined_by_model"
                },

                # Request Parameters Used
                "request_parameters": {
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                    "top_p": request.top_p,
                    "frequency_penalty": request.frequency_penalty,
                    "presence_penalty": request.presence_penalty,
                    "stream": request.stream,
                    "response_format": request.response_format,
                    "reasoning": request.reasoning.dict(exclude_none=True) if request.reasoning else None,
                    "route": request.route,
                    "transforms": request.transforms,
                },

                # Optional metadata (healing, caching, zero completion)
                **optional_metadata,
            }
        )
        
        logger.info(f"✅ Completed: {request_id} | {response_time_ms}ms | Model: {response.get('model_used', 'unknown')} | Cost: ${cost_info.get('total_cost_usd', 0):.4f}")

        # --- Savings tracking (background) ---
        # Calculate what the user would have paid with their benchmark model
        # and compare against the actual routed cost.
        if benchmark_model and not is_zero_completion:
            try:
                from app.services.cost_calculation_service import cost_service
                from app.services.savings_billing_service import SavingsBillingService

                routed_cost = cost_info.get("total_cost_usd", 0.0)
                prompt_tokens = usage_dict.get("prompt_tokens", 0)
                completion_tokens = usage_dict.get("completion_tokens", 0)

                # Estimate what the same request would have cost on the benchmark model
                benchmark_breakdown = cost_service.calculate_comprehensive_cost(
                    model=benchmark_model,
                    tokens_in=prompt_tokens,
                    tokens_out=completion_tokens,
                )
                benchmark_cost = benchmark_breakdown.total_cost

                if benchmark_cost != routed_cost:
                    savings_svc = SavingsBillingService(supabase_db.client)
                    complexity_tier = str(
                        complexity_analysis_result.get("extracted_metrics", {}).get("tier", "unknown")
                        if isinstance(complexity_analysis_result.get("extracted_metrics"), dict)
                        else complexity_analysis_result.get("strategy", "unknown")
                    )

                    async def _track_savings():
                        try:
                            await savings_svc.track_request_savings(
                                user_id=str(current_user.id),
                                request_id=request_id,
                                benchmark_model=benchmark_model,
                                benchmark_cost=benchmark_cost,
                                routed_model=response.get("model_used", "unknown"),
                                routed_cost=routed_cost,
                                prompt_tokens=prompt_tokens,
                                completion_tokens=completion_tokens,
                                complexity_tier=complexity_tier,
                                # Stamp the request mode so the monthly billing
                                # rollup can apply the Hosted Bedrock markup.
                                key_mode=current_user.key_mode,
                            )
                        except Exception as sav_err:
                            logger.warning("Savings tracking failed for %s: %s", request_id, sav_err)

                    background_tasks.add_task(_track_savings)
            except Exception as sav_setup_err:
                logger.debug("Savings tracking setup skipped: %s", sav_setup_err)

        # Track hosted spend in-memory (fast, non-blocking)
        if current_user.key_mode == "hosted":
            total_cost = cost_section.get("total_cost_usd", 0) or 0
            if total_cost > 0:
                record_hosted_spend(str(current_user.id), float(total_cost))

        return formatted_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing completion request {request_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error processing request {request_id}"
        )

@router.get("/v1/models")
async def list_models(
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """List available models for the authenticated user."""
    try:
        # Get user's allowed models
        allowed_models = current_user.allowed_models or []
        
        # Get model information from the database
        models_info = await supabase_db.get_available_models()
        
        # Filter to user's allowed models
        user_models = []
        for model_info in models_info:
            if model_info.get("model_id") in allowed_models or not allowed_models:
                user_models.append({
                    "id": model_info.get("model_id"),
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": model_info.get("provider", "unknown"),
                    "permission": [],
                    "root": model_info.get("model_id"),
                    "parent": None
                })
        
        return {
            "object": "list",
            "data": user_models
        }
        
    except Exception as e:
        logger.error(f"Error listing models: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve models"
        )

@router.get("/v1/user/presets")
async def list_user_presets(
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """List user's preset configurations from presets table."""
    try:
        from app.auth.supabase_auth import supabase
        
        # Query the presets table based on user_id
        response = supabase.table("presets").select(
            "id, name, description, system_prompt, selected_models, model_parameters, created_at, updated_at"
        ).eq("user_id", current_user.id).execute()
        
        presets = []
        for preset in response.data:
            # Extract slug from model_parameters if it exists
            model_params = preset.get("model_parameters", {})
            slug = model_params.get("slug", preset.get("name", "").lower().replace(" ", "-"))
            benchmark_model = model_params.get("benchmarkModel")
            load_balancing_policy = model_params.get("loadBalancingPolicy", "round-robin")
            
            presets.append({
                "id": preset.get("id"),
                "slug": slug,
                "name": preset.get("name", slug),
                "description": preset.get("description") or "User preset configuration",
                "model_identifier": f"@preset/{slug}",
                "selected_models": preset.get("selected_models", []),
                "benchmark_model": benchmark_model,
                "load_balancing_policy": load_balancing_policy,
                "system_prompt": preset.get("system_prompt"),
                "model_parameters": model_params,
                "created_at": preset.get("created_at"),
                "updated_at": preset.get("updated_at")
            })
        
        return {
            "object": "list",
            "data": presets,
            "total": len(presets)
        }
        
    except Exception as e:
        logger.error(f"Error listing user presets: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve user presets"
        )

@router.post("/v1/chat/completions/playground")
async def create_completion_playground(
    request: ProductionCompletionRequest,
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """
    Playground version of chat completions that returns analysis without calling LLM.
    
    This endpoint provides detailed complexity analysis and routing decisions
    for testing preset configurations without making actual LLM API calls.
    
    Uses the /v1/public/recommendation endpoint for analysis.
    """
    start_time = time.time()
    request_id = str(uuid.uuid4())
    
    try:
        # Extract messages from request
        messages = [msg.dict() for msg in request.messages]
        
        logger.debug(f"Processing playground completion request {request_id} for user {current_user.id}")
        
        # Extract the user message for analysis
        user_messages = [msg.get("content", "") for msg in messages if msg.get("role") == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="No user messages found")
        
        latest_prompt = user_messages[-1]
        system_message = next((msg.get("content", "") for msg in messages if msg.get("role") == "system"), "")
        
        # Get user configuration from API key
        user_config = await get_user_config_from_api_key(current_user, request.model)
        
        # Get available models from user config
        available_models = user_config.get("selected_models", [])
        if not available_models:
            available_models = current_user.allowed_models or []
        
        if not available_models:
            # Fallback to default models if none configured
            available_models = ["gpt-4o-mini", "claude-3-haiku-20240307"]
        
        # Check if this is a load balancing strategy
        sort_strategy = user_config.get("sort_strategy", "smart-routing")
        
        if sort_strategy == "load-balancing":
            # Return load balancing analysis
            load_balancing_policy = user_config.get("load_balancing_policy", "round-robin")
            
            # Simulate load balancing selection
            if load_balancing_policy == "random":
                import random
                selected_model = random.choice(available_models) if available_models else "gpt-4o-mini"
            else:
                selected_model = available_models[0] if available_models else "gpt-4o-mini"
            
            # Calculate distribution
            model_count = len(available_models)
            base_percentage = 100.0 / model_count if model_count > 0 else 0
            distribution = {}
            for i, model in enumerate(available_models):
                if i == model_count - 1:
                    # Last model gets remaining percentage to ensure 100%
                    remaining = 100.0 - (base_percentage * (model_count - 1))
                    distribution[model] = f"{remaining:.1f}%"
                else:
                    distribution[model] = f"{base_percentage:.1f}%"
            
            # Create fallback chain
            fallback_chain = []
            fallback_models = ["claude-3-haiku-20240307", "gpt-4o-mini", "gemini-1.5-flash"]
            for i, model in enumerate(fallback_models):
                if model not in available_models:
                    fallback_chain.append({
                        "model": model,
                        "priority": i + 1
                    })
            
            response_data = {
                "load_balancing": {
                    "strategy": "load-balancing",
                    "policy": load_balancing_policy,
                    "selected_model": selected_model,
                    "available_models": available_models,
                    "distribution": distribution,
                    "fallback_chain": fallback_chain
                },
                "preset_config": {
                    "name": user_config.get("api_key_name", "Unknown"),
                    "slug": user_config.get("slug"),
                    "sort": sort_strategy,
                    "loadBalancingPolicy": load_balancing_policy,
                    "selected_models": available_models,
                    "use_fallback": user_config.get("use_fallback", True)
                },
                "request_info": {
                    "request_id": request_id,
                    "user_id": str(current_user.id),
                    "processing_time_ms": int((time.time() - start_time) * 1000),
                    "mode": "playground"
                }
            }
            
        else:
            # Smart routing - call the /v1/public/recommendation endpoint
            import httpx
            
            # Prepare request for recommendation endpoint
            recommendation_request = {
                "prompt": latest_prompt,
                "system_message": system_message,
                "providers": current_user.allowed_providers or [],
                "models": available_models,
                "benchmark_model": user_config.get("benchmark_model") or current_user.benchmark_model,
                "max_models": 5
            }
            
            try:
                # Make internal request to recommendation endpoint
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        "http://127.0.0.1:8000/v1/public/recommendation",
                        json=recommendation_request,
                        timeout=30.0
                    )
                    
                if response.status_code == 200:
                    recommendation_result = response.json()
                    
                    if recommendation_result.get("success"):
                        recommendations = recommendation_result.get("recommendations", [])
                        if recommendations:
                            recommended_model = recommendations[0].get("model", "gpt-4o-mini")
                            complexity_score = recommendations[0].get("confidence", 0.5)
                            
                            # Create detailed response similar to original playground
                            benchmark_model = user_config.get("benchmark_model") or current_user.benchmark_model
                            benchmark_comparison = None
                            if benchmark_model:
                                benchmark_comparison = recommendation_result.get("benchmark_comparison", {
                                    "benchmark_model": benchmark_model,
                                    "cost_difference": "Calculating...",
                                    "performance_trade_off": "Analyzing trade-offs based on complexity requirements"
                                })
                            
                            response_data = {
                                "recommendation": {
                                    "selected_model": recommended_model,
                                    "strategy": "smart-routing",
                                    "reasoning": recommendations[0].get("reasoning", "Model selected based on complexity analysis"),
                                    "complexity_score": complexity_score,
                                    "available_models": available_models,
                                    "cost_estimate": recommendations[0].get("cost_estimate", 0.003),
                                    "benchmark_comparison": benchmark_comparison
                                },
                                "complexity_analysis": {
                                    "analyzer_used": "gemini-2.0-flash",
                                    "raw_response": recommendation_result.get("complexity_reasoning", "Analysis completed"),
                                    "task_complexity": recommendation_result.get("task_complexity", 3),
                                    "extracted_metrics": {
                                        "complexity_score": complexity_score,
                                        "reasoning_depth": "moderate",
                                        "tier": recommendations[0].get("tier", 2),
                                        "confidence": complexity_score,
                                        "selection_method": "gemini_analysis",
                                        "model_type": "llm_analysis"
                                    },
                                    "model_requirements": {
                                        "minimum_capability": "intermediate" if complexity_score > 0.5 else "basic",
                                        "recommended_context_length": "32k" if complexity_score > 0.7 else "4k",
                                        "reasoning_type": "analytical_with_context"
                                    }
                                },
                                "model_selection_process": {
                                    "step_1": "Analyzed prompt complexity using Gemini via recommendation service",
                                    "step_2": f"Filtered models by user's allowed list from preset ({len(available_models)} models)",
                                    "step_3": "Matched complexity requirements to model capabilities",
                                    "step_4": "Applied cost optimization vs benchmark model" if benchmark_model else "No benchmark model set",
                                    "step_5": f"Selected optimal model: {recommended_model}",
                                    "alternatives_considered": [
                                        {
                                            "model": rec.get("model"),
                                            "reason_excluded": f"Lower confidence ({rec.get('confidence', 0):.2f})"
                                        } for rec in recommendations[1:]
                                    ]
                                },
                                "preset_config": {
                                    "name": user_config.get("api_key_name", "Unknown"),
                                    "slug": user_config.get("slug"),
                                    "sort": sort_strategy,
                                    "benchmark_model": benchmark_model,
                                    "selected_models": available_models,
                                    "fallback_enabled": user_config.get("use_fallback", True)
                                },
                                "request_info": {
                                    "request_id": request_id,
                                    "user_id": str(current_user.id),
                                    "processing_time_ms": int((time.time() - start_time) * 1000),
                                    "mode": "playground"
                                }
                            }
                        else:
                            raise HTTPException(status_code=500, detail="No recommendations returned")
                    else:
                        raise HTTPException(status_code=500, detail=f"Recommendation failed: {recommendation_result.get('error', 'Unknown error')}")
                else:
                    raise HTTPException(status_code=500, detail=f"Recommendation service error: {response.status_code}")
                    
            except httpx.RequestError as e:
                logger.error(f"Failed to call recommendation service: {e}")
                raise HTTPException(status_code=500, detail="Failed to call recommendation service")
        
        logger.debug(f"Playground completion analysis completed for user {current_user.id}")
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in playground completion: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error in playground analysis"
        )