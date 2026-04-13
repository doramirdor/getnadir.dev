"""
OCR — Outcome-Conditioned Routing engine for NadirClaw.

Closed-loop adaptive model selection that learns from every LLM response.
Components:
  - DualChannelCapacity: Per-model capacity estimates updated via two channels
  - CapacityProber: Opportunistic boundary probing with 3:2 asymmetric updates
  - CalibrationProbe: Cross-tier comparative probing for bidirectional capacity recovery
  - ThompsonSamplingBandit: Contextual within-tier model selection (d=8)
  - COS: Composite Outcome Score for bandit reward
  - OCRRouter: Orchestrator tying everything together

Architecture informed by paper findings:
  - Calibration probes are the PRIMARY learning mechanism. Without them,
    dual-channel updates make routing WORSE than a static router (+35.8%
    cost vs +32.0% for static). With calibration: +15.0%.
  - Channel 2 (cost residuals) is dampened (weight=0.3) because the signal
    vanishes near the capacity boundary where routing decisions matter most.
  - Channel 1 (quality failures) is kept at full strength for fast degradation
    detection (~100 requests to detect a -0.20 capacity drop).
  - Top-tier models are FROZEN: no dual-channel updates applied, because
    there's no cross-tier calibration signal above them. Error >0.5 in all
    experiments when updates are applied. Trust the static classifier instead.
  - Learning rate ratio is 3:1 (eta_q=0.05, eta_c=0.017), not the
    theoretically-predicted 10:1, because 3:1 empirically dominates.
"""

import hashlib
import json
import logging
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger("nadirclaw.ocr")

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------

DEFAULT_ETA_QUALITY = 0.05       # Channel 1 learning rate (fast, downward)
DEFAULT_ETA_COST = 0.017         # Channel 2 learning rate — 3:1 ratio (was 10:1)
                                 # Paper Table eta_sweep: 3:1 empirically dominates 10:1
DEFAULT_SIGMA_BOUNDARY = 0.15    # Relevance kernel width
DEFAULT_COST_CHANNEL_WEIGHT = 0.3  # Dampen Channel 2 near boundary (unreliable signal)
DEFAULT_WARMUP_BONUS = 2.0       # Multiplier for first 500 req/model
DEFAULT_WARMUP_REQUESTS = 500    # Requests before warmup bonus expires
DEFAULT_PROBE_INTERVAL = 500     # Requests between probes per model
DEFAULT_PROBE_SUCCESS = 0.015    # Capacity step on probe success
DEFAULT_PROBE_FAILURE = -0.010   # Capacity step on probe failure
DEFAULT_PROBE_MARGIN_START = 0.15
DEFAULT_PROBE_MARGIN_MAX = 0.40
DEFAULT_PROBE_MARGIN_STEP = 0.005
DEFAULT_CLIP_MIN = 0.05
DEFAULT_CLIP_MAX = 0.95
DEFAULT_TS_DIM = 8               # Thompson Sampling context dimension
DEFAULT_COS_QUALITY_W = 0.50
DEFAULT_COS_LATENCY_W = 0.25
DEFAULT_COS_COST_W = 0.25
DEFAULT_PERSIST_INTERVAL = 100   # Persist state every N updates

# Calibration probe defaults — this is the PRIMARY learning mechanism.
# Paper finding: calibration alone outperforms all baselines; dual-channel
# alone is worse than static routing. Calibration must be aggressive.
DEFAULT_CALIBRATION_INTERVAL = 30     # Requests between calibration probes (was 50)
DEFAULT_CALIBRATION_UP_STEP = 0.04    # Capacity boost when cheaper model succeeds (was 0.03)
DEFAULT_CALIBRATION_DOWN_STEP = 0.01  # Capacity reduction when cheaper model fails
DEFAULT_CALIBRATION_UNCERTAINTY_THRESHOLD = 0.10  # Min uncertainty to trigger adaptive probing
DEFAULT_CALIBRATION_MIN_INTERVAL = 15  # Minimum interval even under high uncertainty (was 20)


# ---------------------------------------------------------------------------
# Composite Outcome Score (COS)
# ---------------------------------------------------------------------------

def _sigmoid(x: float, scale: float = 5.0) -> float:
    """Sigmoid with configurable steepness."""
    clamped = max(-10.0, min(10.0, x * scale))
    return 1.0 / (1.0 + math.exp(-clamped))


def compute_cos(
    quality: float,
    latency_residual: float,
    cost_residual: float,
    w_quality: float = DEFAULT_COS_QUALITY_W,
    w_latency: float = DEFAULT_COS_LATENCY_W,
    w_cost: float = DEFAULT_COS_COST_W,
) -> float:
    """Compute Composite Outcome Score.

    Used ONLY as the Thompson Sampling bandit reward.
    Capacity updates use raw signals directly (not COS).

    Args:
        quality: 1.0 if response is valid, 0.0 otherwise
        latency_residual: (expected - actual) / expected (positive = faster)
        cost_residual: (expected - actual) / expected (positive = cheaper)
    """
    return (
        w_quality * quality
        + w_latency * _sigmoid(latency_residual)
        + w_cost * _sigmoid(cost_residual)
    )


# ---------------------------------------------------------------------------
# Dual-Channel Capacity Estimator
# ---------------------------------------------------------------------------

@dataclass
class ModelCapacity:
    """Per-model capacity state."""
    capacity: float = 0.5          # C_k in [0, 1]
    request_count: int = 0         # Total requests seen
    quality_failures: int = 0      # Channel 1 fire count
    cost_updates: int = 0          # Channel 2 fire count

    # Prober state
    probe_armed: bool = False
    probe_requests_since: int = 0  # Requests since last probe
    probe_margin: float = DEFAULT_PROBE_MARGIN_START
    probe_wait_count: int = 0      # Requests waiting for suitable prompt
    probes_fired: int = 0


