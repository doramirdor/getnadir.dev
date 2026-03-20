"""
Sticky provider cache for prompt-caching affinity.

When a user's request includes cache_control directives (Anthropic/OpenAI prompt caching),
subsequent requests benefit from routing to the same provider to maximize cache hits.

Stores (user_id, preset_slug) -> provider_name in-process with a 1-hour TTL.
Best-effort: data is lost on restart and not shared across workers.
"""

import time
import logging
from typing import Optional, Dict, Tuple

logger = logging.getLogger(__name__)

_TTL_SECONDS = 3600  # 1 hour


class _StickyProviderCache:
    """In-memory TTL cache mapping (user_id, preset_slug) to a provider name."""

    def __init__(self):
        self._store: Dict[Tuple[str, str], Tuple[str, float]] = {}

    def get(self, user_id: str, preset_slug: str) -> Optional[str]:
        """Return the cached provider for this user+preset, or None if expired/missing."""
        key = (user_id, preset_slug)
        entry = self._store.get(key)
        if entry is None:
            return None
        provider, expires_at = entry
        if time.time() > expires_at:
            self._store.pop(key, None)  # safe under async concurrency
            return None
        return provider

    def set(self, user_id: str, preset_slug: str, provider: str) -> None:
        """Store a provider for this user+preset with a 1-hour TTL."""
        key = (user_id, preset_slug)
        self._store[key] = (provider, time.time() + _TTL_SECONDS)
        # Periodic cleanup: evict if store is large
        if len(self._store) > 5000:
            self._evict_expired()

    def _evict_expired(self) -> None:
        """Remove all expired entries."""
        now = time.time()
        expired = [k for k, (_, exp) in self._store.items() if now > exp]
        for k in expired:
            del self._store[k]
        if expired:
            logger.debug("Sticky provider cache: evicted %d expired entries", len(expired))


# Module-level singleton
sticky_provider_cache = _StickyProviderCache()
