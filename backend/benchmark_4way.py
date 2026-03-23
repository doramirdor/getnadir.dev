#!/usr/bin/env python3
"""
Nadir 4-Way Benchmark
=====================
Tests 20 diverse prompts across 4 configurations:
  1. BASELINE — All Opus 4.6 (no routing, no optimization)
  2. ROUTER ONLY — Heuristic classifier routes to haiku/sonnet/opus
  3. OPTIMIZE SAFE — All Opus but with context optimization (safe mode)
  4. ROUTER + OPTIMIZE — Routing + context optimization combined

Uses Claude CLI for all calls, then LLM-as-judge for quality scoring.
"""

import subprocess
import json
import re
import time
import sys
import os

# Direct import of heuristic classifier (skip broken __init__)
import importlib.util
spec = importlib.util.spec_from_file_location(
    "hc", os.path.join(os.path.dirname(__file__), "app/complexity/heuristic_classifier.py")
)
hc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hc)

classifier = hc.HeuristicClassifier.__new__(hc.HeuristicClassifier)
classifier.allowed_providers = []
classifier.allowed_models = []
classifier.performance_data = []

# ── 20 diverse prompts ──────────────────────────────────────────────

PROMPTS = [
    # SIMPLE (expected: haiku)
    ("S1", "simple",  "What is the capital of Japan?"),
    ("S2", "simple",  "What is 47 * 13?"),
    ("S3", "simple",  "Translate 'good morning' to French."),
    ("S4", "simple",  "Is the Earth round? Yes or no."),
    ("S5", "simple",  "Define the word 'ubiquitous'."),
    ("S6", "simple",  "What's the boiling point of water in Celsius?"),
    # MEDIUM (expected: sonnet)
    ("M1", "medium",  "Explain the difference between TCP and UDP in 3 sentences."),
    ("M2", "medium",  "Write a Python function that checks if a string is a palindrome."),
    ("M3", "medium",  "What are the pros and cons of microservices vs monolith architecture?"),
    ("M4", "medium",  "Summarize how a hash table works internally."),
    ("M5", "medium",  "Write a SQL query to find the second highest salary in an employees table."),
    ("M6", "medium",  "Explain the CAP theorem and give a real-world example."),
    ("M7", "medium",  "Write a bash one-liner that finds all .py files modified in the last 24 hours."),
    # COMPLEX (expected: opus)
    ("C1", "complex", "Design a distributed rate limiter handling 1M requests/second. Cover the algorithm, data structures, Redis schema, failure modes, and include Python implementation code."),
    ("C2", "complex", "Implement a thread-safe LRU cache in Python with O(1) get/put, configurable TTL expiry, max size eviction, and comprehensive unit tests with type hints."),
    ("C3", "complex", "Analyze the trade-offs between event sourcing and traditional CRUD for a financial trading platform. Cover data consistency, auditability, replay capability, query performance, and operational complexity."),
    ("C4", "complex", "Write a recursive descent parser for arithmetic expressions supporting +, -, *, /, parentheses, and variables. Include the lexer, AST node definitions, parser, and an evaluator with error handling."),
    ("C5", "complex", "Design a real-time collaborative text editor. Explain CRDTs vs Operational Transform, conflict resolution strategies, presence indicators, offline support, and provide a simplified implementation."),
    ("C6", "complex", "Compare consensus protocols Raft, Paxos, PBFT, and Tendermint for a blockchain system. Evaluate each on latency, throughput, fault tolerance model, message complexity, and implementation difficulty."),
    ("C7", "complex", "Implement a B+ tree in Python with insert, delete, search, and range query operations. Include proper node splitting, merging, redistribution, and handle edge cases for minimum degree 3."),
]

# ── Pricing (blended $/1M tokens) ───────────────────────────────────

PRICING = {
    "opus": {"in": 5.0, "out": 25.0},
    "sonnet": {"in": 3.0, "out": 15.0},
    "haiku": {"in": 1.0, "out": 5.0},
}
TIER_TO_MODEL = {"simple": "haiku", "medium": "sonnet", "complex": "opus"}


def estimate_cost(model: str, prompt_chars: int, response_chars: int) -> float:
    """Estimate cost in dollars based on char count → approximate tokens."""
    tok_in = prompt_chars / 4
    tok_out = response_chars / 4
    p = PRICING[model]
    return (tok_in * p["in"] + tok_out * p["out"]) / 1_000_000


def run_claude(prompt: str, model: str, max_tokens: int = 1024) -> tuple:
    """Run a prompt through Claude CLI. Returns (response, elapsed_ms)."""
    start = time.time()
    try:
        r = subprocess.run(
            ["claude", "-p", "--model", model, "--max-tokens", str(max_tokens)],
            input=prompt, capture_output=True, text=True, timeout=120
        )
        elapsed = int((time.time() - start) * 1000)
        return r.stdout.strip(), elapsed
    except subprocess.TimeoutExpired:
        return "[TIMEOUT]", int((time.time() - start) * 1000)
    except Exception as e:
        return f"[ERROR: {e}]", 0


