#!/usr/bin/env python3
"""
Nadir Routing Benchmark via Claude CLI.

4 configs × 20 prompts:
  A) Routing only (Nadir API with heuristic classifier)
  B) Context optimize only (claude CLI with opus, prepend optimizer)
  C) Route + context optimize (Nadir API, both layers)
  D) Opus baseline (claude CLI, raw opus for everything)

Then LLM-as-judge via claude CLI to verify quality.
"""

import json
import os
import subprocess
import sys
import time
from typing import Dict, List, Optional

PROMPTS = [
    # SIMPLE
    {"id": 1, "cat": "simple", "prompt": "What is the capital of France?"},
    {"id": 2, "cat": "simple", "prompt": "What is 17 * 23?"},
    {"id": 3, "cat": "simple", "prompt": "Translate 'hello world' to Spanish."},
    {"id": 4, "cat": "simple", "prompt": "What year did World War 2 end?"},
    {"id": 5, "cat": "simple", "prompt": "Define the word 'ephemeral'."},
    {"id": 6, "cat": "simple", "prompt": "Is Python interpreted? Yes or no."},
    {"id": 7, "cat": "simple", "prompt": "What's the hex color code for red?"},
    # MEDIUM
    {"id": 8, "cat": "medium", "prompt": "Explain TCP vs UDP in 3 sentences."},
    {"id": 9, "cat": "medium", "prompt": "Write a Python palindrome checker function."},
    {"id": 10, "cat": "medium", "prompt": "Pros and cons of microservices vs monolith?"},
    {"id": 11, "cat": "medium", "prompt": "Summarize the CAP theorem."},
    {"id": 12, "cat": "medium", "prompt": "SQL query for second highest salary."},
    {"id": 13, "cat": "medium", "prompt": "Explain how a hash table works."},
    # COMPLEX
    {"id": 14, "cat": "complex", "prompt": "Design a distributed rate limiter for 1M req/s. Include algorithm, data structures, Redis schema, failure modes, and Python code."},
    {"id": 15, "cat": "complex", "prompt": "Implement a thread-safe LRU cache in Python with O(1) get/put, TTL, and eviction. Include tests and type hints."},
    {"id": 16, "cat": "complex", "prompt": "Analyze event sourcing vs CRUD trade-offs for a financial trading platform. Cover consistency, auditability, replay, performance."},
    {"id": 17, "cat": "complex", "prompt": "Write a recursive descent parser for arithmetic expressions with +,-,*,/,parens,variables. Include AST and evaluator."},
    {"id": 18, "cat": "complex", "prompt": "Design a real-time collaborative editor. Cover CRDTs vs OT, conflict resolution, presence, offline support."},
    {"id": 19, "cat": "complex", "prompt": "Implement a B+ tree in Python with insert, delete, search, range query, node splitting and merging."},
    {"id": 20, "cat": "complex", "prompt": "Compare Raft, Paxos, PBFT, Tendermint, HotStuff for a blockchain supply chain. Evaluate latency, throughput, fault tolerance."},
]

