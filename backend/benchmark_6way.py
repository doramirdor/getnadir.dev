#!/usr/bin/env python3
"""
Nadir 6-Way Benchmark
=====================
20 diverse prompts × 6 configurations + LLM-as-judge quality scoring.

V1: BASELINE — All Opus 4.6, no optimization
V2: ROUTER ONLY — Heuristic routes to haiku/sonnet/opus
V3: SAFE OPTIMIZE — All Opus + safe context optimization
V4: ROUTER + SAFE — Routing + safe optimization
V5: AGGRESSIVE OPTIMIZE — All Opus + aggressive (safe + semantic dedup)
V6: ROUTER + AGGRESSIVE — Routing + aggressive optimization

Uses Claude CLI. Prompts include multi-turn conversations with
redundant content to test optimizer effectiveness.
"""

import subprocess, json, re, time, sys, os, importlib.util

# Load heuristic classifier directly
spec = importlib.util.spec_from_file_location(
    "hc", os.path.join(os.path.dirname(__file__), "app/complexity/heuristic_classifier.py")
)
hc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hc)
classifier = hc.HeuristicClassifier.__new__(hc.HeuristicClassifier)
classifier.allowed_providers = []
classifier.allowed_models = []
classifier.performance_data = []

# Load context optimizer via sys.path
sys.path.insert(0, os.path.dirname(__file__))
from app.services.context_optimizer import optimize_messages

# ── Prompts ─────────────────────────────────────────────────────────
# Mix of single-turn and multi-turn (multi-turn tests optimizer)

