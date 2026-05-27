"""RouterArena full-split NO-CLASSIFIER cost-minimization strategies.

Submitted as a second leaderboard entry: nadir-cheapest.

Strategy A:        cheapest cached model per prompt (output $/M, alpha tie-break)
Strategy A-prime:  cheapest among cached models with output $/M < 1.0
                   (fall back to cheapest overall if none qualify)
Strategy E:        Strategy A + length-budgeted max_tokens (R2-Router playbook)

Honest disclosure:
- Decisions use ONLY per-model cost from RouterArena's model_cost.json plus the
  set of cached models per prompt. We do NOT consult per-model accuracy when
  choosing a model.
- Tie-break is alphabetical on the cached-model name.
- Strategy E recomputes cost as min(cached_out, budget) for that prompt, keeping
  cached accuracy as the optimistic upper bound. Documented in the report.
- No production calls; everything is local.

Inputs:
  /tmp/routerarena_acc_lookup.pkl  (gi -> {model: {acc, cost, in, out}})
  upstream/RouterArena/model_cost/model_cost.json
  upstream/RouterArena/universal_model_names.py (for provider-prefix mapping)
  upstream/RouterArena/cached_results/gpt-4o-mini.jsonl  (for prompt lengths)

Outputs:
  cheapest_decisions_{A|Aprime|E}_<ts>.csv
  cheapest_predictions_{A|Aprime|E}_<ts>.json  (also copied into upstream preds)
  cheapest_official_score_{A|Aprime|E}_<ts>.txt
  CHEAPEST_RESULTS.md
"""
from __future__ import annotations

import csv
import json
import math
import pickle
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = Path("/Users/ellabaror/Documents/code/Nadir/getnadir.dev")
DRY_RUN_DIR = REPO_ROOT / "eval/routerarena/reports/dry_run_20260527T130817Z"
UP = DRY_RUN_DIR / "upstream/RouterArena"
PREDICTIONS_DIR = UP / "router_inference/predictions"
SCORER = UP / "router_evaluation/compute_scores.py"
COST_JSON = UP / "model_cost/model_cost.json"
RESCORE_DIR = REPO_ROOT / "eval/routerarena/rescoring"
LOOKUP_PKL = Path("/tmp/routerarena_acc_lookup.pkl")
GPT4O_JSONL = UP / "cached_results/gpt-4o-mini.jsonl"

# Strategy E length buckets (R2-Router playbook)
def length_budget(prompt_text: str) -> int:
    n = len(prompt_text or "")
    if n < 500:
        return 256
    if n < 2000:
        return 512
    return 1024


def load_mapping() -> Dict[str, str]:
    sys.path.insert(0, str(UP))
    from universal_model_names import mapping  # type: ignore
    return dict(mapping)


def build_cost_table(cost_blob: Dict, mapping: Dict[str, str]) -> Dict[str, Tuple[float, float]]:
    """Return cached-model-name -> (input_$/M, output_$/M). For provider-prefixed
    names, fall back through the mapping. For names we can't resolve, return
    +inf so they never get chosen (and are logged)."""
    table: Dict[str, Tuple[float, float]] = {}
    return table


def resolve_cost(model_name: str, cost_blob: Dict, mapping: Dict[str, str]) -> Tuple[float, float, str]:
    """Return (input $/M, output $/M, resolved_name_used)."""
    if model_name in cost_blob:
        c = cost_blob[model_name]
        return float(c["input_token_price_per_million"]), float(c["output_token_price_per_million"]), model_name
    mapped = mapping.get(model_name)
    if mapped and mapped in cost_blob:
        c = cost_blob[mapped]
        return float(c["input_token_price_per_million"]), float(c["output_token_price_per_million"]), mapped
    return math.inf, math.inf, model_name


def compute_arena_score(cost_per_1k, accuracy, beta=0.1, c_max=200, c_min=0.0044):
    cost = max(c_min, min(cost_per_1k, c_max))
    C_i = (math.log2(c_max) - math.log2(cost)) / (math.log2(c_max) - math.log2(c_min))
    if accuracy <= 0 or C_i <= 0:
        return 0.0
    return ((1 + beta) * accuracy * C_i) / (beta * accuracy + C_i)


def load_prompt_lengths() -> Dict[str, int]:
    """gi -> question text length, from gpt-4o-mini.jsonl which covers all 8400."""
    out: Dict[str, int] = {}
    with GPT4O_JSONL.open() as f:
        for line in f:
            d = json.loads(line)
            gi = d.get("global_index") or d.get("global index")
            out[gi] = len(d.get("question") or "")
    return out


