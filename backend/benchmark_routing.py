#!/usr/bin/env python3
"""
Nadir Routing Benchmark — 20 diverse prompts × 4 configurations.

Configs:
  A) Only routing (heuristic classifier, no context optimize)
  B) Only context optimize (no routing, force opus)
  C) Route + context optimize (both layers on)
  D) Just Opus 4.6 (baseline — most expensive, no routing)

Then runs LLM-as-judge to verify quality isn't degraded.

Usage:
    cd backend && source venv/bin/activate
    python benchmark_routing.py
"""

import asyncio
import json
import os
import sys
import time
from typing import Dict, List, Any, Optional

# Ensure we can import the app
sys.path.insert(0, os.path.dirname(__file__))

# 20 diverse prompts covering simple → complex spectrum
PROMPTS = [
    # ── SIMPLE (should route to cheapest) ──
    {"id": 1, "expected": "simple", "prompt": "What is the capital of France?"},
    {"id": 2, "expected": "simple", "prompt": "What is 17 * 23?"},
    {"id": 3, "expected": "simple", "prompt": "Translate 'hello world' to Spanish."},
    {"id": 4, "expected": "simple", "prompt": "What year did World War 2 end?"},
    {"id": 5, "expected": "simple", "prompt": "Define the word 'ephemeral'."},
    {"id": 6, "expected": "simple", "prompt": "Is Python an interpreted language? Yes or no."},
    {"id": 7, "expected": "simple", "prompt": "What's the hex color code for red?"},

    # ── MEDIUM (could go either way) ──
    {"id": 8, "expected": "medium", "prompt": "Explain the difference between TCP and UDP in 3 sentences."},
    {"id": 9, "expected": "medium", "prompt": "Write a Python function that checks if a string is a palindrome."},
    {"id": 10, "expected": "medium", "prompt": "What are the pros and cons of microservices vs monolith architecture?"},
    {"id": 11, "expected": "medium", "prompt": "Summarize the key points of the CAP theorem."},
    {"id": 12, "expected": "medium", "prompt": "Write a SQL query to find the second highest salary from an employees table."},
    {"id": 13, "expected": "medium", "prompt": "Explain how a hash table works and its time complexity."},

    # ── COMPLEX (should route to premium) ──
    {"id": 14, "expected": "complex", "prompt": "Design a rate limiter for a distributed API gateway that handles 1M requests/second. Include the algorithm, data structures, Redis schema, and failure modes. Provide production-ready Python code."},
    {"id": 15, "expected": "complex", "prompt": "Implement a thread-safe LRU cache in Python with O(1) get/put, TTL expiration, and size-based eviction. Include comprehensive unit tests and type hints."},
    {"id": 16, "expected": "complex", "prompt": "Analyze the trade-offs between event sourcing and CRUD for a financial trading platform. Consider consistency, auditability, replay, performance, and operational complexity. Provide a recommendation with justification."},
    {"id": 17, "expected": "complex", "prompt": "Write a recursive descent parser for a simple arithmetic expression language supporting +, -, *, /, parentheses, and variables. Include an AST representation and an evaluator."},
    {"id": 18, "expected": "complex", "prompt": "Design a real-time collaborative text editor architecture. Cover CRDTs vs OT, conflict resolution, presence awareness, offline support, and network partitioning. Include sequence diagrams."},
    {"id": 19, "expected": "complex", "prompt": "Implement a B+ tree in Python with insert, delete, search, and range query operations. Include proper node splitting, merging, and rebalancing. Add visualization of the tree structure."},
    {"id": 20, "expected": "complex", "prompt": "Compare and contrast 5 different consensus algorithms (Raft, Paxos, PBFT, Tendermint, HotStuff) for a blockchain-based supply chain system. Evaluate latency, throughput, fault tolerance, and Byzantine resistance. Recommend one with detailed justification."},
]

# Model pricing (per 1M tokens)
MODEL_PRICING = {
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-opus-4-6": {"input": 5.00, "output": 25.00},
}


def calculate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """Calculate cost in USD for a given model and token counts."""
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["claude-opus-4-6"])
    return (tokens_in * pricing["input"] / 1_000_000) + (tokens_out * pricing["output"] / 1_000_000)