class DualChannelCapacity:
    """Per-model capacity estimation with dual-channel updates.

    Channel 1 (Quality): Fast downward updates on quality failures.
    Channel 2 (Cost): Slow bidirectional updates on cost efficiency.

    Both channels use relevance weighting — updates are strongest when
    R_hat is near the model's capacity boundary.
    """

    def __init__(
        self,
        models: List[str],
        initial_capacities: Optional[Dict[str, float]] = None,
        eta_quality: float = DEFAULT_ETA_QUALITY,
        eta_cost: float = DEFAULT_ETA_COST,
        sigma_boundary: float = DEFAULT_SIGMA_BOUNDARY,
        cost_channel_weight: float = DEFAULT_COST_CHANNEL_WEIGHT,
        warmup_bonus: float = DEFAULT_WARMUP_BONUS,
        warmup_requests: int = DEFAULT_WARMUP_REQUESTS,
        clip_min: float = DEFAULT_CLIP_MIN,
        clip_max: float = DEFAULT_CLIP_MAX,
        frozen_models: Optional[List[str]] = None,
    ):
        self.eta_quality = eta_quality
        self.eta_cost = eta_cost
        self.sigma_boundary = sigma_boundary
        self.cost_channel_weight = cost_channel_weight
        self.warmup_bonus = warmup_bonus
        self.warmup_requests = warmup_requests
        self.clip_min = clip_min
        self.clip_max = clip_max
        # Top-tier models whose capacity should NOT be updated by
        # dual-channel feedback (paper: top-tier error >0.5 always,
        # updating makes things worse). Trust the static classifier.
        self.frozen_models: set = set(frozen_models or [])
        self._lock = Lock()

        # Initialize per-model capacity
        self.models: Dict[str, ModelCapacity] = {}
        for model in models:
            init_c = 0.5
            if initial_capacities and model in initial_capacities:
                init_c = initial_capacities[model]
            self.models[model] = ModelCapacity(capacity=init_c)

    def _relevance(self, r_hat: float, capacity: float) -> float:
        """Gaussian relevance weighting — high near the boundary."""
        diff = r_hat - capacity
        return math.exp(-(diff ** 2) / (2 * self.sigma_boundary ** 2))

    def _effective_eta_cost(self, model_state: ModelCapacity) -> float:
        """Channel 2 learning rate with warmup bonus."""
        if model_state.request_count < self.warmup_requests:
            return self.eta_cost * (1 + self.warmup_bonus)
        return self.eta_cost

    def update(
        self,
        model: str,
        r_hat: float,
        quality: float,
        cost_residual: float,
    ) -> Dict[str, Any]:
        """Update capacity estimate for a model after observing an outcome.

        Args:
            model: Model identifier
            r_hat: Classifier's complexity estimate for the prompt
            quality: 1.0 if valid response, 0.0 otherwise
            cost_residual: (expected_cost - actual_cost) / expected_cost

        Returns:
            Dict with update details for logging.
        """
        with self._lock:
            if model not in self.models:
                self.models[model] = ModelCapacity()

            state = self.models[model]
            old_capacity = state.capacity
            state.request_count += 1
            state.probe_requests_since += 1

            # Top-tier models are frozen: dual-channel updates make
            # things worse because there's no cross-tier calibration
            # signal to counteract drift. Trust the static classifier.
            if model in self.frozen_models:
                return {
                    "model": model,
                    "channel": "frozen",
                    "old_capacity": round(old_capacity, 6),
                    "new_capacity": round(old_capacity, 6),
                    "delta": 0.0,
                    "relevance": 0.0,
                    "request_count": state.request_count,
                }

            relevance = self._relevance(r_hat, state.capacity)
            channel = None
            delta = 0.0

            if quality < 1.0:
                # Channel 1: Quality failure — fast downward
                # This channel is reliable: failures are unambiguous
                delta = self.eta_quality * relevance * (quality - 1.0)
                state.quality_failures += 1
                channel = "quality"
            else:
                # Channel 2: Cost efficiency — slow bidirectional
                # DAMPENED: paper shows cost signal vanishes near the
                # boundary (where it matters most). Apply weight < 1.0
                # to reduce noise injection from unreliable signal.
                eta = self._effective_eta_cost(state)
                delta = eta * relevance * cost_residual * self.cost_channel_weight
                state.cost_updates += 1
                channel = "cost"

            state.capacity = max(
                self.clip_min,
                min(self.clip_max, state.capacity + delta),
            )

            return {
                "model": model,
                "channel": channel,
                "old_capacity": round(old_capacity, 6),
                "new_capacity": round(state.capacity, 6),
                "delta": round(delta, 6),
                "relevance": round(relevance, 4),
                "request_count": state.request_count,
            }

    def get_capacity(self, model: str) -> float:
        """Get current capacity estimate for a model."""
        with self._lock:
            if model in self.models:
                return self.models[model].capacity
            return 0.5

    def get_all_capacities(self) -> Dict[str, float]:
        """Get all model capacity estimates."""
        with self._lock:
            return {m: s.capacity for m, s in self.models.items()}

    def add_model(self, model: str, initial_capacity: float = 0.5) -> None:
        """Add a new model to track."""
        with self._lock:
            if model not in self.models:
                self.models[model] = ModelCapacity(capacity=initial_capacity)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize state for persistence."""
        with self._lock:
            return {
                model: {
                    "capacity": s.capacity,
                    "request_count": s.request_count,
                    "quality_failures": s.quality_failures,
                    "cost_updates": s.cost_updates,
                    "probes_fired": s.probes_fired,
                }
                for model, s in self.models.items()
            }

    def load_dict(self, data: Dict[str, Any]) -> None:
        """Restore state from persisted data."""
        with self._lock:
            for model, vals in data.items():
                if model not in self.models:
                    self.models[model] = ModelCapacity()
                s = self.models[model]
                s.capacity = vals.get("capacity", 0.5)
                s.request_count = vals.get("request_count", 0)
                s.quality_failures = vals.get("quality_failures", 0)
                s.cost_updates = vals.get("cost_updates", 0)
                s.probes_fired = vals.get("probes_fired", 0)


# ---------------------------------------------------------------------------
# Capacity Prober
# ---------------------------------------------------------------------------

class CapacityProber:
    """Opportunistic boundary probing with 3:2 asymmetric updates.

    Every `probe_interval` requests per model, arms a probe. The probe
    fires on the next natural prompt with R_hat near the capacity boundary.
    Updates are asymmetric: +0.015 on success, -0.010 on failure (3:2 ratio)
    to maintain mild upward exploration pressure.

    Equilibrium bias: +0.0025/probe, absorbed by Channel 2 at ~12x the rate.
    """

    def __init__(
        self,
        capacity_estimator: DualChannelCapacity,
        probe_interval: int = DEFAULT_PROBE_INTERVAL,
        probe_success: float = DEFAULT_PROBE_SUCCESS,
        probe_failure: float = DEFAULT_PROBE_FAILURE,
        margin_start: float = DEFAULT_PROBE_MARGIN_START,
        margin_max: float = DEFAULT_PROBE_MARGIN_MAX,
        margin_step: float = DEFAULT_PROBE_MARGIN_STEP,
    ):
        self.capacity = capacity_estimator
        self.probe_interval = probe_interval
        self.probe_success = probe_success
        self.probe_failure = probe_failure
        self.margin_start = margin_start
        self.margin_max = margin_max
        self.margin_step = margin_step

    def should_probe(self, model: str, r_hat: float) -> bool:
        """Check if a probe should fire for this model on this request.

        A probe is armed every `probe_interval` requests. Once armed,
        it fires on the next prompt with R_hat in [C, C + margin].
        The margin expands over time to prevent probes from never firing.
        """
        with self.capacity._lock:
            if model not in self.capacity.models:
                return False

            state = self.capacity.models[model]

            # Arm the probe if interval reached
            if (
                not state.probe_armed
                and state.probe_requests_since >= self.probe_interval
            ):
                state.probe_armed = True
                state.probe_margin = self.margin_start
                state.probe_wait_count = 0

            if not state.probe_armed:
                return False

            # Check if R_hat is in the probe zone [C, C + margin]
            c = state.capacity
            if c <= r_hat <= c + state.probe_margin:
                return True

            # Expand margin (expanding window safety)
            state.probe_wait_count += 1
            state.probe_margin = min(
                self.margin_max,
                state.probe_margin + self.margin_step,
            )
            return False

    def apply_probe_result(self, model: str, quality: float) -> Dict[str, Any]:
        """Apply probe outcome to capacity estimate.

        3:2 asymmetric: success +0.015, failure -0.010.
        """
        with self.capacity._lock:
            if model not in self.capacity.models:
                return {"probed": False}

            state = self.capacity.models[model]
            old_c = state.capacity

            if quality >= 1.0:
                delta = self.probe_success
            else:
                delta = self.probe_failure

            state.capacity = max(
                self.capacity.clip_min,
                min(self.capacity.clip_max, state.capacity + delta),
            )
            state.probe_armed = False
            state.probe_requests_since = 0
            state.probes_fired += 1

            return {
                "probed": True,
                "model": model,
                "quality": quality,
                "delta": delta,
                "old_capacity": round(old_c, 6),
                "new_capacity": round(state.capacity, 6),
                "total_probes": state.probes_fired,
            }


# ---------------------------------------------------------------------------
# Calibration Probe — Cross-Tier Comparative Probing
# ---------------------------------------------------------------------------

class CalibrationProbe:
    """Cross-tier calibration probing for bidirectional capacity recovery.

    The key insight: dual-channel updates alone cannot recover from capacity
    UNDER-estimation because Channel 1 only fires downward and Channel 2's
    cost signal is zero-mean. CalibrationProbe fixes this by periodically
    routing a request to both the selected model AND one tier cheaper.

    If the cheaper model succeeds: its capacity should be HIGHER → push up.
    If the cheaper model fails: confirms the boundary is correct.

    Probe frequency adapts to uncertainty: when recent quality outcomes are
    volatile (high variance), probe more often to pin down the boundary.

    Published routers (RouteLLM, Martian, FrugalGPT) are open-loop;
    cross-tier calibration may exist in unpublished production systems.
    """

    def __init__(
        self,
        capacity_estimator: DualChannelCapacity,
        tier_order: List[str],  # ordered cheap → expensive
        tier_models: Dict[str, List[str]],
        calibration_interval: int = DEFAULT_CALIBRATION_INTERVAL,
        up_step: float = DEFAULT_CALIBRATION_UP_STEP,
        down_step: float = DEFAULT_CALIBRATION_DOWN_STEP,
        uncertainty_threshold: float = DEFAULT_CALIBRATION_UNCERTAINTY_THRESHOLD,
        min_interval: int = DEFAULT_CALIBRATION_MIN_INTERVAL,
    ):
        self.capacity = capacity_estimator
        self.tier_order = tier_order
        self.tier_models = tier_models
        self.calibration_interval = calibration_interval
        self.up_step = up_step
        self.down_step = down_step
        self.uncertainty_threshold = uncertainty_threshold
        self.min_interval = min_interval

        # Per-model tracking for adaptive scheduling
        self._requests_since_calibration: Dict[str, int] = {}
        self._recent_qualities: Dict[str, List[float]] = {}  # sliding window
        self._calibration_count: Dict[str, int] = {}
        self._quality_window_size = 20

        # Pending calibration: maps model -> cheaper_model to also evaluate
        self._pending_calibration: Optional[Dict[str, str]] = None

    def _get_uncertainty(self, model: str) -> float:
        """Estimate capacity uncertainty from recent quality variance.

        High variance in recent outcomes → uncertain about boundary position.
        """
        quals = self._recent_qualities.get(model, [])
        if len(quals) < 5:
            return 1.0  # High uncertainty when few observations
        mean_q = sum(quals) / len(quals)
        variance = sum((q - mean_q) ** 2 for q in quals) / len(quals)
        return min(1.0, math.sqrt(variance) * 2.0)  # Scale to [0, 1]

    def _effective_interval(self, model: str) -> int:
        """Compute adaptive probe interval based on uncertainty.

        High uncertainty → shorter interval (probe more).
        Low uncertainty → longer interval (probe less).
        """
        uncertainty = self._get_uncertainty(model)
        if uncertainty > self.uncertainty_threshold:
            # Scale interval: at max uncertainty, use min_interval
            # At threshold, use calibration_interval
            ratio = (uncertainty - self.uncertainty_threshold) / (1.0 - self.uncertainty_threshold)
            interval = int(
                self.calibration_interval - ratio * (self.calibration_interval - self.min_interval)
            )
            return max(self.min_interval, interval)
        return self.calibration_interval

    def _get_cheaper_tier(self, model: str) -> Optional[str]:
        """Find one tier cheaper than this model's tier."""
        for tier, models in self.tier_models.items():
            if model in models:
                idx = self.tier_order.index(tier)
                if idx > 0:
                    return self.tier_order[idx - 1]
                return None
        return None

    def record_quality(self, model: str, quality: float) -> None:
        """Track quality outcomes for uncertainty estimation."""
        if model not in self._recent_qualities:
            self._recent_qualities[model] = []
        self._recent_qualities[model].append(quality)
        # Keep sliding window
        if len(self._recent_qualities[model]) > self._quality_window_size:
            self._recent_qualities[model] = self._recent_qualities[model][-self._quality_window_size:]

    def should_calibrate(self, model: str, r_hat: float) -> Optional[str]:
        """Check if we should trigger a calibration probe.

        Returns the cheaper model to also evaluate, or None.

        A calibration fires when:
        1. Enough requests since last calibration (adaptive interval)
        2. The prompt is near a tier boundary (r_hat near a capacity value)
        3. There exists a cheaper tier to compare against
        """
        if model not in self._requests_since_calibration:
            self._requests_since_calibration[model] = 0

        self._requests_since_calibration[model] += 1

        interval = self._effective_interval(model)
        if self._requests_since_calibration[model] < interval:
            return None

        # Find cheaper tier
        cheaper_tier = self._get_cheaper_tier(model)
        if cheaper_tier is None:
            return None  # Already on cheapest tier

        # Pick the first model in the cheaper tier
        cheaper_models = self.tier_models.get(cheaper_tier, [])
        if not cheaper_models:
            return None

        cheaper_model = cheaper_models[0]

        # Check if r_hat is in an interesting zone (near cheaper model's capacity)
        cheaper_capacity = self.capacity.get_capacity(cheaper_model)
        # Probe when r_hat is within ±0.2 of the cheaper model's capacity boundary
        if abs(r_hat - cheaper_capacity) <= 0.25:
            self._requests_since_calibration[model] = 0
            self._calibration_count[model] = self._calibration_count.get(model, 0) + 1
            return cheaper_model

        return None

    def apply_calibration_result(
        self,
        cheaper_model: str,
        expensive_model: str,
        cheaper_quality: float,
        expensive_quality: float,
        r_hat: float,
    ) -> Dict[str, Any]:
        """Apply calibration probe results to capacity estimates.

        Logic:
        - If cheaper model succeeds (quality >= 0.7) AND expensive also succeeds:
          → Push cheaper model's capacity UP (it can handle this complexity)
        - If cheaper model fails but expensive succeeds:
          → Confirms boundary is between the two. Fine-tune both.
        - If both fail:
          → Don't update (both models are below this complexity)

        The UP step is deliberately larger than the down step (3:1 ratio)
        because the whole point of calibration is to RECOVER from under-estimation.
        """
        result: Dict[str, Any] = {
            "calibrated": True,
            "cheaper_model": cheaper_model,
            "expensive_model": expensive_model,
            "cheaper_quality": cheaper_quality,
            "expensive_quality": expensive_quality,
            "r_hat": r_hat,
        }

        with self.capacity._lock:
            cheap_state = self.capacity.models.get(cheaper_model)
            if not cheap_state:
                result["error"] = "cheaper model not found"
                return result

            old_capacity = cheap_state.capacity

            if cheaper_quality >= 0.7 and expensive_quality >= 0.7:
                # Cheaper model CAN handle this → push capacity UP
                # Use relevance weighting: stronger update when r_hat is near boundary
                relevance = self.capacity._relevance(r_hat, cheap_state.capacity)
                delta = self.up_step * max(0.3, relevance)  # Floor at 0.3 to ensure meaningful updates
                cheap_state.capacity = min(
                    self.capacity.clip_max,
                    cheap_state.capacity + delta,
                )
                result["action"] = "capacity_up"
                result["delta"] = round(delta, 6)
            elif cheaper_quality < 0.7 and expensive_quality >= 0.7:
                # Boundary is between the two — slight downward confirmation
                relevance = self.capacity._relevance(r_hat, cheap_state.capacity)
                delta = -self.down_step * relevance
                cheap_state.capacity = max(
                    self.capacity.clip_min,
                    cheap_state.capacity + delta,
                )
                result["action"] = "boundary_confirmed"
                result["delta"] = round(delta, 6)
            else:
                # Both failed — no information about the boundary
                result["action"] = "both_failed"
                result["delta"] = 0.0

            result["old_capacity"] = round(old_capacity, 6)
            result["new_capacity"] = round(cheap_state.capacity, 6)

        return result

    def get_stats(self) -> Dict[str, Any]:
        """Get calibration probe statistics."""
        return {
            model: {
                "calibration_count": self._calibration_count.get(model, 0),
                "uncertainty": round(self._get_uncertainty(model), 4),
                "effective_interval": self._effective_interval(model),
                "requests_since": self._requests_since_calibration.get(model, 0),
            }
            for model in self.capacity.models
        }


