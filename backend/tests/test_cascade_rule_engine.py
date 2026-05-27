"""Unit tests for the cascade rule engine.

Tests exercise:
  - YAML loading + parsing of every condition type and action type
  - Priority ordering of rules
  - `applies_when.tier_predicted_in` gating
  - `set_threshold` stacking (max wins)
  - Hot-reload cache: file change invalidates engine
  - Backward compat: default.yaml loads and matches legacy domains
  - CascadeRouter wiring: engine is opt-out via `force_escalate_patterns`
    or `domain_thresholds` in cfg
"""

from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

import pytest

# Import the engine module directly so tests do not require the FastAPI
# settings + Supabase env validation that app.services.__init__ pulls in.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app" / "services" / "cascade_rules"))

import engine as eng  # type: ignore  # noqa: E402


@pytest.fixture(autouse=True)
def clear_cache():
    eng._clear_profile_cache()
    yield
    eng._clear_profile_cache()


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def test_substring_condition_matches():
    e = eng.load_inline([{
        "name": "r1", "priority": 1,
        "match": {"any_of": [{"substring": "foo"}]},
        "action": {"type": "force_escalate", "to_tier": "complex"},
    }])
    d = e.evaluate("this contains FOO somewhere", predicted_tier="simple")
    assert d.action == "force_escalate"
    assert d.to_tier == "complex"
    assert "r1" in d.matched_rules


def test_regex_condition_matches():
    e = eng.load_inline([{
        "name": "r1", "priority": 1,
        "match": {"any_of": [{"regex": r"\bstep\s+\d+:"}]},
        "action": {"type": "force_escalate", "to_tier": "complex"},
    }])
    assert e.evaluate("step 1: do X", predicted_tier="simple").action == "force_escalate"
    assert e.evaluate("steps are nice", predicted_tier="simple").action == "none"


def test_prompt_length_conditions():
    e = eng.load_inline([{
        "name": "long_prompt", "priority": 1,
        "match": {"any_of": [{"prompt_length_min": 100}]},
        "action": {"type": "force_escalate", "to_tier": "complex"},
    }])
    assert e.evaluate("x" * 50).action == "none"
    assert e.evaluate("x" * 150).action == "force_escalate"


def test_confidence_conditions():
    e = eng.load_inline([{
        "name": "low_conf", "priority": 1,
        "match": {"any_of": [{"classifier_confidence_max": 0.5}]},
        "action": {"type": "force_escalate", "to_tier": "medium"},
    }])
    assert e.evaluate("anything", classifier_confidence=0.4).action == "force_escalate"
    assert e.evaluate("anything", classifier_confidence=0.9).action == "none"
    # Missing confidence => rule does not fire.
    assert e.evaluate("anything", classifier_confidence=None).action == "none"


def test_applies_when_tier_gate():
    e = eng.load_inline([{
        "name": "g", "priority": 1,
        "match": {"any_of": [{"substring": "foo"}]},
        "applies_when": {"tier_predicted_in": ["simple"]},
        "action": {"type": "force_escalate", "to_tier": "medium"},
    }])
    assert e.evaluate("foo", predicted_tier="simple").action == "force_escalate"
    assert e.evaluate("foo", predicted_tier="medium").action == "none"
    assert e.evaluate("foo", predicted_tier=None).action == "none"


# ---------------------------------------------------------------------------
# Priority + stacking
# ---------------------------------------------------------------------------


def test_higher_priority_wins_on_force_escalate():
    e = eng.load_inline([
        {"name": "low", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "force_escalate", "to_tier": "medium"}},
        {"name": "high", "priority": 100,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "force_escalate", "to_tier": "complex"}},
    ])
    d = e.evaluate("foo", predicted_tier="simple")
    assert d.to_tier == "complex"
    # Both rules' names land in matched_rules (audit trail).
    assert set(d.matched_rules) == {"low", "high"}