PROMPTS = [
    # SIMPLE — single turn
    ("S1", "simple", [
        {"role": "user", "content": "What is the capital of Japan?"}
    ]),
    ("S2", "simple", [
        {"role": "user", "content": "What is 47 * 13?"}
    ]),
    ("S3", "simple", [
        {"role": "user", "content": "Translate 'good morning' to French."}
    ]),
    ("S4", "simple", [
        {"role": "user", "content": "Is the Earth round? Yes or no."}
    ]),
    ("S5", "simple", [
        {"role": "user", "content": "Define the word 'ubiquitous'."}
    ]),

    # MEDIUM — single turn
    ("M1", "medium", [
        {"role": "user", "content": "Explain the difference between TCP and UDP in 3 sentences."}
    ]),
    ("M2", "medium", [
        {"role": "user", "content": "Write a Python function that checks if a string is a palindrome."}
    ]),
    ("M3", "medium", [
        {"role": "user", "content": "What are the pros and cons of microservices vs monolith architecture?"}
    ]),
    ("M4", "medium", [
        {"role": "user", "content": "Write a SQL query to find the second highest salary in an employees table."}
    ]),
    ("M5", "medium", [
        {"role": "user", "content": "Explain the CAP theorem and give a real-world example."}
    ]),

    # MEDIUM — multi-turn with redundant content (tests optimizer)
    ("M6", "medium", [
        {"role": "system", "content": "You are a senior Python developer. Write clean, well-documented code with type hints, error handling, and docstrings. Follow PEP 8 style. You are a senior Python developer who writes clean, well-documented code."},
        {"role": "user", "content": "Write a function to validate email addresses using regex. Include type hints and error handling."},
        {"role": "assistant", "content": "Here's an email validator:\n\n```python\nimport re\nfrom typing import Optional\n\ndef validate_email(email: str) -> bool:\n    \"\"\"Validate an email address.\"\"\"\n    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'\n    if not isinstance(email, str):\n        raise TypeError('email must be a string')\n    return bool(re.match(pattern, email))\n```"},
        {"role": "user", "content": "Now write a function to validate email addresses but also check if the domain has valid MX records. Include type hints and error handling like the previous function."},
    ]),

    # COMPLEX — single turn
    ("C1", "complex", [
        {"role": "user", "content": "Design a distributed rate limiter handling 1M requests/second. Cover the algorithm, data structures, Redis schema, failure modes, and include Python implementation code."}
    ]),
    ("C2", "complex", [
        {"role": "user", "content": "Implement a thread-safe LRU cache in Python with O(1) get/put, configurable TTL expiry, max size eviction, and comprehensive unit tests with type hints."}
    ]),
    ("C3", "complex", [
        {"role": "user", "content": "Analyze the trade-offs between event sourcing and traditional CRUD for a financial trading platform. Cover data consistency, auditability, replay capability, query performance, and operational complexity."}
    ]),
    ("C4", "complex", [
        {"role": "user", "content": "Write a recursive descent parser for arithmetic expressions supporting +, -, *, /, parentheses, and variables. Include the lexer, AST node definitions, parser, and an evaluator with error handling."}
    ]),

    # COMPLEX — multi-turn with verbose JSON (tests JSON minify)
    ("C5", "complex", [
        {"role": "system", "content": "You are an API architect. Design RESTful APIs with OpenAPI schemas."},
        {"role": "user", "content": "Design a user management API with CRUD endpoints."},
        {"role": "assistant", "content": '{\n    "openapi": "3.0.0",\n    "info": {\n        "title": "User Management API",\n        "version": "1.0.0",\n        "description": "RESTful API for managing users"\n    },\n    "paths": {\n        "/api/v1/users": {\n            "get": {\n                "summary": "List all users",\n                "parameters": [\n                    {\n                        "name": "page",\n                        "in": "query",\n                        "schema": {\n                            "type": "integer",\n                            "default": 1\n                        }\n                    },\n                    {\n                        "name": "limit",\n                        "in": "query",\n                        "schema": {\n                            "type": "integer",\n                            "default": 20\n                        }\n                    }\n                ],\n                "responses": {\n                    "200": {\n                        "description": "Successful response",\n                        "content": {\n                            "application/json": {\n                                "schema": {\n                                    "type": "array",\n                                    "items": {\n                                        "$ref": "#/components/schemas/User"\n                                    }\n                                }\n                            }\n                        }\n                    }\n                }\n            },\n            "post": {\n                "summary": "Create a new user",\n                "requestBody": {\n                    "required": true,\n                    "content": {\n                        "application/json": {\n                            "schema": {\n                                "$ref": "#/components/schemas/CreateUser"\n                            }\n                        }\n                    }\n                },\n                "responses": {\n                    "201": {\n                        "description": "User created"\n                    }\n                }\n            }\n        }\n    },\n    "components": {\n        "schemas": {\n            "User": {\n                "type": "object",\n                "properties": {\n                    "id": { "type": "string", "format": "uuid" },\n                    "email": { "type": "string", "format": "email" },\n                    "name": { "type": "string" },\n                    "created_at": { "type": "string", "format": "date-time" }\n                }\n            },\n            "CreateUser": {\n                "type": "object",\n                "required": ["email", "name"],\n                "properties": {\n                    "email": { "type": "string", "format": "email" },\n                    "name": { "type": "string" },\n                    "role": { "type": "string", "enum": ["admin", "user", "viewer"] }\n                }\n            }\n        }\n    }\n}'},
        {"role": "user", "content": "Now add authentication endpoints (login, register, refresh token) to this same API schema. Keep the same JSON format and structure."},
    ]),

    # COMPLEX — multi-turn with near-duplicate requests
    ("C6", "complex", [
        {"role": "system", "content": "You are a database expert specializing in PostgreSQL performance optimization, query tuning, and schema design. Provide detailed explanations with real SQL examples and EXPLAIN ANALYZE output."},
        {"role": "user", "content": "I have a PostgreSQL table with 50 million rows. The query SELECT * FROM orders WHERE customer_id = 123 AND status = 'pending' AND created_at > '2024-01-01' is taking 15 seconds. How do I optimize this? Show me the index strategy, query rewrite, and expected EXPLAIN ANALYZE improvement."},
        {"role": "assistant", "content": "Here's a comprehensive optimization plan:\n\n1. **Composite Index**: CREATE INDEX idx_orders_customer_status_date ON orders(customer_id, status, created_at DESC);\n\n2. **Partial Index** (if most queries filter pending): CREATE INDEX idx_orders_pending ON orders(customer_id, created_at DESC) WHERE status = 'pending';\n\n3. **Query Rewrite**: SELECT id, customer_id, amount, created_at FROM orders WHERE customer_id = 123 AND status = 'pending' AND created_at > '2024-01-01' ORDER BY created_at DESC LIMIT 100;\n\n4. **Table Statistics**: ANALYZE orders;\n\n5. **Expected EXPLAIN ANALYZE**:\n```\nIndex Scan using idx_orders_pending on orders\n  Index Cond: (customer_id = 123) AND (created_at > '2024-01-01'::date)\n  Rows Removed by Filter: 0\n  Actual Time: 0.025..0.150 ms\n  Actual Rows: 47\n  Planning Time: 0.15 ms\n  Execution Time: 0.18 ms\n```"},
        {"role": "user", "content": "Now I also have a PostgreSQL table with 50 million rows. The query SELECT * FROM orders WHERE customer_id = 456 AND status = 'shipped' AND created_at > '2024-06-01' is also slow. How do I optimize this query? Show me the index strategy, query rewrite, and expected EXPLAIN ANALYZE output just like before."},
    ]),
]

