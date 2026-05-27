"""Build a RouterArena-format prediction file from a rule-engine rescore.

The official scorer (`upstream/RouterArena/router_evaluation/compute_scores.py`)
reads `router_inference/predictions/<name>.json` and expects each entry
to have `accuracy` and `cost` fields. This script generates that file
from our `decisions.csv` after applying a named cascade rule profile.

Usage:
    python3 build_prediction_file.py <profile_name> <output_router_name>

Example:
    python3 build_prediction_file.py routerarena_v2 nadir-sub10-v2

The output goes to:
    ../reports/dry_run_20260527T130817Z/upstream/RouterArena/router_inference/predictions/<output_router_name>.json
"""

from __future__ import annotations

import csv
import json
import pickle
import sys
from pathlib import Path

REPO_ROOT = Path("/Users/ellabaror/Documents/code/Nadir/getnadir.dev")
sys.path.insert(0, str(REPO_ROOT / "backend" / "app" / "services" / "cascade_rules"))
from engine import load_profile, _clear_profile_cache  # type: ignore  # noqa: E402

DRY_RUN_DIR = REPO_ROOT / "eval/routerarena/reports/dry_run_20260527T130817Z"
DECISIONS_CSV = DRY_RUN_DIR / "decisions.csv"
CACHED_DIR = DRY_RUN_DIR / "upstream/RouterArena/cached_results"
PREDICTIONS_DIR = DRY_RUN_DIR / "upstream/RouterArena/router_inference/predictions"
ACC_LOOKUP_PKL = Path("/tmp/routerarena_acc_lookup.pkl")

# Mirror run_dry.py + score_with_rules.py
PRICING = {
    "claude-haiku-4-5":  {"in": 0.80, "out": 4.00},
    "claude-sonnet-4-6": {"in": 3.00, "out": 15.00},
    "claude-opus-4-6":   {"in": 5.00, "out": 25.00},
}

PROXY = {
    "claude-haiku-4-5": [
        "claude-haiku-4-5",
        "claude-haiku-4-5-20251001",
        "anthropic/claude-haiku-4-5-20251001",
        "claude-haiku-4.5",
        "claude-3-haiku-20240307",
    ],
    "claude-sonnet-4-6": [
        "claude-sonnet-4-6",
        "claude-sonnet-4-5",
        "anthropic/claude-sonnet-4",
        "claude-sonnet-4",
        "openai/gpt-5-mini",
        "openai/gpt-4o",
        "gpt-4o",
    ],
    "claude-opus-4-6": [
        "claude-opus-4-6",
        "claude-opus-4-7",
        "deepseek/deepseek-reasoner",
        "qwen/qwen3-235b-a22b-2507",
        "grok-4-1-fast-reasoning",
    ],
}

TIER_TO_MODEL = {
    "simple": "claude-haiku-4-5",
    "medium": "claude-sonnet-4-6",
    "complex": "claude-opus-4-6",
}


def load_decisions():
    rows = []
    with DECISIONS_CSV.open() as f:
        for r in csv.DictReader(f):
            r["classifier_confidence"] = (
                float(r["classifier_confidence"]) if r["classifier_confidence"] else None
            )
            r["accuracy"] = float(r["accuracy"])
            r["cost"] = float(r["cost"])
            r["in_tokens"] = int(r["in_tokens"]) if r["in_tokens"] else 200
            r["out_tokens"] = int(r["out_tokens"]) if r["out_tokens"] else 150
            rows.append(r)
    return rows


def load_prompts():
    prompts = {}
    for f in CACHED_DIR.glob("*.jsonl"):
        with f.open() as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                gi = d.get("global_index")
                q = d.get("question") or ""
                if gi and q and gi not in prompts:
                    prompts[gi] = q
    return prompts


def lookup_acc_and_tokens(gi, target_model, acc_lookup):
    per_prompt = acc_lookup.get(gi)
    if not per_prompt:
        return None, None, None
    for cand in PROXY.get(target_model, []):
        entry = per_prompt.get(cand)
        if entry is not None:
            return (
                float(entry["acc"]),
                int(entry.get("in", 200)),
                int(entry.get("out", 150)),
            )
    return None, None, None


def model_cost_usd(model, ti, to):
    p = PRICING[model]
    return (ti / 1_000_000.0) * p["in"] + (to / 1_000_000.0) * p["out"]


def main(profile_name: str, out_router_name: str):
    print(f"[build] profile={profile_name} → {out_router_name}")
    _clear_profile_cache()
    engine = load_profile(profile_name) if profile_name != "_baseline" else None

    decisions = load_decisions()
    prompts = load_prompts()
    acc_lookup = pickle.load(ACC_LOOKUP_PKL.open("rb"))

    predictions = []
    n_changed = 0
    for r in decisions:
        gi = r["gi"]
        prompt = prompts.get(gi, "")
        orig_tier = r["tier"]
        orig_model = r["model"]
        orig_acc = r["accuracy"]
        orig_cost = r["cost"]
        orig_in = r["in_tokens"]
        orig_out = r["out_tokens"]

        new_model = orig_model
        new_acc = orig_acc
        new_cost = orig_cost
        new_in = orig_in
        new_out = orig_out

        if engine is not None:
            decision = engine.evaluate(
                prompt,
                predicted_tier=orig_tier,
                classifier_confidence=r["classifier_confidence"],
            )
            if decision.action in ("force_escalate", "force_cheap") and decision.to_tier:
                target_tier = decision.to_tier
                if target_tier != orig_tier:
                    target_model = TIER_TO_MODEL.get(target_tier)
                    if target_model:
                        acc, ti, to = lookup_acc_and_tokens(gi, target_model, acc_lookup)
                        if acc is not None:
                            new_model = target_model
                            new_acc = acc
                            new_cost = model_cost_usd(target_model, ti, to)
                            new_in = ti
                            new_out = to
                            n_changed += 1

        predictions.append({
            "global index": gi,
            "prompt": "",  # mirror existing nadir-sub10.json
            "prediction": new_model,
            "generated_result": {
                "generated_answer": "",
                "success": True,
                "token_usage": {
                    "input_tokens": new_in,
                    "output_tokens": new_out,
                },
            },
            "cost": new_cost,
            "accuracy": new_acc,
            "for_optimality": False,
        })

    out_path = PREDICTIONS_DIR / f"{out_router_name}.json"
    out_path.write_text(json.dumps(predictions, ensure_ascii=False, indent=2))
    print(f"[build] wrote {out_path}")
    print(f"[build] {n_changed}/{len(predictions)} prompts re-routed by profile")


if __name__ == "__main__":
    profile = sys.argv[1] if len(sys.argv) > 1 else "routerarena_v2"
    out_name = sys.argv[2] if len(sys.argv) > 2 else f"nadir-sub10-{profile.replace('routerarena_', '')}"
    main(profile, out_name)
