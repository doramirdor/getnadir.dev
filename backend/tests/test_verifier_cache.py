"""Tests for backend/app/services/verifier_cache.py.

Pure stdlib, fully offline. TTL tests use a 0.1-0.2s window so the whole
suite runs in well under 2 seconds.
"""

from __future__ import annotations

import importlib
import os
import threading
import time

import pytest

from app.services import verifier_cache as vc_module
from app.services.verifier_cache import VerifierCache, get_shared_verifier_cache


# ---------------------------------------------------------------------------
# Basic behavior
# ---------------------------------------------------------------------------


def test_empty_cache_get_returns_none_and_records_miss():
    cache = VerifierCache(max_size=8, ttl_seconds=60)
    assert cache.get("nope") is None
    stats = cache.stats()
    assert stats["hits"] == 0
    assert stats["misses"] == 1
    assert stats["size"] == 0
    assert stats["max_size"] == 8


def test_put_then_get_returns_score_and_records_hit():
    cache = VerifierCache(max_size=8, ttl_seconds=60)
    cache.put("k1", 0.87)
    assert cache.get("k1") == pytest.approx(0.87)
    stats = cache.stats()
    assert stats["hits"] == 1
    assert stats["misses"] == 0
    assert stats["size"] == 1


def test_two_distinct_keys_are_independent():
    cache = VerifierCache(max_size=8, ttl_seconds=60)
    cache.put("k1", 0.1)
    cache.put("k2", 0.9)
    assert cache.get("k1") == pytest.approx(0.1)
    assert cache.get("k2") == pytest.approx(0.9)
    assert cache.stats()["size"] == 2


def test_repeated_put_overwrites_previous_value():
    cache = VerifierCache(max_size=8, ttl_seconds=60)
    cache.put("k", 0.1)
    cache.put("k", 0.5)
    cache.put("k", 0.9)
    assert cache.get("k") == pytest.approx(0.9)
    assert cache.stats()["size"] == 1


# ---------------------------------------------------------------------------
# Key derivation
# ---------------------------------------------------------------------------


def test_key_for_is_deterministic():
    cache = VerifierCache()
    k1 = cache.key_for("a", "b")
    k2 = cache.key_for("a", "b")
    assert k1 == k2
    assert len(k1) == 32
    # Hex chars only
    int(k1, 16)


def test_key_for_avoids_concat_collisions_via_unit_separator():
    """Without the \\x1f separator, ('ab', 'c') and ('a', 'bc') would
    produce the same digest if naively concatenated. The separator prevents this."""
    cache = VerifierCache()
    assert cache.key_for("ab", "c") != cache.key_for("a", "bc")


def test_key_for_reference_variation_changes_key():
    cache = VerifierCache()
    k_no_ref = cache.key_for("a", "b", None)
    k_empty_ref = cache.key_for("a", "b", "")
    k_with_ref = cache.key_for("a", "b", "x")
    # None and "" intentionally collapse to the same key (documented).
    assert k_no_ref == k_empty_ref
    # A real reference must produce a different key.
    assert k_no_ref != k_with_ref


# ---------------------------------------------------------------------------
# LRU
# ---------------------------------------------------------------------------


def test_lru_eviction_at_capacity_drops_oldest():
    cache = VerifierCache(max_size=3, ttl_seconds=60)
    cache.put("a", 1.0)
    cache.put("b", 2.0)
    cache.put("c", 3.0)
    cache.put("d", 4.0)  # should evict "a"

    assert cache.get("a") is None  # evicted -> miss
    assert cache.get("b") == pytest.approx(2.0)
    assert cache.get("c") == pytest.approx(3.0)
    assert cache.get("d") == pytest.approx(4.0)
    stats = cache.stats()
    assert stats["evictions"] == 1
    assert stats["size"] == 3


def test_lru_get_touches_entry_so_eviction_drops_a_different_one():
    cache = VerifierCache(max_size=3, ttl_seconds=60)
    cache.put("a", 1.0)
    cache.put("b", 2.0)
    cache.put("c", 3.0)
    # Touch "a" — now LRU order is b, c, a.
    assert cache.get("a") == pytest.approx(1.0)
    # Insert "d" — should evict "b", not "a".
    cache.put("d", 4.0)

    assert cache.get("a") == pytest.approx(1.0)  # still present
    assert cache.get("b") is None  # evicted
    assert cache.get("c") == pytest.approx(3.0)
    assert cache.get("d") == pytest.approx(4.0)
    assert cache.stats()["evictions"] == 1


