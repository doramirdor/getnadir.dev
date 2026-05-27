"""In-memory LRU + TTL cache for verifier scores.

Standalone module. Pure stdlib. Thread-safe via a single threading.Lock
acquired once per public method call.

Designed for the trained verifier path (see verifier_model.py::VerifierModel.score)
which costs ~180ms on CPU per call. Production traffic exhibits a meaningful
fraction of duplicate or near-duplicate (prompt, cheap_response) pairs, so a
simple bounded LRU with TTL gives most of the benefit of a full semantic
cache at essentially zero infra cost.

Not wired into cascade_router yet; that integration lives in a separate step.

Edge cases handled (documented inline at the call sites below):
  - TTL of 0 or negative: treated as "already expired" — get always returns None.
    A non-positive TTL is permitted (no value-coercion) so callers can disable
    the cache by setting VERIFIER_CACHE_TTL_SECONDS=0 without code changes.
  - max_size of 0: cache stays empty; put still runs but the entry is
    immediately evicted on the next put (or on the same put if size > max_size
    after insertion). Avoid by guarding callers, but the cache itself does not
    raise.
  - reference=None vs reference="" produce the same key, by design — the
    separator already disambiguates positions, and an absent reference is
    semantically equivalent to an empty reference for verifier scoring.
  - clear() preserves cumulative hits/misses/evictions/expirations counters,
    only resets the storage. This makes stats useful across hot reloads of
    weights / config without losing visibility. Size resets to 0.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import OrderedDict
from typing import Dict, Optional, Tuple


_FIELD_SEP = "\x1f"  # ASCII unit separator, will not collide with normal text


class VerifierCache:
    """In-memory LRU + TTL cache for verifier scores.

    Key derivation is deterministic and collision-resistant via SHA-256 of
    a tuple of inputs joined with \\x1f (ASCII unit separator) as the field
    delimiter. TTL is applied lazily on get (no sweeper thread). Eviction
    is LRU; least-recently-used entry drops when size > max_size on put.

    Thread-safe via threading.Lock on all mutating operations.
    """

    def __init__(self, max_size: int = 4096, ttl_seconds: int = 300) -> None:
        self._max_size: int = max_size
        self._ttl_seconds: float = float(ttl_seconds)
        # Maps key -> (score, expires_at_monotonic)
        self._store: "OrderedDict[str, Tuple[float, float]]" = OrderedDict()
        self._lock = threading.Lock()
        # Counters. Cumulative across clear() calls by design (see module docstring).
        self._hits: int = 0
        self._misses: int = 0
        self._evictions: int = 0
        self._expirations: int = 0

    def key_for(
        self,
        prompt: str,
        cheap_answer: str,
        reference: Optional[str] = None,
    ) -> str:
        """Return a 32-hex-char SHA-256-derived key for the inputs.

        The \\x1f separator prevents the "ab"+"c" vs "a"+"bc" collision
        that simple string concatenation would allow.
        """
        ref = reference if reference is not None else ""
        payload = f"{prompt}{_FIELD_SEP}{cheap_answer}{_FIELD_SEP}{ref}"
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        return digest[:32]

    def get(self, key: str) -> Optional[float]:
        """Return score for `key`, or None on miss or TTL expiry.

        Expired entries are evicted on access (lazy TTL). Hit moves entry to
        most-recently-used end of the LRU order.
        """
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            score, expires_at = entry
            # Non-positive TTL means "always expired" — see module docstring.
            if time.monotonic() >= expires_at:
                # Lazy expiration: drop and count.
                del self._store[key]
                self._expirations += 1
                self._misses += 1
                return None
            # Touch: mark as most-recently-used.
            self._store.move_to_end(key, last=True)
            self._hits += 1
            return score

    def put(self, key: str, score: float) -> None:
        """Store score for `key`. Evicts LRU entry if at capacity.

        If the key already exists, the value is overwritten and the entry is
        moved to most-recently-used. TTL is refreshed on overwrite.
        """
        with self._lock:
            expires_at = time.monotonic() + self._ttl_seconds
            if key in self._store:
                # Overwrite + refresh TTL + bump to MRU.
                self._store[key] = (score, expires_at)
                self._store.move_to_end(key, last=True)
                return
            self._store[key] = (score, expires_at)
            # Evict until within capacity. Normally this is at most one
            # iteration since we only inserted one entry, but the loop is
            # defensive against max_size being reduced at runtime in future.
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)  # FIFO end == LRU
                self._evictions += 1

    def stats(self) -> Dict[str, int]:
        """Return {hits, misses, evictions, expirations, size, max_size}."""
        with self._lock:
            return {
                "hits": self._hits,
                "misses": self._misses,
                "evictions": self._evictions,
                "expirations": self._expirations,
                "size": len(self._store),
                "max_size": self._max_size,
            }

    def clear(self) -> None:
        """Empty the cache. Preserves cumulative hit/miss/eviction/expiration counters.

        See module docstring for rationale: clearing the storage typically
        happens on hot reload, and losing operational counters at that moment
        defeats their purpose.
        """
        with self._lock:
            self._store.clear()


_shared_cache: Optional[VerifierCache] = None
_singleton_lock = threading.Lock()


def get_shared_verifier_cache() -> VerifierCache:
    """Module-scoped singleton.

    Configured from env vars VERIFIER_CACHE_MAX_SIZE (default 4096) and
    VERIFIER_CACHE_TTL_SECONDS (default 300). Env vars are read on first
    construction only; subsequent calls return the same instance.
    """
    global _shared_cache
    if _shared_cache is not None:
        return _shared_cache
    with _singleton_lock:
        if _shared_cache is None:
            max_size = int(os.environ.get("VERIFIER_CACHE_MAX_SIZE", "4096"))
            ttl_seconds = int(os.environ.get("VERIFIER_CACHE_TTL_SECONDS", "300"))
            _shared_cache = VerifierCache(max_size=max_size, ttl_seconds=ttl_seconds)
    return _shared_cache
