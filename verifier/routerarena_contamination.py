"""Contamination check: RouterArena prompts vs Nadir verifier training corpus.

Parallels `verifier/routerbench_contamination.py`. Where the RouterBench audit
defends the *classifier* (wide_deep_asym_v3) against the verifier corpus, this
audit defends the *verifier* training corpus against the public RouterArena
benchmark — the second cycle-1 reviewer-flagged submission blocker.

What it does
------------
1. Loads RouterArena prompts for both `sub_10` (809) and `full` (8,399) splits
   from a local snapshot cache. The default cache lives in the sibling repo at
   `Nadir/eval/contamination_audit/cache/routerarena_<split>.json` and was
   downloaded with the Cycle 2 audit. If a snapshot is missing the script
   fails loudly with the exact bash command to refresh it.
2. NFC-normalizes + SHA-256 hashes every prompt (via the existing helper at
   `eval/contamination_audit/hasher.py` — NOT re-implemented).
3. Hashes the verifier training corpus. Two sources, in priority order:
     (a) Supabase `verifier_training_corpus` table — only if
         `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` env vars are set AND the
         `--source supabase` flag is passed.
     (b) Local snapshot `verifier/data/routerbench_triples.jsonl` (the offline
         training-set proxy). This is the default so the audit reproduces
         deterministically in CI without a live DB.
4. Splits the corpus into:
     - train rows (split == "train")
     - labeled-but-dropped rows (split in {"val", "test"} or filtered out)
   Train overlap is the hard FAIL gate. Labeled-but-dropped overlap is
   informational only (the reviewer wanted this distinction explicit).
5. Records SHA-256 of both wide_deep classifier checkpoints:
       backend/app/complexity/models/wide_deep_asym_v3.pt
       backend/app/complexity/models/wide_deep_sym_v3.pt
   so the audit binds to a specific model artifact pair.
6. Writes two files into `verifier/reports/`:
     - `routerarena_overlap_hashes.json`   — sorted list of overlapping hashes
                                              (analog of routerbench_overlap_hashes.json)
     - `routerarena_contamination_<UTC>.json` — human-readable report

Refresh the snapshot
--------------------
If the snapshot is missing or stale, run:

    python -c "from contamination_audit.arena_downloader import download_routerarena; \
               download_routerarena('sub_10'); download_routerarena('full')"

from `Nadir/eval/` (requires `pip install datasets huggingface_hub`).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# Reuse cycle-1 hasher (NFC + casefold + SHA-256). Identical to the import
# pattern in routerbench_contamination.py.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "eval"))
from contamination_audit.hasher import normalize_and_hash  # noqa: E402

# Default snapshot cache. The Cycle 2 audit populated this directory.
DEFAULT_ARENA_CACHE_DIR = REPO_ROOT / "eval" / "contamination_audit" / "cache"

# Default offline verifier-corpus proxy.
DEFAULT_TRIPLES_PATH = (
    REPO_ROOT / "getnadir.dev" / "verifier" / "data" / "routerbench_triples.jsonl"
)

# Classifier checkpoints we want to bind the audit to.
DEFAULT_CHECKPOINT_PATHS = [
    REPO_ROOT
    / "getnadir.dev"
    / "backend"
    / "app"
    / "complexity"
    / "models"
    / "wide_deep_asym_v3.pt",
    REPO_ROOT
    / "getnadir.dev"
    / "backend"
    / "app"
    / "complexity"
    / "models"
    / "wide_deep_sym_v3.pt",
]

SUPPORTED_SPLITS = ("sub_10", "full")


# ───────────────────────────── helpers ─────────────────────────────


def _file_sha256(path: Path) -> str:
    """SHA-256 of a file, or "MISSING" if the file is absent."""
    if not path.exists() or not path.is_file():
        return "MISSING"
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def classifier_artifact_hashes(paths: Iterable[Path]) -> dict[str, str]:
    """Return {basename: sha256_or_MISSING} for every path."""
    return {p.name: _file_sha256(p) for p in paths}


def load_arena_snapshot(split: str, cache_dir: Path) -> list[str]:
    """Load a RouterArena snapshot from local cache; fail loudly on miss.

    The script intentionally does NOT hit the network. If you need a fresh
    snapshot, read the module docstring for the download command.
    """
    if split not in SUPPORTED_SPLITS:
        raise ValueError(f"unsupported split {split!r}, expected one of {SUPPORTED_SPLITS}")
    snap_path = cache_dir / f"routerarena_{split}.json"
    if not snap_path.exists():
        raise FileNotFoundError(
            f"RouterArena snapshot missing: {snap_path}\n"
            "Refresh with (from Nadir/eval/):\n"
            "  python -c \"from contamination_audit.arena_downloader import "
            "download_routerarena; download_routerarena('sub_10'); "
            "download_routerarena('full')\""
        )
    data = json.loads(snap_path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not all(isinstance(x, str) for x in data):
        raise ValueError(f"snapshot {snap_path} is not a list[str]")
    return data


def hash_prompts(prompts: Iterable[str]) -> dict[str, str]:
    """{hash: preview_100}. Duplicate prompts collapse to one entry."""
    out: dict[str, str] = {}
    for p in prompts:
        if not isinstance(p, str) or not p:
            continue
        h = normalize_and_hash(p)
        if h not in out:
            out[h] = p[:100]
    return out


def load_corpus_from_jsonl(path: Path) -> tuple[dict[str, dict], dict[str, dict]]:
    """Return ({train_hash: meta}, {dropped_hash: meta}).

    `dropped` here means any row whose `split` is not `"train"` — typically
    the val/test splits of `routerbench_triples.jsonl`. Per the reviewer note,
    those rows were labeled but not used to train the verifier, so an overlap
    there is informational rather than a submission blocker.

    Rows without a `prompt` field are skipped silently.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"verifier training corpus snapshot missing: {path}\n"
            "Either materialise the snapshot or pass --source supabase."
        )
    train: dict[str, dict] = {}
    dropped: dict[str, dict] = {}
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            prompt = row.get("prompt")
            if not isinstance(prompt, str) or not prompt:
                continue
            h = normalize_and_hash(prompt)
            bucket = train if row.get("split") == "train" else dropped
            if h not in bucket:
                bucket[h] = {
                    "id": row.get("id"),
                    "split": row.get("split"),
                    "label_source": row.get("label_source"),
                    "domain_hint": row.get("domain_hint"),
                    "preview": prompt[:100],
                }
    return train, dropped


