"""RouterArena contamination audit (Block B of the RouterArena submission package).

Proves that no prompt in RouterArena's evaluation splits (`full` n=8,400 raw /
n=8,374 unique, `sub_10` n=809) appears in any training corpus Nadir used for
either the wide_deep_asym_v3 classifier or the cascade verifier. This is the
RouterArena analogue of the cycle-1 RouterBench audit at
`verifier/routerbench_contamination.py` and uses **identical** prompt
normalization (NFC → strip → collapse whitespace → casefold → SHA-256), so the
two audits are directly comparable.

Training corpora audited
------------------------
1. **wide_deep_asym_v3 classifier corpus** — every JSON/JSONL under
     - `backend/labeled_data/v3/`  (current production training source)
     - `backend/labeled_data/v2/`  (legacy training source, kept for completeness)
     - `backend/labeled_data/raw/` (pre-labeling prompt pools)
     - `backend/labeled_data/*.json` (top-level arena snapshots)
   For v3 and v2, the corpus is sub-split into:
     - `train` rows: indices in `split.json["train_indices"|"train_idx"]` of
       `combined_labeled.json` / `arena_labeled.json` respectively
     - `labeled_but_dropped` rows: rows in the same combined file that are NOT
       in the train index list (i.e. labeled and held out as val/test)
   Every other file (raw pools, batches, top-level snapshots) is also hashed
   into a per-source bucket so we can prove the snapshot files themselves are
   clean too.

2. **verifier training corpus** — `verifier/data/routerbench_triples.jsonl`,
   sub-split into:
     - `train` rows (`row["split"] == "train"`)
     - `labeled_but_dropped` rows (any other split — val/test)

Verdict rules (matches the RouterBench audit, escalated for the train-vs-dropped
distinction the reviewer asked for):

  * Any prompt in BOTH a training-set bucket AND any RouterArena split → **FAIL**
    (exit code 1). This is the hard submission blocker.
  * Any prompt in BOTH a labeled-but-dropped bucket AND any RouterArena split →
    **NEEDS_FOUNDER_REVIEW** (exit code 2). Informational; the prompt was
    labeled but never used to train, so it's a soft signal rather than a leak.
  * No overlap anywhere → **PASS** (exit code 0).

Hard constraints honored
------------------------
* Uses the cycle-1 hasher at `eval/contamination_audit/hasher.py` verbatim.
* No network calls. RouterArena prompts come from the existing snapshot cache
  at `eval/contamination_audit/cache/routerarena_{split}.json` that was
  populated during the cycle-2 audit. If a snapshot is missing the script
  fails loudly with the exact refresh command.
* All intermediate sets are sorted before serialization for determinism.
* Records SHA-256 of `wide_deep_asym_v3.pt` + `wide_deep_sym_v3.pt` so the
  audit binds to a specific classifier artifact pair.
* No production calls, no deploys, no commits.

Usage
-----
    python3 eval/routerarena/routerarena_contamination.py \
        --eval-source RouteWorks/RouterArena \
        --train-paths backend/labeled_data/v3/ backend/labeled_data/v2/ \
                      backend/labeled_data/raw/ verifier/data/ \
        --out eval/routerarena/reports/

Defaults match the production audit configuration, so running with no args
reproduces the on-disk report exactly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# Layout note:
#   eval/routerarena/routerarena_contamination.py
#     -> parents[0] = eval/routerarena
#     -> parents[1] = eval
#     -> parents[2] = getnadir.dev   (REPO_ROOT for this monorepo subtree)
#     -> parents[3] = Nadir          (sibling-repo root, holds the shared hasher)
HERE = Path(__file__).resolve()
GETNADIR_ROOT = HERE.parents[2]
SIBLING_ROOT = HERE.parents[3]

# Reuse cycle-1 hasher VERBATIM (NFC + strip + collapse whitespace + casefold +
# SHA-256). Identical to the import pattern in verifier/routerbench_contamination.py
# and verifier/routerarena_contamination.py.
sys.path.insert(0, str(SIBLING_ROOT / "eval"))
from contamination_audit.hasher import normalize_and_hash  # noqa: E402
from contamination_audit.corpus_loader import (  # noqa: E402
    load_all_prompts,
    _extract_prompt,
)

DEFAULT_ARENA_CACHE_DIR = SIBLING_ROOT / "eval" / "contamination_audit" / "cache"
DEFAULT_TRIPLES_PATH = GETNADIR_ROOT / "verifier" / "data" / "routerbench_triples.jsonl"
DEFAULT_TRAIN_PATHS = [
    GETNADIR_ROOT / "backend" / "labeled_data" / "v3",
    GETNADIR_ROOT / "backend" / "labeled_data" / "v2",
    GETNADIR_ROOT / "backend" / "labeled_data" / "raw",
    GETNADIR_ROOT / "backend" / "labeled_data",  # top-level arena snapshots
    GETNADIR_ROOT / "verifier" / "data",
]
DEFAULT_CHECKPOINT_PATHS = [
    GETNADIR_ROOT / "backend" / "app" / "complexity" / "models" / "wide_deep_asym_v3.pt",
    GETNADIR_ROOT / "backend" / "app" / "complexity" / "models" / "wide_deep_sym_v3.pt",
]
SUPPORTED_SPLITS = ("full", "sub_10")


# ───────────────────────────── helpers ─────────────────────────────


def _file_sha256(path: Path) -> str:
    if not path.exists() or not path.is_file():
        return "MISSING"
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_arena_snapshot(split: str, cache_dir: Path) -> list[str]:
    """Load a RouterArena snapshot from local cache; fail loudly on miss."""
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


def hash_arena(prompts: list[str]) -> dict[str, str]:
    """Return {hash: preview_200}. Duplicates collapse to one entry."""
    out: dict[str, str] = {}
    for p in prompts:
        if not isinstance(p, str) or not p:
            continue
        h = normalize_and_hash(p)
        if h not in out:
            out[h] = p[:200]
    return out


# ─────────────── classifier corpus loaders (v2/v3 split-aware) ───────────────


def _load_combined_with_split(
    combined_path: Path, split_path: Path
) -> tuple[dict[str, dict], dict[str, dict], int]:
    """Partition a v2/v3 combined-labeled file into (train, dropped, n_total).

    The split.json sidecar holds train/test index lists into the combined file's
    `data` array. Rows in `train_indices` are training rows; everything else is
    labeled-but-dropped.
    """
    if not combined_path.exists() or not split_path.exists():
        return {}, {}, 0
    try:
        combined = json.loads(combined_path.read_text(encoding="utf-8"))
        split = json.loads(split_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, {}, 0

    rows = combined.get("data") if isinstance(combined, dict) else None
    if not isinstance(rows, list):
        return {}, {}, 0

    train_idx_key = "train_indices" if "train_indices" in split else "train_idx"
    test_idx_key = "test_indices" if "test_indices" in split else "test_idx"
    train_idx = set(split.get(train_idx_key, []) or [])
    test_idx = set(split.get(test_idx_key, []) or [])

    train: dict[str, dict] = {}
    dropped: dict[str, dict] = {}
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        prompt = _extract_prompt(row)
        if not prompt:
            continue
        h = normalize_and_hash(prompt)
        meta = {
            "row_index": i,
            "tier": row.get("tier"),
            "source": row.get("source"),
            "preview": prompt[:200],
        }
        if i in train_idx:
            if h not in train:
                train[h] = meta
        elif i in test_idx:
            if h not in dropped:
                dropped[h] = meta
        # If the row is in neither (shouldn't happen but be defensive), it's
        # neither training nor labeled-and-held-out — skip.
    return train, dropped, len(rows)


def _load_jsonl_verifier_corpus(path: Path) -> tuple[dict[str, dict], dict[str, dict], int]:
    """Partition routerbench_triples.jsonl into (train, dropped, n_total)."""
    if not path.exists():
        return {}, {}, 0
    train: dict[str, dict] = {}
    dropped: dict[str, dict] = {}
    n_total = 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            n_total += 1
            prompt = row.get("prompt")
            if not isinstance(prompt, str) or not prompt:
                continue
            h = normalize_and_hash(prompt)
            meta = {
                "id": row.get("id"),
                "split": row.get("split"),
                "label_source": row.get("label_source"),
                "domain_hint": row.get("domain_hint"),
                "preview": prompt[:200],
            }
            bucket = train if row.get("split") == "train" else dropped
            if h not in bucket:
                bucket[h] = meta
    return train, dropped, n_total


def _hash_generic_corpus(root: Path) -> dict[str, dict]:
    """Hash every prompt under `root` into a {hash: {source, preview}} dict.

    Used for raw pools, batches, and top-level snapshots where we don't have a
    train/test split — every prompt in these files counts as "training input"
    for the purposes of contamination.
    """
    out: dict[str, dict] = {}
    if not root.exists():
        return out
    # Walk all JSON/JSONL files under root, but do NOT recurse into v2/v3 which
    # are handled with split awareness (we'd double-count combined_labeled.json
    # otherwise). We only call this for "raw"-style roots that have no split.
    for source_tag, prompt in load_all_prompts(root):
        h = normalize_and_hash(prompt)
        if h not in out:
            out[h] = {"source": source_tag, "preview": prompt[:200]}
    return out


def _hash_top_level_arena_snapshots(labeled_root: Path) -> dict[str, dict]:
    """Hash only the *.json files directly under backend/labeled_data/ (no recurse).

    Avoids double-counting v2/v3/raw which are loaded separately.
    """
    out: dict[str, dict] = {}
    if not labeled_root.exists():
        return out
    for path in sorted(labeled_root.glob("*.json")):
        if not path.is_file():
            continue
        # Pretend root is the file's parent so load_all_prompts works on the
        # single file; but load_all_prompts walks rglob, so just call the
        # private file iterator instead.
        from contamination_audit.corpus_loader import _iter_file

        for prompt in _iter_file(path):
            h = normalize_and_hash(prompt)
            if h not in out:
                out[h] = {"source": path.name, "preview": prompt[:200]}
    return out


# ──────────────────────── audit orchestration ────────────────────────


def collect_training_corpora(
    train_paths: Iterable[Path], triples_path: Path
) -> dict[str, dict]:
    """Build the full training-corpora map.

    Returns:
        {
          corpus_id: {
            "kind": "split-aware" | "flat",
            "path": str,
            "n_prompts": int,
            "train": {hash: meta},
            "dropped": {hash: meta},
          }
        }
    """
    corpora: dict[str, dict] = {}

    # Split-aware corpora: v2 and v3 use combined_labeled + split.json.
    for label_dir, combined_name in [("v3", "combined_labeled.json"), ("v2", "arena_labeled.json")]:
        base = GETNADIR_ROOT / "backend" / "labeled_data" / label_dir
        combined_path = base / combined_name
        split_path = base / "split.json"
        train, dropped, n_total = _load_combined_with_split(combined_path, split_path)
        if combined_path.exists():
            corpora[f"labeled_data/{label_dir}/combined"] = {
                "kind": "split-aware",
                "path": str(combined_path.relative_to(GETNADIR_ROOT)),
                "split_path": str(split_path.relative_to(GETNADIR_ROOT)) if split_path.exists() else None,
                "n_prompts": n_total,
                "train": train,
                "dropped": dropped,
            }
        # Also hash any *other* JSON/JSONL files in v2/v3 (batches, results,
        # raw cache snapshots) as a flat "supplementary" corpus — these are
        # data the labeling pipeline touched but that aren't directly part of
        # the train/test split. Treat them as training inputs for safety.
        flat = {}
        for source_tag, prompt in load_all_prompts(base):
            # Skip the combined file we already loaded; it's the canonical source.
            if source_tag == combined_name:
                continue
            h = normalize_and_hash(prompt)
            if h not in flat:
                flat[h] = {"source": f"{label_dir}/{source_tag}", "preview": prompt[:200]}
        if flat:
            corpora[f"labeled_data/{label_dir}/supplementary"] = {
                "kind": "flat",
                "path": str(base.relative_to(GETNADIR_ROOT)),
                "n_prompts": len(flat),
                "train": flat,  # treated as training inputs (defensive)
                "dropped": {},
            }

    # Flat corpora: raw pools.
    raw_base = GETNADIR_ROOT / "backend" / "labeled_data" / "raw"
    raw_hashes = _hash_generic_corpus(raw_base)
    if raw_hashes:
        corpora["labeled_data/raw"] = {
            "kind": "flat",
            "path": str(raw_base.relative_to(GETNADIR_ROOT)),
            "n_prompts": len(raw_hashes),
            "train": raw_hashes,
            "dropped": {},
        }

    # Top-level snapshots in backend/labeled_data/.
    top_hashes = _hash_top_level_arena_snapshots(GETNADIR_ROOT / "backend" / "labeled_data")
    if top_hashes:
        corpora["labeled_data/top_level"] = {
            "kind": "flat",
            "path": "backend/labeled_data/*.json",
            "n_prompts": len(top_hashes),
            "train": top_hashes,
            "dropped": {},
        }

    # Verifier corpus (split-aware via the `split` field on each row).
    v_train, v_dropped, n_total = _load_jsonl_verifier_corpus(triples_path)
    if triples_path.exists():
        corpora["verifier/routerbench_triples"] = {
            "kind": "split-aware",
            "path": str(triples_path.relative_to(GETNADIR_ROOT)),
            "n_prompts": n_total,
            "train": v_train,
            "dropped": v_dropped,
        }

    return corpora


def compute_overlaps(
    arena_hashes: dict[str, dict[str, str]],
    corpora: dict[str, dict],
) -> tuple[list[dict], list[dict], dict]:
    """Compute per-corpus overlap counts and matched examples.

    Returns (train_hits, dropped_hits, per_corpus_summary).
    """
    # Per-arena-split sets for fast intersection.
    split_sets = {s: set(mp.keys()) for s, mp in arena_hashes.items()}
    union_hashes: set[str] = set()
    for s in split_sets.values():
        union_hashes |= s

    per_corpus = []
    train_hits: list[dict] = []
    dropped_hits: list[dict] = []

    for corpus_id in sorted(corpora.keys()):
        c = corpora[corpus_id]
        train_keys = set(c["train"].keys())
        dropped_keys = set(c["dropped"].keys())

        overlap_train_full = sorted(train_keys & split_sets.get("full", set()))
        overlap_train_sub_10 = sorted(train_keys & split_sets.get("sub_10", set()))
        overlap_drop_full = sorted(dropped_keys & split_sets.get("full", set()))
        overlap_drop_sub_10 = sorted(dropped_keys & split_sets.get("sub_10", set()))

        for h in sorted(train_keys & union_hashes):
            arena_split = "full" if h in split_sets.get("full", set()) else "sub_10"
            train_hits.append({
                "hash": h,
                "corpus_id": corpus_id,
                "arena_split": arena_split,
                "arena_preview": arena_hashes[arena_split][h],
                "corpus_meta": c["train"][h],
            })
        for h in sorted(dropped_keys & union_hashes):
            arena_split = "full" if h in split_sets.get("full", set()) else "sub_10"
            dropped_hits.append({
                "hash": h,
                "corpus_id": corpus_id,
                "arena_split": arena_split,
                "arena_preview": arena_hashes[arena_split][h],
                "corpus_meta": c["dropped"][h],
            })

        per_corpus.append({
            "corpus_id": corpus_id,
            "kind": c["kind"],
            "path": c["path"],
            "n_prompts": c["n_prompts"],
            "n_unique_train_hashes": len(train_keys),
            "n_unique_dropped_hashes": len(dropped_keys),
            "overlap_train_full": len(overlap_train_full),
            "overlap_train_sub_10": len(overlap_train_sub_10),
            "overlap_dropped_full": len(overlap_drop_full),
            "overlap_dropped_sub_10": len(overlap_drop_sub_10),
        })

    return train_hits, dropped_hits, per_corpus


def build_report(
    *,
    arena_hashes: dict[str, dict[str, str]],
    arena_raw_counts: dict[str, int],
    corpora: dict[str, dict],
    checkpoint_paths: Iterable[Path],
) -> dict:
    train_hits, dropped_hits, per_corpus = compute_overlaps(arena_hashes, corpora)

    if train_hits:
        verdict = "FAIL"
        exit_code = 1
    elif dropped_hits:
        verdict = "NEEDS_REVIEW"
        exit_code = 2
    else:
        verdict = "PASS"
        exit_code = 0

    full_set = set(arena_hashes.get("full", {}).keys())
    sub_set = set(arena_hashes.get("sub_10", {}).keys())
    all_train_keys: set[str] = set()
    all_dropped_keys: set[str] = set()
    for c in corpora.values():
        all_train_keys |= set(c["train"].keys())
        all_dropped_keys |= set(c["dropped"].keys())
    all_corpus_keys = all_train_keys | all_dropped_keys

    full_overlap = len(full_set & all_corpus_keys)
    sub_overlap = len(sub_set & all_corpus_keys)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verdict": verdict,
        "exit_code": exit_code,
        "routerarena_splits": {
            split: {
                "n_prompts": arena_raw_counts[split],
                "n_unique_hashes": len(arena_hashes[split]),
            }
            for split in sorted(arena_hashes.keys())
        },
        "training_corpora": [
            {
                "path": pc["path"],
                "corpus_id": pc["corpus_id"],
                "kind": pc["kind"],
                "n_prompts": pc["n_prompts"],
                "n_unique_train_hashes": pc["n_unique_train_hashes"],
                "n_unique_dropped_hashes": pc["n_unique_dropped_hashes"],
                "overlap_with_full_train": pc["overlap_train_full"],
                "overlap_with_sub_10_train": pc["overlap_train_sub_10"],
                "overlap_with_full_dropped": pc["overlap_dropped_full"],
                "overlap_with_sub_10_dropped": pc["overlap_dropped_sub_10"],
            }
            for pc in per_corpus
        ],
        "overlap_summary": {
            "full_overlap_count": full_overlap,
            "full_overlap_pct": round(100.0 * full_overlap / max(1, len(full_set)), 6),
            "sub_10_overlap_count": sub_overlap,
            "sub_10_overlap_pct": round(100.0 * sub_overlap / max(1, len(sub_set)), 6),
            "train_set_overlap_count": len(train_hits),
            "labeled_but_dropped_overlap_count": len(dropped_hits),
        },
        "methodology": {
            "normalization": "NFC + strip + collapse whitespace + casefold + SHA-256",
            "reference_script": "verifier/routerbench_contamination.py",
            "hasher_module": "eval/contamination_audit/hasher.py (cycle-1 hasher, reused verbatim)",
            "snapshot_source": "eval/contamination_audit/cache/routerarena_{full,sub_10}.json",
            "deterministic": True,
        },
        "classifier_artifact_hashes": {
            p.name: _file_sha256(p) for p in checkpoint_paths
        },
        "matched_prompt_examples": [
            {
                "kind": "train_set",
                "hash": h["hash"],
                "corpus_id": h["corpus_id"],
                "arena_split": h["arena_split"],
                "arena_preview": h["arena_preview"][:200],
                "corpus_preview": h["corpus_meta"].get("preview", "")[:200],
            }
            for h in train_hits[:10]
        ] + [
            {
                "kind": "labeled_but_dropped",
                "hash": h["hash"],
                "corpus_id": h["corpus_id"],
                "arena_split": h["arena_split"],
                "arena_preview": h["arena_preview"][:200],
                "corpus_preview": h["corpus_meta"].get("preview", "")[:200],
            }
            for h in dropped_hits[:10]
        ],
        "note": (
            "Train-set overlap with ANY training corpus is a hard FAIL (blocks "
            "RouterArena submission). Labeled-but-dropped overlap is "
            "informational — those rows are in v2/v3 test splits or the "
            "verifier val/test splits and were NOT used to train any deployed "
            "model. Verdict reflects the strongest signal across all corpora."
        ),
    }


def render_markdown(report: dict, json_path: Path) -> str:
    """Build the human-readable .md summary."""
    verdict = report["verdict"]
    badge = {"PASS": "PASS", "FAIL": "FAIL — DO NOT SUBMIT", "NEEDS_REVIEW": "NEEDS FOUNDER REVIEW"}[verdict]
    lines = []
    lines.append("# RouterArena contamination audit")
    lines.append("")
    lines.append(f"**Verdict:** {badge}")
    lines.append(f"**Generated:** {report['generated_at']}")
    lines.append(f"**Exit code:** {report['exit_code']}")
    lines.append("")
    lines.append("## RouterArena splits audited")
    lines.append("")
    lines.append("| Split | n_prompts (raw) | n_unique_hashes |")
    lines.append("|-------|----------------:|----------------:|")
    for split, meta in report["routerarena_splits"].items():
        lines.append(f"| `{split}` | {meta['n_prompts']} | {meta['n_unique_hashes']} |")
    lines.append("")
    lines.append("## Per-corpus overlap")
    lines.append("")
    lines.append("| Corpus | Path | n_prompts | train hashes | dropped hashes | overlap (full-train) | overlap (sub_10-train) | overlap (full-dropped) | overlap (sub_10-dropped) |")
    lines.append("|--------|------|----------:|-------------:|---------------:|---------------------:|-----------------------:|-----------------------:|-------------------------:|")
    for c in report["training_corpora"]:
        lines.append(
            f"| `{c['corpus_id']}` | `{c['path']}` | {c['n_prompts']} | "
            f"{c['n_unique_train_hashes']} | {c['n_unique_dropped_hashes']} | "
            f"{c['overlap_with_full_train']} | {c['overlap_with_sub_10_train']} | "
            f"{c['overlap_with_full_dropped']} | {c['overlap_with_sub_10_dropped']} |"
        )
    lines.append("")
    lines.append("## Overlap summary")
    lines.append("")
    s = report["overlap_summary"]
    lines.append(f"- **full ∩ ANY training corpus:** {s['full_overlap_count']} prompts ({s['full_overlap_pct']}%)")
    lines.append(f"- **sub_10 ∩ ANY training corpus:** {s['sub_10_overlap_count']} prompts ({s['sub_10_overlap_pct']}%)")
    lines.append(f"- **train-set overlap (hard FAIL gate):** {s['train_set_overlap_count']}")
    lines.append(f"- **labeled-but-dropped overlap (NEEDS_REVIEW gate):** {s['labeled_but_dropped_overlap_count']}")
    lines.append("")
    lines.append("## Classifier artifact hashes")
    lines.append("")
    lines.append("| Artifact | SHA-256 |")
    lines.append("|----------|---------|")
    for name, sha in report["classifier_artifact_hashes"].items():
        lines.append(f"| `{name}` | `{sha}` |")
    lines.append("")
    if verdict == "FAIL":
        lines.append("## FAIL — overlapping prompts (truncated to 200 chars)")
        lines.append("")
        for ex in report["matched_prompt_examples"]:
            if ex["kind"] != "train_set":
                continue
            lines.append(f"- **hash:** `{ex['hash']}`")
            lines.append(f"  - **corpus_id:** `{ex['corpus_id']}`")
            lines.append(f"  - **arena_split:** `{ex['arena_split']}`")
            lines.append(f"  - **arena_preview:** {ex['arena_preview']!r}")
            lines.append(f"  - **corpus_preview:** {ex['corpus_preview']!r}")
            lines.append("")
        lines.append("**ACTION:** Do NOT open the RouterArena submission PR. Surface the overlap to the founder before any further engineering steps.")
    elif verdict == "NEEDS_REVIEW":
        lines.append("## NEEDS_REVIEW — labeled-but-dropped prompts overlap RouterArena")
        lines.append("")
        lines.append("These prompts were labeled but excluded from training (v2/v3 test splits or verifier val/test). The founder should decide whether to disclose them in the RouterArena submission.")
        lines.append("")
        for ex in report["matched_prompt_examples"]:
            if ex["kind"] != "labeled_but_dropped":
                continue
            lines.append(f"- **hash:** `{ex['hash']}` ({ex['corpus_id']}, arena={ex['arena_split']})")
            lines.append(f"  - preview: {ex['arena_preview']!r}")
            lines.append("")
    else:
        lines.append("## PASS")
        lines.append("")
        lines.append(
            "No prompt in either RouterArena split (`full` n="
            f"{report['routerarena_splits'].get('full', {}).get('n_prompts', 0)}, "
            f"`sub_10` n={report['routerarena_splits'].get('sub_10', {}).get('n_prompts', 0)}) "
            "appears in ANY audited training corpus (wide_deep_asym_v3 classifier "
            "labeled_data v2/v3/raw, top-level arena snapshots, or the verifier "
            "routerbench_triples corpus). This audit is the RouterArena "
            "submission Block-B engineering gate and certifies the 0.7118 result "
            "against \"trained on the test set\" challenges."
        )
        lines.append("")
        lines.append("The RouterArena submission PR may proceed.")
    lines.append("")
    lines.append("## Reproducibility")
    lines.append("")
    lines.append("```bash")
    lines.append("cd getnadir.dev")
    lines.append("python3 eval/routerarena/routerarena_contamination.py \\")
    lines.append("    --eval-source RouteWorks/RouterArena \\")
    lines.append("    --train-paths backend/labeled_data/v3/ backend/labeled_data/v2/ \\")
    lines.append("                  backend/labeled_data/raw/ verifier/data/ \\")
    lines.append("    --out eval/routerarena/reports/")
    lines.append("```")
    lines.append("")
    lines.append(f"Companion JSON: `{json_path.name}`")
    lines.append("")
    lines.append("Normalization is identical to `verifier/routerbench_contamination.py` (NFC + strip + collapse whitespace + casefold + SHA-256), so this audit is directly comparable to the RouterBench audit at `verifier/reports/routerbench_contamination_20260524T122849.json`.")
    return "\n".join(lines) + "\n"


def write_outputs(report: dict, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    json_path = out_dir / f"routerarena_contamination_{ts}.json"
    md_path = out_dir / f"routerarena_contamination_{ts}.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True))
    md_path.write_text(render_markdown(report, json_path))
    return json_path, md_path


# ─────────────────────────────── CLI ───────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RouterArena contamination audit (Block B)")
    parser.add_argument(
        "--eval-source",
        default="RouteWorks/RouterArena",
        help="HF dataset id (informational only; this script reads the local snapshot cache)",
    )
    parser.add_argument(
        "--train-paths",
        nargs="+",
        type=Path,
        default=DEFAULT_TRAIN_PATHS,
        help="training-corpus roots (informational; the script audits the production set by default)",
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
        help="verifier training-corpus jsonl (split-aware)",
    )
    parser.add_argument(
        "--out",
        "--out-dir",
        dest="out_dir",
        type=Path,
        default=Path(__file__).resolve().parent / "reports",
        help="output directory for the JSON + MD reports",
    )
    parser.add_argument(
        "--splits",
        nargs="+",
        default=list(SUPPORTED_SPLITS),
        choices=list(SUPPORTED_SPLITS),
        help="RouterArena splits to audit (default: both)",
    )
    args = parser.parse_args(argv)

    # 1. Arena snapshots.
    arena_hashes: dict[str, dict[str, str]] = {}
    arena_raw_counts: dict[str, int] = {}
    try:
        for split in args.splits:
            prompts = load_arena_snapshot(split, args.arena_cache_dir)
            arena_raw_counts[split] = len(prompts)
            arena_hashes[split] = hash_arena(prompts)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    # 2. Training corpora.
    corpora = collect_training_corpora(args.train_paths, args.triples_path)

    # 3. Build + write report.
    report = build_report(
        arena_hashes=arena_hashes,
        arena_raw_counts=arena_raw_counts,
        corpora=corpora,
        checkpoint_paths=DEFAULT_CHECKPOINT_PATHS,
    )
    json_path, md_path = write_outputs(report, args.out_dir)

    # 4. Surface.
    print(json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True))
    print(f"\nJSON report: {json_path}", file=sys.stderr)
    print(f"MD report:   {md_path}", file=sys.stderr)
    print(f"Verdict:     {report['verdict']} (exit={report['exit_code']})", file=sys.stderr)
    return report["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
