"""Tests for cache-aware effective cost and auto-injection of cache_control.

Loads only the handful of pure helper functions from ``production_completion.py``
via AST extraction, sidestepping the module's heavy FastAPI/Supabase imports so
tests can run in isolation.
"""

from __future__ import annotations

import ast
import importlib.util
import os
import sys
import types
from typing import Any, Dict, List, Optional

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
PC_PATH = os.path.join(BACKEND, "app", "api", "production_completion.py")
SPC_PATH = os.path.join(BACKEND, "app", "services", "sticky_provider_cache.py")

# Pure helpers (no I/O, no framework dependency) that we want to test.
_HELPER_NAMES = {
    "_CACHE_READ_MULTIPLIER",
    "_CACHE_CONTROL_PROVIDERS",
    "_effective_input_cost",
    "_min_cache_tokens",
    "_approx_token_count",
    "_has_cache_control",
    "_maybe_inject_cache_control",
    "_get_model_input_cost",
    "_apply_provider_preferences",
}


def _load_spc_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("_spc_under_test", SPC_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _fake_provider_of(model: str) -> str:
    """Mirror of extract_provider() in app/complexity/model_registry.py."""
    ml = model.lower()
    if "gpt" in ml or "openai" in ml or ml.startswith("o3"):
        return "openai"
    if "claude" in ml or "anthropic" in ml:
        return "anthropic"
    if "gemini" in ml or "google" in ml:
        return "google"
    return "unknown"


@pytest.fixture
def prod():
    """Extract and return the pure helpers from production_completion.py, bound
    to a fresh sticky cache and a stubbed litellm.model_cost table."""
    spc = _load_spc_module()

    fake_litellm = types.ModuleType("litellm")
    fake_litellm.model_cost = {
        "claude-sonnet-4": {"input_cost_per_token": 3e-6},
        "claude-3-haiku": {"input_cost_per_token": 2.5e-7},
        "gpt-4o": {"input_cost_per_token": 2.5e-6},
        "gemini-1.5-pro": {"input_cost_per_token": 1.25e-6},
    }
    sys.modules["litellm"] = fake_litellm

    ns: Dict[str, Any] = {
        "List": List,
        "Dict": Dict,
        "Any": Any,
        "Optional": Optional,
        "_provider_of": _fake_provider_of,
        "sticky_provider_cache": spc._StickyProviderCache(),
        "logger": types.SimpleNamespace(
            debug=lambda *a, **k: None,
            warning=lambda *a, **k: None,
            info=lambda *a, **k: None,
        ),
    }

    src = open(PC_PATH).read()
    tree = ast.parse(src)
    for node in tree.body:
        name = None
        if isinstance(node, ast.FunctionDef):
            name = node.name
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        if name in _HELPER_NAMES:
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<pc-helpers>", "exec"), ns)

    return types.SimpleNamespace(**ns)


# ---------------------------------------------------------------------------
# _effective_input_cost
# ---------------------------------------------------------------------------


def test_effective_cost_cold_equals_base(prod):
    assert prod._effective_input_cost("claude-sonnet-4", expect_cache_hit=False) == 3e-6


def test_effective_cost_warm_anthropic_discounted(prod):
    # 0.7 hit rate * 0.1 multiplier + 0.3 cold = 0.37 of base
    assert prod._effective_input_cost("claude-sonnet-4", expect_cache_hit=True) == pytest.approx(3e-6 * 0.37)


def test_effective_cost_warm_openai_discounted(prod):
    assert prod._effective_input_cost("gpt-4o", expect_cache_hit=True) == pytest.approx(2.5e-6 * 0.65)


def test_effective_cost_unknown_provider_no_discount(prod):
    cold = prod._effective_input_cost("llama-3-70b", expect_cache_hit=False)
    warm = prod._effective_input_cost("llama-3-70b", expect_cache_hit=True)
    assert cold == warm


def test_effective_cost_zero_base_returns_zero(prod):
    assert prod._effective_input_cost("totally-unknown-model", expect_cache_hit=True) == 0.0


def test_no_bedrock_key_in_multiplier(prod):
    """extract_provider never returns 'bedrock' — that entry would be dead code."""
    assert "bedrock" not in prod._CACHE_READ_MULTIPLIER


def test_cache_control_providers_contains_only_anthropic(prod):
    assert prod._CACHE_CONTROL_PROVIDERS == {"anthropic"}


# ---------------------------------------------------------------------------
# _apply_provider_preferences — price-aware sticky sort
# ---------------------------------------------------------------------------


def test_no_sticky_preserves_order(prod):
    models = ["gpt-4o", "claude-sonnet-4", "claude-3-haiku"]
    assert prod._apply_provider_preferences(models, None, sticky_provider=None) == models


def test_sticky_anthropic_promotes_cheapest_warm_claude(prod):
    # Warm haiku  ≈ 9.25e-8   (cheapest)
    # Warm sonnet ≈ 1.11e-6
    # Cold gpt-4o  = 2.5e-6   (most expensive)
    models = ["gpt-4o", "claude-sonnet-4", "claude-3-haiku"]
    result = prod._apply_provider_preferences(models, None, sticky_provider="anthropic")
    assert result == ["claude-3-haiku", "claude-sonnet-4", "gpt-4o"]


def test_explicit_provider_order_beats_sticky(prod):
    class Prefs:
        order = ["openai"]
        ignore = None
        sort = None
        require_parameters = None

    models = ["gpt-4o", "claude-sonnet-4", "claude-3-haiku"]
    result = prod._apply_provider_preferences(models, Prefs(), sticky_provider="anthropic")
    assert result[0] == "gpt-4o"


def test_sticky_skipped_on_unknown_base_prices(prod):
    # Unknown models have 0.0 effective cost → ties → idx order preserved.
    models = ["unknown-model-a", "unknown-model-b"]
    assert prod._apply_provider_preferences(models, None, sticky_provider="anthropic") == models


# ---------------------------------------------------------------------------
# _maybe_inject_cache_control — guard scenarios
# ---------------------------------------------------------------------------


def _sys_msgs(content: str) -> List[Dict[str, Any]]:
    return [{"role": "system", "content": content}, {"role": "user", "content": "q"}]


LONG = "x" * 5000  # ~1250 tokens — above the 1024-token Sonnet threshold


def test_inject_requires_preset_slug(prod):
    msgs = _sys_msgs(LONG)
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", None, "anthropic") is False


def test_inject_requires_anthropic_provider(prod):
    msgs = _sys_msgs(LONG)
    assert prod._maybe_inject_cache_control(msgs, "gpt-4o", "u", "p", "openai") is False


def test_inject_skips_when_cache_control_already_present(prod):
    msgs = [
        {
            "role": "system",
            "content": [{"type": "text", "text": LONG, "cache_control": {"type": "ephemeral"}}],
        },
        {"role": "user", "content": "q"},
    ]
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", "p", "anthropic") is False


def test_inject_skips_on_short_prompt(prod):
    msgs = _sys_msgs("short")
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", "p", "anthropic") is False


def test_inject_skips_on_first_occurrence(prod):
    msgs = _sys_msgs(LONG)
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", "p", "anthropic") is False


def test_inject_fires_on_repeat_with_sticky_match(prod):
    prod._maybe_inject_cache_control(_sys_msgs(LONG), "claude-sonnet-4", "u", "p", "anthropic")
    msgs = _sys_msgs(LONG)
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", "p", "anthropic") is True
    assert isinstance(msgs[0]["content"], list)
    assert msgs[0]["content"][0]["cache_control"] == {"type": "ephemeral"}


def test_inject_skips_when_sticky_does_not_match(prod):
    prod._maybe_inject_cache_control(_sys_msgs(LONG), "claude-sonnet-4", "u", "p", "anthropic")
    msgs = _sys_msgs(LONG)
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", "p", "openai") is False


def test_inject_respects_haiku_threshold(prod):
    # 1500 tokens (~6000 chars) passes Sonnet's 1024 threshold but not Haiku's 2048.
    medium = "x" * 6000
    prod._maybe_inject_cache_control(_sys_msgs(medium), "claude-sonnet-4", "u", "p", "anthropic")
    msgs = _sys_msgs(medium)
    assert prod._maybe_inject_cache_control(msgs, "claude-3-haiku", "u", "p", "anthropic") is False


def test_inject_preserves_other_messages(prod):
    prod._maybe_inject_cache_control(_sys_msgs(LONG), "claude-sonnet-4", "u", "p", "anthropic")
    msgs = _sys_msgs(LONG)
    assert prod._maybe_inject_cache_control(msgs, "claude-sonnet-4", "u", "p", "anthropic") is True
    assert msgs[1] == {"role": "user", "content": "q"}
