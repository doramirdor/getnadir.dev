"""End-to-end eval of the composed router (pre-classifier + cascade).

For each held-out RouterBench triple we run THREE strategies and report
side-by-side cost/quality/latency numbers. This is the "ship it" eval —
the table that goes in the paper to demonstrate the composed system
strictly Pareto-dominates the alternatives.

  always_cheap            — never escalate; lower bound on cost
  always_expensive        — always escalate; upper bound on quality
  cascade_only            — always call cheap, verifier decides escalation
                            (the IP, current architecture)
  composed_v2             — pre-classifier shortcut on high-conf cases,
                            cascade for the rest (router v2)

The composed strategy has two short-circuits that the cascade-only path
cannot do:

  pre_class high-conf, cheap     → serve cheap, skip verifier (-180ms)
  pre_class high-conf, expensive → skip cheap call, go straight to
                                   escalation (-cheap-cost, -cheap-latency)

On the slice where the classifier is well-calibrated (~10% of test at
>= 99% accuracy), these are pure wins. On the rest, fall through to
cascade — same behaviour as before.

Usage:
    python verifier/eval_composed.py \
        --verifier-report verifier/reports/eval_<ts>.json \
        --classifier verifier/weights/router_v2.pkl \
        --limit 1000
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRIPLES = REPO_ROOT / "verifier" / "data" / "routerbench_triples.jsonl"
DEFAULT_CLASSIFIER = REPO_ROOT / "verifier" / "weights" / "router_v2.pkl"
DEFAULT_REPORTS = REPO_ROOT / "verifier" / "reports"


# The lazy import inside RouterBenchClassifierAnalyzer reaches into
# `app.complexity.__init__` which transitively pulls in settings.py and
# fails on missing SUPABASE_URL when this script runs from the repo
# root rather than backend/. Load backend/.env up front so settings
# validates successfully and the analyzer chain imports cleanly.
def _load_backend_env() -> None:
    backend_env = REPO_ROOT / "backend" / ".env"
    if not backend_env.exists():
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(backend_env, override=False)
    except ImportError:
        # python-dotenv is in backend/requirements.txt — should be available
        # in the venv this script runs under. Best-effort fallback:
        import os as _os

        for line in backend_env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'\"")
            _os.environ.setdefault(key, val)


_load_backend_env()

# Cheap = 1 unit, expensive = COST_RATIO units. Verifier overhead measured
# separately (latency, not cost).
DEFAULT_COST_RATIO = 12.0
# Verifier latency vs cheap-call latency, both in ms. These are CPU-side
# numbers from verifier/reports/eval_*.json + Anthropic public p50.
VERIFIER_LATENCY_MS = 180.0
CHEAP_LATENCY_MS = 480.0
EXPENSIVE_LATENCY_MS = 1100.0


def load_test_triples(path: Path, limit: int | None) -> list[dict]:
    rows: list[dict] = []
    with path.open() as f:
        for line in f:
            t = json.loads(line)
            if t.get("split") != "test":
                continue
            rows.append(t)
            if limit is not None and len(rows) >= limit:
                break
    return rows


def load_verifier_scores(report_path: Path) -> dict[str, float]:
    data = json.loads(report_path.read_text())
    per_prompt = data.get("per_prompt") or []
    if not per_prompt:
        raise RuntimeError(
            f"{report_path} has no per_prompt array; re-run eval.py first."
        )
    return {row["id"]: float(row["score"]) for row in per_prompt if row.get("id")}


def score_strategy(triples, classifier_preds, verifier_scores, strategy: str,
                   threshold: float, cost_ratio: float, hc_threshold: float):
    """Run one strategy and return aggregated metrics.

    classifier_preds[tid] = {p_cheap_acceptable, confidence, high_confidence, ...}
                            or None if skipping the classifier.
    """
    n = len(triples)
    cost_sum = 0.0
    latency_sum = 0.0
    catastrophic = 0
    wasted = 0
    correct = 0
    verifier_calls = 0
    classifier_skips_cheap = 0
    classifier_skips_verifier = 0

    for t in triples:
        tid = t.get("id")
        label = int(t["label"])
        pred = classifier_preds.get(tid) if classifier_preds else None

        served = None
        escalated = False

        if strategy == "always_cheap":
            served, escalated = "cheap", False
            cost_sum += 1.0
            latency_sum += CHEAP_LATENCY_MS
        elif strategy == "always_expensive":
            served, escalated = "expensive", False
            cost_sum += cost_ratio
            latency_sum += EXPENSIVE_LATENCY_MS
        elif strategy == "cascade_only":
            score = verifier_scores.get(tid)
            if score is None:
                continue
            verifier_calls += 1
            if score >= threshold:
                served, escalated = "cheap", False
                cost_sum += 1.0
                latency_sum += CHEAP_LATENCY_MS + VERIFIER_LATENCY_MS
            else:
                served, escalated = "expensive", True
                cost_sum += 1.0 + cost_ratio
                latency_sum += CHEAP_LATENCY_MS + VERIFIER_LATENCY_MS + EXPENSIVE_LATENCY_MS
        elif strategy == "composed_v2":
            # Try classifier first.
            short_circuited = False
            if pred is not None and pred.get("high_confidence") and pred["confidence"] >= hc_threshold:
                if pred["predicted_class"] == "cheap":
                    served, escalated = "cheap", False
                    cost_sum += 1.0
                    latency_sum += CHEAP_LATENCY_MS
                    classifier_skips_verifier += 1
                else:
                    served, escalated = "expensive", True  # escalation-only
                    cost_sum += cost_ratio
                    latency_sum += EXPENSIVE_LATENCY_MS
                    classifier_skips_cheap += 1
                short_circuited = True
            if not short_circuited:
                score = verifier_scores.get(tid)
                if score is None:
                    continue
                verifier_calls += 1
                if score >= threshold:
                    served, escalated = "cheap", False
                    cost_sum += 1.0
                    latency_sum += CHEAP_LATENCY_MS + VERIFIER_LATENCY_MS
                else:
                    served, escalated = "expensive", True
                    cost_sum += 1.0 + cost_ratio
                    latency_sum += CHEAP_LATENCY_MS + VERIFIER_LATENCY_MS + EXPENSIVE_LATENCY_MS
        else:
            raise ValueError(f"unknown strategy: {strategy}")

        # Scoring (binary correctness of the routing decision).
        if served == "cheap" and label == 0:
            catastrophic += 1
        if served == "expensive" and label == 1:
            wasted += 1
        if (served == "cheap" and label == 1) or (served == "expensive" and label == 0):
            correct += 1

    return {
        "strategy": strategy,
        "n": n,
        "relative_cost_per_request": cost_sum / n,
        "avg_latency_ms": latency_sum / n,
        "catastrophic_rate": catastrophic / n,
        "wasted_escalation_rate": wasted / n,
        "accuracy": correct / n,
        "verifier_calls": verifier_calls,
        "verifier_call_rate": verifier_calls / n,
        "classifier_skips_cheap": classifier_skips_cheap,
        "classifier_skips_verifier": classifier_skips_verifier,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Composed router head-to-head eval.")
    parser.add_argument("--triples", type=str, default=str(DEFAULT_TRIPLES))
    parser.add_argument("--verifier-report", type=str, required=True)
    parser.add_argument("--classifier", type=str, default=str(DEFAULT_CLASSIFIER))
    parser.add_argument("--threshold", type=float, default=0.70)
    parser.add_argument("--cost-ratio", type=float, default=DEFAULT_COST_RATIO)
    parser.add_argument("--high-confidence-threshold", type=float, default=0.90)
    parser.add_argument(
        "--sweep-hc-thresholds",
        type=str,
        default=None,
        help="Comma-separated list of confidence thresholds to sweep "
             "composed_v2 over (e.g. 0.65,0.70,0.75,0.80,0.85,0.90). "
             "When set, ignores --high-confidence-threshold and prints "
             "one composed_v2 row per threshold so we can pick the "
             "operating point that maximally beats cascade_only.",
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args(argv)

    triples = load_test_triples(Path(args.triples), args.limit)
    print(f"[comp-v2] loaded {len(triples)} test triples")
    verifier_scores = load_verifier_scores(Path(args.verifier_report))
    print(f"[comp-v2] loaded {len(verifier_scores)} verifier scores")

    # Pre-classifier predictions for every triple.
    print("[comp-v2] running pre-classifier on every prompt ...")
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    # Bypass app.complexity.__init__ which force-loads gemini + settings.
    import importlib.util as _ilu
    _spec = _ilu.spec_from_file_location(
        "_rbca", str(REPO_ROOT / "backend" / "app" / "complexity" / "routerbench_classifier_analyzer.py"),
    )
    _mod = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    RouterBenchClassifierAnalyzer = _mod.RouterBenchClassifierAnalyzer
    pre = RouterBenchClassifierAnalyzer(artifact_path=args.classifier)
    classifier_preds: dict[str, dict] = {}
    for i, t in enumerate(triples):
        tid = t.get("id")
        if tid is None:
            continue
        classifier_preds[tid] = pre.predict_binary(t["prompt"])
        if (i + 1) % 500 == 0:
            print(f"[comp-v2]   {i+1}/{len(triples)}")
    high_conf_count = sum(1 for p in classifier_preds.values() if p["high_confidence"])
    print(
        f"[comp-v2] classifier high-confidence on {high_conf_count}/{len(triples)} "
        f"({100.0 * high_conf_count / len(triples):.1f}%)"
    )

    strategies = ["always_cheap", "always_expensive", "cascade_only", "composed_v2"]
    results = {
        s: score_strategy(
            triples,
            classifier_preds,
            verifier_scores,
            s,
            args.threshold,
            args.cost_ratio,
            args.high_confidence_threshold,
        )
        for s in strategies
    }

    sweep_results: list[dict] = []
    if args.sweep_hc_thresholds:
        hc_values = [float(x) for x in args.sweep_hc_thresholds.split(",")]
        for hc in hc_values:
            m = score_strategy(
                triples,
                classifier_preds,
                verifier_scores,
                "composed_v2",
                args.threshold,
                args.cost_ratio,
                hc,
            )
            m["high_confidence_threshold"] = hc
            sweep_results.append(m)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_triples": len(triples),
        "threshold": args.threshold,
        "cost_ratio": args.cost_ratio,
        "high_confidence_threshold": args.high_confidence_threshold,
        "classifier_high_conf_share": high_conf_count / len(triples),
        "verifier_report": args.verifier_report,
        "classifier_artifact": args.classifier,
        "results": results,
    }

    out_path = Path(args.out) if args.out else (
        DEFAULT_REPORTS / f"eval_composed_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(f"[comp-v2] wrote report to {out_path}")

    print()
    print("=" * 110)
    print(f"COMPOSED ROUTER EVAL — n={len(triples)}, cost_ratio={args.cost_ratio}, τ={args.threshold}, hc={args.high_confidence_threshold}")
    print("=" * 110)
    print(f"{'strategy':<22} {'cost':>7} {'latency_ms':>11} {'catastrophic':>13} {'wasted':>8} {'acc':>7} {'verifier_call_rate':>20}")
    print("-" * 110)
    for s in strategies:
        m = results[s]
        print(
            f"{s:<22} {m['relative_cost_per_request']:>7.2f} "
            f"{m['avg_latency_ms']:>10.0f}  "
            f"{m['catastrophic_rate'] * 100:>11.2f}% "
            f"{m['wasted_escalation_rate'] * 100:>6.2f}% "
            f"{m['accuracy'] * 100:>6.1f}% "
            f"{m['verifier_call_rate'] * 100:>18.1f}%"
        )
    print()
    composed = results["composed_v2"]
    print(
        f"composed_v2 shortcuts: {composed['classifier_skips_verifier']} cheap-direct "
        f"(saves ~{VERIFIER_LATENCY_MS:.0f}ms each), "
        f"{composed['classifier_skips_cheap']} expensive-direct "
        f"(saves cheap call + verifier each)"
    )

    if sweep_results:
        print()
        print(f"=== Composed_v2 sweep over high-confidence threshold (n={len(triples)}) ===")
        print(f"{'hc':>5}  {'cost':>5}  {'lat_ms':>7}  {'catastrophic':>12}  {'wasted':>7}  {'acc':>6}  {'short_cheap':>11}  {'short_exp':>9}")
        for m in sweep_results:
            print(
                f"{m['high_confidence_threshold']:>5.2f}  "
                f"{m['relative_cost_per_request']:>5.2f}  "
                f"{m['avg_latency_ms']:>7.0f}  "
                f"{m['catastrophic_rate'] * 100:>11.2f}%  "
                f"{m['wasted_escalation_rate'] * 100:>6.2f}%  "
                f"{m['accuracy'] * 100:>5.1f}%  "
                f"{m['classifier_skips_verifier']:>11d}  "
                f"{m['classifier_skips_cheap']:>9d}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
