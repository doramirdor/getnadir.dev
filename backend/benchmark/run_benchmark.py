#!/usr/bin/env python3
"""
Nadir Benchmark Runner — 6-way comparison with LLM judge.

Runs 30 diverse prompts across 6 configurations:
  V1: Baseline (Opus only)
  V2: Router only
  V3: Safe optimize only
  V4: Router + Safe optimize
  V5: Aggressive optimize only
  V6: Router + Aggressive optimize

Results saved to JSON with timestamp for daily tracking.

Usage:
  python benchmark/run_benchmark.py
  python benchmark/run_benchmark.py --prompts 10  # quick run
  python benchmark/run_benchmark.py --output results/  # custom output dir
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── 30 Diverse Prompts ────────────────────────────────────────────────

PROMPTS = [
    # Simple (10) — should route to cheapest
    {"id": 1,  "cat": "simple", "prompt": "What is the capital of France?"},
    {"id": 2,  "cat": "simple", "prompt": "What is 17 * 23?"},
    {"id": 3,  "cat": "simple", "prompt": "Translate 'good morning' to Japanese."},
    {"id": 4,  "cat": "simple", "prompt": "What year did the Berlin Wall fall?"},
    {"id": 5,  "cat": "simple", "prompt": "Define the word 'ephemeral'."},
    {"id": 6,  "cat": "simple", "prompt": "Is Python interpreted or compiled?"},
    {"id": 7,  "cat": "simple", "prompt": "What's the hex color code for red?"},
    {"id": 8,  "cat": "simple", "prompt": "How many continents are there?"},
    {"id": 9,  "cat": "simple", "prompt": "What does HTTP stand for?"},
    {"id": 10, "cat": "simple", "prompt": "Convert 100°F to Celsius."},

    # Medium (10) — should route to mid-tier
    {"id": 11, "cat": "medium", "prompt": "Explain the difference between TCP and UDP in 3 sentences."},
    {"id": 12, "cat": "medium", "prompt": "Write a Python function that checks if a string is a palindrome."},
    {"id": 13, "cat": "medium", "prompt": "Pros and cons of microservices vs monolith architecture?"},
    {"id": 14, "cat": "medium", "prompt": "Summarize the CAP theorem and its implications."},
    {"id": 15, "cat": "medium", "prompt": "Write a SQL query to find the second highest salary in an employees table."},
    {"id": 16, "cat": "medium", "prompt": "Explain how a hash table works, including collision handling."},
    {"id": 17, "cat": "medium", "prompt": "Write a bash one-liner to find the 10 largest files in a directory."},
    {"id": 18, "cat": "medium", "prompt": "Explain the Observer pattern with a real-world example."},
    {"id": 19, "cat": "medium", "prompt": "What are the SOLID principles? Give a brief example of each."},
    {"id": 20, "cat": "medium", "prompt": "Describe how DNS resolution works step by step."},

    # Complex (10) — should route to premium
    {"id": 21, "cat": "complex", "prompt": "Design a distributed rate limiter for 1M requests/second. Include the algorithm, data structures, Redis schema, failure modes, and Python implementation."},
    {"id": 22, "cat": "complex", "prompt": "Implement a thread-safe LRU cache in Python with O(1) get and put operations, TTL support, and automatic eviction. Include comprehensive type hints and unit tests."},
    {"id": 23, "cat": "complex", "prompt": "Analyze the trade-offs between event sourcing and traditional CRUD for a financial trading platform. Cover consistency guarantees, auditability, replay capability, and performance implications."},
    {"id": 24, "cat": "complex", "prompt": "Write a recursive descent parser for arithmetic expressions supporting +, -, *, /, parentheses, and variables. Include an AST representation and an evaluator."},
    {"id": 25, "cat": "complex", "prompt": "Design a real-time collaborative text editor. Compare CRDTs vs OT approaches, address conflict resolution, presence indicators, and offline support."},
    {"id": 26, "cat": "complex", "prompt": "Implement a B+ tree in Python with insert, delete, search, and range query operations. Handle node splitting, merging, and redistribution."},
    {"id": 27, "cat": "complex", "prompt": "Compare consensus algorithms: Raft, Paxos, PBFT, and Tendermint. Evaluate each on latency, throughput, fault tolerance, and suitability for blockchain vs traditional distributed systems."},
    {"id": 28, "cat": "complex", "prompt": "Design a machine learning pipeline for real-time fraud detection. Cover feature engineering, model selection, training/serving split, latency requirements, and handling concept drift."},
    {"id": 29, "cat": "complex", "prompt": "Implement a custom memory allocator in Python that supports malloc, free, realloc with coalescing. Include fragmentation tracking and a visualization of the heap state."},
    {"id": 30, "cat": "complex", "prompt": "Design a multi-region database replication strategy. Address consistency models, conflict resolution, failover, latency optimization, and compliance with data residency requirements."},
]

# Model mapping
TIER_TO_MODEL = {"simple": "haiku", "medium": "sonnet", "complex": "opus"}
MODEL_PRICING = {
    "haiku":  {"input": 1.0,  "output": 5.0},   # per 1M tokens
    "sonnet": {"input": 3.0,  "output": 15.0},
    "opus":   {"input": 5.0,  "output": 25.0},
}


def estimate_cost(model: str, prompt: str, response: str) -> float:
    """Estimate cost in dollars based on token approximation."""
    tok_in = len(prompt.split()) * 1.3
    tok_out = len(response.split()) * 1.3
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["opus"])
    return (tok_in * pricing["input"] + tok_out * pricing["output"]) / 1_000_000


def cli_call(prompt: str, model: str, timeout: int = 120) -> Tuple[str, float]:
    """Call Claude CLI and return (response, latency_ms)."""
    start = time.time()
    try:
        result = subprocess.run(
            ["claude", "-p", "--model", model],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        latency = (time.time() - start) * 1000
        return result.stdout.strip(), latency
    except subprocess.TimeoutExpired:
        return "[TIMEOUT]", timeout * 1000
    except Exception as e:
        return f"[ERROR: {e}]", 0


def classify_prompt(prompt: str) -> str:
    """Classify using the heuristic classifier."""
    try:
        # Direct import to avoid heavy dependency chain
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "hc", os.path.join(os.path.dirname(__file__), "..", "app", "complexity", "heuristic_classifier.py")
        )
        hc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hc)
        c = hc.HeuristicClassifier.__new__(hc.HeuristicClassifier)
        c.allowed_providers = []
        c.allowed_models = []
        c.performance_data = []
        tier, _, _ = c.classify(prompt)
        return tier
    except Exception:
        return "medium"  # safe fallback


def judge_quality(prompt: str, resp_a: str, model_a: str, resp_b: str, model_b: str) -> Dict:
    """Use Sonnet as LLM judge to compare two responses."""
    judge_prompt = f"""You are an expert evaluator. Rate these two AI responses on a scale of 1-10 for accuracy, completeness, and clarity.