async def run_completion(api_key: str, prompt: str, layers: Dict, model_override: Optional[str] = None) -> Dict:
    """Run a single completion via the Nadir API."""
    import httpx

    body: Dict[str, Any] = {
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 300,
        "layers": layers,
    }
    if model_override:
        body["model"] = model_override

    start = time.time()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "http://localhost:8000/v1/chat/completions",
            json=body,
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        )
    elapsed_ms = int((time.time() - start) * 1000)

    if resp.status_code != 200:
        return {"error": resp.text, "elapsed_ms": elapsed_ms}

    data = resp.json()
    meta = data.get("nadir_metadata", {})
    cost = meta.get("cost", {})
    bench = meta.get("benchmark_comparison", {})

    return {
        "model": data.get("model", "?"),
        "response": data.get("choices", [{}])[0].get("message", {}).get("content", "")[:200],
        "tokens_in": data.get("usage", {}).get("prompt_tokens", 0),
        "tokens_out": data.get("usage", {}).get("completion_tokens", 0),
        "cost_usd": cost.get("total_cost_usd", 0),
        "benchmark_cost_usd": bench.get("benchmark_cost_usd", 0),
        "savings_usd": bench.get("savings_usd", 0),
        "tier": meta.get("complexity_analysis", {}).get("tier", "?"),
        "routing_strategy": meta.get("routing_strategy", "?"),
        "layers": meta.get("layers", {}),
        "elapsed_ms": elapsed_ms,
    }


async def run_benchmark_config(api_key: str, config_name: str, layers: Dict, model_override: Optional[str] = None):
    """Run all 20 prompts through a specific configuration."""
    print(f"\n{'='*70}")
    print(f"  CONFIG: {config_name}")
    print(f"  Layers: {json.dumps(layers)}")
    if model_override:
        print(f"  Model override: {model_override}")
    print(f"{'='*70}\n")

    results = []
    total_cost = 0
    total_benchmark = 0

    for p in PROMPTS:
        result = await run_completion(api_key, p["prompt"], layers, model_override)

        if "error" in result:
            print(f"  #{p['id']:2d} ❌ ERROR: {result['error'][:80]}")
            results.append({"id": p["id"], "expected": p["expected"], "error": True})
            continue

        cost = result["cost_usd"]
        total_cost += cost
        bench_cost = result.get("benchmark_cost_usd", 0)
        total_benchmark += bench_cost
        savings = result.get("savings_usd", 0)

        tier_label = result.get("tier", "?")
        model_short = result["model"].split("/")[-1][:20]

        print(f"  #{p['id']:2d} [{p['expected']:7s}] → {model_short:20s} | "
              f"${cost:.6f} (bench ${bench_cost:.6f}) | "
              f"save ${savings:.6f} | {result['elapsed_ms']:>5d}ms | tier={tier_label}")

        results.append({
            "id": p["id"],
            "expected": p["expected"],
            "model": result["model"],
            "response": result["response"],
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
            "cost_usd": cost,
            "benchmark_cost_usd": bench_cost,
            "savings_usd": savings,
            "tier": tier_label,
            "elapsed_ms": result["elapsed_ms"],
        })

    savings_total = total_benchmark - total_cost if total_benchmark > 0 else 0
    savings_pct = (savings_total / total_benchmark * 100) if total_benchmark > 0 else 0

    print(f"\n  ┌─────────────────────────────────────────┐")
    print(f"  │ Total cost:      ${total_cost:.6f}          │")
    print(f"  │ Benchmark cost:  ${total_benchmark:.6f}          │")
    print(f"  │ Savings:         ${savings_total:.6f} ({savings_pct:.1f}%)   │")
    print(f"  │ Avg latency:     {sum(r.get('elapsed_ms',0) for r in results if not r.get('error'))//max(len([r for r in results if not r.get('error')]),1)}ms              │")
    print(f"  └─────────────────────────────────────────┘")

    return {
        "config": config_name,
        "results": results,
        "total_cost": total_cost,
        "total_benchmark": total_benchmark,
        "savings": savings_total,
        "savings_pct": savings_pct,
    }


