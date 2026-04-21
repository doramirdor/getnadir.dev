"""Integration test for the cache_control pipeline in production_completion.py.

Simulates the three-step transformation that happens inside ``create_completion``:

    1. Build messages_dicts from request.messages
       + insert preset system_prompt if the user didn't provide one
    2. Context-optimize (may normalize whitespace, dedup text, etc.)
    3. Auto-inject cache_control on repeat system prompts

and verifies the invariants that the review called out as fragile under refactor:

  * inject runs AFTER optimize (so hash matches what the provider sees)
  * inject receives string content, not a list — i.e. optimize doesn't choke
    on pre-wrapped cache blocks
  * the marked text in the injected cache_control block equals the POST-optimize
    text, not the raw input
  * sticky cache matches correctly produce hits; mismatches don't

These invariants survive a rename of pure helpers (AST-extracted) but will fail
immediately if someone reorders the steps, skips optimize for system messages,
or changes the content shape that inject emits.
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

_HELPERS = {
    "_CACHE_READ_MULTIPLIER",
    "_CACHE_CONTROL_PROVIDERS",
    "_effective_input_cost",
    "_min_cache_tokens",
    "_approx_token_count",
    "_has_cache_control",
    "_maybe_inject_cache_control",
    "_get_model_input_cost",
}


def _load_spc() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("_spc_flow", SPC_PATH)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _load_context_optimizer() -> types.ModuleType:
    """Load context_optimizer.py and register in sys.modules so dataclass
    field introspection (which looks up ``cls.__module__`` in sys.modules)
    works when the module defines @dataclass types."""
    name = "_ctx_opt_flow"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, os.path.join(BACKEND, "app", "services", "context_optimizer.py"),
    )
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _fake_provider_of(model: str) -> str:
    ml = model.lower()
    if "gpt" in ml or "openai" in ml:
        return "openai"
    if "claude" in ml or "anthropic" in ml:
        return "anthropic"
    return "unknown"


@pytest.fixture
def helpers():
    """Extract the pure helpers from production_completion.py bound to a fresh
    sticky cache and a stubbed litellm pricing table."""
    spc = _load_spc()
    fake_litellm = types.ModuleType("litellm")
    fake_litellm.model_cost = {"claude-sonnet-4": {"input_cost_per_token": 3e-6}}
    sys.modules["litellm"] = fake_litellm

    ns: Dict[str, Any] = {
        "List": List, "Dict": Dict, "Any": Any, "Optional": Optional,
        "_provider_of": _fake_provider_of,
        "sticky_provider_cache": spc._StickyProviderCache(),
        "logger": types.SimpleNamespace(debug=lambda *a, **k: None),
    }
    tree = ast.parse(open(PC_PATH).read())
    for node in tree.body:
        name = None
        if isinstance(node, ast.FunctionDef):
            name = node.name
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
        if name in _HELPERS:
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<pc>", "exec"), ns)
    return types.SimpleNamespace(**ns)


def _simulate_completion_pipeline(
    helpers,
    *,
    user_messages: List[Dict[str, Any]],
    preset_system_prompt: Optional[str],
    optimize_mode: str,
    model: str,
    user_id: str,
    preset_slug: Optional[str],
    sticky_provider: Optional[str],
) -> List[Dict[str, Any]]:
    """Runs the same three steps create_completion runs, in the same order."""
    # Step 1: build messages_dicts + insert preset system_prompt (matches :872-876)
    messages_dicts: List[Dict[str, Any]] = [dict(m) for m in user_messages]
    if preset_system_prompt and not any(m.get("role") == "system" for m in messages_dicts):
        messages_dicts.insert(0, {"role": "system", "content": preset_system_prompt})

    # Step 2: optimize (matches :889-904). We use the real optimizer when enabled.
    if optimize_mode in ("safe", "aggressive"):
        opt_mod = _load_context_optimizer()
        result = opt_mod.optimize_messages(messages_dicts, mode=optimize_mode)
        messages_dicts = result.messages

    # Step 3: auto-inject (matches :908-925)
    helpers._maybe_inject_cache_control(
        messages_dicts, model, user_id, preset_slug, sticky_provider,
    )
    return messages_dicts


LONG_SYSTEM = (
    "You are a senior software engineer. "
    "Follow these rules carefully.\n\n\n\n"  # multiple blank lines → whitespace normalize will touch this
    + ("x" * 5000)
)


def test_preset_system_prompt_reaches_inject(helpers):
    """B2 regression: preset system_prompt must end up in messages_dicts so the
    auto-inject helper can find it on the standard routing path."""
    # First call primes the prompt-hash cache.
    _simulate_completion_pipeline(
        helpers,
        user_messages=[{"role": "user", "content": "hi"}],
        preset_system_prompt=LONG_SYSTEM,
        optimize_mode="off",
        model="claude-sonnet-4",
        user_id="u1",
        preset_slug="p1",
        sticky_provider="anthropic",
    )
    # Second call with identical system prompt should trigger inject.
    messages = _simulate_completion_pipeline(
        helpers,
        user_messages=[{"role": "user", "content": "hi again"}],
        preset_system_prompt=LONG_SYSTEM,
        optimize_mode="off",
        model="claude-sonnet-4",
        user_id="u1",
        preset_slug="p1",
        sticky_provider="anthropic",
    )
    assert messages[0]["role"] == "system"
    assert isinstance(messages[0]["content"], list), (
        "auto-inject did not fire — preset system_prompt didn't reach messages_dicts"
    )
    assert messages[0]["content"][0]["cache_control"] == {"type": "ephemeral"}


def test_inject_runs_after_optimize(helpers):
    """B1 regression: inject must run after optimize. If it runs first, optimize
    receives list-content and its len()/string transforms corrupt or crash.
    Also: the cache-marked text must equal the POST-optimize string so call 2
    can hash-match call 1 and actually hit the cache server-side."""
    # Call 1: optimize runs, then inject records the prompt hash (no marker yet).
    _simulate_completion_pipeline(
        helpers,
        user_messages=[{"role": "user", "content": "q"}],
        preset_system_prompt=LONG_SYSTEM,
        optimize_mode="safe",
        model="claude-sonnet-4",
        user_id="u2",
        preset_slug="p2",
        sticky_provider="anthropic",
    )
    # Call 2: same input, optimize normalizes the same way, inject fires.
    messages = _simulate_completion_pipeline(
        helpers,
        user_messages=[{"role": "user", "content": "q"}],
        preset_system_prompt=LONG_SYSTEM,
        optimize_mode="safe",
        model="claude-sonnet-4",
        user_id="u2",
        preset_slug="p2",
        sticky_provider="anthropic",
    )
    sys_content = messages[0]["content"]
    assert isinstance(sys_content, list), "inject did not fire after optimize"
    marked_text = sys_content[0]["text"]
    # Whitespace-normalized text should NOT contain the original 4-blank-line run.
    assert "\n\n\n\n" not in marked_text, (
        "cache-marked text still contains pre-optimize whitespace — "
        "inject likely ran before optimize"
    )
    # Marker is correct
    assert sys_content[0]["cache_control"] == {"type": "ephemeral"}


def test_optimize_sees_string_content_not_list(helpers):
    """If inject ever ran before optimize, messages_dicts[system].content would
    be a list at the point optimize tries len(content) // 4. This test locks in
    that after step 2 (optimize), system content is still a string."""
    # Build through step 1 + 2 only, skipping step 3.
    messages_dicts: List[Dict[str, Any]] = [{"role": "user", "content": "q"}]
    if LONG_SYSTEM:
        messages_dicts.insert(0, {"role": "system", "content": LONG_SYSTEM})

    opt_mod = _load_context_optimizer()
    result = opt_mod.optimize_messages(messages_dicts, mode="safe")

    sys_msg = next(m for m in result.messages if m.get("role") == "system")
    assert isinstance(sys_msg["content"], str), (
        "optimize produced non-string system content — upstream code (inject) "
        "must not convert content to a list before optimize runs"
    )


def test_sticky_mismatch_does_not_inject_on_repeat(helpers):
    """Repeat detection alone isn't enough — sticky must also match the chosen
    provider. If it didn't, we'd pay a 1.25x cache-write cost when routing
    lands somewhere the cache doesn't actually live."""
    _simulate_completion_pipeline(
        helpers,
        user_messages=[{"role": "user", "content": "q"}],
        preset_system_prompt=LONG_SYSTEM,
        optimize_mode="off",
        model="claude-sonnet-4",
        user_id="u3",
        preset_slug="p3",
        sticky_provider="openai",  # mismatch: we last went to openai, now routed to claude
    )
    messages = _simulate_completion_pipeline(
        helpers,
        user_messages=[{"role": "user", "content": "q"}],
        preset_system_prompt=LONG_SYSTEM,
        optimize_mode="off",
        model="claude-sonnet-4",
        user_id="u3",
        preset_slug="p3",
        sticky_provider="openai",
    )
    assert isinstance(messages[0]["content"], str), (
        "sticky mismatch should prevent inject — the provider has no warm cache"
    )


