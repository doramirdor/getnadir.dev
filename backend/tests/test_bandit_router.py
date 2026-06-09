"""Unit tests for the bandit router math kernel and reward function.

Covers the foundation only: NIG conjugate update, posterior-predictive
sampling, full Lambda storage, and the Composite Outcome Score reward.
DB-bound BanditRouter methods are out of scope this cycle.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.services.bandit_router import (
    BanditRouter,
    init_arm_state,
    nig_sample,
    nig_update,
)


D = 8


def _fresh_state():
    return init_arm_state(
        api_key_id="00000000-0000-0000-0000-000000000001",
        cluster_id="cluster-a",
        arm_model="claude-sonnet-4-6",
        d=D,
    )


def _dense_context(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = rng.normal(size=D)
    # Force every entry nonzero so the outer product has dense off-diagonals.
    x[x == 0.0] = 0.1
    return x


def _sample_many(state, context: np.ndarray, n: int, seed: int = 123) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.array([nig_sample(state, context, rng) for _ in range(n)])


def test_nig_update_increments_n_obs():
    state = _fresh_state()
    assert state.n_obs == 0

    context = _dense_context()
    updated = nig_update(state, context, reward=0.7)
    assert updated.n_obs == 1

    updated2 = nig_update(updated, context, reward=0.7)
    assert updated2.n_obs == 2


def test_nig_update_shifts_mu_toward_observed_reward():
    state = _fresh_state()
    prior_mu_mean = float(np.mean(state.mu))
    context = _dense_context(seed=1)

    for _ in range(10):
        state = nig_update(state, context, reward=0.9)

    # Posterior predicted reward should move from the prior (0.5 mean) toward 0.9.
    pred = float(context @ state.mu)
    prior_pred = float(context @ np.full(D, 0.5))
    assert abs(pred - 0.9) < abs(prior_pred - 0.9)
    # Sanity: mu itself should have shifted off the flat 0.5 prior.
    assert not np.allclose(state.mu, np.full(D, prior_mu_mean))


def test_nig_update_decreases_posterior_variance():
    context = _dense_context(seed=2)

    light = _fresh_state()
    for _ in range(5):
        light = nig_update(light, context, reward=0.5)

    heavy = _fresh_state()
    for _ in range(50):
        heavy = nig_update(heavy, context, reward=0.5)

    light_samples = _sample_many(light, context, n=1000, seed=42)
    heavy_samples = _sample_many(heavy, context, n=1000, seed=42)

    assert heavy_samples.var() < light_samples.var()


def test_full_lambda_not_diagonal():
    state = _fresh_state()
    # Prior Lambda is the identity, so it starts diagonal.
    assert np.allclose(state.Lambda, np.eye(D))

    context = _dense_context(seed=3)
    updated = nig_update(state, context, reward=0.6)

    # After a single rank-1 update with a dense context, off-diagonals must be nonzero.
    off_diag = updated.Lambda - np.diag(np.diag(updated.Lambda))
    assert np.max(np.abs(off_diag)) > 1e-6


def test_compute_reward_quality_dominates():
    router = BanditRouter()

    # Matching expected vs actual makes both residual sigmoids land at 0.5,
    # so reward = w_q * quality + 0.5 * (w_l + w_c) = 0.5*q + 0.25.
    reward_pass = router._compute_reward(
        quality=1.0,
        actual_cost=0.01,
        expected_cost=0.01,
        actual_latency_ms=1000.0,
        expected_latency_ms=1000.0,
    )
    reward_fail = router._compute_reward(
        quality=0.0,
        actual_cost=0.01,
        expected_cost=0.01,
        actual_latency_ms=1000.0,
        expected_latency_ms=1000.0,
    )

    assert reward_pass == pytest.approx(0.75, abs=1e-6)
    assert reward_fail < 0.5
    assert reward_fail == pytest.approx(0.25, abs=1e-6)


def test_compute_reward_high_latency_penalty():
    router = BanditRouter()

    on_time = router._compute_reward(
        quality=1.0,
        actual_cost=0.01,
        expected_cost=0.01,
        actual_latency_ms=1000.0,
        expected_latency_ms=1000.0,
    )
    slow = router._compute_reward(
        quality=1.0,
        actual_cost=0.01,
        expected_cost=0.01,
        actual_latency_ms=2000.0,
        expected_latency_ms=1000.0,
    )
    assert slow < on_time