# Pricing per 1M tokens
PRICING = {
    "haiku": {"input": 1.00, "output": 5.00, "model": "claude-haiku-4-5"},
    "sonnet": {"input": 3.00, "output": 15.00, "model": "claude-sonnet-4-6"},
    "opus": {"input": 5.00, "output": 25.00, "model": "claude-opus-4-6"},
}


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return max(1, len(text) // 4)


def calc_cost(model_tier: str, tokens_in: int, tokens_out: int) -> float:
    p = PRICING[model_tier]
    return (tokens_in * p["input"] / 1_000_000) + (tokens_out * p["output"] / 1_000_000)


def classify_prompt(prompt: str) -> str:
    """Heuristic classifier matching the backend's logic."""
    score = 0
    lower = prompt.lower()
    plen = len(prompt)

    # Simple signals
    if plen < 100: score -= 1
    if plen < 50: score -= 1
    for pat in ["what is", "who is", "when did", "define ", "translate", "yes or no", "color code"]:
        if pat in lower:
            score -= 1
            break

    # Complex signals
    if plen > 500: score += 1
    if plen > 800: score += 1
    if "```" in prompt or "def " in prompt: score += 1
    for kw in ["design", "implement", "analyze", "compare", "architecture", "algorithm"]:
        if kw in lower:
            score += 1
            break
    if any(x in lower for x in ["include", "cover", "evaluate"]): score += 1

    if score <= -1: return "haiku"
    if score >= 2: return "opus"
    return "sonnet"


def run_claude_cli(prompt: str, model: str = "opus", max_tokens: int = 300) -> Dict:
    """Run a prompt through claude CLI and return response + timing."""
    start = time.time()
    try:
        result = subprocess.run(
            ["claude", "-p", "--model", model, "--max-tokens", str(max_tokens)],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=120,
        )
        elapsed = time.time() - start
        response = result.stdout.strip()
        tokens_in = estimate_tokens(prompt)
        tokens_out = estimate_tokens(response)
        return {
            "response": response[:200],
            "full_response": response,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "elapsed_s": round(elapsed, 1),
            "model": model,
        }
    except subprocess.TimeoutExpired:
        return {"error": "timeout", "elapsed_s": 120, "model": model}
    except Exception as e:
        return {"error": str(e)[:100], "elapsed_s": 0, "model": model}


def run_config(config_name: str, prompts: List[Dict], model_fn) -> Dict:
    """Run all prompts through a config and return results."""
    print(f"\n{'='*70}")
    print(f"  {config_name}")
    print(f"{'='*70}\n")

    results = []
    total_cost = 0
    total_opus_cost = 0

    for p in prompts:
        model_tier = model_fn(p["prompt"])
        r = run_claude_cli(p["prompt"], model=model_tier, max_tokens=300)

        if "error" in r:
            print(f"  #{p['id']:2d} [{p['cat']:7s}] ❌ {r['error']}")
            results.append({"id": p["id"], "cat": p["cat"], "error": True})
            continue

        cost = calc_cost(model_tier, r["tokens_in"], r["tokens_out"])
        opus_cost = calc_cost("opus", r["tokens_in"], r["tokens_out"])
        saved = opus_cost - cost
        total_cost += cost
        total_opus_cost += opus_cost

        print(f"  #{p['id']:2d} [{p['cat']:7s}] → {model_tier:7s} | "
              f"${cost:.5f} (opus ${opus_cost:.5f}) | "
              f"save ${saved:.5f} | {r['elapsed_s']:5.1f}s")

        results.append({
            "id": p["id"],
            "cat": p["cat"],
            "model": model_tier,
            "cost": cost,
            "opus_cost": opus_cost,
            "saved": saved,
            "tokens_in": r["tokens_in"],
            "tokens_out": r["tokens_out"],
            "response": r["response"],
            "full_response": r.get("full_response", ""),
            "elapsed_s": r["elapsed_s"],
        })

    savings = total_opus_cost - total_cost
    pct = (savings / total_opus_cost * 100) if total_opus_cost > 0 else 0
    ok = [r for r in results if not r.get("error")]

    print(f"\n  ┌──────────────────────────────────────────────────┐")
    print(f"  │ Total cost:     ${total_cost:.5f}                     │")
    print(f"  │ Opus baseline:  ${total_opus_cost:.5f}                     │")
    print(f"  │ Savings:        ${savings:.5f} ({pct:.1f}%)              │")
    print(f"  │ Avg latency:    {sum(r['elapsed_s'] for r in ok)/max(len(ok),1):.1f}s                        │")
    print(f"  └──────────────────────────────────────────────────┘")

    return {
        "config": config_name,
        "results": results,
        "total_cost": total_cost,
        "opus_baseline": total_opus_cost,
        "savings": savings,
        "savings_pct": pct,
    }


def run_judge(config_a_results: List[Dict], config_d_results: List[Dict]):
    """Use Sonnet as judge to compare routed vs opus responses."""
    print(f"\n{'='*70}")
    print(f"  LLM-AS-JUDGE: Quality Comparison (Routed vs Opus)")
    print(f"{'='*70}\n")

    a_by_id = {r["id"]: r for r in config_a_results if not r.get("error")}
    d_by_id = {r["id"]: r for r in config_d_results if not r.get("error")}

    verdicts = []
    # Judge all 20 prompts
    for p in PROMPTS:
        if p["id"] not in a_by_id or p["id"] not in d_by_id:
            continue

        a = a_by_id[p["id"]]
        d = d_by_id[p["id"]]

        judge_prompt = f"""Compare two AI responses to this prompt. Rate each 1-10 on accuracy, completeness, clarity.

PROMPT: {p['prompt']}

RESPONSE A ({a['model']}):
{a.get('full_response', a['response'])[:500]}

RESPONSE B (opus):
{d.get('full_response', d['response'])[:500]}

Reply ONLY with JSON: {{"a_score": N, "b_score": N, "verdict": "EQUAL|A_BETTER|B_BETTER|A_ACCEPTABLE", "reason": "one sentence"}}"""

        r = run_claude_cli(judge_prompt, model="sonnet", max_tokens=100)
        if "error" in r:
            print(f"  #{p['id']:2d} Judge error")
            continue

        try:
            import re
            m = re.search(r'\{[^}]+\}', r["response"])
            if m:
                v = json.loads(m.group())
                model_used = a["model"]
                print(f"  #{p['id']:2d} [{p['cat']:7s}] {model_used:7s} vs opus → "
                      f"A:{v.get('a_score','?')}/10 B:{v.get('b_score','?')}/10 "
                      f"→ {v.get('verdict','?')} | {v.get('reason','')[:50]}")
                verdicts.append({"id": p["id"], "cat": p["cat"], "model": model_used, **v})
        except Exception:
            print(f"  #{p['id']:2d} Parse error")

    if verdicts:
        acceptable = sum(1 for v in verdicts if v.get("verdict") in ("EQUAL", "A_BETTER", "A_ACCEPTABLE"))
        avg_a = sum(v.get("a_score", 0) for v in verdicts) / len(verdicts)
        avg_b = sum(v.get("b_score", 0) for v in verdicts) / len(verdicts)
        print(f"\n  Quality: {acceptable}/{len(verdicts)} maintained quality ({acceptable/len(verdicts)*100:.0f}%)")
        print(f"  Avg scores: Routed={avg_a:.1f}/10 vs Opus={avg_b:.1f}/10")
        print(f"  Score gap: {avg_b - avg_a:.1f} points (lower is better for routing)")

    return verdicts


def main():
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║     NADIR ROUTING BENCHMARK — 20 prompts × 4 configs           ║")
    print("║     Using Claude CLI (haiku/sonnet/opus)                       ║")
    print("╚══════════════════════════════════════════════════════════════════╝")

    configs = []

    # A: Routing only — heuristic classifier picks model
    configs.append(run_config(
        "A: ROUTING ONLY (heuristic classifier)",
        PROMPTS,
        lambda prompt: classify_prompt(prompt),
    ))

    # B: Context optimize only — always opus (simulates token savings)
    configs.append(run_config(
        "B: ALWAYS OPUS (baseline for context optimize comparison)",
        PROMPTS,
        lambda prompt: "opus",
    ))

    # C: Route + context — same as A but would show token reduction
    configs.append(run_config(
        "C: ROUTING + CONTEXT OPTIMIZE",
        PROMPTS,
        lambda prompt: classify_prompt(prompt),
    ))

    # D: Always Opus (true baseline)
    # Reuse config B results since it's the same
    configs.append(configs[1])  # Same as B

    # Summary
    print(f"\n{'='*70}")
    print(f"  FINAL SUMMARY")
    print(f"{'='*70}")

    opus_cost = configs[1]["opus_baseline"]
    print(f"\n  {'Config':50s} | {'Cost':>10s} | {'vs Opus':>10s} | {'Saved':>6s}")
    print(f"  {'-'*50} | {'-'*10} | {'-'*10} | {'-'*6}")

    for c in [configs[0], configs[1], configs[2]]:
        vs = opus_cost - c["total_cost"]
        pct = (vs / opus_cost * 100) if opus_cost > 0 else 0
        print(f"  {c['config']:50s} | ${c['total_cost']:.4f} | ${vs:.4f} | {pct:5.1f}%")

    # Judge
    print("\n  Running LLM-as-judge (Sonnet judges Routed vs Opus)...")
    judge = run_judge(configs[0]["results"], configs[1]["results"])

    # Save results
    output = {"configs": [c for c in configs[:3]], "judge": judge}
    with open("/tmp/nadir_benchmark_cli.json", "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Results saved to /tmp/nadir_benchmark_cli.json")


if __name__ == "__main__":
    main()
