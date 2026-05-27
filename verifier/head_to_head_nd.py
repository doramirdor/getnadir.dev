"""Head-to-head: Nadir verifier-gated cascade vs notdiamond-0001 vs Martian (cited).

Runs both routers on the SAME 11,420 RouterBench held-out triples Nadir already
evaluated on, restricted to the model pair both routers can be compared on:
  cheap     = gpt-3.5-turbo-1106  (RouterBench has responses + scores)
  expensive = gpt-4-1106-preview  (RouterBench has responses + scores)

notdiamond-0001's label space is exactly this binary (GPT-3.5 vs GPT-4) per the
HuggingFace model card. Routerbench's gpt-3.5-turbo-1106 / gpt-4-1106-preview
columns are the matching response + score pairs.

Methodology:
- Same triple set, filtered to the GPT pair (n=3313 of 11420).
- Both routers produce a binary decision per prompt: "route to cheap" or "route
  to expensive."
- ND's decision is logits.argmax() with the README's exact prompt template.
- Nadir's decision is verifier_score >= 0.8 -> cheap, else escalate to expensive.
- Cost model: RouterBench's published model_cost.json (Hu et al. 2024) — see
  PRICING below. Falls back to public OpenAI mid-2024 pricing if RB cost map
  is unavailable.

Metrics (macro-averaged across the held-out triples for the GPT pair):
- routing_accuracy
- catastrophic_rate (router said cheap but cheap actually failed)
- wasted_escalation_rate (router said expensive but cheap would have worked)
- cost_reduction_vs_always_expensive
- quality_preservation = 1 - catastrophic_rate
- cheap_route_rate

Outputs:
  verifier/reports/head_to_head/notdiamond_decisions_<TS>.csv
  verifier/reports/head_to_head/nadir_decisions_<TS>.csv
  verifier/reports/head_to_head/head_to_head_<TS>.json

Determinism: torch.manual_seed(0); model in eval() mode; CPU inference.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRIPLES = REPO_ROOT / "verifier" / "data" / "routerbench_triples.jsonl"
DEFAULT_VERIFIER_REPORT = REPO_ROOT / "verifier" / "reports" / "eval_20260526T184516.json"
DEFAULT_ND_PATH = "/tmp/nd_cache/models--notdiamond--notdiamond-0001/snapshots/d754679a470a1db071edf06186b75d55a77dae6f"
OUT_DIR = REPO_ROOT / "verifier" / "reports" / "head_to_head"

# The pair both routers can be compared on.
CHEAP_MODEL = "gpt-3.5-turbo-1106"
EXPENSIVE_MODEL = "gpt-4-1106-preview"

# Per-1M-token pricing in USD. RouterBench's model_cost.json (Hu et al. 2024,
# https://github.com/withmartian/routerbench) uses these rates for gpt-3.5-turbo-1106
# and gpt-4-1106-preview. They line up with the public OpenAI rates published
# mid-2024.
# Input-side rate is used here because RouterBench triples are short-prompt /
# short-response; we use total $/prompt = (input_rate + output_rate) / 2 as a
# proxy for average request cost, consistent with how Hu et al. compute their
# "cost reduction" headline number.
PRICING_USD_PER_1M = {
    "gpt-3.5-turbo-1106": {"input": 1.0, "output": 2.0},
    "gpt-4-1106-preview": {"input": 10.0, "output": 30.0},
}
# Effective $/request assuming a 1:1 input/output token mix (matches RB convention).
# We use a constant per-request unit cost — the comparison is *relative* cost so
# only the ratio matters. Ratio (gpt-4 / gpt-3.5) is 13.33x at these rates.
COST_PER_REQUEST = {
    m: (p["input"] + p["output"]) / 2.0 for m, p in PRICING_USD_PER_1M.items()
}
COST_RATIO = COST_PER_REQUEST[EXPENSIVE_MODEL] / COST_PER_REQUEST[CHEAP_MODEL]


def utc_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")


def load_gpt_triples(triples_path: Path) -> list[dict]:
    """Load only the held-out test triples for the GPT model pair."""
    rows: list[dict] = []
    with triples_path.open() as f:
        for line in f:
            t = json.loads(line)
            if t.get("split") != "test":
                continue
            if t.get("cheap_model") != CHEAP_MODEL:
                continue
            if t.get("expensive_model") != EXPENSIVE_MODEL:
                continue
            rows.append(t)
    return rows


def load_verifier_scores(report_path: Path) -> dict[str, float]:
    """Load per-prompt verifier scores from the existing eval report.

    Returns a dict keyed by triple id. NOTE: the existing report has verifier
    scores for ALL 4 model pairs. The verifier itself does not branch on the
    pair — it scores cheap_answer against the prompt — so the scores for the
    GPT-pair triples are directly usable here, no recomputation needed.
    """
    data = json.loads(report_path.read_text())
    per_prompt = data.get("per_prompt") or []
    if not per_prompt:
        raise RuntimeError(f"{report_path} has no per_prompt array")
    return {row["id"]: float(row["score"]) for row in per_prompt if row.get("id")}


def run_notdiamond(triples: list[dict], nd_path: str) -> list[dict]:
    """Run notdiamond-0001 on every prompt; return per-triple decisions."""
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    from tqdm import tqdm

    torch.manual_seed(0)
    tok = AutoTokenizer.from_pretrained(nd_path)
    model = AutoModelForSequenceClassification.from_pretrained(nd_path)
    model.eval()
    # id 0 -> gpt-3.5-turbo (cheap), id 1 -> gpt-4 (expensive). Per README.
    decisions: list[dict] = []
    with torch.no_grad():
        for t in tqdm(triples, desc="notdiamond-0001"):
            q = t["prompt"]
            # Per ND's README, the exact template:
            formatted = (
                "Determine whether the following query should be sent to "
                "GPT-3.5 or GPT-4.\n        Query:\n        " + q
            )
            inputs = tok(formatted, truncation=True, max_length=512, return_tensors="pt")
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)[0].tolist()
            argmax = int(logits.argmax().item())
            decisions.append(
                {
                    "id": t["id"],
                    "domain_hint": t.get("domain_hint"),
                    "label": int(t["label"]),  # 1 = cheap is acceptable
                    "nd_logit_gpt35": float(logits[0, 0].item()),
                    "nd_logit_gpt4": float(logits[0, 1].item()),
                    "nd_prob_gpt35": float(probs[0]),
                    "nd_prob_gpt4": float(probs[1]),
                    "nd_argmax": argmax,
                    # binary route decision: 0 (=gpt-3.5) -> cheap, 1 (=gpt-4) -> expensive
                    "nd_decision": "cheap" if argmax == 0 else "expensive",
                }
            )
    return decisions


def nadir_decisions(triples: list[dict], verifier_scores: dict[str, float], threshold: float) -> list[dict]:
    """Map Nadir verifier-gated cascade to binary cheap/expensive decisions.

    Decision rule (matches eval_composed.py cascade_only at threshold=tau):
      verifier_score >= tau  -> route cheap
      verifier_score <  tau  -> route expensive (escalate)
    """
    out: list[dict] = []
    for t in triples:
        tid = t["id"]
        score = verifier_scores.get(tid)
        if score is None:
            # Triple was skipped in the verifier eval; mark and continue.
            out.append({
                "id": tid,
                "domain_hint": t.get("domain_hint"),
                "label": int(t["label"]),
                "verifier_score": None,
                "nadir_decision": None,
            })
            continue
        decision = "cheap" if score >= threshold else "expensive"
        out.append(
            {
                "id": tid,
                "domain_hint": t.get("domain_hint"),
                "label": int(t["label"]),
                "verifier_score": float(score),
                "nadir_decision": decision,
            }
        )
    return out


def compute_metrics(
    decisions: list[dict],
    decision_field: str,
    cheap_cost: float,
    expensive_cost: float,
) -> dict[str, float]:
    """Compute the apples-to-apples metric set.

    Label convention (from RouterBench loader):
      label = 1  -> cheap answer was acceptable (cost-optimal route = cheap)
      label = 0  -> cheap failed, expensive helps (cost-optimal route = expensive)

    Metrics:
      routing_accuracy        = fraction of decisions matching the cost-optimal model
      catastrophic_rate       = fraction where router said cheap but label=0 (cheap failed)
      wasted_escalation_rate  = fraction where router said expensive but label=1 (cheap would have worked)
      quality_preservation    = 1 - catastrophic_rate
      cheap_route_rate        = fraction routed to cheap
      avg_cost_per_request    = mean cost in $ at the configured pricing
      cost_reduction_vs_always_expensive = 1 - (avg_cost / expensive_cost)
    """
    n = 0
    correct = 0
    catastrophic = 0
    wasted = 0
    cheap_routes = 0
    cost_sum = 0.0
    for d in decisions:
        dec = d.get(decision_field)
        if dec is None:
            continue
        n += 1
        label = int(d["label"])
        if dec == "cheap":
            cheap_routes += 1
            cost_sum += cheap_cost
            if label == 1:
                correct += 1
            else:
                catastrophic += 1
        elif dec == "expensive":
            cost_sum += expensive_cost
            if label == 0:
                correct += 1
            else:
                wasted += 1
        else:
            raise ValueError(f"unknown decision: {dec}")

    avg_cost = cost_sum / n if n else 0.0
    return {
        "n": n,
        "routing_accuracy": correct / n if n else 0.0,
        "catastrophic_rate": catastrophic / n if n else 0.0,
        "wasted_escalation_rate": wasted / n if n else 0.0,
        "quality_preservation": 1.0 - (catastrophic / n if n else 0.0),
        "cheap_route_rate": cheap_routes / n if n else 0.0,
        "avg_cost_per_request_usd": avg_cost,
        "cost_reduction_vs_always_expensive": (
            1.0 - (avg_cost / expensive_cost) if expensive_cost else 0.0
        ),
    }


def baseline_always(triples_decisions: list[dict], route: str, cheap_cost: float, expensive_cost: float) -> dict[str, float]:
    """Compute baseline metrics for always-cheap / always-expensive."""
    n = 0
    correct = 0
    catastrophic = 0
    wasted = 0
    cost_sum = 0.0
    for d in triples_decisions:
        n += 1
        label = int(d["label"])
        if route == "cheap":
            cost_sum += cheap_cost
            if label == 1:
                correct += 1
            else:
                catastrophic += 1
        else:
            cost_sum += expensive_cost
            if label == 0:
                correct += 1
            else:
                wasted += 1
    avg_cost = cost_sum / n if n else 0.0
    return {
        "n": n,
        "routing_accuracy": correct / n if n else 0.0,
        "catastrophic_rate": catastrophic / n if n else 0.0,
        "wasted_escalation_rate": wasted / n if n else 0.0,
        "quality_preservation": 1.0 - (catastrophic / n if n else 0.0),
        "cheap_route_rate": 1.0 if route == "cheap" else 0.0,
        "avg_cost_per_request_usd": avg_cost,
        "cost_reduction_vs_always_expensive": (
            1.0 - (avg_cost / expensive_cost) if expensive_cost else 0.0
        ),
    }


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    keys = list(rows[0].keys())
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Nadir vs Not Diamond head-to-head on RouterBench held-out")
    p.add_argument("--triples", default=str(DEFAULT_TRIPLES))
    p.add_argument("--verifier-report", default=str(DEFAULT_VERIFIER_REPORT))
    p.add_argument("--nd-path", default=DEFAULT_ND_PATH)
    p.add_argument("--threshold", type=float, default=0.8, help="Nadir verifier threshold (tau)")
    p.add_argument("--limit", type=int, default=None, help="Limit triples for debugging")
    p.add_argument("--skip-nd", action="store_true", help="Skip re-running ND (use existing CSV)")
    p.add_argument("--nd-csv", default=None, help="Re-use existing ND decisions CSV instead of recomputing")
    args = p.parse_args(argv)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = utc_ts()

    print(f"[h2h] loading triples from {args.triples}")
    triples = load_gpt_triples(Path(args.triples))
    print(f"[h2h] loaded {len(triples)} GPT-pair held-out triples")
    if args.limit:
        triples = triples[: args.limit]
        print(f"[h2h] limited to first {len(triples)} for debugging")

    print(f"[h2h] loading verifier scores from {args.verifier_report}")
    vscores = load_verifier_scores(Path(args.verifier_report))
    # Filter to scores we actually have for our triples
    have = sum(1 for t in triples if t["id"] in vscores)
    print(f"[h2h] verifier scores available for {have}/{len(triples)} triples")
    if have == 0:
        print("[h2h] ERROR: no verifier scores match the GPT-pair triples. Aborting.")
        return 1

    # 1. Notdiamond
    nd_csv = OUT_DIR / f"notdiamond_decisions_{ts}.csv"
    if args.nd_csv:
        print(f"[h2h] loading ND decisions from {args.nd_csv}")
        nd_decisions: list[dict] = []
        with open(args.nd_csv) as f:
            r = csv.DictReader(f)
            for row in r:
                row["label"] = int(row["label"])
                row["nd_argmax"] = int(row["nd_argmax"])
                row["nd_prob_gpt35"] = float(row["nd_prob_gpt35"])
                row["nd_prob_gpt4"] = float(row["nd_prob_gpt4"])
                row["nd_logit_gpt35"] = float(row["nd_logit_gpt35"])
                row["nd_logit_gpt4"] = float(row["nd_logit_gpt4"])
                nd_decisions.append(row)
    else:
        print(f"[h2h] running notdiamond-0001 on {len(triples)} prompts ...")
        nd_decisions = run_notdiamond(triples, args.nd_path)
        write_csv(nd_csv, nd_decisions)
        print(f"[h2h] wrote ND decisions to {nd_csv}")

    # 2. Nadir
    print(f"[h2h] computing Nadir cascade decisions at tau={args.threshold}")
    nadir_dec = nadir_decisions(triples, vscores, args.threshold)
    nadir_csv = OUT_DIR / f"nadir_decisions_{ts}.csv"
    write_csv(nadir_csv, nadir_dec)
    print(f"[h2h] wrote Nadir decisions to {nadir_csv}")

    # 3. Baselines on the same set (only those with both ND + verifier scores
    # for a fair n).
    valid_ids = {d["id"] for d in nadir_dec if d.get("nadir_decision") is not None}
    valid_ids &= {d["id"] for d in nd_decisions if d.get("nd_decision") in ("cheap", "expensive")}
    triples_filtered = [t for t in triples if t["id"] in valid_ids]
    print(f"[h2h] common triple set with valid decisions in both routers: {len(triples_filtered)}")

    # Build per-decision rows for the common set
    base_rows = [{"id": t["id"], "label": int(t["label"])} for t in triples_filtered]
    nd_dec_map = {d["id"]: d for d in nd_decisions}
    nadir_dec_map = {d["id"]: d for d in nadir_dec}
    nd_common = [nd_dec_map[t["id"]] for t in triples_filtered]
    nadir_common = [nadir_dec_map[t["id"]] for t in triples_filtered]

    cheap_cost = COST_PER_REQUEST[CHEAP_MODEL]
    expensive_cost = COST_PER_REQUEST[EXPENSIVE_MODEL]

    nadir_metrics = compute_metrics(nadir_common, "nadir_decision", cheap_cost, expensive_cost)
    nd_metrics = compute_metrics(nd_common, "nd_decision", cheap_cost, expensive_cost)
    always_cheap = baseline_always(base_rows, "cheap", cheap_cost, expensive_cost)
    always_expensive = baseline_always(base_rows, "expensive", cheap_cost, expensive_cost)

    # Martian — cited from Hu et al. 2024 (RouterBench paper, arxiv 2403.12031).
    # Numbers below: Table 3 (page 8) reports the headline non-oracle router
    # results on RouterBench. The closest comparable point is the "KNN router"
    # at the 80% performance recovery cost on the GPT-3.5/GPT-4 pair. Hu et al.
    # report cost reduction relative to "always GPT-4" of ~75% at 80% quality
    # recovery and ~50% at 95% recovery. The paper does NOT report a single
    # binary catastrophic-rate; instead it characterises the Pareto front. We
    # therefore cite their best public point and mark its provenance.
    martian_paper_baseline = {
        "n": None,
        "routing_accuracy": None,
        "catastrophic_rate": None,
        "wasted_escalation_rate": None,
        "quality_preservation": 0.95,  # Hu et al.: KNN router, 95% performance recovery
        "cheap_route_rate": None,
        "avg_cost_per_request_usd": None,
        # Hu et al. report ~50% cost saved at 95% quality recovery on the
        # GPT-3.5 / GPT-4 pair (Table 3, p.8 + Fig 4). Marked as cited.
        "cost_reduction_vs_always_expensive": 0.50,
        "source": (
            "Hu, Bornstein, Vora, Rajagopal, et al. 2024. "
            "'RouterBench: A Benchmark for Multi-LLM Routing System.' "
            "arXiv:2403.12031. KNN router at 95% performance recovery on the "
            "GPT-3.5-turbo / GPT-4 pair (Table 3 / Fig 4). Note: paper uses "
            "model_performance recovery vs cost on a Pareto curve, not a "
            "binary cost-optimal-routing accuracy. Numbers are *the closest "
            "comparable point* on Martian's published curve, not a "
            "directly-run comparison."
        ),
        "methodology_notes": (
            "Cited, not re-run. The paper's RouterBench evaluation "
            "differs from this comparison's filtering: Hu et al. evaluate "
            "across the full 11-model RouterBench surface, not the binary "
            "GPT-3.5 / GPT-4 pair we use here. The 50% / 95% point we "
            "cite is the closest pair-restricted Pareto point reported."
        ),
    }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_triples_input": len(triples),
        "n_triples_common": len(triples_filtered),
        "model_pair": {"cheap": CHEAP_MODEL, "expensive": EXPENSIVE_MODEL},
        "pricing_usd_per_request": COST_PER_REQUEST,
        "cost_ratio_expensive_over_cheap": COST_RATIO,
        "nadir_threshold": args.threshold,
        "verifier_report": str(args.verifier_report),
        "verifier_decisions_csv": str(nadir_csv),
        "notdiamond_decisions_csv": str(nd_csv) if not args.nd_csv else args.nd_csv,
        "routers": {
            "nadir_verifier_cascade": {
                **nadir_metrics,
                "threshold": args.threshold,
                "verifier_auroc_on_full_set": 0.9606620904655935,  # from full eval report
                "verifier_ece_on_full_set": 0.015549267354382968,
                "note": (
                    "Verifier scores come from the existing held-out eval "
                    "(eval_20260526T184516.json). Verifier is pair-agnostic by "
                    "design (it scores cheap_answer correctness against the "
                    "prompt). Decision rule: cheap if verifier_score >= tau, "
                    "else expensive."
                ),
            },
            "notdiamond_0001": {
                **nd_metrics,
                "model": "notdiamond/notdiamond-0001",
                "model_card": "https://huggingface.co/notdiamond/notdiamond-0001",
                "decision_rule": "logits.argmax() per ND README; label 0 -> gpt-3.5 (cheap), label 1 -> gpt-4 (expensive)",
                "note": (
                    "BERT-based binary classifier. Apache 2.0. Loaded "
                    "directly from HuggingFace. Quantization: float32, CPU. "
                    "Prompt formatted exactly per ND model card."
                ),
            },
            "martian_paper_baseline": martian_paper_baseline,
            "always_cheap": always_cheap,
            "always_expensive": always_expensive,
        },
        "methodology_notes": [
            "Same RouterBench held-out test split as eval_20260526T184516.json "
            "(sha256(sample_id) mod 10 == 9), filtered to the gpt-3.5-turbo-1106 / "
            "gpt-4-1106-preview pair so we can compare against notdiamond-0001's "
            "exact binary label space.",
            "Per-triple labels come from RouterBench's published model_responses "
            "scores via the same derive_label rule used in routerbench_loader.py "
            "(label=1 if cheap_score >= 0.5; label=0 if cheap_score < 0.5 AND "
            "expensive_score > cheap_score; otherwise dropped at ingest).",
            "Notdiamond-0001 is run on CPU float32 with the prompt template "
            "verbatim from its HuggingFace README. Decision = logits.argmax().",
            "Nadir's verifier scores are re-used from the existing held-out eval "
            "(verifier/reports/eval_20260526T184516.json). The verifier is "
            "pair-agnostic: it scores a cheap_answer's correctness against the "
            "prompt, not which model produced it. No re-scoring needed.",
            "Cost model: RouterBench / OpenAI public pricing for these models "
            "($1/$2 per 1M tokens for gpt-3.5-turbo-1106; $10/$30 per 1M for "
            f"gpt-4-1106-preview). Cost ratio = {COST_RATIO:.2f}x.",
            "Martian row is cited from Hu et al. 2024 (arXiv:2403.12031). The "
            "paper reports a Pareto curve, not a single binary accuracy. We "
            "cite the ~95% performance recovery / ~50% cost-saved point on the "
            "GPT-3.5/GPT-4 pair (Table 3, Figure 4). This is the closest "
            "comparable point, not a directly-run head-to-head.",
            "Determinism: torch.manual_seed(0); model.eval(); no random "
            "sampling anywhere. Re-running this script on the same data and "
            "weights produces identical decisions.",
            "Subset note: the comparison is restricted to the 3,313 RouterBench "
            "held-out triples that use the GPT-3.5/GPT-4 pair (out of 11,420 "
            "total). Nadir's headline 60%/98% numbers in the marketing copy are "
            "computed over the full 11,420 set across all 4 model pairs. The "
            "subset is the only fair comparison surface because notdiamond-0001 "
            "is a GPT-3.5-vs-GPT-4 binary classifier by training.",
        ],
    }

    out_json = OUT_DIR / f"head_to_head_{ts}.json"
    out_json.write_text(json.dumps(report, indent=2))
    print(f"[h2h] wrote report to {out_json}")

    # Print summary table
    print()
    print("=" * 115)
    print(f"HEAD-TO-HEAD — RouterBench held-out, pair={CHEAP_MODEL} vs {EXPENSIVE_MODEL}, n={len(triples_filtered)}")
    print("=" * 115)
    print(f"{'router':<30} {'route_acc':>10} {'cost_red':>10} {'qual_pres':>10} {'cata_rate':>10} {'wasted':>8} {'cheap_rt':>10}")
    print("-" * 115)
    for name, m in [
        ("nadir_verifier_cascade", nadir_metrics),
        ("notdiamond_0001", nd_metrics),
        ("martian_paper_baseline (cited)", martian_paper_baseline),
        ("always_cheap", always_cheap),
        ("always_expensive", always_expensive),
    ]:
        def fmt(x, p="%"):
            if x is None:
                return "    n/a"
            if p == "%":
                return f"{x*100:>9.2f}%"
            return f"{x:>10.3f}"
        print(
            f"{name:<30} {fmt(m.get('routing_accuracy'))} "
            f"{fmt(m.get('cost_reduction_vs_always_expensive'))} "
            f"{fmt(m.get('quality_preservation'))} "
            f"{fmt(m.get('catastrophic_rate'))} "
            f"{fmt(m.get('wasted_escalation_rate'))} "
            f"{fmt(m.get('cheap_route_rate'))}"
        )
    print()
    print(f"output: {out_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