def test_set_threshold_rules_stack_max_wins():
    e = eng.load_inline([
        {"name": "a", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_threshold", "threshold": 0.80}},
        {"name": "b", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_threshold", "threshold": 0.90}},
    ])
    d = e.evaluate("foo", predicted_tier="simple")
    assert d.action == "set_threshold"
    assert d.threshold == 0.90


def test_set_threshold_stacks_with_force_escalate():
    e = eng.load_inline([
        {"name": "esc", "priority": 100,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "force_escalate", "to_tier": "complex"}},
        {"name": "thr", "priority": 50,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_threshold", "threshold": 0.95}},
    ])
    d = e.evaluate("foo", predicted_tier="simple")
    assert d.action == "force_escalate"
    assert d.to_tier == "complex"
    assert d.threshold == 0.95


# ---------------------------------------------------------------------------
# set_max_tokens action (R2-Router length budgeting)
# ---------------------------------------------------------------------------


def test_set_max_tokens_basic():
    e = eng.load_inline([{
        "name": "short", "priority": 1,
        "match": {"any_of": [{"prompt_length_max": 500}]},
        "action": {"type": "set_max_tokens", "value": 256},
    }])
    d = e.evaluate("hello world", predicted_tier="simple")
    assert d.action == "set_max_tokens"
    assert d.max_tokens == 256
    assert "short" in d.matched_rules
    # Long prompt does not match
    d2 = e.evaluate("x" * 1000, predicted_tier="simple")
    assert d2.action == "none"
    assert d2.max_tokens is None


def test_set_max_tokens_max_wins_on_conflict():
    """When multiple set_max_tokens rules match, the MAX value wins."""
    e = eng.load_inline([
        {"name": "tight", "priority": 1,
         "match": {"any_of": [{"prompt_length_min": 100}]},
         "action": {"type": "set_max_tokens", "value": 256}},
        {"name": "loose", "priority": 1,
         "match": {"any_of": [{"prompt_length_min": 100}]},
         "action": {"type": "set_max_tokens", "value": 1024}},
    ])
    d = e.evaluate("x" * 500, predicted_tier="simple")
    assert d.max_tokens == 1024
    assert set(d.matched_rules) == {"tight", "loose"}


def test_set_max_tokens_composes_with_force_cheap():
    """set_max_tokens stacks alongside force_cheap (independent fields)."""
    e = eng.load_inline([
        {"name": "downgrade", "priority": 100,
         "match": {"any_of": [{"classifier_confidence_max": 0.5}]},
         "applies_when": {"tier_predicted_in": ["medium"]},
         "action": {"type": "force_cheap", "to_tier": "simple"}},
        {"name": "short_budget", "priority": 50,
         "match": {"any_of": [{"prompt_length_max": 500}]},
         "action": {"type": "set_max_tokens", "value": 256}},
    ])
    d = e.evaluate("hi", predicted_tier="medium", classifier_confidence=0.3)
    # Primary action is force_cheap, but budget rides along.
    assert d.action == "force_cheap"
    assert d.to_tier == "simple"
    assert d.max_tokens == 256
    assert set(d.matched_rules) == {"downgrade", "short_budget"}


def test_set_max_tokens_rejects_missing_value():
    """Malformed set_max_tokens rule (no value) is skipped, not a no-op."""
    e = eng.load_inline([
        {"name": "no_value", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_max_tokens"}},
        {"name": "good", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_max_tokens", "value": 512}},
    ])
    assert len(e.rules) == 1
    assert e.rules[0].name == "good"


def test_set_max_tokens_rejects_nonpositive_value():
    e = eng.load_inline([
        {"name": "zero", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_max_tokens", "value": 0}},
        {"name": "negative", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "set_max_tokens", "value": -1}},
    ])
    assert len(e.rules) == 0


def test_routerarena_v4_profile_loads_and_buckets_lengths():
    """End-to-end: v4 profile assigns the R2-Router length buckets."""
    eng._clear_profile_cache()
    e = eng.load_profile("routerarena_v4")
    # Three new budget rules + two v3 downgrade rules.
    assert len(e.rules) == 5
    # Short prompt (< 500 chars) -> budget 256.
    d_short = e.evaluate("x" * 100, predicted_tier="simple",
                         classifier_confidence=0.9)
    assert d_short.max_tokens == 256
    # Medium prompt (500-2000 chars) -> budget 512.
    d_med = e.evaluate("x" * 1000, predicted_tier="simple",
                       classifier_confidence=0.9)
    assert d_med.max_tokens == 512
    # Long prompt (>= 2000 chars) -> budget 1024 (MAX of medium+long).
    d_long = e.evaluate("x" * 3000, predicted_tier="simple",
                        classifier_confidence=0.9)
    assert d_long.max_tokens == 1024
    # Medium prompt + low-conf medium tier -> force_cheap AND 512 budget.
    d_combo = e.evaluate("x" * 1000, predicted_tier="medium",
                         classifier_confidence=0.5)
    assert d_combo.action == "force_cheap"
    assert d_combo.to_tier == "simple"
    assert d_combo.max_tokens == 512


def test_empty_prompt_is_safe():
    e = eng.load_inline([{
        "name": "r1", "priority": 1,
        "match": {"any_of": [{"substring": "foo"}]},
        "action": {"type": "force_escalate", "to_tier": "complex"},
    }])
    assert e.evaluate("", predicted_tier="simple").action == "none"


# ---------------------------------------------------------------------------
# Malformed rules are skipped, not raised
# ---------------------------------------------------------------------------


def test_malformed_rule_is_skipped():
    e = eng.load_inline([
        {"name": "good", "priority": 1,
         "match": {"any_of": [{"substring": "foo"}]},
         "action": {"type": "force_escalate", "to_tier": "complex"}},
        {"priority": 1, "match": {"any_of": [{"substring": "x"}]}},  # no name
        {"name": "bad_regex", "priority": 1,
         "match": {"any_of": [{"regex": "[invalid"}]},
         "action": {"type": "force_escalate", "to_tier": "complex"}},
        {"name": "bad_action", "priority": 1,
         "match": {"any_of": [{"substring": "x"}]},
         "action": {"type": "nuke_database"}},
    ])
    # Only the good rule survives.
    assert len(e.rules) == 1
    assert e.rules[0].name == "good"


# ---------------------------------------------------------------------------
# Profile loader + hot reload
# ---------------------------------------------------------------------------


def test_load_default_profile_has_rules():
    eng._clear_profile_cache()
    e = eng.load_profile("default")
    assert len(e.rules) > 0
    # The default profile encodes the legacy code/summarize patterns.
    names = {r.name for r in e.rules}
    assert any("code" in n for n in names)
    assert any("summarize" in n for n in names)


def test_load_unknown_profile_returns_empty_engine():
    eng._clear_profile_cache()
    e = eng.load_profile("this_profile_does_not_exist")
    assert e.rules == ()
    # Empty engine returns "none" on every prompt.
    assert e.evaluate("anything", predicted_tier="simple").action == "none"


def test_hot_reload_on_mtime_change(tmp_path):
    """Profile cache invalidates when the file's mtime changes."""
    p = tmp_path / "tenant_x.yaml"
    p.write_text("""
- name: v1
  priority: 1
  match:
    any_of: [{substring: "alpha"}]
  action: {type: force_escalate, to_tier: complex}
""")
    eng._clear_profile_cache()
    e1 = eng.load_profile(str(p))
    assert {r.name for r in e1.rules} == {"v1"}
    # Bump mtime forward + rewrite. Sleep to ensure the stat picks it up
    # on filesystems with 1-second mtime granularity.
    time.sleep(1.1)
    p.write_text("""
- name: v2
  priority: 1
  match:
    any_of: [{substring: "beta"}]
  action: {type: force_escalate, to_tier: medium}
""")
    # Force the cache to bypass the TTL fast-path by directly setting
    # the cached ts to long ago. (The TTL is 30s; we don't want to wait
    # for it in tests.)
    with eng._PROFILE_CACHE_LOCK:
        for k, (mtime, _ts, en) in list(eng._PROFILE_CACHE.items()):
            eng._PROFILE_CACHE[k] = (mtime, 0.0, en)
    e2 = eng.load_profile(str(p))
    assert {r.name for r in e2.rules} == {"v2"}
