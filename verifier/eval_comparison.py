"""Head-to-head eval: pre-generation classifier vs verifier-gated cascade.

This is the apples-to-apples comparison that the paper's Table 2 needs:
both routers run on the *exact same* held-out RouterBench triples, and we
report the metrics that actually decide which routing strategy wins:

    - relative_cost: sum(per-request cost) / n, normalized so always-cheap = 1.0
    - catastrophic_rate: share of label==0 prompts served from the cheap tier
                         (these are the routes the quality floor would catch)
    - wasted_escalation: share of label==1 prompts served from the expensive
                         tier (cheap was fine but we paid extra)
    - accuracy: share of decisions that matched the optimal tier given the
                ground-truth label

Setup
-----
Both routers face a binary decision: serve cheap or serve expensive.

The verifier cascade is binary by design (cheap first, escalate on reject).

The production classifier is 3-tier (simple / medium / complex). We project
to binary as:
    simple                → "use cheap"
    medium | complex      → "use expensive"
This matches what happens in production when the cheap tier is Haiku-4.5
and any escalation lands on Sonnet-4.6 or Opus-4.6. The verifier cascade
gets to recover from a "use cheap" decision; the classifier does not.

Cost model: cheap = 1.0, expensive = COST_RATIO (default 12, matching
Anthropic's Haiku-4.5 vs Sonnet-4.6 price ratio at the time of writing).
The cascade ALWAYS pays cheap, plus expensive if it escalates. The
classifier pays cheap on "simple" predictions, expensive otherwise.

Verifier scores are loaded from the JSON dump produced by
`verifier/eval.py --quantize`, so this script does NOT re-run the 12-minute
verifier scoring loop. If the dump is missing or stale, re-run `eval.py`
first.

Usage
-----
    python verifier/eval_comparison.py \
        --verifier-report verifier/reports/eval_<timestamp>.json \
        --threshold 0.70 \
        --cost-ratio 12

The output JSON lands in verifier/reports/eval_comparison_<timestamp>.json
and the human-readable side-by-side table is printed to stdout for direct
inclusion in the paper.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRIPLES = REPO_ROOT / "verifier" / "data" / "routerbench_triples.jsonl"
DEFAULT_REPORTS = REPO_ROOT / "verifier" / "reports"


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
    """Load per-prompt verifier scores keyed by triple id."""
    data = json.loads(report_path.read_text())
    per_prompt = data.get("per_prompt") or []
    if not per_prompt:
        raise RuntimeError(
            f"{report_path} has no per_prompt array. Re-run eval.py with the "
            f"updated dump (per-prompt scores) before running this comparison."
        )
    return {row["id"]: float(row["score"]) for row in per_prompt if row.get("id")}


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------


def cascade_decision(
    score: float, threshold: float
) -> tuple[str, bool]:
    """Cascade picks cheap if score >= threshold, else escalates."""
    if score >= threshold:
        return "cheap", False
    return "expensive", True


def classifier_decision_from_tier(tier: str) -> str:
    """Project the 3-tier classifier output to a binary {cheap, expensive}."""
    if tier == "simple":
        return "cheap"
    return "expensive"


# ---------------------------------------------------------------------------
# Metrics aggregator
# ---------------------------------------------------------------------------


def aggregate(
    decisions: list[dict],
    cost_ratio: float,
) -> dict[str, Any]:
    """Compute the head-to-head metrics for a single strategy.

    `decisions` is a list of {"served": "cheap"|"expensive", "label": 0|1,
    "escalated": bool}. Cost: cheap=1, expensive=cost_ratio; if escalated,
    the cascade pays BOTH (cheap call wasted, expensive call served).
    """
    n = len(decisions)
    if n == 0:
        return {}
    cost_sum = 0.0
    catastrophic = 0
    wasted = 0
    correct = 0
    accept_cheap = 0
    escalations = 0
    for d in decisions:
        served, label, escalated = d["served"], d["label"], d.get("escalated", False)
        if escalated:
            cost_sum += 1.0 + cost_ratio  # paid cheap + expensive
            escalations += 1
        elif served == "cheap":
            cost_sum += 1.0
            accept_cheap += 1
        else:
            cost_sum += cost_ratio
        # Catastrophic: served cheap on a label==0 prompt (cheap was not OK).
        if served == "cheap" and label == 0:
            catastrophic += 1
        # Wasted: served expensive on a label==1 prompt (cheap was fine).
        if served == "expensive" and label == 1:
            wasted += 1
        # "Correct": served cheap on label==1 OR served expensive on label==0.
        if (served == "cheap" and label == 1) or (served == "expensive" and label == 0):
            correct += 1

    return {
        "n": n,
        "relative_cost_per_request": cost_sum / n,
        "relative_cost_per_request_vs_always_cheap": cost_sum / n,
        "catastrophic_rate": catastrophic / n,
        "wasted_escalation_rate": wasted / n,
        "accuracy": correct / n,
        "accept_cheap_rate": accept_cheap / n,
        "escalation_rate": escalations / n,
    }


# ---------------------------------------------------------------------------
# Strategy runners
# ---------------------------------------------------------------------------


def run_always_cheap(triples: list[dict], cost_ratio: float) -> dict[str, Any]:
    decisions = [
        {"served": "cheap", "label": int(t["label"]), "escalated": False}
        for t in triples
    ]
    return aggregate(decisions, cost_ratio)


def run_always_expensive(triples: list[dict], cost_ratio: float) -> dict[str, Any]:
    decisions = [
        {"served": "expensive", "label": int(t["label"]), "escalated": False}
        for t in triples
    ]
    return aggregate(decisions, cost_ratio)


def run_verifier_cascade(
    triples: list[dict],
    scores: dict[str, float],
    threshold: float,
    cost_ratio: float,
) -> dict[str, Any]:
    decisions: list[dict] = []
    missing = 0
    for t in triples:
        tid = t.get("id")
        if tid is None or tid not in scores:
            missing += 1
            continue
        s = scores[tid]
        served, escalated = cascade_decision(s, threshold)
        decisions.append(
            {"served": served, "label": int(t["label"]), "escalated": escalated}
        )
    metrics = aggregate(decisions, cost_ratio)
    metrics["missing_scores"] = missing
    return metrics


def run_classifier(
    triples: list[dict],
    analyzer: Any,
    cost_ratio: float,
    verbose: bool = True,
) -> tuple[dict[str, Any], list[str]]:
    """Run the 3-tier classifier on each prompt, project to binary, score."""
    decisions: list[dict] = []
    predicted_tiers: list[str] = []
    t0 = time.time()
    for i, t in enumerate(triples):
        prompt = t.get("prompt") or ""
        tier, _conf, _meta = analyzer.classify(prompt)
        served = classifier_decision_from_tier(tier)
        predicted_tiers.append(tier)
        decisions.append(
            {"served": served, "label": int(t["label"]), "escalated": False}
        )
        if verbose and (i + 1) % 500 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(triples) - (i + 1)) / rate
            print(
                f"[classifier]   {i + 1}/{len(triples)} "
                f"({rate:.1f}/s, eta {eta:.0f}s)",
                flush=True,
            )
    metrics = aggregate(decisions, cost_ratio)
    return metrics, predicted_tiers


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def print_row(label: str, m: dict[str, Any]) -> None:
    print(
        f"{label:<40}  cost={m['relative_cost_per_request']:>5.2f}  "
        f"catastrophic={m['catastrophic_rate'] * 100:>5.2f}%  "
        f"wasted={m['wasted_escalation_rate'] * 100:>5.2f}%  "
        f"acc={m['accuracy'] * 100:>5.1f}%"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Head-to-head: pre-generation classifier vs verifier cascade."
    )
    parser.add_argument(
        "--triples", type=str, default=str(DEFAULT_TRIPLES),
        help="RouterBench triples JSONL (uses split=='test').",
    )
    parser.add_argument(
        "--verifier-report", type=str, required=True,
        help="Path to verifier eval JSON with per_prompt scores.",
    )
    parser.add_argument(
        "--threshold", type=float, default=0.70,
        help="Cascade acceptance threshold (default 0.70).",
    )
    parser.add_argument(
        "--cost-ratio", type=float, default=12.0,
        help="Cost multiplier expensive/cheap (default 12, ~Haiku→Sonnet 4.x).",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Eval only the first N test triples (default: all).",
    )
    parser.add_argument(
        "--skip-classifier", action="store_true",
        help="Skip the production classifier path (faster; only compares "
             "always-cheap / always-expensive / cascade).",
    )
    parser.add_argument(
        "--classifier-rules",
        type=str,
        default="argmax,cost_sensitive_20",
        help="Comma-separated classifier configs to run. Each entry is either "
             "'argmax' or 'cost_sensitive_<lambda>'. Default runs both.",
    )
    parser.add_argument(
        "--classifier-variant",
        type=str,
        default="asym",
        choices=("asym", "symmetric"),
        help="Which checkpoint the classifier loads. 'asym' is the shipped "
             "(bugged) variant with simple-class F1 = 0.0; 'symmetric' is "
             "the working companion checkpoint.",
    )
    parser.add_argument(
        "--out", type=str, default=None,
        help="Output JSON path (default: verifier/reports/eval_comparison_<ts>.json).",
    )
    args = parser.parse_args(argv)

    triples_path = Path(args.triples)
    verifier_report_path = Path(args.verifier_report)
    if not triples_path.exists():
        print(f"ERROR: triples not found: {triples_path}", file=sys.stderr)
        return 1
    if not verifier_report_path.exists():
        print(f"ERROR: verifier report not found: {verifier_report_path}", file=sys.stderr)
        return 1

    print(f"[comp] loading test triples from {triples_path}")
    triples = load_test_triples(triples_path, args.limit)
    if not triples:
        print("ERROR: no test triples found.", file=sys.stderr)
        return 1
    print(f"[comp] {len(triples)} test triples loaded")

    print(f"[comp] loading verifier scores from {verifier_report_path}")
    scores = load_verifier_scores(verifier_report_path)
    print(f"[comp] {len(scores)} verifier scores loaded")

    # Baselines
    always_cheap = run_always_cheap(triples, args.cost_ratio)
    always_expensive = run_always_expensive(triples, args.cost_ratio)
    cascade = run_verifier_cascade(triples, scores, args.threshold, args.cost_ratio)

    classifier_runs: list[dict[str, Any]] = []

    if not args.skip_classifier:
        # The classifier import is heavy (BGE encoder + torch). Defer until
        # we actually need it so --skip-classifier stays fast.
        print("[comp] loading wide_deep_asym classifier ...")
        sys.path.insert(0, str(REPO_ROOT / "backend"))
        os.chdir(REPO_ROOT / "backend")  # analyzer resolves model_path relative to its module
        try:
            from app.complexity.wide_deep_asym_analyzer import WideDeepAsymAnalyzer
        except Exception as e:  # noqa: BLE001
            print(f"ERROR: could not import WideDeepAsymAnalyzer: {e}", file=sys.stderr)
            return 1
        for raw_rule in args.classifier_rules.split(","):
            raw_rule = raw_rule.strip()
            if not raw_rule:
                continue
            if raw_rule == "argmax":
                analyzer = WideDeepAsymAnalyzer(
                    decision_rule="argmax",
                    checkpoint_variant=args.classifier_variant,
                )
                label = f"wide_deep ({args.classifier_variant}, argmax)"
            elif raw_rule.startswith("cost_sensitive_"):
                lam = float(raw_rule.split("_", 2)[2])
                analyzer = WideDeepAsymAnalyzer(
                    decision_rule="cost_sensitive",
                    cost_lambda=lam,
                    checkpoint_variant=args.classifier_variant,
                )
                label = f"wide_deep ({args.classifier_variant}, cost_sensitive λ={lam:g})"
            else:
                print(f"[comp] WARN: unknown classifier rule {raw_rule!r}, skipping")
                continue
            print(f"[comp] running {label} on every prompt ...")
            metrics, predicted_tiers = run_classifier(triples, analyzer, args.cost_ratio)
            tier_counts = {
                tier: predicted_tiers.count(tier)
                for tier in ("simple", "medium", "complex")
            }
            classifier_runs.append(
                {"rule": raw_rule, "label": label, "metrics": metrics, "tier_counts": tier_counts}
            )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_triples": len(triples),
        "threshold": args.threshold,
        "cost_ratio_expensive_over_cheap": args.cost_ratio,
        "verifier_report": str(verifier_report_path),
        "results": {
            "always_cheap": always_cheap,
            "always_expensive": always_expensive,
            "verifier_cascade": cascade,
        },
        "classifier_runs": classifier_runs,
    }

    out_path = Path(args.out) if args.out else (
        DEFAULT_REPORTS / f"eval_comparison_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(f"[comp] wrote report to {out_path}")

    print()
    print("=" * 92)
    print(
        f"HEAD-TO-HEAD COMPARISON — {len(triples)} held-out triples, "
        f"cost_ratio={args.cost_ratio:g}, τ={args.threshold:g}"
    )
    print("=" * 92)
    print(f"{'system':<40}  {'cost':>5}  {'catastrophic':>12}  {'wasted':>7}  {'acc':>5}")
    print("-" * 92)
    print_row("always_cheap", always_cheap)
    print_row("always_expensive", always_expensive)
    print_row("verifier_cascade (ours)", cascade)
    for run in classifier_runs:
        print_row(run["label"], run["metrics"])
    if classifier_runs:
        print()
        print("Classifier tier distribution per rule:")
        for run in classifier_runs:
            counts = run["tier_counts"]
            line = "  ".join(
                f"{tier}={counts.get(tier, 0)} ({100.0 * counts.get(tier, 0) / len(triples):.1f}%)"
                for tier in ("simple", "medium", "complex")
            )
            print(f"  {run['label']:<40}  {line}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