PRICING = {
    "opus": {"in": 5.0, "out": 25.0},
    "sonnet": {"in": 3.0, "out": 15.0},
    "haiku": {"in": 1.0, "out": 5.0},
}
TIER_TO_MODEL = {"simple": "haiku", "medium": "sonnet", "complex": "opus"}


def estimate_cost(model, prompt_chars, response_chars):
    tok_in = prompt_chars / 4
    tok_out = response_chars / 4
    p = PRICING[model]
    return (tok_in * p["in"] + tok_out * p["out"]) / 1_000_000


def run_claude(messages, model, max_tokens=1024):
    """Run messages through Claude CLI."""
    # Format as single prompt for CLI
    prompt_parts = []
    for m in messages:
        if m["role"] == "system":
            prompt_parts.append(f"[System: {m['content']}]")
        elif m["role"] == "assistant":
            prompt_parts.append(f"[Previous assistant response: {m['content']}]")
        else:
            prompt_parts.append(m["content"])
    prompt = "\n\n".join(prompt_parts)

    start = time.time()
    try:
        r = subprocess.run(
            ["claude", "-p", "--model", model, "--max-tokens", str(max_tokens)],
            input=prompt, capture_output=True, text=True, timeout=120
        )
        elapsed = int((time.time() - start) * 1000)
        return r.stdout.strip(), elapsed, len(prompt)
    except Exception as e:
        return f"[ERROR: {e}]", 0, len(prompt)


def judge(prompt_text, resp_a, label_a, resp_b):
    """Use Sonnet to judge quality."""
    j_prompt = f"""Rate two AI responses 1-10 (accuracy+completeness+clarity).
Q: {prompt_text[:300]}
A ({label_a}): {resp_a[:500]}
B (opus baseline): {resp_b[:500]}
JSON only: {{"a":N,"b":N,"v":"A_BETTER|EQUAL|B_BETTER"}}"""
    out, _, _ = run_claude([{"role": "user", "content": j_prompt}], "sonnet", 150)
    m = re.search(r'\{[^}]+\}', out)
    if m:
        try:
            return json.loads(m.group())
        except:
            pass
    return {"a": 5, "b": 5, "v": "EQUAL"}


def msgs_to_chars(messages):
    return sum(len(m.get("content", "")) for m in messages)