def load_corpus_from_supabase() -> tuple[dict[str, dict], dict[str, dict]]:  # pragma: no cover
    """Live Supabase path. Returns the same shape as `load_corpus_from_jsonl`.

    Not exercised by the default test suite (requires network + service key).
    Kept lean and isolated so the offline path stays the deterministic default.
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for --source supabase"
        )
    try:
        from supabase import create_client  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "supabase-py is required for --source supabase: pip install supabase"
        ) from e

    client = create_client(url, key)
    train: dict[str, dict] = {}
    dropped: dict[str, dict] = {}
    offset = 0
    page = 1000
    while True:
        resp = (
            client.table("verifier_training_corpus")
            .select("id, prompt, split, label_source, domain_hint")
            .range(offset, offset + page - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            prompt = row.get("prompt")
            if not isinstance(prompt, str) or not prompt:
                continue
            h = normalize_and_hash(prompt)
            bucket = train if row.get("split") == "train" else dropped
            if h not in bucket:
                bucket[h] = {
                    "id": row.get("id"),
                    "split": row.get("split"),
                    "label_source": row.get("label_source"),
                    "domain_hint": row.get("domain_hint"),
                    "preview": prompt[:100],
                }
        if len(rows) < page:
            break
        offset += page
    return train, dropped


# ──────────────────────── audit orchestration ────────────────────────


def build_report(
    *,
    arena_hashes: dict[str, dict[str, str]],  # split -> {hash: preview}
    train_hashes: dict[str, dict],
    dropped_hashes: dict[str, dict],
    checkpoint_paths: Iterable[Path],
    corpus_source: str,
) -> dict:
    """Assemble the human-readable report dict."""
    # Union across both arena splits — we want a single overlap set the
    # verifier loader could optionally consume the same way it consumes
    # routerbench_overlap_hashes.json.
    arena_union: dict[str, dict] = {}
    for split, mp in arena_hashes.items():
        for h, preview in mp.items():
            if h not in arena_union:
                arena_union[h] = {"first_seen_split": split, "preview": preview}

    train_overlap = set(arena_union.keys()) & set(train_hashes.keys())
    dropped_overlap = set(arena_union.keys()) & set(dropped_hashes.keys())

    train_examples = [
        {
            "hash": h,
            "first_seen_split": arena_union[h]["first_seen_split"],
            "verifier_corpus_id": train_hashes[h].get("id"),
            "verifier_corpus_split": train_hashes[h].get("split"),
            "verifier_label_source": train_hashes[h].get("label_source"),
            "verifier_domain_hint": train_hashes[h].get("domain_hint"),
            "preview": arena_union[h]["preview"],
        }
        for h in sorted(train_overlap)[:50]
    ]
    dropped_examples = [
        {
            "hash": h,
            "first_seen_split": arena_union[h]["first_seen_split"],
            "verifier_corpus_id": dropped_hashes[h].get("id"),
            "verifier_corpus_split": dropped_hashes[h].get("split"),
            "verifier_label_source": dropped_hashes[h].get("label_source"),
            "verifier_domain_hint": dropped_hashes[h].get("domain_hint"),
            "preview": arena_union[h]["preview"],
        }
        for h in sorted(dropped_overlap)[:50]
    ]

    # Verdict: train-set overlap = FAIL, dropped-only = NEEDS_REVIEW, else PASS.
    if train_overlap:
        verdict = "FAIL"
    elif dropped_overlap:
        verdict = "NEEDS_FOUNDER_REVIEW"
    else:
        verdict = "PASS"

    return {
        "audit_date": datetime.now(timezone.utc).isoformat(),
        "benchmark": "RouterArena (RouteWorks/RouterArena)",
        "splits_audited": sorted(arena_hashes.keys()),
        "arena_prompt_count_by_split": {s: len(mp) for s, mp in arena_hashes.items()},
        "arena_unique_hashes": len(arena_union),
        "corpus_source": corpus_source,
        "verifier_train_unique_hashes": len(train_hashes),
        "verifier_labeled_but_dropped_unique_hashes": len(dropped_hashes),
        "train_set_overlap_count": len(train_overlap),
        "labeled_but_dropped_overlap_count": len(dropped_overlap),
        "verdict": verdict,
        "train_set_overlap_examples": train_examples,
        "labeled_but_dropped_overlap_examples": dropped_examples,
        "classifier_artifact_hashes": classifier_artifact_hashes(checkpoint_paths),
        "note": (
            "Train-set overlap is a hard FAIL gate (blocks RouterArena "
            "submission). Labeled-but-dropped overlap is informational — those "
            "rows are in val/test splits and were not used to train the "
            "verifier. Both wide_deep checkpoint SHAs are recorded so this "
            "audit binds to a specific (asym, sym) model artifact pair."
        ),
    }


def run_audit(
    *,
    splits: list[str],
    arena_cache_dir: Path = DEFAULT_ARENA_CACHE_DIR,
    triples_path: Path = DEFAULT_TRIPLES_PATH,
    source: str = "jsonl",
    checkpoint_paths: Iterable[Path] = DEFAULT_CHECKPOINT_PATHS,
) -> dict:
    """Programmatic entry point. Tests call this directly."""
    arena_hashes: dict[str, dict[str, str]] = {}
    for split in splits:
        prompts = load_arena_snapshot(split, arena_cache_dir)
        arena_hashes[split] = hash_prompts(prompts)

    if source == "supabase":
        train_hashes, dropped_hashes = load_corpus_from_supabase()
    else:
        train_hashes, dropped_hashes = load_corpus_from_jsonl(triples_path)

    return build_report(
        arena_hashes=arena_hashes,
        train_hashes=train_hashes,
        dropped_hashes=dropped_hashes,
        checkpoint_paths=checkpoint_paths,
        corpus_source=source,
    )


def write_outputs(report: dict, out_dir: Path) -> tuple[Path, Path]:
    """Write the timestamped report + the sorted overlap-hash list."""
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    report_path = out_dir / f"routerarena_contamination_{ts}.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    # Union of train + dropped overlap hashes — anything the verifier loader
    # might want to exclude. Mirrors the shape of routerbench_overlap_hashes.json.
    overlap_hashes = sorted(
        {ex["hash"] for ex in report["train_set_overlap_examples"]}
        | {ex["hash"] for ex in report["labeled_but_dropped_overlap_examples"]}
    )
    overlap_path = out_dir / "routerarena_overlap_hashes.json"
    overlap_path.write_text(json.dumps(overlap_hashes, indent=0))

    return report_path, overlap_path


# ─────────────────────────────── CLI ───────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RouterArena contamination audit")
    parser.add_argument(
        "--splits",
        nargs="+",
        default=list(SUPPORTED_SPLITS),
        choices=list(SUPPORTED_SPLITS),
        help="RouterArena splits to audit (default: both)",
    )
    parser.add_argument(
        "--arena-cache-dir",
        type=Path,
        default=DEFAULT_ARENA_CACHE_DIR,
        help="directory holding routerarena_<split>.json snapshots",
    )
    parser.add_argument(
        "--triples-path",
        type=Path,
        default=DEFAULT_TRIPLES_PATH,
        help="offline verifier_training_corpus proxy (jsonl)",
    )
    parser.add_argument(
        "--source",
        choices=["jsonl", "supabase"],
        default="jsonl",
        help="where to read the verifier training corpus from",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "reports",
        help="output directory for the report + overlap-hash list",
    )
    args = parser.parse_args(argv)

    try:
        report = run_audit(
            splits=args.splits,
            arena_cache_dir=args.arena_cache_dir,
            triples_path=args.triples_path,
            source=args.source,
        )
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    report_path, overlap_path = write_outputs(report, args.out_dir)

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nReport: {report_path}", file=sys.stderr)
    print(f"Overlap hash set: {overlap_path}", file=sys.stderr)
    # FAIL exits non-zero so CI catches train-set contamination.
    return 1 if report["verdict"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
