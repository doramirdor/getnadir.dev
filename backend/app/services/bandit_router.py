"""Online contextual Thompson Sampling bandit router (foundation).

This module ships the math kernel and persistence-aware wrapper for the WS-3
bandit router. It implements the Normal-Inverse-Gamma (NIG) conjugate posterior
for Bayesian linear regression with Gaussian likelihood, and exposes Thompson
sampling over the posterior-predictive distribution for arm selection. It is
multi-tenant: posterior state is keyed by (api_key_id, cluster_id, arm_model)
and persisted to the `routing_arms` Postgres table.

Status: foundation only. The math kernel (`nig_sample`, `nig_update`,
`_compute_reward`, `BanditArmState`) is fully implemented and unit tested.
Async DB wiring, integration with `production_completion.py`, cluster_id
sourcing, dedup against `bandit_reward_log`, dashboard, reset endpoint, and
rollout phasing are scheduled for the next cycle.

Limitation: with 4 Gunicorn workers and a 60s LRU TTL on per-worker posterior
caches, the effective sample size per posterior is roughly 25% of actual
traffic during the window. This is a known approximation, not a bug. Per WS-3
reviewer must-fix #3.

Blueprint: competitor-profiles/blueprints/ws3-bandit-router.md
Math kernel matches nadirclaw.ocr.ThompsonSamplingBandit; see ocr.py:684-805.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import numpy as np


DEFAULT_TS_DIM: int = 8
DEFAULT_ALPHA: float = 2.0
DEFAULT_BETA: float = 1.0

# Composite Outcome Score weights matching nadirclaw.ocr defaults (0.50 / 0.25 / 0.25).
DEFAULT_COS_QUALITY_W: float = 0.5
DEFAULT_COS_LATENCY_W: float = 0.25
DEFAULT_COS_COST_W: float = 0.25


@dataclass
class BanditArmState:
    """Persisted posterior state for a single bandit arm.

    Lambda is the full d x d precision matrix, not a diagonal approximation.
    Per WS-3 reviewer must-fix #4: a diagonal-only store discards the rank-1
    outer-product mass added on every update and degrades calibration.
    """

    api_key_id: str
    cluster_id: str
    arm_model: str
    mu: np.ndarray
    Lambda: np.ndarray
    alpha: float = DEFAULT_ALPHA
    beta: float = DEFAULT_BETA
    n_obs: int = 0


def _sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def init_arm_state(
    api_key_id: str,
    cluster_id: str,
    arm_model: str,
    d: int = DEFAULT_TS_DIM,
) -> BanditArmState:
    """Build a fresh prior for a (tenant, cluster, model) cell."""
    return BanditArmState(
        api_key_id=api_key_id,
        cluster_id=cluster_id,
        arm_model=arm_model,
        mu=np.full(d, 0.5, dtype=np.float64),
        Lambda=np.eye(d, dtype=np.float64),
        alpha=DEFAULT_ALPHA,
        beta=DEFAULT_BETA,
        n_obs=0,
    )


def nig_sample(
    state: BanditArmState,
    context: np.ndarray,
    rng: np.random.Generator,
) -> float:
    """Posterior-predictive sample for one arm.

    Closed-form NIG sampling:
      sigma^2 ~ InverseGamma(alpha, beta)
      theta   ~ Normal(mu, sigma^2 * inv(Lambda))
      y_hat   = context @ theta

    Source: Murphy, "Conjugate Bayesian analysis of the Gaussian distribution"
    (2007), section 4 (Normal-Inverse-Gamma). Matches the kernel in
    nadirclaw.ocr.ThompsonSamplingBandit._sample_posterior.
    """
    x = np.asarray(context, dtype=np.float64).reshape(-1)
    if x.shape[0] != state.mu.shape[0]:
        raise ValueError(
            f"context dim {x.shape[0]} does not match posterior dim {state.mu.shape[0]}"
        )

    # Sample sigma^2 from Inverse-Gamma via 1 / Gamma.
    gamma_draw = rng.gamma(shape=state.alpha, scale=1.0 / max(1e-10, state.beta))
    sigma2 = 1.0 / max(1e-10, gamma_draw)

    try:
        cov = sigma2 * np.linalg.inv(state.Lambda)
        # Symmetrize to defend against tiny numerical asymmetries before
        # multivariate_normal raises on a not-quite-PSD matrix.
        cov = 0.5 * (cov + cov.T)
        theta = rng.multivariate_normal(state.mu, cov)
    except np.linalg.LinAlgError:
        theta = state.mu + rng.normal(0.0, 0.1, size=state.mu.shape[0])

    return float(x @ theta)


def nig_update(
    state: BanditArmState,
    context: np.ndarray,
    reward: float,
) -> BanditArmState:
    """Conjugate update for Bayesian linear regression with Gaussian likelihood.

    Lambda_new = Lambda + x x^T
    mu_new     = inv(Lambda_new) @ (Lambda @ mu + reward * x)
    alpha_new  = alpha + 0.5
    beta_new   = beta + 0.5 * (reward^2 + mu^T Lambda mu - mu_new^T Lambda_new mu_new)
    n_obs    += 1

    Lambda is kept as a full d x d matrix throughout (no diagonal-only path).
    """
    x = np.asarray(context, dtype=np.float64).reshape(-1)
    if x.shape[0] != state.mu.shape[0]:
        raise ValueError(
            f"context dim {x.shape[0]} does not match posterior dim {state.mu.shape[0]}"
        )

    Lambda_old = state.Lambda
    mu_old = state.mu

    Lambda_new = Lambda_old + np.outer(x, x)

    rhs = Lambda_old @ mu_old + reward * x
    try:
        mu_new = np.linalg.solve(Lambda_new, rhs)
    except np.linalg.LinAlgError:
        d = state.mu.shape[0]
        mu_new = np.linalg.solve(Lambda_new + 1e-6 * np.eye(d), rhs)

    alpha_new = state.alpha + 0.5
    beta_quad = (
        reward * reward
        + float(mu_old @ Lambda_old @ mu_old)
        - float(mu_new @ Lambda_new @ mu_new)
    )
    # Keep beta strictly positive; the quadratic form can dip slightly negative
    # on the first few updates from numerical noise.
    beta_new = max(1e-6, state.beta + 0.5 * beta_quad)

    return BanditArmState(
        api_key_id=state.api_key_id,
        cluster_id=state.cluster_id,
        arm_model=state.arm_model,
        mu=mu_new,
        Lambda=Lambda_new,
        alpha=alpha_new,
        beta=beta_new,
        n_obs=state.n_obs + 1,
    )


class BanditRouter:
    """Persistence-aware multi-tenant Thompson Sampling router (skeleton).

    The math kernel above is fully implemented; the DB-bound methods below are
    contracts only and raise NotImplementedError. They will be wired up in the
    next cycle alongside integration into supabase_unified_llm_service.
    """

    def __init__(self, d: int = DEFAULT_TS_DIM) -> None:
        self.d = d

    async def select(
        self,
        api_key_id: str,
        cluster_id: str,
        candidate_arms: list[str],
        context: np.ndarray,
        n_cold: int = 20,
    ) -> Tuple[str, bool, Dict[str, Any]]:
        """Select an arm via Thompson Sampling over per-arm NIG posteriors.

        Returns (chosen_arm, is_active, meta) where `is_active` is False during
        the cold-start window (n_obs < n_cold for all arms) and True once the
        bandit is in steady-state exploration.
        """
        raise NotImplementedError("integration scheduled for Cycle 2")

    async def update(
        self,
        api_key_id: str,
        cluster_id: str,
        arm_model: str,
        context: np.ndarray,
        quality: float,
        actual_cost: float,
        expected_cost: float,
        actual_latency_ms: float,
        expected_latency_ms: float,
        weights: Optional[Dict[str, float]] = None,
        request_id: Optional[str] = None,
        update_source: str = "immediate",
    ) -> bool:
        """Apply a posterior update for an observed (context, reward) pair.

        Computes the composite reward, then performs an optimistic upsert
        against `routing_arms` using the n_obs concurrency guard documented
        in routing_arms_table.sql. Dedups against `bandit_reward_log` keyed
        by (request_id, update_source).
        """
        raise NotImplementedError("integration scheduled for Cycle 2")

    async def _load_arms(
        self,
        api_key_id: str,
        cluster_id: str,
    ) -> Dict[str, BanditArmState]:
        """Load all arms for (api_key_id, cluster_id) from `routing_arms`."""
        raise NotImplementedError("integration scheduled for Cycle 2")

    async def _save_arm(self, state: BanditArmState) -> None:
        """Optimistic upsert with the n_obs concurrency guard."""
        raise NotImplementedError("integration scheduled for Cycle 2")

    def _compute_reward(
        self,
        quality: float,
        actual_cost: float,
        expected_cost: float,
        actual_latency_ms: float,
        expected_latency_ms: float,
        weights: Optional[Dict[str, float]] = None,
    ) -> float:
        """Composite Outcome Score (COS) used as the bandit reward.

        reward = w_q * quality
               + w_l * sigmoid((expected_latency - actual_latency) / expected_latency)
               + w_c * sigmoid((expected_cost - actual_cost) / expected_cost)

        Quality is currently a binary 0/1 signal from the OCR pipeline; this
        is the same approximation used in nadirclaw.ocr.compute_cos. Promoting
        it to a graded score is a separate workstream.
        """
        w = weights or {}
        w_q = float(w.get("quality", DEFAULT_COS_QUALITY_W))
        w_l = float(w.get("latency", DEFAULT_COS_LATENCY_W))
        w_c = float(w.get("cost", DEFAULT_COS_COST_W))

        if expected_latency_ms <= 0:
            latency_residual = 0.0
        else:
            latency_residual = (expected_latency_ms - actual_latency_ms) / expected_latency_ms

        if expected_cost <= 0:
            cost_residual = 0.0
        else:
            cost_residual = (expected_cost - actual_cost) / expected_cost

        return (
            w_q * float(quality)
            + w_l * _sigmoid(latency_residual)
            + w_c * _sigmoid(cost_residual)
        )
