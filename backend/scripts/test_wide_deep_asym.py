"""Smoke-test the Wide&Deep (asym-loss) analyzer end-to-end.

Part 1 — handcrafted prompts (shows tier probs + picked model + latency).
Part 2 — v3 held-out test set sanity check (must match training-time numbers):
    argmax          → safe% ≈ 95.4%, catastrophic% == 0.0%
    cost-sens λ=3   → safe% ≈ 96.2%
    cost-sens λ=20  → safe% ≈ 97.8%

Run from backend/ with the venv:
    venv/bin/python3 scripts/test_wide_deep_asym.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from app.complexity.wide_deep_asym_analyzer import (  # noqa: E402
    WideDeepAsymAnalyzer,
    get_wide_deep_asym_analyzer,
)

PROMPTS = [
    # --- simple ---
    ("What's the capital of France?", "simple"),
    ("2 + 2 = ?", "simple"),
    ("Translate 'hello' to Spanish.", "simple"),
    # --- medium ---
    ("Write a Python function that returns the n-th Fibonacci number iteratively.", "medium"),
    ("Explain the difference between TCP and UDP with two concrete examples.", "medium"),
    ("Debug this: def add(a,b): retrun a+b — it throws SyntaxError.", "medium"),
    # --- complex ---
    (
        "Design a horizontally-scalable rate-limiting system for a multi-region API gateway. "
        "Discuss tradeoffs between token bucket and leaky bucket, how to handle clock skew across "
        "regions, and how the design changes if per-user limits must be enforced exactly.",
        "complex",
    ),
    (
        "Walk me through how you would refactor a 40k-line monolith Django app into a set of "
        "domain-driven microservices. Cover the strangler-fig migration path, how to split the "
        "shared Postgres database, and the dual-write / outbox patterns you'd use for consistency.",
        "complex",
    ),
    (
        "Given a 3-layer transformer decoder with causal self-attention, derive the gradient of "
        "the loss w.r.t. the Q projection weights at layer 2, then explain how the gradient "
        "magnitude would change if we added RMSNorm pre-attention.",
        "complex",
    ),
]


def asymmetric_metrics(y_true, y_pred):
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    n = len(y_true)
    exact = int((y_pred == y_true).sum())
    down = int((y_pred < y_true).sum())
    up = int((y_pred > y_true).sum())
    cata = int(((y_true == 2) & (y_pred == 0)).sum())
    return {
        "n": n,
        "safe": (n - down) / n,
        "exact": exact / n,
        "upgrade": up / n,
        "downgrade": down / n,
        "catastrophic": cata / n,
    }


def fmt(m):
    return (
        f"safe={m['safe']:.1%} exact={m['exact']:.1%} "
        f"up={m['upgrade']:.1%} down={m['downgrade']:.1%} cata={m['catastrophic']:.1%}"
    )


async def handcrafted_demo():
    print("=" * 80)
    print("PART 1: handcrafted prompts")
    print("=" * 80)

    analyzer = get_wide_deep_asym_analyzer(
        decision_rule="argmax",
        allowed_models=None,
    )
    # Warm-up: first call loads BGE (~400ms) — don't penalise the first prompt.
    _ = await analyzer.analyze("warmup")

    print(f"{'expected':<9} {'pred':<9} {'conf':>6} {'ms':>5}  "
          f"{'P(s)':>6} {'P(m)':>6} {'P(c)':>6}  {'model':<28} prompt")
    print("-" * 140)
    for prompt, expected in PROMPTS:
        t0 = time.time()
        r = await analyzer.analyze(prompt)
        dt = int((time.time() - t0) * 1000)
        probs = r["tier_probabilities"]
        print(
            f"{expected:<9} {r['tier_name']:<9} {r['confidence']:>6.1%} {dt:>5d}  "
            f"{probs['simple']:>6.2f} {probs['medium']:>6.2f} {probs['complex']:>6.2f}  "
            f"{r['recommended_model']:<28} {prompt[:60]}{'…' if len(prompt) > 60 else ''}"
        )


def v3_holdout_check():
    """Recompute v3 test-set metrics and compare against training-time numbers."""
    print()
    print("=" * 80)
    print("PART 2: v3 held-out test set (497 prompts)")
    print("=" * 80)

    data_root = os.path.join(BACKEND, "labeled_data", "v3")
    combined_path = os.path.join(data_root, "combined_labeled.json")
    split_path = os.path.join(data_root, "split.json")
    if not (os.path.exists(combined_path) and os.path.exists(split_path)):
        print("  (v3 dataset not present on disk, skipping)")
        return

    with open(combined_path) as f:
        data = json.load(f)["data"]
    with open(split_path) as f:
        s = json.load(f)
    test_idx = s.get("test_idx", s.get("test_indices"))
    test = [data[i] for i in test_idx]

    # Reuse exactly the probs the pipeline computed on v3.
    probs_path_results = os.path.join(data_root, "results", "06_tune_thresholds.json")
    print(f"  comparing against: {probs_path_results}")

    # Re-run the analyzer on every test prompt (this is the real integration test).
    analyzer = WideDeepAsymAnalyzer(decision_rule="argmax")

    tier_to_idx = {"simple": 0, "medium": 1, "complex": 2}
    y_true = np.array([tier_to_idx[d["tier"]] for d in test])

    t0 = time.time()
    all_probs = np.zeros((len(test), 3), dtype=np.float32)
    for i, d in enumerate(test):
        probs, _ = analyzer._predict_proba(d["prompt"])
        all_probs[i] = probs
        if (i + 1) % 100 == 0:
            print(f"    scored {i+1}/{len(test)} ({(time.time()-t0):.1f}s)")
    dt = time.time() - t0
    print(f"  scored {len(test)} prompts in {dt:.1f}s ({dt/len(test)*1000:.1f}ms/prompt)")

    # argmax
    pred_argmax = all_probs.argmax(axis=1)
    print(f"  argmax        : {fmt(asymmetric_metrics(y_true, pred_argmax))}")
    # cost-sens λ=3 / 20
    from app.complexity.wide_deep_asym_analyzer import _cost_matrix
    for lam in (3.0, 20.0):
        pred = (all_probs @ _cost_matrix(lam)).argmin(axis=1)
        print(f"  cost-sens λ={lam:<4g}: {fmt(asymmetric_metrics(y_true, pred))}")

    print()
    print("Expected (from training-time logs):")
    print("  argmax        : safe=95.4% exact=44.7% up=50.7% down=4.6% cata=0.0%")
    print("  cost-sens λ=3 : safe=96.2% exact=44.1% up=52.1% down=3.8% cata=0.0%")
    print("  cost-sens λ=20: safe=97.8% exact=39.6% up=58.1% down=2.2% cata=0.0%")


async def main():
    await handcrafted_demo()
    v3_holdout_check()
    print()
    print("OK — Wide&Deep (asym-loss) analyzer loads, classifies, and matches v3 metrics.")


if __name__ == "__main__":
    asyncio.run(main())
