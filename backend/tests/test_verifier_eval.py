"""Unit tests for verifier/eval.py metric helpers.

These tests exercise the pure functions only (auroc, metrics_at_threshold,
calibration, per_domain). They do not load the verifier checkpoint or touch
the JSONL test file — those paths are covered by running `eval.py --limit N`
manually and by the end-to-end smoke in test_verifier_model.py.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

# verifier/eval.py is a sibling of the repo root, not on sys.path by default.
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))

from verifier.eval import (  # noqa: E402
    auroc,
    calibration,
    metrics_at_threshold,
    per_domain,
)


def test_auroc_perfect_ranking():
    labels = [0, 0, 0, 1, 1, 1]
    scores = [0.1, 0.2, 0.3, 0.7, 0.8, 0.9]
    assert auroc(labels, scores) == pytest.approx(1.0)


def test_auroc_inverted_ranking():
    labels = [0, 0, 0, 1, 1, 1]
    scores = [0.9, 0.8, 0.7, 0.3, 0.2, 0.1]
    assert auroc(labels, scores) == pytest.approx(0.0)


def test_auroc_random_ranking_near_half():
    labels = [0, 1, 0, 1, 0, 1, 0, 1]
    scores = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    assert auroc(labels, scores) == pytest.approx(0.5)


def test_auroc_single_class_returns_nan():
    assert math.isnan(auroc([1, 1, 1], [0.2, 0.5, 0.8]))
    assert math.isnan(auroc([0, 0, 0], [0.2, 0.5, 0.8]))


def test_metrics_at_threshold_perfect_separation():
    labels = [0, 0, 1, 1]
    scores = [0.1, 0.2, 0.8, 0.9]
    m = metrics_at_threshold(labels, scores, 0.5)
    assert m["accuracy"] == pytest.approx(1.0)
    assert m["f1"] == pytest.approx(1.0)
    assert m["downgrade_rate"] == 0.0
    assert m["wasted_escalation"] == 0.0
    assert m["accept_rate"] == 0.5


def test_metrics_at_threshold_all_above_threshold():
    # threshold=0 means "accept everything"
    labels = [0, 0, 1, 1]
    scores = [0.1, 0.2, 0.8, 0.9]
    m = metrics_at_threshold(labels, scores, 0.0)
    assert m["accept_rate"] == 1.0
    assert m["downgrade_rate"] == 0.5  # both label==0 incorrectly accepted
    assert m["wasted_escalation"] == 0.0


def test_metrics_at_threshold_all_below_threshold():
    # threshold=1.01 means "escalate everything"
    labels = [0, 0, 1, 1]
    scores = [0.1, 0.2, 0.8, 0.9]
    m = metrics_at_threshold(labels, scores, 1.01)
    assert m["accept_rate"] == 0.0
    assert m["downgrade_rate"] == 0.0
    assert m["wasted_escalation"] == 0.5  # both label==1 unnecessarily escalated


def test_calibration_perfectly_calibrated():
    # 100 examples where score == empirical positive rate per bin
    labels: list[int] = []
    scores: list[float] = []
    for i in range(10):
        pos = i  # bin i has i positives out of 10
        neg = 10 - i
        labels.extend([1] * pos + [0] * neg)
        scores.extend([i / 10 + 0.05] * 10)  # all in bin i
    bins, ece = calibration(labels, scores, n_bins=10)
    assert ece == pytest.approx(0.05, abs=0.001)  # within bin offset
    populated = [b for b in bins if b["n"] > 0]
    assert len(populated) == 10


def test_calibration_uncalibrated_high_ece():
    # All examples scored 0.9 but actual positive rate is 0.1 -> high ECE
    labels = [1] + [0] * 9
    scores = [0.9] * 10
    _, ece = calibration(labels, scores, n_bins=10)
    assert ece == pytest.approx(0.8, abs=0.01)


def test_per_domain_filters_small_buckets():
    triples = [
        {"domain_hint": "small", "label": 1},
        {"domain_hint": "small", "label": 0},
        *[{"domain_hint": "big", "label": 1} for _ in range(15)],
        *[{"domain_hint": "big", "label": 0} for _ in range(15)],
    ]
    scores = [0.5, 0.5] + [0.9] * 15 + [0.1] * 15
    out = per_domain(triples, scores, min_n=20)
    domains = [r["domain"] for r in out]
    assert "small" not in domains
    assert "big" in domains
    big = next(r for r in out if r["domain"] == "big")
    assert big["auroc"] == pytest.approx(1.0)
    assert big["n"] == 30