# ---------------------------------------------------------------------------
# Thompson Sampling Bandit (Contextual, d=8)
# ---------------------------------------------------------------------------

def _build_context_vector(
    r_hat: float,
    prompt_length: int,
    domain_hint: str = "",
    timestamp: Optional[float] = None,
) -> np.ndarray:
    """Build 8-dimensional context vector for Thompson Sampling.

    Features:
        [R_hat, prompt_len/1000, domain_hash(4d), hour_sin, hour_cos,
         day_sin, day_cos, is_weekend]

    Wait — that's 9. The spec says 8. Let me match exactly:
        [R_hat, prompt_len/1000, domain_hash_0, domain_hash_1,
         hour_sin, hour_cos, is_weekend, 1.0(bias)]
    """
    ts = timestamp or time.time()
    hour = (ts % 86400) / 3600.0
    day = (ts % (7 * 86400)) / 86400.0

    # Domain hash: 2 features from hash of domain hint
    if domain_hint:
        h = int(hashlib.md5(domain_hint.encode()).hexdigest()[:8], 16)
        d0 = (h & 0xFFFF) / 65535.0
        d1 = ((h >> 16) & 0xFFFF) / 65535.0
    else:
        d0, d1 = 0.5, 0.5

    return np.array([
        r_hat,
        min(prompt_length / 1000.0, 5.0),  # Capped at 5
        d0,
        d1,
        math.sin(2 * math.pi * hour / 24.0),
        math.cos(2 * math.pi * hour / 24.0),
        1.0 if day >= 5 else 0.0,  # is_weekend
        1.0,  # bias term
    ], dtype=np.float64)