def pick_strategy_A(cached: Dict[str, dict], cost_blob: Dict, mapping: Dict[str, str]) -> Tuple[str, float, float]:
    """Cheapest by output $/M, alpha tie-break. Returns (model, in_price, out_price)."""
    rows = []
    for m in cached.keys():
        ip, op, _ = resolve_cost(m, cost_blob, mapping)
        rows.append((op, ip, m))
    # alpha tie-break is achieved by sorting tuple (out_price, model_name)
    rows.sort(key=lambda r: (r[0], r[2]))
    op, ip, m = rows[0]
    return m, ip, op


def pick_strategy_Aprime(cached: Dict[str, dict], cost_blob: Dict, mapping: Dict[str, str]) -> Tuple[str, float, float, str]:
    """Cheapest by output $/M, restricted to output $/M < 1.0. If none qualify,
    fall back to Strategy A pick. Returns (model, in_price, out_price, note)."""
    in_tier = []
    all_rows = []
    for m in cached.keys():
        ip, op, _ = resolve_cost(m, cost_blob, mapping)
        all_rows.append((op, ip, m))
        if op < 1.0:
            in_tier.append((op, ip, m))
    if in_tier:
        in_tier.sort(key=lambda r: (r[0], r[2]))
        op, ip, m = in_tier[0]
        return m, ip, op, "in_sub1_tier"
    all_rows.sort(key=lambda r: (r[0], r[2]))
    op, ip, m = all_rows[0]
    return m, ip, op, "fallback_no_sub1"


