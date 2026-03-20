"""
Rate Limiting middleware using token bucket algorithm.

Per-API-key rate limiting with configurable limits per pricing tier.
Returns X-RateLimit-Remaining and X-RateLimit-Reset headers.
"""

import hashlib
import time
import logging
from typing import Dict, Tuple
from fastapi import HTTPException, Request, Depends

from app.settings import settings

logger = logging.getLogger(__name__)


class TokenBucket:
    """Simple token bucket rate limiter."""

    def __init__(self, rate: int, capacity: int):
        """
        Args:
            rate: tokens added per second
            capacity: maximum bucket size
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now

    def consume(self) -> Tuple[bool, int, float]:
        """
        Try to consume one token.

        Returns:
            (allowed, remaining, reset_seconds)
        """
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return (True, int(self.tokens), 0.0)
        # Time until next token
        wait = (1 - self.tokens) / self.rate if self.rate > 0 else 60.0
        return (False, 0, wait)


class RateLimiter:
    """Per-API-key rate limiter.

    In multi-instance deployments (e.g. GCP App Engine with N instances),
    each instance holds its own in-memory state.  Set the env var
    ``RATE_LIMIT_INSTANCE_DIVISOR=N`` so each instance enforces ``RPM / N``,
    giving a correct aggregate rate limit across the cluster.
    """

    def __init__(self):
        self._buckets: Dict[str, TokenBucket] = {}
        self._divisor: int = max(1, settings.RATE_LIMIT_INSTANCE_DIVISOR)
        if self._divisor > 1:
            logger.info(
                "Rate limiter: dividing per-key capacity by %d (multi-instance mode)",
                self._divisor,
            )

    def get_bucket(self, api_key_id: str, rate_per_minute: int = None) -> TokenBucket:
        """Get or create a token bucket for an API key."""
        if api_key_id not in self._buckets:
            rpm = rate_per_minute or settings.RATE_LIMIT_PER_MINUTE
            effective_rpm = max(1, rpm // self._divisor)
            rate_per_second = effective_rpm / 60.0
            self._buckets[api_key_id] = TokenBucket(rate=rate_per_second, capacity=effective_rpm)
        return self._buckets[api_key_id]

    def check_rate_limit(self, api_key_id: str, rate_per_minute: int = None) -> Tuple[bool, int, float]:
        """Check if a request is allowed under rate limit."""
        bucket = self.get_bucket(api_key_id, rate_per_minute)
        return bucket.consume()


# Global instance
rate_limiter = RateLimiter()


async def check_rate_limit(request: Request):
    """FastAPI dependency for rate limiting on completion endpoints."""
    # Extract API key from header for rate-limit bucketing
    api_key = request.headers.get("X-API-Key", "anonymous")
    # Hash the full key to avoid collisions between different users
    bucket_key = hashlib.sha256(api_key.encode()).hexdigest()[:16]

    allowed, remaining, reset_seconds = rate_limiter.check_rate_limit(bucket_key)

    # Store for response headers (middleware or endpoint can read these)
    request.state.rate_limit_remaining = remaining
    request.state.rate_limit_reset = reset_seconds

    if not allowed:
        from app.metrics import RATE_LIMIT_REJECTIONS_TOTAL
        RATE_LIMIT_REJECTIONS_TOTAL.inc()
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(reset_seconds)),
                "Retry-After": str(int(reset_seconds) + 1),
            },
        )