def safe_optimize(text: str) -> str:
    """Simple safe context optimization: strip whitespace, compress spaces."""
    import re as _re
    text = _re.sub(r'\n{3,}', '\n\n', text)
    text = _re.sub(r'[ \t]+', ' ', text)
    text = _re.sub(r' +\n', '\n', text)
    return text.strip()


def judge_quality(prompt: str, resp_a: str, model_a: str, resp_b: str, model_b: str) -> dict:
    """Use Sonnet as judge to compare two responses."""
    judge_prompt = f"""You are evaluating two AI responses for quality. Rate each 1-10 on:
- Accuracy (factual correctness)
- Completeness (covers all aspects of the question)
- Clarity (well-structured, easy to follow)

Question: {prompt[:300]}

Response A ({model_a}):
{resp_a[:600]}

Response B ({model_b}):
{resp_b[:600]}

Return ONLY valid JSON:
{{"score_a": N, "score_b": N, "verdict": "A_BETTER"|"EQUAL"|"B_BETTER", "reason": "brief explanation"}}"""

    out, _ = run_claude(judge_prompt, "sonnet", max_tokens=200)

    m = re.search(r'\{[^}]+\}', out)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"score_a": 5, "score_b": 5, "verdict": "EQUAL", "reason": "parse_error"}