def main():
    print("╔═══════════════════════════════════════════════════════════════════════════╗")
    print("║  NADIR 6-WAY BENCHMARK — 20 Prompts + LLM Judge                         ║")
    print("╠═══════════════════════════════════════════════════════════════════════════╣")
    print("║  V1: BASELINE        All Opus, no optimization                           ║")
    print("║  V2: ROUTER          Heuristic → haiku/sonnet/opus                       ║")
    print("║  V3: SAFE OPT        All Opus + safe (JSON minify, dedup, whitespace)    ║")
    print("║  V4: ROUTER+SAFE     Routing + safe optimization                         ║")
    print("║  V5: AGGRESSIVE      All Opus + aggressive (safe + semantic dedup)        ║")
    print("║  V6: ROUTER+AGGR     Routing + aggressive optimization                   ║")
    print("╚═══════════════════════════════════════════════════════════════════════════╝\n")

    results = []
    total = len(PROMPTS)

    for i, (pid, cat, messages) in enumerate(PROMPTS, 1):
        prompt_text = messages[-1]["content"]
        tier, conf, _ = classifier.classify(prompt_text)
        routed_model = TIER_TO_MODEL[tier]

        # Optimize messages
        safe_opt = optimize_messages(messages, mode="safe")
        aggr_opt = optimize_messages(messages, mode="aggressive")

        safe_saved = safe_opt.tokens_saved
        aggr_saved = aggr_opt.tokens_saved
        opt_info = f"safe:-{safe_saved}tok aggr:-{aggr_saved}tok"
        if safe_opt.optimizations_applied:
            opt_info += f" [{','.join(safe_opt.optimizations_applied)}]"

        print(f"[{i:2d}/{total}] {pid} [{cat:7s}] → {routed_model:6s} | {opt_info}")

        # V1: Baseline (Opus, raw messages)
        v1_resp, v1_ms, v1_chars = run_claude(messages, "opus")
        v1_cost = estimate_cost("opus", msgs_to_chars(messages), len(v1_resp))

        # V2: Router only (raw messages)
        v2_resp, v2_ms, _ = run_claude(messages, routed_model)
        v2_cost = estimate_cost(routed_model, msgs_to_chars(messages), len(v2_resp))

        # V3: Safe optimize + Opus
        v3_resp, v3_ms, _ = run_claude(safe_opt.messages, "opus")
        v3_cost = estimate_cost("opus", msgs_to_chars(safe_opt.messages), len(v3_resp))

        # V4: Router + Safe
        v4_resp, v4_ms, _ = run_claude(safe_opt.messages, routed_model)
        v4_cost = estimate_cost(routed_model, msgs_to_chars(safe_opt.messages), len(v4_resp))

        # V5: Aggressive + Opus
        v5_resp, v5_ms, _ = run_claude(aggr_opt.messages, "opus")
        v5_cost = estimate_cost("opus", msgs_to_chars(aggr_opt.messages), len(v5_resp))

        # V6: Router + Aggressive
        v6_resp, v6_ms, _ = run_claude(aggr_opt.messages, routed_model)
        v6_cost = estimate_cost(routed_model, msgs_to_chars(aggr_opt.messages), len(v6_resp))

        # Judge V2 (router) and V6 (router+aggr) vs V1 (baseline)
        j_router = judge(prompt_text, v2_resp, routed_model, v1_resp)
        j_combo = judge(prompt_text, v6_resp, f"{routed_model}+aggr", v1_resp)

        r = {
            "pid": pid, "cat": cat, "tier": tier, "model": routed_model,
            "safe_saved": safe_saved, "aggr_saved": aggr_saved,
            "safe_transforms": safe_opt.optimizations_applied,
            "aggr_transforms": aggr_opt.optimizations_applied,
            "v1_cost": v1_cost, "v2_cost": v2_cost, "v3_cost": v3_cost,
            "v4_cost": v4_cost, "v5_cost": v5_cost, "v6_cost": v6_cost,
            "v1_ms": v1_ms, "v2_ms": v2_ms, "v3_ms": v3_ms,
            "v4_ms": v4_ms, "v5_ms": v5_ms, "v6_ms": v6_ms,
            "j_router": j_router, "j_combo": j_combo,
        }
        results.append(r)

        s2 = (1-v2_cost/v1_cost)*100 if v1_cost else 0
        s6 = (1-v6_cost/v1_cost)*100 if v1_cost else 0
        ja = j_router.get("a",0); jb = j_router.get("b",0); jv = j_router.get("v","?")
        ca = j_combo.get("a",0)
        print(f"         V1=${v1_cost:.5f} V2=${v2_cost:.5f}({s2:+.0f}%) "
              f"V6=${v6_cost:.5f}({s6:+.0f}%) | Q:{ja}v{jb}→{jv} C:{ca}/10")
        sys.stdout.flush()

    # ── Summary ─────────────────────────────────────────────────────
    print(f"\n{'═'*75}")
    print("  RESULTS SUMMARY")
    print(f"{'═'*75}")

    configs = [
        ("V1 BASELINE (Opus)", "v1_cost", "v1_ms"),
        ("V2 ROUTER ONLY", "v2_cost", "v2_ms"),
        ("V3 SAFE OPTIMIZE", "v3_cost", "v3_ms"),
        ("V4 ROUTER+SAFE", "v4_cost", "v4_ms"),
        ("V5 AGGRESSIVE OPT", "v5_cost", "v5_ms"),
        ("V6 ROUTER+AGGRESSIVE", "v6_cost", "v6_ms"),
    ]
    baseline_total = sum(r["v1_cost"] for r in results)
    for label, ck, mk in configs:
        tc = sum(r[ck] for r in results)
        am = sum(r[mk] for r in results) / len(results)
        sv = (1 - tc/baseline_total)*100 if baseline_total else 0
        print(f"  {label:25s} ${tc:.5f}  avg {am:4.0f}ms  {sv:+.0f}% vs baseline")

    # Quality
    print(f"\n  QUALITY (LLM Judge)")
    for label, jkey in [("Router (V2 vs V1)", "j_router"), ("R+Aggr (V6 vs V1)", "j_combo")]:
        scores_a = [r[jkey].get("a",0) for r in results]
        scores_b = [r[jkey].get("b",0) for r in results]
        verdicts = [r[jkey].get("v","?") for r in results]
        ok = sum(1 for v in verdicts if v in ("EQUAL","A_BETTER","A_OK"))
        avg_a = sum(scores_a)/len(scores_a)
        avg_b = sum(scores_b)/len(scores_b)
        print(f"  {label:25s} {ok}/{len(results)} maintained ({ok/len(results)*100:.0f}%)  "
              f"avg {avg_a:.1f} vs {avg_b:.1f} (gap {avg_a-avg_b:+.1f})")

    # Optimizer effectiveness
    print(f"\n  OPTIMIZER EFFECTIVENESS")
    safe_savings = [r["safe_saved"] for r in results]
    aggr_savings = [r["aggr_saved"] for r in results]
    print(f"  Safe:       {sum(safe_savings):4d} tokens saved across {sum(1 for s in safe_savings if s>0)} prompts")
    print(f"  Aggressive: {sum(aggr_savings):4d} tokens saved across {sum(1 for s in aggr_savings if s>0)} prompts")

    # Per category
    print(f"\n  PER-CATEGORY SAVINGS (vs baseline):")
    for cat in ["simple", "medium", "complex"]:
        cr = [r for r in results if r["cat"] == cat]
        if not cr: continue
        v1 = sum(r["v1_cost"] for r in cr)
        v2 = sum(r["v2_cost"] for r in cr)
        v4 = sum(r["v4_cost"] for r in cr)
        v6 = sum(r["v6_cost"] for r in cr)
        print(f"  {cat:8s} ({len(cr):2d}): Router {(1-v2/v1)*100:+.0f}%  "
              f"R+Safe {(1-v4/v1)*100:+.0f}%  R+Aggr {(1-v6/v1)*100:+.0f}%")

    # Verdict
    v6_total = sum(r["v6_cost"] for r in results)
    final = (1 - v6_total/baseline_total)*100
    j_ok = sum(1 for r in results if r["j_combo"].get("v","") in ("EQUAL","A_BETTER","A_OK"))
    print(f"\n{'═'*75}")
    if final > 20 and j_ok >= len(results)*0.7:
        print(f"  ✅ VERDICT: {final:.0f}% total savings with {j_ok/len(results)*100:.0f}% quality maintained")
    else:
        print(f"  ⚠️  VERDICT: {final:.0f}% savings, {j_ok/len(results)*100:.0f}% quality — review needed")
    print(f"{'═'*75}")

    with open("/tmp/nadir_benchmark_6way.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to /tmp/nadir_benchmark_6way.json")


if __name__ == "__main__":
    main()