Question: {prompt}

Response A ({model_a}):
{resp_a[:600]}

Response B ({model_b}):
{resp_b[:600]}

Return ONLY valid JSON: {{"a": <score>, "b": <score>, "verdict": "EQUAL"|"A_BETTER"|"B_BETTER"}}
A verdict of EQUAL means both are acceptable. B_BETTER means the baseline (opus) was significantly better."""

    out, _ = cli_call(judge_prompt, "sonnet", timeout=60)
    try:
        m = re.search(r'\{[^}]+\}', out)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return {"a": 0, "b": 0, "verdict": "ERROR"}


def context_optimize(prompt: str, mode: str) -> str:
    """Apply context optimization (simulated for benchmark)."""
    if mode == "safe":
        # Safe: remove extra whitespace, normalize
        return re.sub(r'\s+', ' ', prompt).strip()
    elif mode == "aggressive":
        # Aggressive: safe + remove filler words
        optimized = re.sub(r'\s+', ' ', prompt).strip()
        fillers = ["please", "could you", "can you", "I would like you to", "kindly"]
        for f in fillers:
            optimized = re.sub(rf'\b{f}\b', '', optimized, flags=re.IGNORECASE)
        return re.sub(r'\s+', ' ', optimized).strip()
    return prompt


def run_variant(prompts: List[Dict], variant: str) -> List[Dict]:
    """Run a single variant across all prompts."""
    results = []
    for p in prompts:
        prompt_text = p["prompt"]

        # Determine model and optimization
        if variant == "V1":  # Baseline: always opus
            model = "opus"
            prompt_text = p["prompt"]
        elif variant == "V2":  # Router only
            tier = classify_prompt(p["prompt"])
            model = TIER_TO_MODEL[tier]
            prompt_text = p["prompt"]
        elif variant == "V3":  # Safe optimize only
            model = "opus"
            prompt_text = context_optimize(p["prompt"], "safe")
        elif variant == "V4":  # Router + Safe
            tier = classify_prompt(p["prompt"])
            model = TIER_TO_MODEL[tier]
            prompt_text = context_optimize(p["prompt"], "safe")
        elif variant == "V5":  # Aggressive optimize only
            model = "opus"
            prompt_text = context_optimize(p["prompt"], "aggressive")
        elif variant == "V6":  # Router + Aggressive
            tier = classify_prompt(p["prompt"])
            model = TIER_TO_MODEL[tier]
            prompt_text = context_optimize(p["prompt"], "aggressive")
        else:
            raise ValueError(f"Unknown variant: {variant}")

        response, latency = cli_call(prompt_text, model)
        cost = estimate_cost(model, prompt_text, response)

        results.append({
            "prompt_id": p["id"],
            "category": p["cat"],
            "variant": variant,
            "model": model,
            "tier": classify_prompt(p["prompt"]) if "V2" in variant or "V4" in variant or "V6" in variant else "n/a",
            "cost": round(cost, 6),
            "latency_ms": round(latency, 1),
            "response_length": len(response),
            "response_preview": response[:200],
            "optimized": variant in ("V3", "V4", "V5", "V6"),
            "optimize_mode": "safe" if variant in ("V3", "V4") else "aggressive" if variant in ("V5", "V6") else "none",
        })

        print(f"  {variant} #{p['id']:2d} [{p['cat']:7s}] → {model:7s} ${cost:.6f} {latency:.0f}ms")

    return results


def run_judge(prompts: List[Dict], baseline: List[Dict], variant_results: List[Dict], variant: str) -> List[Dict]:
    """Judge variant results against baseline."""
    judgments = []
    for base, var in zip(baseline, variant_results):
        if var["response_preview"] == base["response_preview"]:
            # Same response, skip judging
            judgments.append({"a": 10, "b": 10, "verdict": "EQUAL"})
            continue

        j = judge_quality(
            prompts[base["prompt_id"] - 1]["prompt"],
            var["response_preview"], var["model"],
            base["response_preview"], "opus",
        )
        judgments.append(j)
        v = j.get("verdict", "?")
        print(f"  Judge #{base['prompt_id']:2d}: A({var['model']}):{j.get('a',0)} B(opus):{j.get('b',0)} → {v}")
        time.sleep(1)  # Rate limit

    return judgments


def main():
    parser = argparse.ArgumentParser(description="Nadir 6-way Benchmark")
    parser.add_argument("--prompts", type=int, default=30, help="Number of prompts (default: 30)")
    parser.add_argument("--output", type=str, default="benchmark/results", help="Output directory")
    parser.add_argument("--skip-judge", action="store_true", help="Skip LLM judge (faster)")
    parser.add_argument("--variants", nargs="+", default=["V1", "V2", "V3", "V4", "V5", "V6"])
    args = parser.parse_args()

    prompts = PROMPTS[:args.prompts]
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")

    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  NADIR BENCHMARK — 6-Way Comparison                         ║")
    print(f"║  {len(prompts)} prompts × {len(args.variants)} variants = {len(prompts) * len(args.variants)} API calls                        ║")
    print(f"║  {timestamp}                                  ║")
    print("╚═══════════════════════════════════════════════════════════════╝\n")

    all_results = {}
    baseline = None

    for variant in args.variants:
        label = {
            "V1": "Baseline (Opus)",
            "V2": "Router Only",
            "V3": "Safe Optimize",
            "V4": "Router + Safe",
            "V5": "Aggressive Optimize",
            "V6": "Router + Aggressive",
        }.get(variant, variant)

        print(f"\n{'━' * 60}")
        print(f"  {variant}: {label}")
        print(f"{'━' * 60}")

        results = run_variant(prompts, variant)
        all_results[variant] = results

        if variant == "V1":
            baseline = results

    # ── Judge quality ──
    judgments = {}
    if not args.skip_judge and baseline:
        print(f"\n{'━' * 60}")
        print("  LLM-as-Judge (Sonnet evaluating quality)")
        print(f"{'━' * 60}")

        for variant in args.variants:
            if variant == "V1":
                continue
            print(f"\n  Judging {variant} vs Baseline:")
            judgments[variant] = run_judge(prompts, baseline, all_results[variant], variant)

    # ── Summary ──
    print(f"\n{'═' * 70}")
    print("  RESULTS SUMMARY")
    print(f"{'═' * 70}\n")

    summary = {}
    for variant in args.variants:
        results = all_results[variant]
        total_cost = sum(r["cost"] for r in results)
        avg_latency = sum(r["latency_ms"] for r in results) / len(results)

        savings_pct = 0
        if baseline and variant != "V1":
            baseline_cost = sum(r["cost"] for r in baseline)
            savings_pct = (1 - total_cost / baseline_cost) * 100 if baseline_cost > 0 else 0

        quality_maintained = 0
        quality_total = 0
        avg_score_a = 0
        avg_score_b = 0
        if variant in judgments:
            jl = judgments[variant]
            quality_total = len(jl)
            quality_maintained = sum(1 for j in jl if j.get("verdict") in ("EQUAL", "A_BETTER", "A_OK"))
            avg_score_a = sum(j.get("a", 0) for j in jl) / max(len(jl), 1)
            avg_score_b = sum(j.get("b", 0) for j in jl) / max(len(jl), 1)

        label = {"V1": "Baseline", "V2": "Router", "V3": "Safe", "V4": "Router+Safe",
                 "V5": "Aggressive", "V6": "Router+Aggr"}.get(variant, variant)

        quality_str = f"{quality_maintained}/{quality_total}" if quality_total > 0 else "n/a"
        print(f"  {label:14s} | ${total_cost:.5f} | {savings_pct:+5.0f}% | {avg_latency:6.0f}ms | quality: {quality_str}")

        summary[variant] = {
            "label": label,
            "total_cost": round(total_cost, 6),
            "savings_pct": round(savings_pct, 1),
            "avg_latency_ms": round(avg_latency, 1),
            "quality_maintained": quality_maintained,
            "quality_total": quality_total,
            "avg_score_routed": round(avg_score_a, 1),
            "avg_score_baseline": round(avg_score_b, 1),
        }

    # ── Per-category breakdown ──
    if baseline:
        print(f"\n  Per-category savings (Router+Aggressive):")
        v6 = all_results.get("V6", all_results.get("V4", []))
        for cat in ["simple", "medium", "complex"]:
            base_cat = sum(r["cost"] for r in baseline if r["category"] == cat)
            v6_cat = sum(r["cost"] for r in v6 if r["category"] == cat)
            sav = (1 - v6_cat / base_cat) * 100 if base_cat > 0 else 0
            print(f"    {cat:8s}: ${base_cat:.5f} → ${v6_cat:.5f} ({sav:+.0f}%)")

    # ── Save results ──
    output = {
        "timestamp": timestamp,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "num_prompts": len(prompts),
        "variants": args.variants,
        "summary": summary,
        "detailed_results": {v: all_results[v] for v in args.variants},
        "judgments": {v: judgments.get(v, []) for v in args.variants if v != "V1"},
        "classifier_version": "heuristic-v1.0",
    }

    output_file = output_dir / f"benchmark_{timestamp}.json"
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to: {output_file}")

    # Also save latest as a symlink-like file
    latest_file = output_dir / "latest.json"
    with open(latest_file, "w") as f:
        json.dump(output, f, indent=2)
    print(f"  Latest copy: {latest_file}")

    print(f"\n{'═' * 70}")
    best = min(summary.items(), key=lambda x: x[1]["total_cost"] if x[0] != "V1" else float("inf"))
    print(f"  Best value: {best[1]['label']} — {best[1]['savings_pct']}% savings")
    print(f"{'═' * 70}\n")


if __name__ == "__main__":
    main()
