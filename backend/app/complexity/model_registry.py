"""
Centralized model name registry.

Single source of truth for mapping performance-data model names
to LiteLLM API model names and provider mappings.
All consumers should import from here instead of maintaining local copies.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Performance-data name  →  LiteLLM API model name
# ──────────────────────────────────────────────────────────────
PERFORMANCE_TO_API: dict[str, str] = {
    # OpenAI models
    "GPT-4.1": "gpt-4.1",
    "GPT-4.1 mini": "gpt-4.1-mini",
    "GPT-4.1 nano": "gpt-4.1-nano",
    "GPT-4o (March 2025)": "gpt-4o",
    "GPT-4o (Nov '24)": "gpt-4o",
    "GPT-4o (May '24)": "gpt-4o",
    "GPT-4o (Aug '24)": "gpt-4o",
    "GPT-4o mini": "gpt-4o-mini",
    "GPT-4 Turbo": "gpt-4-turbo",
    "GPT-4.5 (Preview)": "gpt-4.5-preview",
    "GPT-3.5-turbo": "gpt-3.5-turbo",
    "GPT-3.5 Turbo": "gpt-3.5-turbo",
    "o3": "o3",
    "o3-mini": "o3-mini",
    "o3-mini (high)": "o3-mini",
    "O3": "o3",
    "O3-mini": "o3-mini",

    # Anthropic models
    "Claude-3.5-Sonnet": "claude-3-5-sonnet-20241022",
    "Claude-3.5 Sonnet": "claude-3-5-sonnet-20241022",
    "Claude-3.5 Sonnet (Oct)": "claude-3-5-sonnet-20241022",
    "Claude 3.5 Sonnet (Oct)": "claude-3-5-sonnet-20241022",
    "Claude-3-Sonnet": "claude-3-sonnet-20240229",
    "Claude-3 Sonnet": "claude-3-sonnet-20240229",
    "Claude 3 Sonnet": "claude-3-sonnet-20240229",
    "Claude-3-Opus": "claude-3-opus-20240229",
    "Claude-3 Opus": "claude-3-opus-20240229",
    "Claude 3 Opus": "claude-3-opus-20240229",
    "Claude-3-Haiku": "claude-3-haiku-20240307",
    "Claude-3 Haiku": "claude-3-haiku-20240307",
    "Claude 3 Haiku": "claude-3-haiku-20240307",
    "Claude-3.5-Haiku": "claude-3-5-haiku-20241022",
    "Claude-3.5 Haiku": "claude-3-5-haiku-20241022",
    "Claude 3.7 Sonnet": "claude-3-7-sonnet-20250219",
    "Claude-3.7 Sonnet": "claude-3-7-sonnet-20250219",
    "Claude-3.7-Sonnet": "claude-3-7-sonnet-20250219",
    "Claude 4 Sonnet": "claude-sonnet-4-20250514",
    "Claude 4 Sonnet Thinking": "claude-sonnet-4-20250514",
    "Claude-4 Sonnet": "claude-sonnet-4-20250514",
    "Claude-4-Sonnet": "claude-sonnet-4-20250514",
    "Claude 4 Opus": "claude-opus-4-20250514",
    "Claude 4 Opus Thinking": "claude-opus-4-20250514",

    # Google models  (gemini/ prefix for LiteLLM → Google AI Studio)
    "Gemini 2.5 Pro": "gemini/gemini-2.5-pro",
    "Gemini-2.5 Pro": "gemini/gemini-2.5-pro",
    "Gemini-2.5-Pro": "gemini/gemini-2.5-pro",
    "Gemini 2.5 Pro (Mar '25)": "gemini/gemini-2.5-pro-preview-03-25",
    "Gemini 2.5 Pro (May' 25)": "gemini/gemini-2.5-pro-preview-05-06",
    "Gemini 2.0 Flash": "gemini/gemini-2.0-flash",
    "Gemini-2.0 Flash": "gemini/gemini-2.0-flash",
    "Gemini-2.0-Flash": "gemini/gemini-2.0-flash",
    "Gemini 2.0 Flash (exp)": "gemini/gemini-2.0-flash-exp",
    "Gemini 2.0 Flash-Lite (Feb '25)": "gemini/gemini-2.0-flash-lite-preview-02-05",
    "Gemini 1.5 Pro": "gemini/gemini-1.5-pro",
    "Gemini-1.5 Pro": "gemini/gemini-1.5-pro",
    "Gemini-1.5-Pro": "gemini/gemini-1.5-pro",
    "Gemini 1.5 Flash": "gemini/gemini-1.5-flash",
    "Gemini-1.5 Flash": "gemini/gemini-1.5-flash",
    "Gemini-1.5-Flash": "gemini/gemini-1.5-flash",
    "Gemini 1.5 Flash (Sep)": "gemini/gemini-1.5-flash-002",
}

# ──────────────────────────────────────────────────────────────
# API provider name → internal provider key
# ──────────────────────────────────────────────────────────────
PROVIDER_MAPPING: dict[str, str] = {
    "OpenAI": "openai",
    "Anthropic": "anthropic",
    "Amazon Bedrock": "anthropic",
    "Google": "google",
    "Google Vertex": "google",
    "Google (Vertex)": "google",
    "Google (AI Studio)": "google",
    "Microsoft Azure": "openai",
    "xAI": "openai",
    "xAI Fast": "openai",
    "Nebius Base": "openai",
    "Fireworks": "openai",
    "Deepinfra (FP8)": "openai",
    "Novita (FP8)": "openai",
    "Together.ai": "openai",
    "Together.ai (FP8)": "openai",
    "kluster.ai (FP8)": "openai",
}

# Reverse mapping: LiteLLM API name → list of performance-data names
_API_TO_PERFORMANCE: dict[str, list[str]] = {}
for _perf, _api in PERFORMANCE_TO_API.items():
    _API_TO_PERFORMANCE.setdefault(_api, []).append(_perf)


# ──────────────────────────────────────────────────────────────
# Helper functions
# ──────────────────────────────────────────────────────────────

def map_performance_to_api(performance_name: str) -> str:
    """Map a performance-data model name to its LiteLLM API name.

    Returns the original name unchanged if no mapping exists.
    """
    return PERFORMANCE_TO_API.get(performance_name, performance_name)


def map_provider(api_provider: str) -> str:
    """Map an API provider name to our internal provider key.

    Falls back to ``api_provider.lower()`` when no explicit mapping exists.
    """
    return PROVIDER_MAPPING.get(api_provider, api_provider.lower())


def extract_provider(model: str) -> str:
    """Infer the internal provider key from a model name string."""
    model_lower = model.lower()
    if "gpt" in model_lower or "openai" in model_lower or model_lower.startswith("o3"):
        return "openai"
    if "claude" in model_lower or "anthropic" in model_lower:
        return "anthropic"
    if "gemini" in model_lower or "google" in model_lower:
        return "google"
    if "llama" in model_lower:
        return "meta"
    return "unknown"


def get_api_to_performance_names(api_name: str) -> list[str]:
    """Return all performance-data names that map to a given API name."""
    return _API_TO_PERFORMANCE.get(api_name, [])