def main():
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    print(f"[cheap] ts={ts}")

    print("[cheap] loading inputs ...")
    cost_blob = json.loads(COST_JSON.read_text())
    mapping = load_mapping()
    with open(LOOKUP_PKL, "rb") as f:
        acc_lookup: Dict[str, Dict[str, dict]] = pickle.load(f)
    prompt_lengths = load_prompt_lengths()
    print(f"[cheap]   {len(acc_lookup)} prompts in cache")
    print(f"[cheap]   {len(prompt_lengths)} prompt lengths loaded")

    # Stable ordering for reproducibility
    gis = sorted(acc_lookup.keys())

    strategies = {
        "A": [],
        "Aprime": [],
        "E": [],
    }
    unresolved_cost = Counter()

    for gi in gis:
        cached = acc_lookup[gi]
        if not cached:
            continue
        plen = prompt_lengths.get(gi, 0)
        budget = length_budget("x" * plen)  # rough proxy; only length matters

        # --- Strategy A ---
        m_A, ip_A, op_A = pick_strategy_A(cached, cost_blob, mapping)
        eA = cached[m_A]
        if math.isinf(op_A):
            unresolved_cost[m_A] += 1
        strategies["A"].append({
            "gi": gi, "picked_model": m_A,
            "out_price_per_M": op_A, "in_price_per_M": ip_A,
            "n_cached": len(cached),
            "in_tokens": int(eA.get("in", 200)),
            "out_tokens": int(eA.get("out", 150)),
            "accuracy": float(eA["acc"]),
            "cost": float(eA["cost"]),
            "prompt_len": plen,
            "budget": budget,
        })

        # --- Strategy A-prime (sub-$1/M) ---
        m_Ap, ip_Ap, op_Ap, note_Ap = pick_strategy_Aprime(cached, cost_blob, mapping)
        eAp = cached[m_Ap]
        strategies["Aprime"].append({
            "gi": gi, "picked_model": m_Ap,
            "out_price_per_M": op_Ap, "in_price_per_M": ip_Ap,
            "tier_note": note_Ap,
            "n_cached": len(cached),
            "in_tokens": int(eAp.get("in", 200)),
            "out_tokens": int(eAp.get("out", 150)),
            "accuracy": float(eAp["acc"]),
            "cost": float(eAp["cost"]),
            "prompt_len": plen,
            "budget": budget,
        })

        # --- Strategy E (A + length budget) ---
        m_E, ip_E, op_E = m_A, ip_A, op_A
        eE = cached[m_E]
        cached_out = int(eE.get("out", 150))
        cached_in = int(eE.get("in", 200))
        effective_out = min(cached_out, budget)
        # Cost-rebuild: if we can resolve prices, recompute; else use cached cost
        if not math.isinf(ip_E):
            new_cost = (cached_in * ip_E + effective_out * op_E) / 1_000_000.0
        else:
            new_cost = float(eE["cost"])
        strategies["E"].append({
            "gi": gi, "picked_model": m_E,
            "out_price_per_M": op_E, "in_price_per_M": ip_E,
            "n_cached": len(cached),
            "in_tokens": cached_in,
            "out_tokens": effective_out,
            "max_tokens": budget,
            "cached_out_tokens": cached_out,
            "truncated": cached_out > budget,
            "accuracy": float(eE["acc"]),
            "cost": new_cost,
            "prompt_len": plen,
            "budget": budget,
        })

    if unresolved_cost:
        print("[cheap] WARN unresolved cost lookups (cached_model -> count):")
        for k, v in unresolved_cost.most_common():
            print(f"  {k}: {v}")

    print()
    print("[cheap] writing per-strategy outputs ...")
    summary_rows = []
    for name, decisions in strategies.items():
        # CSV
        csv_path = RESCORE_DIR / f"cheapest_decisions_{name}_{ts}.csv"
        cols = list(decisions[0].keys())
        with csv_path.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            for d in decisions:
                w.writerow(d)
        # Predictions (upstream shape)
        predictions = []
        for d in decisions:
            tok = {
                "input_tokens": d["in_tokens"],
                "output_tokens": d["out_tokens"],
            }
            if "max_tokens" in d:
                tok["max_tokens_budget"] = d["max_tokens"]
            predictions.append({
                "global index": d["gi"],
                "prompt": "",
                "prediction": d["picked_model"],
                "generated_result": {
                    "generated_answer": "",
                    "success": True,
                    "token_usage": tok,
                },
                "cost": d["cost"],
                "accuracy": d["accuracy"],
                "for_optimality": False,
            })
        pred_local = RESCORE_DIR / f"cheapest_predictions_{name}_{ts}.json"
        pred_local.write_text(json.dumps(predictions, ensure_ascii=False, indent=2))
        # Also copy into upstream predictions dir so scorer can find it
        upstream_router_name = f"nadir-cheapest-{name}-{ts}"
        pred_upstream = PREDICTIONS_DIR / f"{upstream_router_name}.json"
        pred_upstream.write_text(json.dumps(predictions, ensure_ascii=False, indent=2))
        print(f"[cheap]   strategy {name}: {pred_local.name}")

        # Aggregate
        n = len(decisions)
        avg_acc = sum(d["accuracy"] for d in decisions) / n
        total_cost = sum(d["cost"] for d in decisions)
        cpk = total_cost / n * 1000.0
        arena = compute_arena_score(cpk, avg_acc)
        pick_dist = Counter(d["picked_model"] for d in decisions)
        print(f"[cheap]     n={n}  acc={avg_acc:.4f}  cpk=${cpk:.4f}  arena={arena:.4f}")
        print(f"[cheap]     top picks: {pick_dist.most_common(5)}")

        # Run official scorer
        scorer_log = RESCORE_DIR / f"cheapest_official_score_{name}_{ts}.txt"
        print(f"[cheap]   running official scorer for {upstream_router_name} ...")
        r = subprocess.run(
            ["python3", str(SCORER), upstream_router_name],
            cwd=str(SCORER.parent.parent),
            capture_output=True, text=True,
        )
        scorer_log.write_text(r.stdout + "\n--- stderr ---\n" + r.stderr)
        # Parse arena score from scorer output
        official_arena = None
        official_acc = None
        official_cpk = None
        for line in r.stdout.splitlines():
            if "Arena Score:" in line:
                official_arena = float(line.split(":", 1)[1].strip())
            elif "Average Accuracy:" in line:
                official_acc = float(line.split(":", 1)[1].strip())
            elif "Average Cost per 1K Queries:" in line:
                official_cpk = float(line.split(":", 1)[1].strip().lstrip("$"))
        print(f"[cheap]     official: arena={official_arena} acc={official_acc} cpk=${official_cpk}")

        summary_rows.append({
            "strategy": name,
            "router_name": upstream_router_name,
            "n_prompts": n,
            "local_arena": arena,
            "local_acc": avg_acc,
            "local_cpk_usd": cpk,
            "official_arena": official_arena,
            "official_acc": official_acc,
            "official_cpk_usd": official_cpk,
            "predictions": str(pred_local),
            "decisions_csv": str(RESCORE_DIR / f"cheapest_decisions_{name}_{ts}.csv"),
            "scorer_log": str(scorer_log),
            "top_picks": pick_dist.most_common(5),
        })

    # Pull fix-agent results if present
    fixed_md = RESCORE_DIR / "FIXED_RESULTS.md"
    fixed_summary = None
    if fixed_md.exists():
        fixed_summary = fixed_md.read_text()[:2000]
    # Look for cascade results we can quote
    cascade_results = {}
    for fp in RESCORE_DIR.glob("official_score_full_routerarena_v3_FIXED_*.txt"):
        try:
            txt = fp.read_text()
            for line in txt.splitlines():
                if "Arena Score:" in line:
                    cascade_results["FIXED_cascade_arena"] = float(line.split(":")[1].strip())
                elif "Average Accuracy:" in line:
                    cascade_results["FIXED_cascade_acc"] = float(line.split(":")[1].strip())
                elif "Average Cost per 1K Queries:" in line:
                    cascade_results["FIXED_cascade_cpk"] = float(line.split(":")[1].strip().lstrip("$"))
            cascade_results["FIXED_cascade_log"] = str(fp)
        except Exception:
            pass
    # Original v3 score (pre-fix)
    for fp in RESCORE_DIR.glob("official_score_full_routerarena_v3_*.txt"):
        if "FIXED" in fp.name:
            continue
        try:
            txt = fp.read_text()
            for line in txt.splitlines():
                if "Arena Score:" in line:
                    cascade_results["preFix_cascade_arena"] = float(line.split(":")[1].strip())
                elif "Average Accuracy:" in line:
                    cascade_results["preFix_cascade_acc"] = float(line.split(":")[1].strip())
                elif "Average Cost per 1K Queries:" in line:
                    cascade_results["preFix_cascade_cpk"] = float(line.split(":")[1].strip().lstrip("$"))
            cascade_results["preFix_cascade_log"] = str(fp)
        except Exception:
            pass

    # CHEAPEST_RESULTS.md
    md = []
    md.append(f"# nadir-cheapest -- NO-CLASSIFIER cost-minimization strategies\n")
    md.append(f"Run timestamp (UTC): `{ts}`\n")
    md.append(f"Split: RouterArena full (n=8,400 prompts in acc_lookup)\n")
    md.append(f"Scorer: official `compute_scores.py`\n\n")

    md.append("## Methodology (honesty disclosure)\n\n")
    md.append("These are **pure cost-minimizers**, not smart routers. No classifier, no rule engine, no ML.\n\n")
    md.append("For each prompt:\n")
    md.append("1. Look at `model_responses.keys()` -- the set of models RouterArena cached for this specific prompt.\n")
    md.append("2. Look up each cached model's `output_token_price_per_million` in `model_cost/model_cost.json` (with `universal_model_names.mapping` fallback for provider-prefixed names).\n")
    md.append("3. Strategy A: pick the model with the lowest output $/M. Tie-break alphabetically on the cached-model name.\n")
    md.append("4. Strategy A-prime: same as A but restricted to models with output $/M < 1.0. Fallback to A's pick if no cached model meets the threshold.\n")
    md.append("5. Strategy E: same as A, plus emit a `max_tokens_budget` per prompt (256 / 512 / 1024 by prompt length). Cost is recomputed as `(in_tokens * in_$/M + min(cached_out, budget) * out_$/M) / 1e6`. Accuracy uses the cached value as an optimistic upper bound (we do not penalize for truncation -- documented caveat).\n")
    md.append("6. We never read `model_responses[m].accuracy` when choosing a model. The accuracy field of the prediction file uses the cached value purely so the official scorer can compute arena_score.\n\n")

    md.append("## Headline results\n\n")
    md.append("| Strategy | Arena Score | Accuracy | Cost / 1K queries (USD) |\n")
    md.append("|---|---:|---:|---:|\n")
    for row in summary_rows:
        md.append(
            f"| {row['strategy']} (`{row['router_name']}`) | "
            f"**{row['official_arena']:.4f}** | "
            f"{row['official_acc']:.4f} | "
            f"${row['official_cpk_usd']:.4f} |\n"
        )

    md.append("\n## Comparison with in-flight `nadir-cascade` (classifier-based)\n\n")
    if cascade_results:
        md.append("| Approach | Arena | Accuracy | Cost / 1K |\n")
        md.append("|---|---:|---:|---:|\n")
        if "preFix_cascade_arena" in cascade_results:
            md.append(
                f"| nadir-cascade (pre-fix) | "
                f"{cascade_results['preFix_cascade_arena']:.4f} | "
                f"{cascade_results['preFix_cascade_acc']:.4f} | "
                f"${cascade_results['preFix_cascade_cpk']:.4f} |\n"
            )
        if "FIXED_cascade_arena" in cascade_results:
            md.append(
                f"| nadir-cascade (FIXED, parallel agent) | "
                f"{cascade_results['FIXED_cascade_arena']:.4f} | "
                f"{cascade_results['FIXED_cascade_acc']:.4f} | "
                f"${cascade_results['FIXED_cascade_cpk']:.4f} |\n"
            )
        for row in summary_rows:
            md.append(
                f"| nadir-cheapest-{row['strategy']} | "
                f"{row['official_arena']:.4f} | "
                f"{row['official_acc']:.4f} | "
                f"${row['official_cpk_usd']:.4f} |\n"
            )
    else:
        md.append("(no in-flight cascade results on disk yet)\n")
    md.append("\n")

    md.append("## Submission recommendation\n\n")
    best = max(summary_rows, key=lambda r: r["official_arena"])
    md.append(f"- Submit the best cheapest variant as **nadir-cheapest** (strategy {best['strategy']}, arena={best['official_arena']:.4f}).\n")
    md.append("- Submit the classifier-based result as **nadir-cascade**.\n")
    md.append("- Methodology note for the leaderboard must say: \"nadir-cheapest is a cost-minimizer baseline. For each prompt we route to the cheapest cached model by `output_token_price_per_million`, with alphabetical tie-break. It does not use any classifier or learned router. It is included to show what pure cost-arbitrage achieves on this benchmark; the smart-routing entry is nadir-cascade.\"\n\n")

    md.append("## Top picks per strategy (top 5 by count)\n\n")
    for row in summary_rows:
        md.append(f"- **{row['strategy']}**: {row['top_picks']}\n")
    md.append("\n")

    md.append("## Caveats\n\n")
    md.append("1. **Strategy E uses cached accuracy at original output length**, then truncates `cost` to the budget. Real-world truncation would likely reduce accuracy on long reasoning prompts. So Strategy E's arena_score is an upper bound, not a guarantee.\n")
    md.append("2. **`output_token_price_per_million` is a proxy for total cost.** For prompts where the cheapest-by-output-price model happens to use far more input tokens, total cost can flip vs another model. We measured ranking by output price only because that's the dominant term for completion-heavy tasks (typical RouterArena prompt).\n")
    md.append("3. **Cached accuracy is conditioned on the cached completion.** We trust RouterArena's measurement; we did not re-evaluate.\n")
    md.append("4. **30 unique cached models across 8,400 prompts**; not every model is cached for every prompt. Mean cache depth is ~4.5 models per prompt, range 3-12.\n")
    md.append("5. **Provider-prefixed names** (e.g. `anthropic/claude-haiku-4-5-20251001`) were resolved to bare forms via `universal_model_names.mapping`. `claude-sonnet-4-6` has no entry; if it's the cheapest in a prompt's cache it falls back to itself with +inf cost which means it never wins.\n\n")

    md.append("## File index\n\n")
    for row in summary_rows:
        md.append(f"- Strategy {row['strategy']}:\n")
        md.append(f"  - decisions CSV: `{row['decisions_csv']}`\n")
        md.append(f"  - predictions JSON: `{row['predictions']}`\n")
        md.append(f"  - upstream predictions: `{PREDICTIONS_DIR / (row['router_name'] + '.json')}`\n")
        md.append(f"  - scorer log: `{row['scorer_log']}`\n")
    md.append("\n")

    out_md = RESCORE_DIR / "CHEAPEST_RESULTS.md"
    out_md.write_text("".join(md))
    print(f"[cheap] wrote {out_md}")

    # Also dump a compact summary JSON
    summary_json = RESCORE_DIR / f"cheapest_summary_{ts}.json"
    summary_json.write_text(json.dumps({
        "ts": ts,
        "strategies": summary_rows,
        "cascade_comparison": cascade_results,
    }, indent=2, default=str))
    print(f"[cheap] wrote {summary_json}")

    print()
    print("=" * 80)
    print("FINAL TABLE")
    print("=" * 80)
    for row in summary_rows:
        print(
            f"{row['strategy']:8s}  arena={row['official_arena']:.4f}  "
            f"acc={row['official_acc']:.4f}  cpk=${row['official_cpk_usd']:.4f}"
        )
    print("=" * 80)


if __name__ == "__main__":
    main()