# ---------------------------------------------------------------------------
# TTL
# ---------------------------------------------------------------------------


def test_ttl_expiration_returns_none_and_increments_expirations():
    cache = VerifierCache(max_size=8, ttl_seconds=0)  # always-expired path
    # Use a positive but tiny TTL by reconstructing — ttl_seconds is int in the
    # public signature, so we set it via a fresh instance with a fractional TTL.
    cache = VerifierCache(max_size=8, ttl_seconds=1)
    # Override TTL to a sub-second value for fast test.
    cache._ttl_seconds = 0.1  # noqa: SLF001 — test-only access

    cache.put("k", 0.5)
    assert cache.get("k") == pytest.approx(0.5)  # fresh hit
    time.sleep(0.15)
    assert cache.get("k") is None  # expired
    stats = cache.stats()
    assert stats["expirations"] == 1
    # Expired access counts as a miss for the hit/miss accounting.
    assert stats["misses"] >= 1
    assert stats["size"] == 0


# ---------------------------------------------------------------------------
# clear()
# ---------------------------------------------------------------------------


def test_clear_empties_storage_but_preserves_cumulative_counters():
    cache = VerifierCache(max_size=8, ttl_seconds=60)
    cache.put("k1", 0.1)
    cache.put("k2", 0.2)
    cache.get("k1")  # hit
    cache.get("missing")  # miss

    before = cache.stats()
    assert before["size"] == 2
    assert before["hits"] == 1
    assert before["misses"] == 1

    cache.clear()
    after = cache.stats()
    assert after["size"] == 0
    # Cumulative counters preserved (documented behavior).
    assert after["hits"] == before["hits"]
    assert after["misses"] == before["misses"]
    assert after["evictions"] == before["evictions"]
    assert after["expirations"] == before["expirations"]


# ---------------------------------------------------------------------------
# Singleton + env vars
# ---------------------------------------------------------------------------


def test_singleton_returns_same_instance_and_env_applies_once(monkeypatch):
    # Force a fresh singleton for this test.
    monkeypatch.setattr(vc_module, "_shared_cache", None)
    monkeypatch.setenv("VERIFIER_CACHE_MAX_SIZE", "11")
    monkeypatch.setenv("VERIFIER_CACHE_TTL_SECONDS", "7")

    first = get_shared_verifier_cache()
    second = get_shared_verifier_cache()
    assert first is second
    assert first.stats()["max_size"] == 11

    # Changing env vars after construction must NOT change the existing instance.
    monkeypatch.setenv("VERIFIER_CACHE_MAX_SIZE", "99")
    third = get_shared_verifier_cache()
    assert third is first
    assert third.stats()["max_size"] == 11


# ---------------------------------------------------------------------------
# Thread safety smoke test
# ---------------------------------------------------------------------------


def test_thread_safety_smoke_no_exceptions_and_stats_consistent():
    cache = VerifierCache(max_size=64, ttl_seconds=60)
    num_threads = 8
    ops_per_thread = 1000
    exceptions: list[BaseException] = []
    barrier = threading.Barrier(num_threads)

    def worker(worker_id: int) -> None:
        try:
            barrier.wait()
            for i in range(ops_per_thread):
                # Overlap keys across workers so get/put contend.
                k = f"key-{i % 32}"
                if (i + worker_id) % 2 == 0:
                    cache.put(k, float(i))
                else:
                    cache.get(k)
        except BaseException as exc:  # noqa: BLE001 — capture anything for the assert
            exceptions.append(exc)

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(num_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert exceptions == []
    stats = cache.stats()
    # Each "get" branch increments either hits or misses.
    # Each "put" branch increments neither.
    # Half the ops (by parity) hit the get branch.
    total_gets = sum(
        1 for w in range(num_threads) for i in range(ops_per_thread) if (i + w) % 2 != 0
    )
    assert stats["hits"] + stats["misses"] == total_gets
    # Size cannot exceed capacity.
    assert stats["size"] <= 64
