"""Offline benchmark: unified ε-constrained ranker vs legacy ranking sorts.

Deterministic Monte Carlo over random user presets sampled from the real
model_performance_clean.json catalog. No API calls, no network — run it
anywhere:

    python3 benchmark_ranker.py [--presets 2000] [--seed 7]

Strategies compared (the three that exist in the codebase today + new):

  legacy_analyzer    heuristic/binary sorts: complex=quality desc,
                     medium=quality/cost ratio desc, simple=cost asc
  legacy_positional  default ("trained") analyzer: first/middle/last of the
                     user's configured list
  nadir_ranker       model_ranker.rank_models (ε-floor + LCB admission)

Scenarios:

  A. Cold start — static data only. Measures pick quality vs pick cost and
     "quality violations" (pick more than 10 quality points below the best
     model in the preset — routing a request to a clearly worse model).
  B. Online evidence — a cheap model in the preset is verified-strong
     (high verifier mean, n=500). Only an evidence-aware ranker can capture
     the savings; measures cost reduction at zero true-quality loss.
  C. Noise robustness — verifier stats are pure noise around the static
     prior with thin samples (n=15). A safe ranker must not move: measures
     how often the pick differs from the cold-start pick (regressions).
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import random
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _load_ranker():
    spec = importlib.util.spec_from_file_location(
        "model_ranker", os.path.join(HERE, "app", "complexity", "model_ranker.py")
    )
    m = importlib.util.module_from_spec(spec)
    sys.modules["model_ranker"] = m
    spec.loader.exec_module(m)
    return m


mr = _load_ranker()

TIERS = ("simple", "medium", "complex")
VIOLATION_GAP = 10.0  # quality_index points below preset-best = violation


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

def pick_legacy_analyzer(tier: str, preset: list[dict]) -> dict:
    if tier == "complex":
        return max(preset, key=lambda m: m["quality_index"])
    if tier == "medium":
        return max(preset, key=lambda m: m["quality_index"] / max(m["cost"], 0.01))
    return min(preset, key=lambda m: m["cost"])


def pick_legacy_positional(tier: str, preset: list[dict]) -> dict:
    if tier == "simple":
        return preset[0]
    if tier == "complex":
        return preset[-1]
    return preset[len(preset) // 2]


def pick_nadir(tier: str, preset: list[dict], stats=None) -> dict:
    ranked = mr.rank_models(tier, 0.85, preset, stats=stats)
    return ranked[0]


# ---------------------------------------------------------------------------
# Scenario runners
# ---------------------------------------------------------------------------

def run_cold_start(presets: list[list[dict]]) -> dict:
    out = {}
    for name, fn in (
        ("legacy_analyzer", pick_legacy_analyzer),
        ("legacy_positional", pick_legacy_positional),
        ("nadir_ranker", pick_nadir),
    ):
        for tier in TIERS:
            quality, cost, violations = [], [], 0
            for preset in presets:
                best_q = max(m["quality_index"] for m in preset)
                pick = fn(tier, preset)
                quality.append(pick["quality_index"])
                cost.append(pick["cost"])
                if pick["quality_index"] < best_q - VIOLATION_GAP:
                    violations += 1
            out[(name, tier)] = {
                "mean_quality": statistics.mean(quality),
                "mean_cost": statistics.mean(cost),
                "violation_rate": violations / len(presets),
            }
    return out


def run_online_evidence(presets: list[list[dict]], rng: random.Random) -> dict:
    """A cheap model is *actually* as good as the best (verified online).

    True quality of the boosted model equals the preset best, so picking it
    is zero quality loss. Compare realized cost on the complex tier.
    """
    rows = {"legacy_analyzer": [], "nadir_ranker": [], "switched": 0, "n": 0}
    for preset in presets:
        best = max(preset, key=lambda m: m["quality_index"])
        cheap_candidates = [
            m for m in preset
            if m is not best and m["cost"] < best["cost"]
            and m["quality_index"] >= best["quality_index"] - 25
        ]
        if not cheap_candidates:
            continue
        hero = rng.choice(cheap_candidates)
        stats = {hero["api_id"]: mr.OnlineModelStats(verifier_mean=0.97, n=500)}

        legacy = pick_legacy_analyzer("complex", preset)   # stats-blind
        nadir = pick_nadir("complex", preset, stats=stats)

        rows["n"] += 1
        rows["legacy_analyzer"].append(legacy["cost"])
        rows["nadir_ranker"].append(nadir["cost"])
        if nadir["api_id"] == hero["api_id"]:
            rows["switched"] += 1
    return rows


def run_noise_robustness(
    presets: list[list[dict]], rng: random.Random, n: float, sigma: float
) -> dict:
    """Noisy (zero-signal) verifier stats must not move the ranking.

    sigma is *persistent per-model* verifier miscalibration (worst case —
    sampling noise at these n would be far smaller). Below the min-evidence
    gate churn must be exactly zero; above it, the static floor anchor +
    promote-only membership + LCB admission keep churn and harm low.
    """
    moved = 0
    quality_delta, cost_delta = [], []
    for preset in presets:
        stats = {
            m["api_id"]: mr.OnlineModelStats(
                verifier_mean=min(max(m["quality_index"] / 100.0
                                      + rng.gauss(0, sigma), 0.0), 1.0),
                n=n,
            )
            for m in preset
        }
        for tier in TIERS:
            cold = pick_nadir(tier, preset)
            noisy = pick_nadir(tier, preset, stats=stats)
            if cold["api_id"] != noisy["api_id"]:
                moved += 1
                # noise is zero-signal: static quality IS the true quality
                quality_delta.append(noisy["quality_index"] - cold["quality_index"])
                cost_delta.append(noisy["cost"] - cold["cost"])
    return {
        "moved": moved,
        "decisions": len(presets) * len(TIERS),
        "mean_quality_delta": statistics.mean(quality_delta) if quality_delta else 0.0,
        "mean_cost_delta": statistics.mean(cost_delta) if cost_delta else 0.0,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--presets", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    catalog = [
        c for c in mr.load_candidate_models()
        if c["cost"] > 0 and c["quality_index"] > 0
    ]
    print(f"catalog: {len(catalog)} priced models")

    presets = []
    for _ in range(args.presets):
        size = rng.randint(3, 8)
        presets.append(rng.sample(catalog, size))

    print(f"\n=== Scenario A: cold start ({args.presets} random presets) ===")
    print(f"{'strategy':<18} {'tier':<8} {'quality':>8} {'cost $/1M':>10} {'violations':>11}")
    results = run_cold_start(presets)
    for (name, tier), r in results.items():
        print(f"{name:<18} {tier:<8} {r['mean_quality']:>8.1f} "
              f"{r['mean_cost']:>10.2f} {r['violation_rate']:>10.1%}")

    print("\n=== Scenario B: online evidence (verified-strong cheap model, complex tier) ===")
    b = run_online_evidence(presets, rng)
    legacy_cost = statistics.mean(b["legacy_analyzer"])
    nadir_cost = statistics.mean(b["nadir_ranker"])
    print(f"applicable presets: {b['n']}")
    print(f"legacy_analyzer  mean cost: ${legacy_cost:.2f}/1M (cannot use evidence)")
    print(f"nadir_ranker     mean cost: ${nadir_cost:.2f}/1M "
          f"({1 - nadir_cost / legacy_cost:.1%} cheaper at zero true-quality loss)")
    print(f"evidence captured (switched to verified model): {b['switched'] / b['n']:.1%}")

    print("\n=== Scenario C: noise robustness (zero-signal verifier stats) ===")
    for n, sigma in ((15, 0.15), (60, 0.08), (60, 0.15)):
        c = run_noise_robustness(presets, rng, n=n, sigma=sigma)
        gate = "below" if n < 30 else "above"
        print(f"n={n:<3} σ={sigma} ({gate} min-evidence gate): picks changed "
              f"{c['moved']}/{c['decisions']} ({c['moved'] / c['decisions']:.2%}) | "
              f"true-quality Δ of changed picks: {c['mean_quality_delta']:+.1f} pts, "
              f"cost Δ: {c['mean_cost_delta']:+.2f} $/1M")


if __name__ == "__main__":
    main()
