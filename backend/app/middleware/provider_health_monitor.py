"""
Provider Health Monitor — rolling-window health scores per LLM provider.

Wraps the existing circuit breaker with latency tracking, success-rate
computation, and a composite health score (0.0–1.0) that the model ranker
can use to down-weight unhealthy providers.
"""

import time
import logging
from collections import deque
from typing import Dict, Any
from dataclasses import dataclass, field

from app.middleware.circuit_breaker import circuit_breaker, CircuitState
from app.settings import settings

logger = logging.getLogger(__name__)

# Configurable constants
WINDOW_SIZE = getattr(settings, "HEALTH_MONITOR_WINDOW_SIZE", 100)


@dataclass
class _RequestRecord:
    """Single request outcome."""
    timestamp: float
    latency_ms: float
    success: bool
    zero_completion: bool = False


class ProviderHealthMonitor:
    """Rolling-window health scoring per provider, wrapping the circuit breaker."""

    # Weight allocation for composite score
    W_SUCCESS_RATE = 0.4
    W_LATENCY = 0.3
    W_ERROR_TREND = 0.2
    W_CIRCUIT = 0.1

    # Baseline p95 latency per provider (ms) — used to normalize latency score
    DEFAULT_BASELINE_P95 = 5_000  # 5s default

    def __init__(self, window_size: int = WINDOW_SIZE):
        self.window_size = window_size
        self._windows: Dict[str, deque] = {}
        # Provider-specific latency baselines (auto-calibrated)
        self._baselines: Dict[str, float] = {}

    # ── Recording ────────────────────────────────────────────────────

    def record_success(self, provider: str, latency_ms: float = 0):
        """Record a successful request."""
        circuit_breaker.record_success(provider)
        self._append(provider, _RequestRecord(
            timestamp=time.time(),
            latency_ms=latency_ms,
            success=True,
        ))

    def record_failure(self, provider: str, latency_ms: float = 0):
        """Record a failed request."""
        circuit_breaker.record_failure(provider)
        self._append(provider, _RequestRecord(
            timestamp=time.time(),
            latency_ms=latency_ms,
            success=False,
        ))

    def record_zero_completion(self, provider: str, latency_ms: float = 0):
        """Record a zero-completion (success at HTTP level but empty content)."""
        self._append(provider, _RequestRecord(
            timestamp=time.time(),
            latency_ms=latency_ms,
            success=True,
            zero_completion=True,
        ))

    # ── Queries ──────────────────────────────────────────────────────

    def can_execute(self, provider: str) -> bool:
        """Delegate to circuit breaker."""
        return circuit_breaker.can_execute(provider)

    def get_health_score(self, provider: str) -> float:
        """
        Compute a composite health score between 0.0 (dead) and 1.0 (perfect).

        Components:
        - Success rate (weight 0.4)
        - Latency p95 vs baseline (weight 0.3)
        - Error trend — recent vs older errors (weight 0.2)
        - Circuit breaker state (weight 0.1)
        """
        window = self._windows.get(provider)
        if not window:
            return 1.0  # No data → assume healthy

        records = list(window)
        n = len(records)
        if n == 0:
            return 1.0

        # 1. Success rate
        successes = sum(1 for r in records if r.success and not r.zero_completion)
        success_rate = successes / n

        # 2. Latency p95 score
        latencies = sorted(r.latency_ms for r in records if r.success and r.latency_ms > 0)
        if latencies:
            p95_idx = int(len(latencies) * 0.95)
            p95 = latencies[min(p95_idx, len(latencies) - 1)]
            baseline = self._baselines.get(provider, self.DEFAULT_BASELINE_P95)
            # Score: 1.0 when p95 <= baseline, degrades linearly to 0.0 at 3x baseline
            latency_score = max(0.0, min(1.0, 1.0 - (p95 - baseline) / (2 * baseline)))
        else:
            latency_score = 1.0

        # 3. Error trend — compare error rate in recent half vs older half
        mid = n // 2
        if mid > 0:
            older_errors = sum(1 for r in records[:mid] if not r.success) / mid
            recent_errors = sum(1 for r in records[mid:] if not r.success) / (n - mid)
            # If recent errors are increasing → lower score
            if older_errors > 0:
                trend_ratio = recent_errors / older_errors
            elif recent_errors > 0:
                trend_ratio = 2.0  # Errors appearing where there were none
            else:
                trend_ratio = 0.0
            trend_score = max(0.0, min(1.0, 1.0 - (trend_ratio - 1.0)))
        else:
            trend_score = 1.0

        # 4. Circuit breaker state
        cb_state = circuit_breaker._get_state(provider)
        if cb_state == CircuitState.CLOSED:
            cb_score = 1.0
        elif cb_state == CircuitState.HALF_OPEN:
            cb_score = 0.5
        else:
            cb_score = 0.0

        composite = (
            self.W_SUCCESS_RATE * success_rate
            + self.W_LATENCY * latency_score
            + self.W_ERROR_TREND * trend_score
            + self.W_CIRCUIT * cb_score
        )

        return round(max(0.0, min(1.0, composite)), 4)

    def get_all_health(self) -> Dict[str, Dict[str, Any]]:
        """Return health snapshot for every tracked provider."""
        providers = set(list(self._windows.keys()) + list(circuit_breaker._states.keys()))
        result = {}
        for p in providers:
            window = self._windows.get(p)
            n = len(window) if window else 0
            result[p] = {
                "health_score": self.get_health_score(p),
                "requests_in_window": n,
                "circuit_state": circuit_breaker._get_state(p).value,
            }
        return result

    # ── Internal ─────────────────────────────────────────────────────

    def _append(self, provider: str, record: _RequestRecord):
        if provider not in self._windows:
            self._windows[provider] = deque(maxlen=self.window_size)
        self._windows[provider].append(record)

        # Auto-calibrate baseline from the first window of successful latencies
        if provider not in self._baselines:
            successes = [r.latency_ms for r in self._windows[provider]
                         if r.success and r.latency_ms > 0]
            if len(successes) >= 10:
                sorted_lat = sorted(successes)
                p95_idx = int(len(sorted_lat) * 0.95)
                self._baselines[provider] = sorted_lat[min(p95_idx, len(sorted_lat) - 1)]


# Global singleton
health_monitor = ProviderHealthMonitor()
