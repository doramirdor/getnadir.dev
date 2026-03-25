"""
Circuit Breaker middleware for LLM provider calls.

States: closed → open (after N failures) → half-open (after timeout) → closed (on success)
"""

import time
import logging
from typing import Dict, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class ProviderCircuitBreaker:
    """Per-provider circuit breaker."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max_calls: int = 1,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        # Per-provider state
        self._states: Dict[str, CircuitState] = {}
        self._failure_counts: Dict[str, int] = {}
        self._last_failure_time: Dict[str, float] = {}
        self._half_open_calls: Dict[str, int] = {}

    def _get_state(self, provider: str) -> CircuitState:
        state = self._states.get(provider, CircuitState.CLOSED)
        if state == CircuitState.OPEN:
            last_failure = self._last_failure_time.get(provider, 0)
            if time.time() - last_failure >= self.recovery_timeout:
                self._states[provider] = CircuitState.HALF_OPEN
                self._half_open_calls[provider] = 0
                return CircuitState.HALF_OPEN
        return state

    def can_execute(self, provider: str) -> bool:
        """Check if a call to this provider is allowed."""
        state = self._get_state(provider)
        if state == CircuitState.CLOSED:
            return True
        if state == CircuitState.HALF_OPEN:
            return self._half_open_calls.get(provider, 0) < self.half_open_max_calls
        return False  # OPEN

    def record_success(self, provider: str):
        """Record a successful call — resets the breaker."""
        self._states[provider] = CircuitState.CLOSED
        self._failure_counts[provider] = 0
        self._half_open_calls.pop(provider, None)

    def record_failure(self, provider: str):
        """Record a failed call — may trip the breaker."""
        state = self._get_state(provider)
        if state == CircuitState.HALF_OPEN:
            # Failure during half-open → back to open
            self._states[provider] = CircuitState.OPEN
            self._last_failure_time[provider] = time.time()
            logger.warning(f"Circuit breaker for {provider}: HALF_OPEN → OPEN")
            return

        count = self._failure_counts.get(provider, 0) + 1
        self._failure_counts[provider] = count

        if count >= self.failure_threshold:
            self._states[provider] = CircuitState.OPEN
            self._last_failure_time[provider] = time.time()
            logger.warning(f"Circuit breaker for {provider}: CLOSED → OPEN (failures={count})")

    def get_status(self) -> Dict[str, Dict]:
        """Return status of all tracked providers."""
        result = {}
        for provider in set(list(self._states.keys()) + list(self._failure_counts.keys())):
            result[provider] = {
                "state": self._get_state(provider).value,
                "failure_count": self._failure_counts.get(provider, 0),
            }
        return result


# Global instance
circuit_breaker = ProviderCircuitBreaker()
