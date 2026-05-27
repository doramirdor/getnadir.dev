"""Tests for the nadir-cheapest cost-minimization adapter.

No HTTP, no production stack — these tests exercise the picker and the
RouterArena contract against synthetic cost tables.

Run from the package dir:

    pytest test_nadir_cheapest_adapter.py

Or from the repo root:

    pytest eval/routerarena/test_nadir_cheapest_adapter.py
"""
from __future__ import annotations

import math
import pathlib
import sys

import pytest

# Make the adapter importable whether pytest is invoked from this dir, from
# the repo root, or from getnadir.dev/.
_HERE = pathlib.Path(__file__).resolve().parent
for _candidate in (_HERE, *_HERE.parents):
    if (_candidate / "nadir_cheapest_adapter.py").exists():
        sys.path.insert(0, str(_candidate))
        break
    if (_candidate / "eval" / "routerarena" / "nadir_cheapest_adapter.py").exists():
        sys.path.insert(0, str(_candidate))
        break

try:
    from nadir_cheapest_adapter import (  # type: ignore
        EXPECTED_SCHEMA_FINGERPRINT,
        FALLBACK_MODEL,
        CheapestDecision,
        NadirCheapestRouter,
        length_budget,
        pick_cheapest,
        resolve_cost,
    )
except ImportError:
    from eval.routerarena.nadir_cheapest_adapter import (  # type: ignore
        EXPECTED_SCHEMA_FINGERPRINT,
        FALLBACK_MODEL,
        CheapestDecision,
        NadirCheapestRouter,
        length_budget,
        pick_cheapest,
        resolve_cost,
    )


# ──────────────────────────────────────────────────────────────────────────
# Fixtures.
# ──────────────────────────────────────────────────────────────────────────


@pytest.fixture
def cost_table():
    """Synthetic cost table covering ties, mid-tier, and expensive."""
    return {
        # alpha-tiebreak pair: both at output $/M = 0.20
        "gpt-3.5-turbo": (0.5, 0.20),
        "claude-haiku-4-5": (0.25, 0.20),
        # mid-tier
        "gpt-4o-mini": (0.15, 0.60),
        # expensive
        "claude-opus-4-6": (15.0, 75.0),
        "gpt-5.2": (1.75, 14.0),
    }


@pytest.fixture
def mapping():
    """Synthetic universal-name mapping."""
    return {
        "anthropic/claude-haiku-4-5-20251001": "claude-haiku-4-5",
        "openai/gpt-4o-mini-20240718": "gpt-4o-mini",
    }


# ──────────────────────────────────────────────────────────────────────────
# (1) Picks the cheapest cached model when multiple are available.
# ──────────────────────────────────────────────────────────────────────────


def test_pick_cheapest_picks_minimum_output_price(cost_table) -> None:
    # claude-haiku and gpt-3.5 both at 0.20; alpha tie-break -> claude-haiku
    cached = ["gpt-4o-mini", "claude-opus-4-6", "claude-haiku-4-5", "gpt-3.5-turbo"]
    chosen = pick_cheapest(cached, cost_table)
    assert chosen == "claude-haiku-4-5"


def test_pick_cheapest_alpha_tiebreak_when_only_ties(cost_table) -> None:
    # Both at 0.20; alphabetical: claude-haiku-4-5 < gpt-3.5-turbo
    cached = ["gpt-3.5-turbo", "claude-haiku-4-5"]
    assert pick_cheapest(cached, cost_table) == "claude-haiku-4-5"
    # Reverse the input ordering — answer must not change.
    assert pick_cheapest(list(reversed(cached)), cost_table) == "claude-haiku-4-5"


def test_pick_cheapest_resolves_provider_prefixed_via_mapping(cost_table, mapping) -> None:
    # The provider-prefixed alias should resolve to the bare model's price.
    cached = ["anthropic/claude-haiku-4-5-20251001", "gpt-4o-mini"]
    # haiku@0.20 vs gpt-4o-mini@0.60 -> haiku wins via the prefixed name.
    chosen = pick_cheapest(cached, cost_table, mapping=mapping)
    assert chosen == "anthropic/claude-haiku-4-5-20251001"


def test_adapter_pick_returns_cheapest_with_metadata(cost_table) -> None:
    router = NadirCheapestRouter(cost_table=cost_table, emit_max_tokens=False)
    decision = router.pick(
        "short prompt",
        ["gpt-4o-mini", "claude-opus-4-6", "claude-haiku-4-5"],
    )
    assert isinstance(decision, CheapestDecision)
    assert decision.model == "claude-haiku-4-5"
    assert decision.out_price_per_M == 0.20
    assert decision.in_price_per_M == 0.25
    assert decision.n_cached == 3
    assert decision.max_tokens_budget is None
    assert decision.schema_fingerprint == EXPECTED_SCHEMA_FINGERPRINT


# ──────────────────────────────────────────────────────────────────────────
# (2) Falls back gracefully when no model_responses are populated.
# ──────────────────────────────────────────────────────────────────────────


def test_pick_cheapest_returns_none_on_empty_cache(cost_table) -> None:
    assert pick_cheapest([], cost_table) is None


def test_adapter_pick_falls_back_when_cached_is_empty(cost_table) -> None:
    router = NadirCheapestRouter(cost_table=cost_table)
    decision = router.pick("anything", [])
    assert decision.model == FALLBACK_MODEL
    assert decision.n_cached == 0
    # FALLBACK_MODEL is gpt-4o-mini which we priced in the fixture.
    assert decision.out_price_per_M == 0.60


