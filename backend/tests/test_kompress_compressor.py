"""Tests for the kompress (headroom-ai) adapter and its context_optimizer mode.

Loaded standalone via importlib (same pattern as test_cache_control_flow.py)
so the tests run without the full app package / heavy service imports.

Invariants under test — these are the cache-safety and accuracy guarantees
the kompress mode is allowed to make:

  * system and user message content is byte-stable after compression
  * message count and role order are preserved
  * the pass is a strict no-op when headroom is unavailable, the prompt is
    small, or compression wouldn't save tokens
  * context_optimizer mode="kompress" degrades to aggressive cleanly
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import types

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))


def _load_module(name: str, rel_path: str) -> types.ModuleType:
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, os.path.join(BACKEND, rel_path))
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _load_kompress() -> types.ModuleType:
    return _load_module(
        "_kompress_test", os.path.join("app", "services", "kompress_compressor.py")
    )


def _load_context_optimizer() -> types.ModuleType:
    return _load_module(
        "_ctx_opt_kompress_test", os.path.join("app", "services", "context_optimizer.py")
    )


def _bulky_messages() -> list[dict]:
    """An agentic conversation with large tool results outside the protected
    recent window — the shape kompress targets. The first tool payload is
    indented JSON so the deterministic json_minify transform also fires."""
    tool_json = json.dumps(
        [
            {
                "id": i,
                "name": f"item-{i}",
                "status": "ok",
                "score": i * 0.5,
                "tags": ["alpha", "beta"],
                "description": "Lorem ipsum dolor sit amet consectetur adipiscing elit " * 3,
            }
            for i in range(300)
        ],
        indent=2,
    )
    log_blob = "\n".join(
        f"2026-06-10T12:00:{i % 60:02d}Z INFO worker-7 processed batch {i} "
        f"status=ok latency_ms={40 + i % 13}"
        for i in range(400)
    )
    return [
        {"role": "system", "content": "You are a precise assistant.\n" * 10},
        {"role": "user", "content": "Search the catalog for failing items"},
        {"role": "assistant", "content": "Calling search tool..."},
        {"role": "tool", "content": tool_json},
        {"role": "assistant", "content": "I found 300 items. Now checking the worker logs."},
        {"role": "user", "content": "Check the worker logs too"},
        {"role": "assistant", "content": "Fetching logs..."},
        {"role": "tool", "content": log_blob},
        {"role": "assistant", "content": "Logs fetched. All batches processed ok."},
        {"role": "user", "content": "Summarize only the items with score > 40."},
    ]


# ---------------------------------------------------------------------------
# kompress_messages
# ---------------------------------------------------------------------------

headroom_installed = importlib.util.find_spec("headroom") is not None


@pytest.mark.skipif(not headroom_installed, reason="headroom-ai not installed")
def test_kompress_saves_tokens_and_keeps_protected_content_byte_stable():
    mod = _load_kompress()
    messages = _bulky_messages()
    result = mod.kompress_messages(messages, model="claude-sonnet-4-5")

    assert result.applied, f"expected compression, got skip: {result.skip_reason}"
    assert result.tokens_after < result.tokens_before
    assert len(result.messages) == len(messages)
    assert [m["role"] for m in result.messages] == [m["role"] for m in messages]
    for original, compressed in zip(messages, result.messages):
        if original["role"] in ("system", "user"):
            assert compressed["content"] == original["content"]


@pytest.mark.skipif(not headroom_installed, reason="headroom-ai not installed")
def test_kompress_skips_small_prompts():
    mod = _load_kompress()
    messages = [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "What is 2+2?"},
    ]
    result = mod.kompress_messages(messages)
    assert not result.applied
    assert result.skip_reason == "prompt_below_threshold"
    assert result.messages is messages


def test_kompress_noop_when_headroom_unavailable(monkeypatch):
    mod = _load_kompress()
    monkeypatch.setattr(mod, "_get_headroom", lambda: (None, None))
    messages = _bulky_messages()
    result = mod.kompress_messages(messages)
    assert not result.applied
    assert result.skip_reason == "headroom_unavailable"
    assert result.messages is messages


def test_kompress_noop_when_compression_errors(monkeypatch):
    mod = _load_kompress()

    def _boom(*args, **kwargs):
        raise RuntimeError("transform exploded")

    class _Cfg:  # accepts any kwargs like CompressConfig
        def __init__(self, **kwargs):
            pass

    monkeypatch.setattr(mod, "_get_headroom", lambda: (_boom, _Cfg))
    messages = _bulky_messages()
    result = mod.kompress_messages(messages)
    assert not result.applied
    assert result.messages is messages


def test_kompress_rejects_result_that_modifies_protected_content(monkeypatch):
    mod = _load_kompress()
    messages = _bulky_messages()

    class _FakeResult:
        def __init__(self, msgs):
            self.messages = msgs
            self.tokens_before = 1000
            self.tokens_after = 500
            self.tokens_saved = 500
            self.transforms_applied = ["fake"]

    def _bad_compress(msgs, **kwargs):
        tampered = [dict(m) for m in msgs]
        tampered[0]["content"] = "REWRITTEN SYSTEM PROMPT"  # would break caching
        return _FakeResult(tampered)

    class _Cfg:
        def __init__(self, **kwargs):
            pass

    monkeypatch.setattr(mod, "_get_headroom", lambda: (_bad_compress, _Cfg))
    result = mod.kompress_messages(messages)
    assert not result.applied
    assert result.skip_reason == "protected_content_modified"


# ---------------------------------------------------------------------------
# context_optimizer mode="kompress"
# ---------------------------------------------------------------------------

def test_optimizer_kompress_mode_degrades_to_aggressive_standalone(monkeypatch):
    """When the kompress adapter can't be imported, mode="kompress" must still
    run every aggressive transform and apply nothing kompress-specific."""
    opt = _load_context_optimizer()
    # None in sys.modules makes `from app.services.kompress_compressor import …`
    # raise ImportError regardless of what's installed in the environment.
    monkeypatch.setitem(sys.modules, "app.services.kompress_compressor", None)
    messages = _bulky_messages()
    result = opt.optimize_messages(messages, mode="kompress")

    assert result.mode == "kompress"
    assert "kompress" not in result.optimizations_applied
    assert result.tokens_saved >= 0
    # Aggressive-tier transforms still ran (the bulky JSON gets minified)
    assert "json_minify" in result.optimizations_applied


def test_optimizer_kompress_mode_applies_when_available(monkeypatch):
    opt = _load_context_optimizer()
    kompress_mod = _load_kompress()
    if not headroom_installed:
        pytest.skip("headroom-ai not installed")

    # Make `from app.services.kompress_compressor import kompress_messages`
    # resolve to the standalone-loaded module.
    app_pkg = types.ModuleType("app")
    services_pkg = types.ModuleType("app.services")
    services_pkg.kompress_compressor = kompress_mod
    monkeypatch.setitem(sys.modules, "app", app_pkg)
    monkeypatch.setitem(sys.modules, "app.services", services_pkg)
    monkeypatch.setitem(sys.modules, "app.services.kompress_compressor", kompress_mod)

    messages = _bulky_messages()
    result = opt.optimize_messages(messages, mode="kompress", model="claude-sonnet-4-5")

    assert "kompress" in result.optimizations_applied
    assert result.optimized_tokens < result.original_tokens
    # System prompt still byte-stable end-to-end
    assert result.messages[0]["content"] == messages[0]["content"]
