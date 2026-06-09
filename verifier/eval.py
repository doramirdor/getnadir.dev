"""Real eval harness for the verifier checkpoint.

This is the held-out evaluation that verifier_smoke.py is NOT. It runs the
trained checkpoint against the test split (10% of the RouterBench-derived
corpus, never seen during training), computes the metrics that actually
matter for cascade routing decisions, and writes a JSON report.

Metrics
-------
Discrimination
    AUROC, PR-AUC, accuracy and F1 at threshold sweep.

Calibration
    Reliability table: predicted probability bin -> empirical positive rate.
    Expected Calibration Error (ECE) with 10 equal-width bins.

Cost-impact (the one that decides go / no-go for shadow mode)
    For each threshold T:
      accept_rate           share of triples where verifier says "cheap is fine"
      downgrade_rate        share where label==0 (escalate needed) but verifier
                            said accept -> these are the catastrophic routes
      wasted_escalation     share where label==1 (cheap was fine) but verifier
                            said escalate -> these are pure cost waste

Per-domain breakdown
    AUROC and downgrade-rate by `domain_hint`, sorted worst-first. The
    average can hide that the verifier is great on MMLU but bad on math.

Usage
-----
    python verifier/eval.py
    python verifier/eval.py --weights verifier/weights/best --limit 500
    python verifier/eval.py --batch-size 16 --out verifier/reports/eval_v1.json

Eval is CPU-only by design (matches production inference). On a MacBook
Pro M-series, the full 11k test set runs in ~12 minutes batched.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRIPLES = REPO_ROOT / "verifier" / "data" / "routerbench_triples.jsonl"
DEFAULT_WEIGHTS = REPO_ROOT / "verifier" / "weights" / "best"
DEFAULT_REPORTS = REPO_ROOT / "verifier" / "reports"

THRESHOLDS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.90]
CALIBRATION_BINS = 10


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


def score_batch(
    model: Any,
    tokenizer: Any,
    batch: list[dict],
    max_length: int,
) -> list[float]:
    import torch

    prompts = [r["prompt"] for r in batch]
    pairs = [
        f"CHEAP:\n{r['cheap_answer']}\n\nEXPENSIVE:\n{r['expensive_answer']}"
        for r in batch
    ]
    inputs = tokenizer(
        text=prompts,
        text_pair=pairs,
        truncation=True,
        max_length=max_length,
        padding=True,
        return_tensors="pt",
    )
    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)
    return [float(probs[i, 1].item()) for i in range(probs.shape[0])]


def auroc(labels: list[int], scores: list[float]) -> float:
    """Mann-Whitney U AUROC, no sklearn dependency."""
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        return float("nan")
    paired = sorted(
        [(s, 1) for s in pos] + [(s, 0) for s in neg], key=lambda x: x[0]
    )
    ranks: dict[float, list[int]] = defaultdict(list)
    for i, (s, _) in enumerate(paired, start=1):
        ranks[s].append(i)
    avg_ranks = {s: sum(rs) / len(rs) for s, rs in ranks.items()}
    rank_sum_pos = sum(avg_ranks[s] for s in pos)
    n_p, n_n = len(pos), len(neg)
    u = rank_sum_pos - n_p * (n_p + 1) / 2
    return u / (n_p * n_n)


def metrics_at_threshold(
    labels: list[int], scores: list[float], threshold: float
) -> dict[str, float]:
    tp = fp = tn = fn = 0
    for y, s in zip(labels, scores):
        pred = 1 if s >= threshold else 0
        if pred == 1 and y == 1:
            tp += 1
        elif pred == 1 and y == 0:
            fp += 1
        elif pred == 0 and y == 0:
            tn += 1
        else:
            fn += 1
    n = len(labels)
    accept_rate = (tp + fp) / n if n else 0.0
    downgrade_rate = fp / n if n else 0.0
    wasted_escalation = fn / n if n else 0.0
    accuracy = (tp + tn) / n if n else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {
        "threshold": threshold,
        "accept_rate": accept_rate,
        "downgrade_rate": downgrade_rate,
        "wasted_escalation": wasted_escalation,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
    }


def calibration(
    labels: list[int], scores: list[float], n_bins: int = CALIBRATION_BINS
) -> tuple[list[dict], float]:
    bins: list[dict] = []
    n = len(labels)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = i / n_bins, (i + 1) / n_bins
        members = [
            (y, s) for y, s in zip(labels, scores) if lo <= s < hi or (i == n_bins - 1 and s == 1.0)
        ]
        if not members:
            bins.append({"bin_lo": lo, "bin_hi": hi, "n": 0, "mean_pred": None, "empirical_pos_rate": None})
            continue
        mean_pred = sum(s for _, s in members) / len(members)
        emp = sum(y for y, _ in members) / len(members)
        bins.append(
            {
                "bin_lo": lo,
                "bin_hi": hi,
                "n": len(members),
                "mean_pred": mean_pred,
                "empirical_pos_rate": emp,
            }
        )
        ece += (len(members) / n) * abs(mean_pred - emp)
    return bins, ece


def per_domain(
    triples: list[dict], scores: list[float], min_n: int = 20
) -> list[dict]:
    buckets: dict[str, dict[str, list]] = defaultdict(lambda: {"labels": [], "scores": []})
    for t, s in zip(triples, scores):
        d = t.get("domain_hint") or "unknown"
        buckets[d]["labels"].append(int(t["label"]))
        buckets[d]["scores"].append(s)

    out: list[dict] = []
    for domain, b in buckets.items():
        if len(b["labels"]) < min_n:
            continue
        a = auroc(b["labels"], b["scores"])
        m = metrics_at_threshold(b["labels"], b["scores"], 0.5)
        out.append(
            {
                "domain": domain,
                "n": len(b["labels"]),
                "pos_rate": sum(b["labels"]) / len(b["labels"]),
                "auroc": a,
                "accuracy_at_0.5": m["accuracy"],
                "downgrade_rate_at_0.5": m["downgrade_rate"],
            }
        )
    out.sort(key=lambda r: (math.isnan(r["auroc"]), r["auroc"]))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Held-out eval for the verifier checkpoint.")
    parser.add_argument("--weights", type=str, default=str(DEFAULT_WEIGHTS))
    parser.add_argument("--triples", type=str, default=str(DEFAULT_TRIPLES))
    parser.add_argument("--limit", type=int, default=None, help="Eval only first N test triples (default: all).")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--quantize", action="store_true", default=False, help="INT8 quantize before eval (matches prod inference).")
    parser.add_argument(
        "--out",
        type=str,
        default=None,
        help="Output JSON path (default: verifier/reports/eval_<timestamp>.json)",
    )
    args = parser.parse_args(argv)

    ckpt = Path(args.weights)
    if not (ckpt / "config.json").exists():
        print(f"ERROR: no config.json in {ckpt}", file=sys.stderr)
        return 1

    triples_path = Path(args.triples)
    if not triples_path.exists():
        print(f"ERROR: triples file not found: {triples_path}", file=sys.stderr)
        return 1

    print(f"[eval] loading test triples from {triples_path}")
    triples = load_test_triples(triples_path, args.limit)
    if not triples:
        print("ERROR: no test triples found.", file=sys.stderr)
        return 1
    print(f"[eval] {len(triples)} test triples loaded")

    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print(f"[eval] loading verifier from {ckpt}")
    tokenizer = AutoTokenizer.from_pretrained(str(ckpt))
    model = AutoModelForSequenceClassification.from_pretrained(str(ckpt)).to("cpu").eval()
    n_params = sum(p.numel() for p in model.parameters()) / 1e6
    print(f"[eval] verifier loaded ({n_params:.1f}M params)")

    if args.quantize:
        try:
            torch.backends.quantized.engine = "qnnpack"
        except Exception:
            pass
        try:
            model = torch.quantization.quantize_dynamic(
                model, {torch.nn.Linear}, dtype=torch.qint8
            )
            print("[eval] INT8 dynamic quantization applied")
        except Exception as e:
            print(f"[eval] WARN: quantization failed, using FP32 ({e})")

    print(f"[eval] scoring (batch_size={args.batch_size})")
    scores: list[float] = []
    t0 = time.time()
    for i in range(0, len(triples), args.batch_size):
        batch = triples[i : i + args.batch_size]
        scores.extend(score_batch(model, tokenizer, batch, args.max_length))
        if (i // args.batch_size) % 25 == 0:
            elapsed = time.time() - t0
            rate = len(scores) / elapsed if elapsed > 0 else 0
            eta_s = (len(triples) - len(scores)) / rate if rate > 0 else 0
            print(f"[eval]   {len(scores)}/{len(triples)} ({rate:.1f}/s, eta {eta_s:.0f}s)")
    total_time = time.time() - t0
    p_per_call = total_time / len(scores) * 1000
    print(f"[eval] scoring done in {total_time:.1f}s ({p_per_call:.1f}ms/call)")

    labels = [int(t["label"]) for t in triples]
    overall_auroc = auroc(labels, scores)
    threshold_table = [metrics_at_threshold(labels, scores, t) for t in THRESHOLDS]
    calib_bins, ece = calibration(labels, scores)
    domain_table = per_domain(triples, scores)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "weights": str(ckpt),
        "n_triples": len(triples),
        "quantized": bool(args.quantize),
        "latency_ms_per_call_cpu": p_per_call,
        "pos_rate": sum(labels) / len(labels),
        "auroc": overall_auroc,
        "ece": ece,
        "thresholds": threshold_table,
        "calibration_bins": calib_bins,
        "per_domain": domain_table,
        # Per-prompt scores + labels so eval_comparison.py and any future
        # head-to-head can reuse the verifier output without re-running the
        # full ~12 minute scoring loop.
        "per_prompt": [
            {
                "id": t.get("id"),
                "label": int(t["label"]),
                "score": s,
                "domain_hint": t.get("domain_hint"),
                "cheap_model": t.get("cheap_model"),
                "expensive_model": t.get("expensive_model"),
            }
            for t, s in zip(triples, scores)
        ],
    }

    out_path = Path(args.out) if args.out else DEFAULT_REPORTS / f"eval_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(f"[eval] wrote report to {out_path}")

    print()
    print("=" * 72)
    print(f"VERIFIER EVAL — {len(triples)} held-out triples")
    print("=" * 72)
    print(f"AUROC:                  {overall_auroc:.3f}")
    print(f"ECE (10-bin):           {ece:.3f}")
    print(f"Positive rate:          {sum(labels) / len(labels):.3f}")
    print(f"Inference latency:      {p_per_call:.1f}ms/call CPU{' (INT8)' if args.quantize else ''}")
    print()
    print(f"{'thresh':>7}  {'accept':>7}  {'downgr':>7}  {'wasted':>7}  {'acc':>6}  {'f1':>6}")
    print("-" * 60)
    for r in threshold_table:
        print(
            f"{r['threshold']:>7.2f}  {r['accept_rate']:>7.3f}  "
            f"{r['downgrade_rate']:>7.3f}  {r['wasted_escalation']:>7.3f}  "
            f"{r['accuracy']:>6.3f}  {r['f1']:>6.3f}"
        )
    print()
    print("Worst 5 domains by AUROC (min 20 examples):")
    for r in domain_table[:5]:
        print(f"  {r['domain']:<40}  n={r['n']:>4}  auroc={r['auroc']:.3f}  "
              f"downgr@0.5={r['downgrade_rate_at_0.5']:.3f}")
    print()
    print("Best 5 domains by AUROC:")
    for r in domain_table[-5:][::-1]:
        print(f"  {r['domain']:<40}  n={r['n']:>4}  auroc={r['auroc']:.3f}  "
              f"downgr@0.5={r['downgrade_rate_at_0.5']:.3f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