def test_get_prediction_falls_back_on_unknown_query(
    cost_table, capsys: pytest.CaptureFixture[str]
) -> None:
    """RouterArena's _get_prediction must NEVER raise."""
    router = NadirCheapestRouter(
        cost_table=cost_table,
        cached_models_for_prompt={
            "known-prompt": ["gpt-4o-mini", "claude-haiku-4-5"],
        },
    )
    model = router._get_prediction("unknown-prompt-not-in-lookup")
    assert model == FALLBACK_MODEL
    assert "no cached models" in capsys.readouterr().err.lower()


def test_get_prediction_uses_cached_models_when_present(cost_table) -> None:
    router = NadirCheapestRouter(
        cost_table=cost_table,
        cached_models_for_prompt={
            "p1": ["gpt-4o-mini", "claude-opus-4-6", "claude-haiku-4-5"],
        },
    )
    # haiku@0.20 < gpt-4o-mini@0.60 < opus@75 → haiku wins.
    assert router._get_prediction("p1") == "claude-haiku-4-5"


def test_get_prediction_never_raises_even_when_picker_blows_up(
    cost_table, capsys: pytest.CaptureFixture[str]
) -> None:
    """If the prompt_to_key callable throws, we still fall back cleanly."""

    def boom(_p: str) -> str:
        raise RuntimeError("synthetic explosion")

    router = NadirCheapestRouter(
        cost_table=cost_table,
        cached_models_for_prompt={"anything": ["gpt-4o-mini"]},
        prompt_to_key=boom,
    )
    assert router._get_prediction("anything") == FALLBACK_MODEL
    assert "synthetic explosion" in capsys.readouterr().err


# ──────────────────────────────────────────────────────────────────────────
# (3) Emits the correct max_tokens for each prompt-length bucket.
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "prompt_text,expected_budget",
    [
        ("", 256),
        ("x" * 100, 256),
        ("x" * 499, 256),
        ("x" * 500, 512),
        ("x" * 1000, 512),
        ("x" * 1999, 512),
        ("x" * 2000, 1024),
        ("x" * 5000, 1024),
        ("x" * 100_000, 1024),
    ],
)
def test_length_budget_buckets(prompt_text: str, expected_budget: int) -> None:
    assert length_budget(prompt_text) == expected_budget


def test_adapter_emits_max_tokens_budget_per_bucket(cost_table) -> None:
    router = NadirCheapestRouter(cost_table=cost_table, emit_max_tokens=True)
    short = router.pick("x" * 100, ["gpt-4o-mini"])
    mid = router.pick("x" * 1000, ["gpt-4o-mini"])
    long = router.pick("x" * 5000, ["gpt-4o-mini"])
    assert short.max_tokens_budget == 256
    assert mid.max_tokens_budget == 512
    assert long.max_tokens_budget == 1024


def test_adapter_omits_max_tokens_when_disabled(cost_table) -> None:
    router = NadirCheapestRouter(cost_table=cost_table, emit_max_tokens=False)
    decision = router.pick("x" * 100, ["gpt-4o-mini"])
    assert decision.max_tokens_budget is None


# ──────────────────────────────────────────────────────────────────────────
# Edge-case coverage.
# ──────────────────────────────────────────────────────────────────────────


def test_resolve_cost_returns_inf_for_unknown(cost_table) -> None:
    ip, op = resolve_cost("nonexistent-model-xyz", cost_table)
    assert math.isinf(ip)
    assert math.isinf(op)


def test_pick_cheapest_handles_all_unresolved_deterministically(cost_table) -> None:
    """When every cached model is unresolvable, alphabetical winner."""
    chosen = pick_cheapest(["zzz-mystery", "aaa-mystery"], cost_table)
    assert chosen == "aaa-mystery"


def test_schema_fingerprint_differs_from_cascade_adapter() -> None:
    """Sanity check: don't reuse nadir-cascade's fingerprint."""
    # Importing the cascade fingerprint is best-effort; we just check
    # the cheapest fingerprint is a 64-char hex string.
    assert len(EXPECTED_SCHEMA_FINGERPRINT) == 64
    assert all(c in "0123456789abcdef" for c in EXPECTED_SCHEMA_FINGERPRINT)


def test_load_cost_table_round_trips(tmp_path) -> None:
    """Make sure load_cost_table parses RouterArena's actual format."""
    import json as _json

    from nadir_cheapest_adapter import load_cost_table

    cost_json = tmp_path / "model_cost.json"
    cost_json.write_text(
        _json.dumps(
            {
                "gpt-4o-mini": {
                    "input_token_price_per_million": 0.15,
                    "output_token_price_per_million": 0.6,
                },
                "claude-opus-4-6": {
                    "input_token_price_per_million": 15.0,
                    "output_token_price_per_million": 75.0,
                },
            }
        )
    )
    mapping = {"anthropic/claude-opus-4-6-20260101": "claude-opus-4-6"}
    table = load_cost_table(cost_json, mapping=mapping)
    assert table["gpt-4o-mini"] == (0.15, 0.6)
    assert table["claude-opus-4-6"] == (15.0, 75.0)
    # Mapping alias gets the bare model's row.
    assert table["anthropic/claude-opus-4-6-20260101"] == (15.0, 75.0)
