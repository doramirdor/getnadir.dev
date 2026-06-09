"""Contamination check: RouterBench prompts vs Nadir classifier training corpus.

Runs the existing cycle-1 hasher against:
  (A) all prompts in `backend/labeled_data/` (the wide_deep_asym_v3 training source)
  (B) all prompts in `routerbench_0shot.pkl`

Writes a JSON report listing any overlapping prompt hashes. The RouterBench
loader uses this report to EXCLUDE overlapping prompts from the verifier
training corpus, so the verifier is never trained on prompts the classifier
already saw.

This is a SEPARATE audit from cycle 2's RouterArena check. RouterArena cleared
0/8,399 overlap; that result stands and is independent of this one.
"""
from __future__ import annotations

import json
import pickle
import sys
from datetime import datetime, timezone
from pathlib import Path

# Reuse cycle-1 hasher
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "eval"))
from contamination_audit.hasher import normalize_and_hash  # noqa: E402
from contamination_audit.corpus_loader import load_all_prompts  # noqa: E402


def main() -> int:
    rb_pkl = Path("/tmp/rb_cache").rglob("routerbench_0shot.pkl")
    rb_pkl_path = next(rb_pkl, None)
    if rb_pkl_path is None:
        print("ERROR: routerbench_0shot.pkl not found in /tmp/rb_cache", file=sys.stderr)
        return 1

    print(f"Loading RouterBench from {rb_pkl_path} ...", file=sys.stderr)
    df = pickle.load(open(rb_pkl_path, "rb"))
    print(f"RouterBench rows: {len(df)}", file=sys.stderr)

    rb_hashes: dict[str, dict] = {}
    for idx, row in df[["sample_id", "prompt", "eval_name"]].iterrows():
        prompt = row["prompt"]
        if not isinstance(prompt, str):
            continue
        h = normalize_and_hash(prompt)
        rb_hashes[h] = {
            "sample_id": row["sample_id"],
            "eval_name": row["eval_name"],
            "preview": prompt[:100],
        }
    print(f"RouterBench unique prompt hashes: {len(rb_hashes)}", file=sys.stderr)

    labeled_root = REPO_ROOT / "getnadir.dev" / "backend" / "labeled_data"
    print(f"Hashing labeled_data at {labeled_root} ...", file=sys.stderr)
    lbl_hashes: dict[str, str] = {}
    for source_tag, prompt in load_all_prompts(labeled_root):
        h = normalize_and_hash(prompt)
        if h not in lbl_hashes:
            lbl_hashes[h] = source_tag
    print(f"labeled_data unique prompt hashes: {len(lbl_hashes)}", file=sys.stderr)

    overlap_hashes = set(rb_hashes.keys()) & set(lbl_hashes.keys())
    overlapping_examples = [
        {
            "hash": h,
            "rb_sample_id": rb_hashes[h]["sample_id"],
            "rb_eval_name": rb_hashes[h]["eval_name"],
            "labeled_data_source": lbl_hashes[h],
            "preview": rb_hashes[h]["preview"],
        }
        for h in list(overlap_hashes)[:50]
    ]

    report = {
        "audit_date": datetime.now(timezone.utc).isoformat(),
        "routerbench_split": "0shot",
        "routerbench_unique_hashes": len(rb_hashes),
        "labeled_data_unique_hashes": len(lbl_hashes),
        "overlap_count": len(overlap_hashes),
        "overlap_pct_of_routerbench": round(100 * len(overlap_hashes) / max(1, len(rb_hashes)), 3),
        "overlapping_examples": overlapping_examples,
        "verdict": "OVERLAP_DETECTED" if overlap_hashes else "DISJOINT",
        "note": (
            "If overlap > 0, the RouterBench loader will exclude those prompts "
            "from verifier_training_corpus to prevent train/test bleed between "
            "the classifier (wide_deep_asym_v3) and the verifier."
        ),
    }

    out_dir = REPO_ROOT / "getnadir.dev" / "verifier" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"routerbench_contamination_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.json"
    out_path.write_text(json.dumps(report, indent=2))

    # Also write the overlap hash set as a separate file for the loader to consume
    overlap_path = out_dir / "routerbench_overlap_hashes.json"
    overlap_path.write_text(json.dumps(sorted(overlap_hashes), indent=0))

    print(json.dumps(report, indent=2))
    print(f"\nReport: {out_path}", file=sys.stderr)
    print(f"Overlap hash set: {overlap_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
