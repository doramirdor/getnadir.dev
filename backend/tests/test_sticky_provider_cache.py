"""Tests for the in-memory sticky provider cache.

Loads the module directly via importlib to bypass ``app/services/__init__.py``'s
eager imports, which would otherwise pull in the whole service stack (settings,
Supabase, etc.) during test collection.
"""

from __future__ import annotations

import importlib.util
import os
import time
import types

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
SPC_PATH = os.path.join(BACKEND, "app", "services", "sticky_provider_cache.py")


def _load_spc_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("sticky_provider_cache_under_test", SPC_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def spc_module() -> types.ModuleType:
    return _load_spc_module()


@pytest.fixture
def cache(spc_module):
    return spc_module._StickyProviderCache()


def test_ttl_matches_anthropic_default(spc_module):
    """TTL must match Anthropic's 5-minute ephemeral cache — a longer TTL would
    produce false 'warm' predictions after the provider has evicted."""
    assert spc_module._TTL_SECONDS == 300


def test_get_returns_none_for_missing_key(cache):
    assert cache.get("u", "p") is None


def test_set_then_get_roundtrip(cache):
    cache.set("u", "p", "anthropic")
    assert cache.get("u", "p") == "anthropic"


def test_get_returns_none_after_ttl_expiry(cache, spc_module, monkeypatch):
    cache.set("u", "p", "anthropic")
    now_plus = time.time() + 301
    monkeypatch.setattr(spc_module.time, "time", lambda: now_plus)
    assert cache.get("u", "p") is None


def test_seen_prompt_false_before_record(cache):
    assert cache.seen_prompt("u", "p", "hello") is False


def test_seen_prompt_true_after_record(cache):
    cache.record_prompt("u", "p", "hello")
    assert cache.seen_prompt("u", "p", "hello") is True


def test_seen_prompt_scoped_to_user_preset(cache):
    cache.record_prompt("u1", "p1", "hello")
    assert cache.seen_prompt("u2", "p1", "hello") is False
    assert cache.seen_prompt("u1", "p2", "hello") is False


def test_seen_prompt_content_sensitive(cache):
    cache.record_prompt("u", "p", "hello")
    assert cache.seen_prompt("u", "p", "hello ") is False  # trailing space differs


def test_seen_prompt_expires(cache, spc_module, monkeypatch):
    cache.record_prompt("u", "p", "hello")
    now_plus = time.time() + 301
    monkeypatch.setattr(spc_module.time, "time", lambda: now_plus)
    assert cache.seen_prompt("u", "p", "hello") is False


def test_evict_expired_drops_old_entries(cache, spc_module, monkeypatch):
    cache.set("u1", "p", "anthropic")
    cache.set("u2", "p", "openai")
    now_plus = time.time() + 301
    monkeypatch.setattr(spc_module.time, "time", lambda: now_plus)
    cache._evict_expired()
    assert cache.get("u1", "p") is None
    assert cache.get("u2", "p") is None


def test_record_prompt_does_not_crash_on_unicode(cache):
    cache.record_prompt("u", "p", "héllo 🌍")
    assert cache.seen_prompt("u", "p", "héllo 🌍") is True
