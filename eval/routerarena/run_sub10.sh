#!/usr/bin/env bash
# Sub-10 smoke for the Nadir RouterArena adapter.
#
# Sends 10 representative prompts through the adapter and verifies the
# operational preconditions a RouterArena reviewer needs to trust:
#
#   1. schema_fingerprint is constant across all 10 calls
#   2. x-nadir-classifier-sha is constant across all 10 calls
#   3. tier distribution is non-degenerate (not 100% one tier)
#   4. every per-call latency is under 5000ms
#
# Exits non-zero (1) on any precondition failure so this can gate a
# submission. The smoke JSON is written under ./reports/ for later
# inspection.
#
# Preconditions to verify by hand BEFORE running:
#
#   - NADIR_BACKEND_URL points at a DEDICATED eval deployment. Do NOT
#     point this at shared production: the rate limiter is a global token
#     bucket and a sub-10 burst will spike latency for live users.
#   - NADIR_API_KEY is an eval-only key with NO clusters and NO expert
#     models attached. /v1/route_only returns 503 otherwise.
#   - The RouterArena PR description must cite the smoke report this run
#     produces.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="${SCRIPT_DIR}/reports"
mkdir -p "${REPORTS_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${REPORTS_DIR}/smoke_sub10_${STAMP}.json"

: "${NADIR_BACKEND_URL:?NADIR_BACKEND_URL must point at a dedicated eval deployment}"
: "${NADIR_API_KEY:?NADIR_API_KEY must be set (eval-only, no clusters, no expert models)}"

PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[run_sub10] base_url=${NADIR_BACKEND_URL}"
echo "[run_sub10] output=${OUT}"

# Run the smoke driver inline. Python is doing the HTTP + the assertions;
# the shell is just orchestrating env, the temp file, and the final exit
# code (so this script can be CI-gated).
export SCRIPT_DIR
"${PYTHON_BIN}" - "${OUT}" <<'PYEOF'
import json
import os
import sys
import time
from pathlib import Path

# Make the adapter importable when run from anywhere in the tree.
HERE = Path(__file__).resolve().parent if "__file__" in globals() else Path(os.getcwd())
PKG_DIR = Path(os.environ.get("SCRIPT_DIR", "")).resolve()
if not PKG_DIR.exists():
    # Walk up to find eval/routerarena/.
    candidates = [
        Path(__file__).resolve().parent if "__file__" in globals() else None,
        Path.cwd() / "eval" / "routerarena",
        Path.cwd(),
    ]
    PKG_DIR = next((p for p in candidates if p and (p / "nadir_adapter.py").exists()), Path.cwd())

# Add repo root so `from eval.routerarena...` works.
for parent in PKG_DIR.parents:
    if (parent / "eval" / "routerarena" / "nadir_adapter.py").exists():
        sys.path.insert(0, str(parent))
        break
# Also add PKG_DIR for direct import.
sys.path.insert(0, str(PKG_DIR))

try:
    from eval.routerarena.nadir_adapter import (  # type: ignore
        EXPECTED_SCHEMA_FINGERPRINT,
        NadirRouter,
        NadirRouterError,
    )
except ImportError:
    from nadir_adapter import (  # type: ignore
        EXPECTED_SCHEMA_FINGERPRINT,
        NadirRouter,
        NadirRouterError,
    )

OUT_PATH = sys.argv[1]
MAX_LATENCY_MS = 5000

# 10 representative prompts spanning expected tiers.
PROMPTS = [
    "hi",
    "what is 2+2?",
    "summarize this in one sentence: the sky is blue because of rayleigh scattering.",
    "translate 'good morning' to French.",
    "list three pros of a microservices architecture.",
    "write a Python function that returns the nth Fibonacci number iteratively.",
    "design a sharded relational schema for a multi-tenant analytics platform handling 1B rows/day, including partition keys and indexing strategy.",
    "prove that the sum of two odd integers is even.",
    "explain transformers vs RNNs for someone with an undergraduate ML background, with attention to gradient flow.",
    "given an n*m grid with weighted cells, output the path from top-left to bottom-right that minimizes total weight; provide pseudocode and complexity.",
]

router = NadirRouter(timeout=10.0)

results = []
errors = []
for i, prompt in enumerate(PROMPTS):
    t0 = time.perf_counter()
    try:
        d = router.route(prompt)
        wall_ms = int((time.perf_counter() - t0) * 1000)
        results.append({
            "i": i,
            "prompt_preview": prompt[:80],
            "tier": d.tier,
            "model": d.model,
            "complexity_score": d.complexity_score,
            "classifier_confidence": d.classifier_confidence,
            "latency_ms_reported": d.latency_ms,
            "latency_ms_wall": wall_ms,
            "classifier_version": d.classifier_version,
            "schema_fingerprint": d.schema_fingerprint,
            "classifier_sha": d.classifier_sha,
        })
    except NadirRouterError as exc:
        errors.append({"i": i, "prompt_preview": prompt[:80], "error": str(exc)})

router.close()

# ── Precondition checks ──
checks = {}

# (1) schema_fingerprint constant
fps = {r["schema_fingerprint"] for r in results}
checks["schema_fingerprint_constant"] = {
    "pass": len(fps) == 1 and EXPECTED_SCHEMA_FINGERPRINT in fps,
    "observed": sorted(fps),
    "expected": EXPECTED_SCHEMA_FINGERPRINT,
}

# (2) classifier_sha constant
shas = {r["classifier_sha"] for r in results}
checks["classifier_sha_constant"] = {
    "pass": len(shas) == 1 and "" not in shas,
    "observed": sorted(shas),
}

# (3) tier distribution non-degenerate
tiers = [r["tier"] for r in results]
tier_counts = {t: tiers.count(t) for t in set(tiers)}
total_tiers = len(tiers) or 1
max_share = (max(tier_counts.values()) / total_tiers) if tier_counts else 1.0
checks["tier_distribution_non_degenerate"] = {
    "pass": len(tier_counts) >= 2 and max_share < 1.0,
    "counts": tier_counts,
    "max_share": max_share,
}

# (4) every latency under 5s (use wall-clock — covers network + classifier)
over_threshold = [r for r in results if r["latency_ms_wall"] > MAX_LATENCY_MS]
checks["all_latencies_under_5s"] = {
    "pass": len(over_threshold) == 0,
    "threshold_ms": MAX_LATENCY_MS,
    "over": over_threshold,
}

verdict = router.smoke_verdict()

all_pass = all(c["pass"] for c in checks.values()) and len(errors) == 0
report = {
    "stamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "base_url": os.environ.get("NADIR_BACKEND_URL"),
    "n_prompts": len(PROMPTS),
    "n_ok": len(results),
    "n_errors": len(errors),
    "errors": errors,
    "results": results,
    "checks": checks,
    "confidence_verdict": verdict,
    "overall_verdict": "PASS" if all_pass else "FAIL",
}

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, sort_keys=True)

print(f"[run_sub10] wrote {OUT_PATH}")
print(f"[run_sub10] overall_verdict={report['overall_verdict']}")
for name, c in checks.items():
    print(f"  - {name}: {'pass' if c['pass'] else 'FAIL'}")
if errors:
    print(f"  - errors: {len(errors)} call(s) raised")

# Exit non-zero on any precondition failure so this can gate CI.
sys.exit(0 if all_pass else 1)
PYEOF

rc=$?
echo "[run_sub10] python exit code: ${rc}"
exit "${rc}"
