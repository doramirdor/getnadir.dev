"""Load RouterBench triples into verifier_training_corpus.

For each RouterBench prompt, construct labeled (prompt, cheap_answer,
expensive_answer, label) triples from within-family model pairs:
  - (gpt-3.5-turbo-1106, gpt-4-1106-preview)
  - (claude-instant-v1, claude-v2)
  - (claude-v1, claude-v2)
  - (mistralai/mistral-7b-chat, mistralai/mixtral-8x7b-chat)

Label rule:
  - label=1 if cheap_score >= 0.5 (cheap is acceptable; expensive irrelevant)
  - label=0 if cheap_score <  0.5 AND expensive_score > cheap_score (escalation helps)
  - DROP   otherwise (cheap failed but expensive doesn't help; ambiguous signal)

Split:
  - sha256(sample_id) mod 10:
      0..7 -> 'train'  (80%)
      8    -> 'val'    (10%)
      9    -> 'test'   (10%)

Writes to Supabase `verifier_training_corpus` with:
  label_source = 'routerbench_0shot'
  label_confidence = cheap_score (real-valued, 0.0/0.25/0.5/0.75/1.0)
  domain_hint = eval_name
  added_by = 'routerbench_loader'

Contamination filter: reads `verifier/reports/routerbench_overlap_hashes.json`
and excludes any RouterBench prompt whose normalized hash is in that set.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import pickle
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "eval"))
from contamination_audit.hasher import normalize_and_hash  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Within-family model pairs (cheap, expensive).
PAIRS: list[tuple[str, str]] = [
    ("gpt-3.5-turbo-1106", "gpt-4-1106-preview"),
    ("claude-instant-v1",  "claude-v2"),
    ("claude-v1",          "claude-v2"),
    ("mistralai/mistral-7b-chat", "mistralai/mixtral-8x7b-chat"),
]


def _split_for(sample_id: str) -> str:
    bucket = int(hashlib.sha256(str(sample_id).encode()).hexdigest()[:8], 16) % 10
    if bucket < 8:
        return "train"
    if bucket == 8:
        return "val"
    return "test"


def _score_for(row, model: str) -> float | None:
    """Extract numeric correctness score for `model` from a RouterBench row.

    RouterBench stores floats in {0.0, 0.25, 0.5, 0.75, 1.0} as object dtype.
    """
    raw = row.get(model)
    if raw is None:
        return None
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


def _response_for(row, model: str) -> str | None:
    raw = row.get(f"{model}|model_response")
    if not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw or raw.startswith("nan"):
        return None
    return raw


def derive_label(cheap_score: float, expensive_score: float) -> int | None:
    """Pairwise label rule.

    Returns 1 (acceptable), 0 (escalate), or None (drop / ambiguous).
    """
    if cheap_score >= 0.5:
        return 1
    if cheap_score < 0.5 and expensive_score > cheap_score:
        return 0
    return None


def iter_triples(df, overlap_hashes: set[str], limit: int | None = None) -> list[dict]:
    """Walk the dataframe, yield labeled triples.

    Returns a list of dicts ready for Supabase upsert.
    """
    triples: list[dict] = []
    dropped_contamination = 0
    dropped_ambiguous = 0
    dropped_missing_response = 0

    rows_iter = df.iterrows()
    rows_seen = 0
    for _, row in rows_iter:
        rows_seen += 1
        if limit is not None and rows_seen > limit:
            break

        prompt = row.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            continue

        h = normalize_and_hash(prompt)
        if h in overlap_hashes:
            dropped_contamination += 1
            continue

        eval_name = row.get("eval_name") or "unknown"
        sample_id = str(row.get("sample_id") or "")
        split = _split_for(sample_id)

        for cheap_model, expensive_model in PAIRS:
            cheap_score = _score_for(row, cheap_model)
            expensive_score = _score_for(row, expensive_model)
            if cheap_score is None or expensive_score is None:
                dropped_missing_response += 1
                continue

            cheap_answer = _response_for(row, cheap_model)
            expensive_answer = _response_for(row, expensive_model)
            if cheap_answer is None or expensive_answer is None:
                dropped_missing_response += 1
                continue

            label = derive_label(cheap_score, expensive_score)
            if label is None:
                dropped_ambiguous += 1
                continue

            triples.append(
                {
                    "id": str(uuid.uuid4()),
                    "prompt": prompt,
                    "cheap_model": cheap_model,
                    "expensive_model": expensive_model,
                    "cheap_answer": cheap_answer,
                    "expensive_answer": expensive_answer,
                    "label": label,
                    "label_source": "routerbench_0shot",
                    "label_confidence": cheap_score,
                    "split": split,
                    "domain_hint": eval_name,
                    "added_by": "routerbench_loader",
                }
            )

    logger.info(
        "Constructed %d triples. Dropped: contamination=%d, ambiguous=%d, missing_response=%d",
        len(triples),
        dropped_contamination,
        dropped_ambiguous,
        dropped_missing_response,
    )
    return triples


def _supabase_client():
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / "getnadir.dev" / "backend" / ".env")
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def upsert_batches(client, triples: list[dict], batch_size: int = 500) -> int:
    total = 0
    for i in range(0, len(triples), batch_size):
        batch = triples[i : i + batch_size]
        client.table("verifier_training_corpus").insert(batch).execute()
        total += len(batch)
        logger.info("upserted %d / %d", total, len(triples))
    return total


def _load_overlap_hashes() -> set[str]:
    p = REPO_ROOT / "getnadir.dev" / "verifier" / "reports" / "routerbench_overlap_hashes.json"
    if not p.exists():
        logger.warning("Overlap hash file not found; assuming empty (run routerbench_contamination.py first to be safe).")
        return set()
    return set(json.loads(p.read_text()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Load RouterBench triples (default: dry-run).")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--no-dry-run", dest="dry_run", action="store_false")
    parser.add_argument("--rows-limit", type=int, default=None, help="Process only first N RouterBench rows (for testing).")
    parser.add_argument("--max-triples", type=int, default=None, help="Cap total triples written.")
    parser.add_argument("--jsonl-out", type=str, default=None, help="Also write triples to JSONL file at this path.")
    args = parser.parse_args(argv)

    if not args.dry_run and os.environ.get("FOUNDER_APPROVED") != "1":
        logger.error("Refusing to write to Supabase without FOUNDER_APPROVED=1")
        return 1

    rb_pkl = next(Path("/tmp/rb_cache").rglob("routerbench_0shot.pkl"), None)
    if rb_pkl is None:
        logger.error("routerbench_0shot.pkl not found in /tmp/rb_cache; run the HF download first.")
        return 1

    logger.info("Loading %s ...", rb_pkl)
    df = pickle.load(open(rb_pkl, "rb"))
    logger.info("RouterBench rows: %d", len(df))

    overlap = _load_overlap_hashes()
    logger.info("Contamination overlap set size: %d", len(overlap))

    triples = iter_triples(df, overlap_hashes=overlap, limit=args.rows_limit)
    if args.max_triples is not None:
        triples = triples[: args.max_triples]
        logger.info("Capped to first %d triples.", len(triples))

    # Stats
    stats = {
        "total": len(triples),
        "labels": {0: sum(1 for t in triples if t["label"] == 0), 1: sum(1 for t in triples if t["label"] == 1)},
        "splits": {s: sum(1 for t in triples if t["split"] == s) for s in ("train", "val", "test")},
        "pairs": {f"{c}->{e}": sum(1 for t in triples if t["cheap_model"] == c and t["expensive_model"] == e) for c, e in PAIRS},
    }
    logger.info("Stats: %s", json.dumps(stats, indent=2))

    if args.jsonl_out:
        out = Path(args.jsonl_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w") as f:
            for t in triples:
                f.write(json.dumps(t) + "\n")
        logger.info("Wrote JSONL to %s", out)

    if args.dry_run:
        logger.info("DRY-RUN: %d triples constructed. Sample (first 3):", len(triples))
        for t in triples[:3]:
            preview = {
                "label": t["label"],
                "label_confidence": t["label_confidence"],
                "cheap_model": t["cheap_model"],
                "expensive_model": t["expensive_model"],
                "domain_hint": t["domain_hint"],
                "split": t["split"],
                "prompt": t["prompt"][:80],
            }
            print(json.dumps(preview, indent=2))
        return 0

    # Real write
    client = _supabase_client()
    written = upsert_batches(client, triples)
    logger.info("Wrote %d triples to verifier_training_corpus.", written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
