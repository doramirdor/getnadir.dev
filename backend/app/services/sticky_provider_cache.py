"""
Sticky provider cache for prompt-caching affinity.

When a user's request includes cache_control directives (Anthropic/OpenAI prompt caching),
subsequent requests benefit from routing to the same provider to maximize cache hits.

Stores (user_id, preset_slug) -> provider_name in-process with a 5-minute TTL, matching
Anthropic's default ephemeral cache lifetime. Best-effort: data is lost on restart and
not shared across workers.

Also remembers recent system-prompt hashes per (user_id, preset_slug) so the router can
tell whether an incoming prompt is likely to hit a warm cache on the sticky provider.
"""

import hashlib
import time
import logging
from typing import Optional, Dict, Tuple

logger = logging.getLogger(__name__)

_TTL_SECONDS = 300  # 5 minutes — matches Anthropic default ephemeral cache TTL


def _hash_prompt(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


class _StickyProviderCache:
    """In-memory TTL cache mapping (user_id, preset_slug) to a provider name,
    plus a recent-prompt-hash set per key so callers can detect repeat prompts."""

    def __init__(self):
        self._store: Dict[Tuple[str, str], Tuple[str, float]] = {}
        self._prompt_hashes: Dict[Tuple[str, str], Dict[str, float]] = {}

    def get(self, user_id: str, preset_slug: str) -> Optional[str]:
        """Return the cached provider for this user+preset, or None if expired/missing."""
        key = (user_id, preset_slug)
        entry = self._store.get(key)
        if entry is None:
            return None
        provider, expires_at = entry
        if time.time() > expires_at:
            self._store.pop(key, None)
            return None
        return provider

    def set(self, user_id: str, preset_slug: str, provider: str) -> None:
        """Store a provider for this user+preset with a TTL."""
        key = (user_id, preset_slug)
        self._store[key] = (provider, time.time() + _TTL_SECONDS)
        if len(self._store) > 5000:
            self._evict_expired()

    def seen_prompt(self, user_id: str, preset_slug: str, prompt_text: str) -> bool:
        """Return True if this prompt text was recorded for this key within the TTL."""
        key = (user_id, preset_slug)
        bucket = self._prompt_hashes.get(key)
        if not bucket:
            return False
        h = _hash_prompt(prompt_text)
        expires_at = bucket.get(h)
        if expires_at is None:
            return False
        if time.time() > expires_at:
            bucket.pop(h, None)
            return False
        return True

    def record_prompt(self, user_id: str, preset_slug: str, prompt_text: str) -> None:
        """Remember this prompt text for this key so a later call can detect repetition."""
        key = (user_id, preset_slug)
        bucket = self._prompt_hashes.setdefault(key, {})
        bucket[_hash_prompt(prompt_text)] = time.time() + _TTL_SECONDS
        if len(bucket) > 32:
            now = time.time()
            for h in [h for h, exp in bucket.items() if now > exp]:
                bucket.pop(h, None)

    def _evict_expired(self) -> None:
        """Remove all expired entries."""
        now = time.time()
        expired = [k for k, (_, exp) in self._store.items() if now > exp]
        for k in expired:
            del self._store[k]
        if expired:
            logger.debug("Sticky provider cache: evicted %d expired entries", len(expired))


sticky_provider_cache = _StickyProviderCache()