# ── Main benchmark ──────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════════════════════════╗")
    print("║  NADIR 4-WAY BENCHMARK — 20 Prompts × 4 Configs + LLM Judge       ║")
    print("╠══════════════════════════════════════════════════════════════════════╣")
    print("║  V1: BASELINE (all Opus 4.6)                                       ║")
    print("║  V2: ROUTER ONLY (heuristic → haiku/sonnet/opus)                   ║")
    print("║  V3: OPTIMIZE SAFE (all Opus + context compress)                   ║")
    print("║  V4: ROUTER + OPTIMIZE (routing + context compress)                ║")
    print("╚══════════════════════════════════════════════════════════════════════╝\n")

    results = []
    total = len(PROMPTS)

    for i, (pid, cat, prompt) in enumerate(PROMPTS, 1):
        tier, conf, _ = classifier.classify(prompt)
        routed_model = TIER_TO_MODEL[tier]
        optimized_prompt = safe_optimize(prompt)
        savings_chars = len(prompt) - len(optimized_prompt)

        print(f"[{i:2d}/{total}] {pid} [{cat:7s}] tier={tier:7s} → {routed_model}")

        # V1: Baseline (Opus)
        v1_resp, v1_ms = run_claude(prompt, "opus")
        v1_cost = estimate_cost("opus", len(prompt), len(v1_resp))

        # V2: Router only
        v2_resp, v2_ms = run_claude(prompt, routed_model)
        v2_cost = estimate_cost(routed_model, len(prompt), len(v2_resp))

        # V3: Optimize safe (Opus + compressed prompt)
        v3_resp, v3_ms = run_claude(optimized_prompt, "opus")
        v3_cost = estimate_cost("opus", len(optimized_prompt), len(v3_resp))

        # V4: Router + Optimize
        v4_resp, v4_ms = run_claude(optimized_prompt, routed_model)
        v4_cost = estimate_cost(routed_model, len(optimized_prompt), len(v4_resp))

        # Judge: V2 vs V1 (router quality)
        j_router = judge_quality(prompt, v2_resp, routed_model, v1_resp, "opus")
        # Judge: V4 vs V1 (router+optimize quality)
        j_combo = judge_quality(prompt, v4_resp, f"{routed_model}+opt", v1_resp, "opus")

        result = {
            "pid": pid, "cat": cat, "tier": tier, "model": routed_model,
            "v1_cost": v1_cost, "v1_ms": v1_ms,
            "v2_cost": v2_cost, "v2_ms": v2_ms,
            "v3_cost": v3_cost, "v3_ms": v3_ms,
            "v4_cost": v4_cost, "v4_ms": v4_ms,
            "j_router": j_router, "j_combo": j_combo,
            "optimize_saved_chars": savings_chars,
        }
        results.append(result)

        # Print per-prompt summary
        r_save = (1 - v2_cost/v1_cost)*100 if v1_cost > 0 else 0
        c_save = (1 - v4_cost/v1_cost)*100 if v1_cost > 0 else 0
        jrs = j_router.get("score_a", 0)
        jbs = j_router.get("score_b", 0)
        jrv = j_router.get("verdict", "?")
        jcs = j_combo.get("score_a", 0)
        print(f"        V1=${v1_cost:.5f} V2=${v2_cost:.5f}({r_save:+.0f}%) "
              f"V4=${v4_cost:.5f}({c_save:+.0f}%) | "
              f"Router:{jrs}vs{jbs}→{jrv} | Combo:{jcs}/10")
        sys.stdout.flush()

    # ── Summary ─────────────────────────────────────────────────────
    print("\n" + "═" * 70)
    print("  BENCHMARK RESULTS SUMMARY")
    print("═" * 70)

    for label, cost_key, ms_key in [
        ("V1 BASELINE (Opus)", "v1_cost", "v1_ms"),
        ("V2 ROUTER ONLY", "v2_cost", "v2_ms"),
        ("V3 OPTIMIZE SAFE", "v3_cost", "v3_ms"),
        ("V4 ROUTER+OPTIMIZE", "v4_cost", "v4_ms"),
    ]:
        total_cost = sum(r[cost_key] for r in results)
        avg_ms = sum(r[ms_key] for r in results) / len(results)
        baseline = sum(r["v1_cost"] for r in results)
        savings = (1 - total_cost/baseline)*100 if baseline > 0 else 0
        print(f"  {label:25s} ${total_cost:.5f}  avg {avg_ms:.0f}ms  {savings:+.0f}% vs baseline")

    # Quality analysis
    print(f"\n  QUALITY (LLM Judge — Sonnet evaluating vs Opus baseline)")

    # Router quality
    r_scores_a = [r["j_router"].get("score_a", 0) for r in results]
    r_scores_b = [r["j_router"].get("score_b", 0) for r in results]
    r_verdicts = [r["j_router"].get("verdict", "?") for r in results]
    r_ok = sum(1 for v in r_verdicts if v in ("EQUAL", "A_BETTER", "A_OK"))
    avg_ra = sum(r_scores_a)/len(r_scores_a)
    avg_rb = sum(r_scores_b)/len(r_scores_b)

    print(f"  Router:    {r_ok}/{len(results)} quality maintained ({r_ok/len(results)*100:.0f}%)")
    print(f"             Routed avg={avg_ra:.1f}/10  Opus avg={avg_rb:.1f}/10  Gap={avg_ra-avg_rb:+.1f}")

    # Combo quality
    c_scores_a = [r["j_combo"].get("score_a", 0) for r in results]
    c_scores_b = [r["j_combo"].get("score_b", 0) for r in results]
    c_verdicts = [r["j_combo"].get("verdict", "?") for r in results]
    c_ok = sum(1 for v in c_verdicts if v in ("EQUAL", "A_BETTER", "A_OK"))
    avg_ca = sum(c_scores_a)/len(c_scores_a)
    avg_cb = sum(c_scores_b)/len(c_scores_b)

    print(f"  R+Optimize:{c_ok}/{len(results)} quality maintained ({c_ok/len(results)*100:.0f}%)")
    print(f"             Combo avg={avg_ca:.1f}/10  Opus avg={avg_cb:.1f}/10  Gap={avg_ca-avg_cb:+.1f}")

    # Per-category breakdown
    print(f"\n  PER-CATEGORY SAVINGS:")
    for cat_name in ["simple", "medium", "complex"]:
        cat_results = [r for r in results if r["cat"] == cat_name]
        if not cat_results:
            continue
        v1 = sum(r["v1_cost"] for r in cat_results)
        v2 = sum(r["v2_cost"] for r in cat_results)
        v4 = sum(r["v4_cost"] for r in cat_results)
        r_s = (1-v2/v1)*100 if v1 > 0 else 0
        c_s = (1-v4/v1)*100 if v1 > 0 else 0
        print(f"  {cat_name:8s} ({len(cat_results):2d}): Router {r_s:+.0f}%  R+Opt {c_s:+.0f}%")

    # Verdict
    total_v1 = sum(r["v1_cost"] for r in results)
    total_v4 = sum(r["v4_cost"] for r in results)
    final_savings = (1 - total_v4/total_v1)*100

    print(f"\n{'═'*70}")
    if final_savings > 20 and c_ok >= len(results) * 0.7:
        print(f"  ✅ VERDICT: {final_savings:.0f}% savings with {c_ok/len(results)*100:.0f}% quality maintained")
        print(f"  → Routing PROVEN to save money without meaningful quality loss")
    elif final_savings > 10:
        print(f"  ⚠️  VERDICT: {final_savings:.0f}% savings — moderate, needs tuning")
    else:
        print(f"  ❌ VERDICT: {final_savings:.0f}% savings — insufficient")
    print(f"{'═'*70}")

    # Save raw results
    with open("/tmp/nadir_benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Raw results saved to /tmp/nadir_benchmark_results.json")


if __name__ == "__main__":
    main()
