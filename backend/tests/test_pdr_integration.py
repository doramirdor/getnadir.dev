"""Integration tests for the PDR opt-in branch in `_route_messages_model`.

These tests stub the production_completion helpers
(`get_user_config_from_api_key`, `get_intelligent_model_recommendation_with_analysis`,
`_map_tier_to_model`) inside the function-local import, so the PDR branch
runs without touching Supabase or the complexity analyzers.
"""
from __future__ import annotations

import sys
import types
from typing import Any, Dict, List, Optional, Tuple

import pytest

from app.api import anthropic_messages as am_mod


class _FakeUser:
    id = "user-123"


def _install_production_completion_stub(
    monkeypatch: pytest.MonkeyPatch,
    *,
    user_config: Dict[str, Any],
    recommend_calls: List[Tuple[Any, ...]],
) -> None:
    """Patch the `app.api.production_completion` module so the function-local
    import inside `_route_messages_model` resolves to our stubs.

    We track calls into `get_intelligent_model_recommendation_with_analysis`
    via the passed `recommend_calls` list. Tests assert the list is empty
    (PDR took the branch) or populated (PDR was skipped).
    """
    fake_mod = types.ModuleType("app.api.production_completion")

    class ChatMessage:
        def __init__(self, role: str, content: str):
            self.role = role
            self.content = content

    async def get_user_config_from_api_key(current_user, model_override=None):
        return dict(user_config)

    async def get_intelligent_model_recommendation_with_analysis(
        adapted, cfg, user
    ):
        recommend_calls.append((adapted, cfg, user))
        return "claude-sonnet-4-6", {"strategy": "smart_route"}

    def _map_tier_to_model(
        tier_name: str,
        selected_models: List[str],
        model_parameters: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        # Trivial tier mapping for the test: pick by tier name from a known
        # mapping over the supplied selected_models.
        defaults = {
            "simple": "claude-haiku-4-5",
            "medium": "claude-sonnet-4-6",
            "complex": "claude-opus-4-6",
        }
        chosen = defaults.get(tier_name)
        if chosen and selected_models and chosen in selected_models:
            return chosen
        return chosen

    fake_mod.ChatMessage = ChatMessage
    fake_mod.get_user_config_from_api_key = get_user_config_from_api_key
    fake_mod.get_intelligent_model_recommendation_with_analysis = (
        get_intelligent_model_recommendation_with_analysis
    )
    fake_mod._map_tier_to_model = _map_tier_to_model

    monkeypatch.setitem(sys.modules, "app.api.production_completion", fake_mod)


@pytest.mark.asyncio
async def test_pdr_enabled_planning_prompt_short_circuits(monkeypatch):
    """`pdr.enabled=true` + planning prompt -> analysis.strategy='pdr_mode_a'."""
    recommend_calls: List[Tuple[Any, ...]] = []
    _install_production_completion_stub(
        monkeypatch,
        user_config={
            "selected_models": [
                "claude-haiku-4-5",
                "claude-sonnet-4-6",
                "claude-opus-4-6",
            ],
            "model_parameters": {
                "pdr": {
                    "enabled": True,
                    "confidence_threshold": 0.55,
                    # v0 default: heuristic-fallback labels are still
                    # honoured. Set explicitly for documentation.
                    "use_heuristic_fallback": True,
                },
            },
        },
        recommend_calls=recommend_calls,
    )

    body = {
        "messages": [
            {"role": "user", "content": "Let's plan the new auth module."},
        ],
    }

    result = await am_mod._route_messages_model(body, _FakeUser(), "claude-sonnet-4-6")

    analysis = result["analysis"]
    assert analysis["strategy"] == "pdr_mode_a"
    assert analysis["sub_task"] == "plan"
    assert analysis["pdr_tier"] == "complex"
    # PLAN -> complex -> opus from the stubbed tier map.
    assert result["model"] == "claude-opus-4-6"
    assert result["provider"] == "claude"
    # Existing recommendation path must not run.
    assert recommend_calls == []


@pytest.mark.asyncio
async def test_pdr_disabled_uses_existing_recommendation(monkeypatch):
    """`pdr.enabled=false` -> existing pipeline runs, strategy is smart_route."""
    recommend_calls: List[Tuple[Any, ...]] = []
    _install_production_completion_stub(
        monkeypatch,
        user_config={
            "selected_models": [
                "claude-haiku-4-5",
                "claude-sonnet-4-6",
                "claude-opus-4-6",
            ],
            "model_parameters": {
                # No `pdr` block at all is the realistic default; we
                # set enabled=False explicitly so the assertion is precise.
                "pdr": {"enabled": False},
            },
        },
        recommend_calls=recommend_calls,
    )

    body = {
        "messages": [
            {"role": "user", "content": "Let's plan the new auth module."},
        ],
    }

    result = await am_mod._route_messages_model(body, _FakeUser(), "claude-sonnet-4-6")

    assert result["analysis"]["strategy"] == "smart_route"
    # Existing recommendation path must run exactly once.
    assert len(recommend_calls) == 1
    # Model is the stubbed recommendation result.
    assert result["model"] == "claude-sonnet-4-6"