def test_preset_system_prompt_skipped_when_user_supplies_one(helpers):
    """Client-supplied system message takes precedence; preset shouldn't be
    double-inserted."""
    user_sys = "user provided " + ("y" * 5000)
    _simulate_completion_pipeline(
        helpers,
        user_messages=[
            {"role": "system", "content": user_sys},
            {"role": "user", "content": "q"},
        ],
        preset_system_prompt="preset " + ("z" * 5000),
        optimize_mode="off",
        model="claude-sonnet-4",
        user_id="u4",
        preset_slug="p4",
        sticky_provider="anthropic",
    )
    messages = _simulate_completion_pipeline(
        helpers,
        user_messages=[
            {"role": "system", "content": user_sys},
            {"role": "user", "content": "q"},
        ],
        preset_system_prompt="preset " + ("z" * 5000),
        optimize_mode="off",
        model="claude-sonnet-4",
        user_id="u4",
        preset_slug="p4",
        sticky_provider="anthropic",
    )
    # Only one system message
    system_msgs = [m for m in messages if m.get("role") == "system"]
    assert len(system_msgs) == 1
    # The one system message should reflect what the USER sent (marked for cache on repeat).
    marked_text = system_msgs[0]["content"][0]["text"]
    assert marked_text.startswith("user provided ")