class ThompsonSamplingBandit:
    """Contextual Thompson Sampling with Normal-Inverse-Gamma posterior.

    Per-arm Bayesian linear regression: y ~ N(x^T mu, sigma^2).
    Prior: mu ~ N(mu_0, sigma^2 / kappa), sigma^2 ~ IG(alpha, beta).

    Perpetual exploration via posterior sampling — never stops exploring,
    critical for detecting distribution shifts.
    """

    def __init__(self, arms: List[str], d: int = DEFAULT_TS_DIM):
        self.arms = list(arms)
        self.d = d
        self._lock = Lock()

        # Per-arm Normal-Inverse-Gamma parameters
        self._mu: Dict[str, np.ndarray] = {}      # d-dim mean
        self._Lambda: Dict[str, np.ndarray] = {}   # d x d precision matrix
        self._alpha: Dict[str, float] = {}          # IG shape
        self._beta: Dict[str, float] = {}           # IG scale
        self._n: Dict[str, int] = {}                # observation count

        for arm in arms:
            self._init_arm(arm)

    def _init_arm(self, arm: str) -> None:
        """Initialize an arm with default prior."""
        self._mu[arm] = np.full(self.d, 0.5)
        self._Lambda[arm] = np.eye(self.d)  # kappa=1 → precision = I
        self._alpha[arm] = 2.0
        self._beta[arm] = 1.0
        self._n[arm] = 0

    def select(self, context: np.ndarray) -> Tuple[str, float]:
        """Select an arm via Thompson Sampling.

        Samples from each arm's posterior and picks the argmax.
        Returns (arm_name, sampled_value).
        """
        with self._lock:
            best_arm = self.arms[0]
            best_val = -float("inf")

            for arm in self.arms:
                val = self._sample_posterior(arm, context)
                if val > best_val:
                    best_val = val
                    best_arm = arm

            return best_arm, float(best_val)

    def _sample_posterior(self, arm: str, context: np.ndarray) -> float:
        """Sample predicted reward from the posterior for one arm."""
        # Sample sigma^2 from Inverse-Gamma
        alpha = self._alpha[arm]
        beta = self._beta[arm]
        # Use Gamma to sample IG: if X ~ Gamma(alpha, 1/beta) then 1/X ~ IG
        sigma2 = 1.0 / max(1e-10, np.random.gamma(alpha, 1.0 / max(1e-10, beta)))

        # Sample mu from Normal
        Lambda = self._Lambda[arm]
        try:
            cov = sigma2 * np.linalg.inv(Lambda)
            mu_sample = np.random.multivariate_normal(self._mu[arm], cov)
        except np.linalg.LinAlgError:
            # Fallback if precision matrix is singular
            mu_sample = self._mu[arm] + np.random.normal(0, 0.1, self.d)

        return float(context @ mu_sample)

    def update(self, arm: str, context: np.ndarray, reward: float) -> None:
        """Update arm posterior with observed (context, reward) pair.

        Standard Bayesian linear regression update.
        """
        with self._lock:
            if arm not in self._mu:
                self._init_arm(arm)

            x = context.reshape(-1, 1)  # d x 1

            # Update precision matrix: Lambda_new = Lambda + x x^T
            self._Lambda[arm] = self._Lambda[arm] + x @ x.T

            # Update mean: mu_new = Lambda_new^{-1} (Lambda_old mu_old + x y)
            Lambda_new = self._Lambda[arm]
            try:
                Lambda_inv = np.linalg.inv(Lambda_new)
                old_contrib = (Lambda_new - x @ x.T) @ self._mu[arm]
                self._mu[arm] = Lambda_inv @ (old_contrib + x.flatten() * reward)
            except np.linalg.LinAlgError:
                # Regularize if singular
                Lambda_reg = Lambda_new + 1e-6 * np.eye(self.d)
                Lambda_inv = np.linalg.inv(Lambda_reg)
                old_contrib = (Lambda_reg - x @ x.T) @ self._mu[arm]
                self._mu[arm] = Lambda_inv @ (old_contrib + x.flatten() * reward)

            # Update IG parameters
            self._n[arm] += 1
            n = self._n[arm]
            self._alpha[arm] = 2.0 + n / 2.0
            # Simple update for beta: accumulate squared residual
            pred = float(context @ self._mu[arm])
            self._beta[arm] = max(
                0.01,
                self._beta[arm] + 0.5 * (reward - pred) ** 2,
            )

    def add_arm(self, arm: str) -> None:
        """Add a new arm."""
        with self._lock:
            if arm not in self._mu:
                self._init_arm(arm)

    def remove_arm(self, arm: str) -> None:
        """Remove an arm."""
        with self._lock:
            for store in (self._mu, self._Lambda, self._alpha, self._beta, self._n):
                store.pop(arm, None)
            if arm in self.arms:
                self.arms.remove(arm)

    def get_stats(self) -> Dict[str, Any]:
        """Get per-arm statistics."""
        with self._lock:
            return {
                arm: {
                    "n": self._n.get(arm, 0),
                    "mean_reward": float(np.mean(self._mu.get(arm, [0.5]))),
                }
                for arm in self.arms
            }

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for persistence."""
        with self._lock:
            return {
                arm: {
                    "mu": self._mu[arm].tolist(),
                    "Lambda": self._Lambda[arm].tolist(),
                    "alpha": self._alpha[arm],
                    "beta": self._beta[arm],
                    "n": self._n[arm],
                }
                for arm in self.arms
                if arm in self._mu
            }

    def load_dict(self, data: Dict[str, Any]) -> None:
        """Restore from persisted data."""
        with self._lock:
            for arm, vals in data.items():
                if arm not in self.arms:
                    self.arms.append(arm)
                self._mu[arm] = np.array(vals["mu"])
                self._Lambda[arm] = np.array(vals["Lambda"])
                self._alpha[arm] = vals["alpha"]
                self._beta[arm] = vals["beta"]
                self._n[arm] = vals["n"]


# ---------------------------------------------------------------------------
# OCR Router — the orchestrator
# ---------------------------------------------------------------------------

@dataclass
class OCROutcome:
    """Observed outcome from an LLM response, used for feedback."""
    quality: float            # 1.0 = valid, 0.0 = failure
    actual_latency_ms: float  # Response latency in ms
    expected_latency_ms: float  # Expected latency for this model
    actual_cost: float        # Actual cost in USD
    expected_cost: float      # Expected cost for this model


class OCRRouter:
    """Outcome-Conditioned Routing orchestrator.

    Ties together:
    - Static classifier (produces R_hat)
    - Dual-channel capacity estimator (per-model C_k)
    - Capacity prober (boundary exploration)
    - Thompson Sampling bandit (within-tier selection)
    - COS computation (bandit reward)

    Usage:
        router = OCRRouter(tier_models={"simple": [...], "complex": [...]})
        model, tier, meta = router.select(r_hat=0.3, prompt_len=50)
        # ... call the model ...
        router.observe(model, r_hat, outcome)
    """

    def __init__(
        self,
        tier_models: Dict[str, List[str]],
        initial_capacities: Optional[Dict[str, float]] = None,
        state_dir: Optional[Path] = None,
        **kwargs: Any,
    ):
        """Initialize OCR Router.

        Args:
            tier_models: Mapping from tier name to list of models.
                         Tiers should be ordered cheap → expensive.
                         e.g. {"simple": ["flash"], "mid": ["gpt4-mini"], "complex": ["gpt4"]}
            initial_capacities: Optional {model: capacity} overrides.
            state_dir: Directory for state persistence. If None, no persistence.
            **kwargs: Override default hyperparameters.
        """
        self.tier_models = tier_models
        self.state_dir = state_dir
        self._update_count = 0
        self._persist_interval = kwargs.get(
            "persist_interval", DEFAULT_PERSIST_INTERVAL
        )

        # Flatten all models
        all_models = []
        for models in tier_models.values():
            all_models.extend(models)
        all_models = list(dict.fromkeys(all_models))  # deduplicate, preserve order

        # Assign default capacities by tier position
        if initial_capacities is None:
            initial_capacities = {}
            tier_names = list(tier_models.keys())
            n_tiers = len(tier_names)
            for i, tier in enumerate(tier_names):
                # Spread capacities evenly: simple=0.35, mid=0.65, complex=0.90
                c = 0.35 + (i / max(1, n_tiers - 1)) * 0.55 if n_tiers > 1 else 0.5
                for model in tier_models[tier]:
                    if model not in initial_capacities:
                        initial_capacities[model] = round(c, 2)

        # Auto-freeze top-tier models: dual-channel updates cannot help
        # the most expensive tier (no cross-tier calibration signal exists
        # above it). Paper finding: top-tier error >0.5 in all variants.
        top_tier = list(tier_models.keys())[-1]
        frozen = list(tier_models[top_tier])
        if kwargs.get("frozen_models") is not None:
            frozen = kwargs["frozen_models"]
        elif kwargs.get("freeze_top_tier", True) is False:
            frozen = []

        # Initialize components
        self.capacity_estimator = DualChannelCapacity(
            models=all_models,
            initial_capacities=initial_capacities,
            eta_quality=kwargs.get("eta_quality", DEFAULT_ETA_QUALITY),
            eta_cost=kwargs.get("eta_cost", DEFAULT_ETA_COST),
            sigma_boundary=kwargs.get("sigma_boundary", DEFAULT_SIGMA_BOUNDARY),
            cost_channel_weight=kwargs.get("cost_channel_weight", DEFAULT_COST_CHANNEL_WEIGHT),
            warmup_bonus=kwargs.get("warmup_bonus", DEFAULT_WARMUP_BONUS),
            warmup_requests=kwargs.get("warmup_requests", DEFAULT_WARMUP_REQUESTS),
            frozen_models=frozen,
        )

        self.prober = CapacityProber(
            capacity_estimator=self.capacity_estimator,
            probe_interval=kwargs.get("probe_interval", DEFAULT_PROBE_INTERVAL),
            probe_success=kwargs.get("probe_success", DEFAULT_PROBE_SUCCESS),
            probe_failure=kwargs.get("probe_failure", DEFAULT_PROBE_FAILURE),
        )

        # Per-tier bandits
        self.bandits: Dict[str, ThompsonSamplingBandit] = {}
        ts_dim = kwargs.get("ts_dim", DEFAULT_TS_DIM)
        for tier, models in tier_models.items():
            if len(models) > 1:
                self.bandits[tier] = ThompsonSamplingBandit(
                    arms=models, d=ts_dim
                )

        # Calibration probe — cross-tier comparative probing
        tier_order = list(tier_models.keys())
        self.calibrator = CalibrationProbe(
            capacity_estimator=self.capacity_estimator,
            tier_order=tier_order,
            tier_models=tier_models,
            calibration_interval=kwargs.get(
                "calibration_interval", DEFAULT_CALIBRATION_INTERVAL
            ),
            up_step=kwargs.get("calibration_up_step", DEFAULT_CALIBRATION_UP_STEP),
            down_step=kwargs.get("calibration_down_step", DEFAULT_CALIBRATION_DOWN_STEP),
        )

        # Track which model was probed on last request
        self._last_probe: Optional[str] = None
        # Track pending calibration: (cheaper_model, expensive_model)
        self._pending_calibration: Optional[Tuple[str, str]] = None

        # Try to load persisted state
        if state_dir:
            self._load_state()

    def select(
        self,
        r_hat: float,
        prompt_length: int = 0,
        domain_hint: str = "",
        timestamp: Optional[float] = None,
    ) -> Tuple[str, str, Dict[str, Any]]:
        """Select a model for this request.

        Args:
            r_hat: Classifier's complexity score in [0, 1]
            prompt_length: Number of characters in the prompt
            domain_hint: Optional domain category string
            timestamp: Optional unix timestamp (defaults to now)

        Returns:
            (model_name, tier_name, metadata_dict)
        """
        self._last_probe = None
        capacities = self.capacity_estimator.get_all_capacities()
        meta: Dict[str, Any] = {"r_hat": r_hat, "capacities": capacities}

        # Step 1: Tier routing — cheapest model where C_k >= R_hat
        selected_tier = None
        tier_candidates: List[str] = []

        for tier, models in self.tier_models.items():
            # Check if any model in this tier can handle the prompt
            can_handle = any(capacities.get(m, 0.5) >= r_hat for m in models)
            if can_handle:
                selected_tier = tier
                tier_candidates = [
                    m for m in models if capacities.get(m, 0.5) >= r_hat
                ]
                break

        # Fallback to last (most expensive) tier if nothing matches
        if selected_tier is None:
            tier_list = list(self.tier_models.keys())
            selected_tier = tier_list[-1]
            tier_candidates = list(self.tier_models[selected_tier])

        meta["selected_tier"] = selected_tier

        # Step 2: Within-tier selection
        if len(tier_candidates) == 1:
            selected_model = tier_candidates[0]
            meta["selection_method"] = "single_candidate"
        elif selected_tier in self.bandits:
            ctx = _build_context_vector(
                r_hat, prompt_length, domain_hint, timestamp
            )
            selected_model, ts_value = self.bandits[selected_tier].select(ctx)
            # Ensure selected model is in candidates
            if selected_model not in tier_candidates:
                selected_model = tier_candidates[0]
            meta["selection_method"] = "thompson_sampling"
            meta["ts_value"] = round(ts_value, 4)
        else:
            selected_model = tier_candidates[0]
            meta["selection_method"] = "first_candidate"

        # Step 3: Check if prober wants to fire
        for model in capacities:
            if self.prober.should_probe(model, r_hat):
                # Override selection to probe this model
                self._last_probe = model
                meta["probe_target"] = model
                # Only override if the probe model is in the same tier
                # to avoid sending simple prompts to premium models
                probe_tier = self._get_model_tier(model)
                if probe_tier == selected_tier:
                    selected_model = model
                    meta["selection_method"] = "probe_override"
                break

        # Step 4: Check if calibration probe should fire
        self._pending_calibration = None
        cheaper_model = self.calibrator.should_calibrate(selected_model, r_hat)
        if cheaper_model:
            self._pending_calibration = (cheaper_model, selected_model)
            meta["calibration_pending"] = cheaper_model
            meta["calibration_reason"] = (
                f"uncertainty={self.calibrator._get_uncertainty(selected_model):.3f}, "
                f"interval={self.calibrator._effective_interval(selected_model)}"
            )

        meta["selected_model"] = selected_model
        return selected_model, selected_tier, meta

    def observe(
        self,
        model: str,
        r_hat: float,
        outcome: OCROutcome,
        prompt_length: int = 0,
        domain_hint: str = "",
        timestamp: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Observe the outcome of a routed request and update all components.

        Args:
            model: The model that handled the request
            r_hat: The complexity score for this prompt
            outcome: Observed quality, latency, and cost
            prompt_length: Prompt character count
            domain_hint: Optional domain string
            timestamp: Optional unix timestamp

        Returns:
            Dict with all update details.
        """
        result: Dict[str, Any] = {}

        # Compute residuals
        latency_residual = 0.0
        if outcome.expected_latency_ms > 0:
            latency_residual = (
                (outcome.expected_latency_ms - outcome.actual_latency_ms)
                / outcome.expected_latency_ms
            )

        cost_residual = 0.0
        if outcome.expected_cost > 0:
            cost_residual = (
                (outcome.expected_cost - outcome.actual_cost)
                / outcome.expected_cost
            )

        # 1. Compute COS (for bandit only)
        cos = compute_cos(outcome.quality, latency_residual, cost_residual)
        result["cos"] = round(cos, 4)

        # 2. Dual-channel capacity update (uses raw signals)
        cap_update = self.capacity_estimator.update(
            model=model,
            r_hat=r_hat,
            quality=outcome.quality,
            cost_residual=cost_residual,
        )
        result["capacity_update"] = cap_update

        # 3. Probe result (if this was a probed request)
        if self._last_probe == model:
            probe_result = self.prober.apply_probe_result(model, outcome.quality)
            result["probe"] = probe_result
            self._last_probe = None

        # 4. Track quality for calibration uncertainty estimation
        self.calibrator.record_quality(model, outcome.quality)

        # 5. Thompson Sampling update (uses COS as reward)
        tier = self._get_model_tier(model)
        if tier and tier in self.bandits:
            ctx = _build_context_vector(
                r_hat, prompt_length, domain_hint, timestamp
            )
            self.bandits[tier].update(model, ctx, cos)
            result["bandit_update"] = {"tier": tier, "arm": model, "reward": cos}

        # 6. Periodic persistence
        self._update_count += 1
        if self.state_dir and self._update_count % self._persist_interval == 0:
            self._save_state()
            result["persisted"] = True

        return result

    def get_pending_calibration(self) -> Optional[Tuple[str, str]]:
        """Check if a calibration probe is pending.

        Returns (cheaper_model, expensive_model) if the caller should also
        call the cheaper model for comparison. Returns None otherwise.

        The caller should:
        1. Call router.select() as normal → gets expensive model
        2. Check get_pending_calibration() → if not None, also call cheaper model
        3. Call observe_calibration() with both quality scores
        """
        return self._pending_calibration

    def observe_calibration(
        self,
        cheaper_model: str,
        expensive_model: str,
        cheaper_quality: float,
        expensive_quality: float,
        r_hat: float,
    ) -> Dict[str, Any]:
        """Apply calibration probe results after both models have responded.

        Called by the server after getting responses from both models.
        """
        result = self.calibrator.apply_calibration_result(
            cheaper_model=cheaper_model,
            expensive_model=expensive_model,
            cheaper_quality=cheaper_quality,
            expensive_quality=expensive_quality,
            r_hat=r_hat,
        )
        self._pending_calibration = None
        return result

    def _get_model_tier(self, model: str) -> Optional[str]:
        """Find which tier a model belongs to."""
        for tier, models in self.tier_models.items():
            if model in models:
                return tier
        return None

    def get_status(self) -> Dict[str, Any]:
        """Get current OCR state for diagnostics."""
        return {
            "capacities": self.capacity_estimator.get_all_capacities(),
            "capacity_details": self.capacity_estimator.to_dict(),
            "bandits": {
                tier: bandit.get_stats()
                for tier, bandit in self.bandits.items()
            },
            "calibration": self.calibrator.get_stats(),
            "total_updates": self._update_count,
        }

    def save(self) -> None:
        """Explicitly save state to disk."""
        self._save_state()

    # --- Persistence ---

    def _state_path(self) -> Optional[Path]:
        if not self.state_dir:
            return None
        self.state_dir.mkdir(parents=True, exist_ok=True)
        return self.state_dir / "ocr_state.json"

    def _save_state(self) -> None:
        path = self._state_path()
        if not path:
            return
        try:
            state = {
                "version": 1,
                "update_count": self._update_count,
                "capacity": self.capacity_estimator.to_dict(),
                "bandits": {
                    tier: bandit.to_dict()
                    for tier, bandit in self.bandits.items()
                },
                "saved_at": time.time(),
            }
            tmp = path.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(state, f, indent=2)
            tmp.replace(path)
            logger.debug("OCR state saved (%d updates)", self._update_count)
        except Exception as e:
            logger.warning("Failed to save OCR state: %s", e)

    def _load_state(self) -> None:
        path = self._state_path()
        if not path or not path.exists():
            return
        try:
            with open(path) as f:
                state = json.load(f)

            if state.get("version") != 1:
                logger.warning("Unknown OCR state version, ignoring")
                return

            self._update_count = state.get("update_count", 0)

            if "capacity" in state:
                self.capacity_estimator.load_dict(state["capacity"])

            if "bandits" in state:
                for tier, bandit_data in state["bandits"].items():
                    if tier in self.bandits:
                        self.bandits[tier].load_dict(bandit_data)

            logger.info(
                "OCR state loaded (%d prior updates)", self._update_count
            )
        except Exception as e:
            logger.warning("Failed to load OCR state: %s", e)