async def run_llm_judge(all_configs: List[Dict], api_key: str):
    """Use the premium model as a judge to evaluate response quality."""
    print(f"\n{'='*70}")
    print(f"  LLM-AS-JUDGE: Quality Evaluation")
    print(f"{'='*70}\n")

    # Compare config A (routing only) vs config D (opus baseline) for each prompt
    config_a = {r["id"]: r for r in all_configs[0]["results"] if not r.get("error")}
    config_d = {r["id"]: r for r in all_configs[3]["results"] if not r.get("error")}

    judge_results = []

    for p in PROMPTS[:10]:  # Judge first 10 to save cost
        pid = p["id"]
        if pid not in config_a or pid not in config_d:
            continue

        resp_routed = config_a[pid].get("response", "")
        resp_opus = config_d[pid].get("response", "")
        model_routed = config_a[pid].get("model", "?")

        judge_prompt = f"""You are a quality judge. Compare two AI responses to the same prompt.

PROMPT: {p['prompt']}

RESPONSE A (from {model_routed}, routed by Nadir):
{resp_routed}

RESPONSE B (from claude-opus-4-6, premium baseline):
{resp_opus}

Rate each response 1-10 on: accuracy, completeness, clarity.
Then give an overall verdict: EQUAL, A_BETTER, B_BETTER, or A_ACCEPTABLE (A is slightly worse but still usable).

Respond in JSON format:
{{"a_score": N, "b_score": N, "verdict": "...", "reason": "one sentence"}}"""

        import httpx
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "http://localhost:8000/v1/chat/completions",
                json={
                    "messages": [{"role": "user", "content": judge_prompt}],
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 200,
                    "layers": {"routing": False, "fallback": False, "optimize": "off"},
                },
                headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            )

        if resp.status_code == 200:
            judge_text = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            try:
                # Try to parse JSON from response
                import re
                json_match = re.search(r'\{[^}]+\}', judge_text)
                if json_match:
                    verdict = json.loads(json_match.group())
                    print(f"  #{pid:2d} [{p['expected']:7s}] {model_routed:20s} vs opus → "
                          f"A:{verdict.get('a_score','?')}/10 B:{verdict.get('b_score','?')}/10 "
                          f"→ {verdict.get('verdict','?')} | {verdict.get('reason','')[:60]}")
                    judge_results.append({"id": pid, **verdict})
                else:
                    print(f"  #{pid:2d} Could not parse judge response")
            except Exception as e:
                print(f"  #{pid:2d} Parse error: {e}")
        else:
            print(f"  #{pid:2d} Judge call failed: {resp.status_code}")

    if judge_results:
        equal_or_better = sum(1 for j in judge_results if j.get("verdict") in ("EQUAL", "A_BETTER", "A_ACCEPTABLE"))
        print(f"\n  Quality verdict: {equal_or_better}/{len(judge_results)} prompts maintained quality with routing")
        avg_a = sum(j.get("a_score", 0) for j in judge_results) / len(judge_results)
        avg_b = sum(j.get("b_score", 0) for j in judge_results) / len(judge_results)
        print(f"  Average scores: Routed={avg_a:.1f}/10, Opus baseline={avg_b:.1f}/10")

    return judge_results


async def main():
    # Read API key
    key_file = "/tmp/nadir_byok_key.txt"
    if not os.path.exists(key_file):
        print("ERROR: No API key found. Run the E2E test setup first.")
        sys.exit(1)

    api_key = open(key_file).read().strip()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║          NADIR ROUTING BENCHMARK — 20 PROMPTS × 4 CONFIGS      ║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    all_configs = []

    # Config A: Only routing (heuristic), no context optimize
    config_a = await run_benchmark_config(api_key, "A: ROUTING ONLY", {
        "routing": True, "fallback": False, "optimize": "off"
    })
    all_configs.append(config_a)

    # Config B: Only context optimize (safe), no routing — force opus
    config_b = await run_benchmark_config(api_key, "B: CONTEXT OPTIMIZE ONLY (safe, force opus)", {
        "routing": False, "fallback": False, "optimize": "safe"
    }, model_override="claude-opus-4-6")
    all_configs.append(config_b)

    # Config C: Route + context optimize (both on)
    config_c = await run_benchmark_config(api_key, "C: ROUTING + CONTEXT OPTIMIZE", {
        "routing": True, "fallback": False, "optimize": "safe"
    })
    all_configs.append(config_c)

    # Config D: Just Opus 4.6 (baseline — no routing, no optimize)
    config_d = await run_benchmark_config(api_key, "D: OPUS 4.6 BASELINE (no routing)", {
        "routing": False, "fallback": False, "optimize": "off"
    }, model_override="claude-opus-4-6")
    all_configs.append(config_d)

    # ── SUMMARY TABLE ──
    print(f"\n{'='*70}")
    print(f"  BENCHMARK SUMMARY")
    print(f"{'='*70}")
    print(f"\n  {'Config':45s} | {'Cost':>10s} | {'Benchmark':>10s} | {'Savings':>10s} | {'%':>6s}")
    print(f"  {'-'*45} | {'-'*10} | {'-'*10} | {'-'*10} | {'-'*6}")
    for c in all_configs:
        print(f"  {c['config']:45s} | ${c['total_cost']:.4f} | ${c['total_benchmark']:.4f} | ${c['savings']:.4f} | {c['savings_pct']:5.1f}%")

    baseline_cost = all_configs[3]["total_cost"]  # Config D = opus baseline
    print(f"\n  Baseline (Opus 4.6 for all): ${baseline_cost:.4f}")
    for c in all_configs[:3]:
        vs_baseline = baseline_cost - c["total_cost"]
        vs_pct = (vs_baseline / baseline_cost * 100) if baseline_cost > 0 else 0
        print(f"  {c['config']:45s} saves ${vs_baseline:.4f} vs baseline ({vs_pct:.1f}%)")

    # ── LLM-AS-JUDGE ──
    print("\n  Running LLM-as-judge quality evaluation...")
    judge_results = await run_llm_judge(all_configs, api_key)

    # Save full results to file
    output = {
        "configs": all_configs,
        "judge_results": judge_results,
        "baseline_cost": baseline_cost,
    }
    with open("/tmp/nadir_benchmark_results.json", "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Full results saved to /tmp/nadir_benchmark_results.json")


if __name__ == "__main__":
    asyncio.run(main())
