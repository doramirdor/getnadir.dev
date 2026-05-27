"""Unit tests for verifier/routerarena_contamination.py.

These tests deliberately use synthetic fixtures and never hit the network or
Supabase. They cover the six guarantees the audit must hold to qualify as a
RouterArena submission-blocker fix:

  1. Hashing is deterministic AND NFC-normalized (NFD `é` hashes the same as NFC `é`)
  2. Empty / malformed input is handled cleanly
  3. A real overlap between RouterArena and the train split is detected
  4. Zero-overlap input is reported as PASS
  5. Both wide_deep checkpoint SHAs (asym + sym) are recorded in the report
  6. The report file is written to disk with the expected schema
"""
from __future__ import annotations

import hashlib
import importlib
import json
import sys
import unicodedata
from pathlib import Path

import pytest

# Make `verifier/` importable. backend/tests/conftest.py already adds it to
# sys.path, but we re-add here so this test file can also be run standalone
# (e.g. `pytest verifier/test_routerarena_contamination.py`).
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
VERIFIER_DIR = REPO_ROOT / "verifier"
if str(VERIFIER_DIR) not in sys.path:
    sys.path.insert(0, str(VERIFIER_DIR))

routerarena_contamination = importlib.import_module("routerarena_contamination")
normalize_and_hash = routerarena_contamination.normalize_and_hash


# ─────────────────────────── fixtures ───────────────────────────


@pytest.fixture
def arena_cache(tmp_path: Path) -> Path:
    """Synthetic RouterArena cache with both splits populated."""
    cache_dir = tmp_path / "arena_cache"
    cache_dir.mkdir()
    (cache_dir / "routerarena_sub_10.json").write_text(
        json.dumps(["What is the capital of France?", "Tell me about the moon."])
    )
    (cache_dir / "routerarena_full.json").write_text(
        json.dumps(
            [
                "What is the capital of France?",
                "Tell me about the moon.",
                "Explain quantum entanglement in simple terms.",
            ]
        )
    )
    return cache_dir


@pytest.fixture
def triples_clean(tmp_path: Path) -> Path:
    """Verifier corpus snapshot that has zero overlap with the arena cache."""
    path = tmp_path / "triples_clean.jsonl"
    rows = [
        {"id": "a", "prompt": "Solve x^2 - 4 = 0.", "split": "train"},
        {"id": "b", "prompt": "Translate 'good morning' to Japanese.", "split": "train"},
        {"id": "c", "prompt": "Describe photosynthesis.", "split": "val"},
        {"id": "d", "prompt": "What year did WWII end?", "split": "test"},
    ]
    path.write_text("\n".join(json.dumps(r) for r in rows))
    return path


@pytest.fixture
def triples_with_train_overlap(tmp_path: Path) -> Path:
    """Verifier corpus snapshot whose `train` row collides with an arena prompt."""
    path = tmp_path / "triples_dirty.jsonl"
    rows = [
        # Collides exactly with the first arena prompt above.
        {"id": "leak", "prompt": "What is the capital of France?", "split": "train"},
        {"id": "ok", "prompt": "Compute the derivative of x^3.", "split": "train"},
        {"id": "valish", "prompt": "Describe photosynthesis.", "split": "val"},
    ]
    path.write_text("\n".join(json.dumps(r) for r in rows))
    return path


@pytest.fixture
def triples_with_dropped_overlap(tmp_path: Path) -> Path:
    """Overlap only in val/test (labeled-but-dropped) — should be NEEDS_REVIEW."""
    path = tmp_path / "triples_dropped.jsonl"
    rows = [
        {"id": "ok", "prompt": "Compute the derivative of x^3.", "split": "train"},
        # Collides with an arena prompt but lives in val, not train.
        {"id": "leakval", "prompt": "Tell me about the moon.", "split": "val"},
    ]
    path.write_text("\n".join(json.dumps(r) for r in rows))
    return path


@pytest.fixture
def fake_checkpoints(tmp_path: Path) -> list[Path]:
    """Two byte-distinct fake checkpoints standing in for asym + sym."""
    asym = tmp_path / "wide_deep_asym_v3.pt"
    sym = tmp_path / "wide_deep_sym_v3.pt"
    asym.write_bytes(b"asym-checkpoint-bytes")
    sym.write_bytes(b"sym-checkpoint-bytes")
    return [asym, sym]


# ─────────────────────────── tests ───────────────────────────


def test_hash_is_deterministic_and_nfc_normalized():
    """1. Same logical text under NFD vs NFC must hash identically."""
    # "café" — first written with a combining acute accent (NFD), second precomposed (NFC).
    nfd = unicodedata.normalize("NFD", "café")
    nfc = unicodedata.normalize("NFC", "café")
    assert nfd != nfc, "fixture sanity: the two encodings should differ at the byte level"
    assert normalize_and_hash(nfd) == normalize_and_hash(nfc)
    # And the hash is stable across calls.
    assert normalize_and_hash("hello") == normalize_and_hash("hello")
    # Case + whitespace folding still applies.
    assert normalize_and_hash("  Hello   World  ") == normalize_and_hash("hello world")


def test_empty_and_malformed_input_handled(tmp_path: Path, arena_cache: Path, fake_checkpoints):
    """2. Empty prompts in the arena cache are skipped, not crashed on."""
    # Overwrite the sub_10 snapshot with one valid + one empty prompt.
    (arena_cache / "routerarena_sub_10.json").write_text(
        json.dumps(["", "What is the capital of France?"])
    )
    triples = tmp_path / "empty_triples.jsonl"
    triples.write_text("\n".join([
        "",  # blank line
        "{not valid json",  # malformed
        json.dumps({"id": "x", "split": "train"}),  # no prompt field
        json.dumps({"id": "y", "prompt": "", "split": "train"}),  # empty prompt
        json.dumps({"id": "z", "prompt": "Compute derivative.", "split": "train"}),
    ]))
    report = routerarena_contamination.run_audit(
        splits=["sub_10"],
        arena_cache_dir=arena_cache,
        triples_path=triples,
        source="jsonl",
        checkpoint_paths=fake_checkpoints,
    )
    # One arena prompt kept after dropping the empty one; one corpus row kept.
    assert report["arena_prompt_count_by_split"]["sub_10"] == 1
    assert report["verifier_train_unique_hashes"] == 1
    assert report["verdict"] == "PASS"


def test_real_overlap_with_train_split_is_FAIL(
    arena_cache: Path, triples_with_train_overlap: Path, fake_checkpoints
):
    """3. A train-split overlap must be detected and verdict = FAIL."""
    report = routerarena_contamination.run_audit(
        splits=["sub_10", "full"],
        arena_cache_dir=arena_cache,
        triples_path=triples_with_train_overlap,
        source="jsonl",
        checkpoint_paths=fake_checkpoints,
    )
    assert report["train_set_overlap_count"] == 1
    assert report["labeled_but_dropped_overlap_count"] == 0
    assert report["verdict"] == "FAIL"
    # The example surfaces the verifier corpus id so reviewers can audit it.
    assert report["train_set_overlap_examples"][0]["verifier_corpus_id"] == "leak"


def test_zero_overlap_reported_as_PASS(
    arena_cache: Path, triples_clean: Path, fake_checkpoints
):
    """4. Zero-overlap input -> verdict PASS, zero counts."""
    report = routerarena_contamination.run_audit(
        splits=["sub_10", "full"],
        arena_cache_dir=arena_cache,
        triples_path=triples_clean,
        source="jsonl",
        checkpoint_paths=fake_checkpoints,
    )
    assert report["train_set_overlap_count"] == 0
    assert report["labeled_but_dropped_overlap_count"] == 0
    assert report["verdict"] == "PASS"
    assert report["arena_unique_hashes"] == 3  # union of both splits, dedup
    # Splits audited recorded in alpha order.
    assert report["splits_audited"] == ["full", "sub_10"]


def test_dropped_only_overlap_is_NEEDS_REVIEW(
    arena_cache: Path, triples_with_dropped_overlap: Path, fake_checkpoints
):
    """4b. Val/test-only overlap -> NEEDS_FOUNDER_REVIEW, not FAIL."""
    report = routerarena_contamination.run_audit(
        splits=["sub_10"],
        arena_cache_dir=arena_cache,
        triples_path=triples_with_dropped_overlap,
        source="jsonl",
        checkpoint_paths=fake_checkpoints,
    )
    assert report["train_set_overlap_count"] == 0
    assert report["labeled_but_dropped_overlap_count"] == 1
    assert report["verdict"] == "NEEDS_FOUNDER_REVIEW"


def test_both_wide_deep_checkpoint_shas_recorded(
    arena_cache: Path, triples_clean: Path, fake_checkpoints
):
    """5. Both asym + sym checkpoint SHAs appear in the report."""
    report = routerarena_contamination.run_audit(
        splits=["sub_10"],
        arena_cache_dir=arena_cache,
        triples_path=triples_clean,
        source="jsonl",
        checkpoint_paths=fake_checkpoints,
    )
    shas = report["classifier_artifact_hashes"]
    assert set(shas.keys()) == {"wide_deep_asym_v3.pt", "wide_deep_sym_v3.pt"}
    # Each is a 64-char hex digest matching what hashlib produces for the bytes.
    assert shas["wide_deep_asym_v3.pt"] == hashlib.sha256(b"asym-checkpoint-bytes").hexdigest()
    assert shas["wide_deep_sym_v3.pt"] == hashlib.sha256(b"sym-checkpoint-bytes").hexdigest()
    # The two SHAs must differ (otherwise we're not binding to the right artifact).
    assert shas["wide_deep_asym_v3.pt"] != shas["wide_deep_sym_v3.pt"]


def test_missing_checkpoint_is_recorded_as_MISSING(
    arena_cache: Path, triples_clean: Path, tmp_path: Path
):
    """5b. If a checkpoint file is absent, the audit records "MISSING", not raises."""
    asym = tmp_path / "wide_deep_asym_v3.pt"
    asym.write_bytes(b"asym-only")
    sym = tmp_path / "wide_deep_sym_v3.pt"  # never created
    report = routerarena_contamination.run_audit(
        splits=["sub_10"],
        arena_cache_dir=arena_cache,
        triples_path=triples_clean,
        source="jsonl",
        checkpoint_paths=[asym, sym],
    )
    shas = report["classifier_artifact_hashes"]
    assert shas["wide_deep_sym_v3.pt"] == "MISSING"
    assert shas["wide_deep_asym_v3.pt"] != "MISSING"


def test_report_file_written_with_expected_schema(
    tmp_path: Path, arena_cache: Path, triples_clean: Path, fake_checkpoints
):
    """6. write_outputs lands two files with the expected top-level keys."""
    report = routerarena_contamination.run_audit(
        splits=["sub_10"],
        arena_cache_dir=arena_cache,
        triples_path=triples_clean,
        source="jsonl",
        checkpoint_paths=fake_checkpoints,
    )
    out_dir = tmp_path / "reports"
    report_path, overlap_path = routerarena_contamination.write_outputs(report, out_dir)

    assert report_path.exists() and report_path.parent == out_dir
    assert overlap_path.name == "routerarena_overlap_hashes.json"

    written = json.loads(report_path.read_text())
    expected_keys = {
        "audit_date",
        "benchmark",
        "splits_audited",
        "arena_prompt_count_by_split",
        "arena_unique_hashes",
        "corpus_source",
        "verifier_train_unique_hashes",
        "verifier_labeled_but_dropped_unique_hashes",
        "train_set_overlap_count",
        "labeled_but_dropped_overlap_count",
        "verdict",
        "train_set_overlap_examples",
        "labeled_but_dropped_overlap_examples",
        "classifier_artifact_hashes",
        "note",
    }
    assert expected_keys.issubset(written.keys())
    assert written["benchmark"].startswith("RouterArena")

    overlap = json.loads(overlap_path.read_text())
    assert isinstance(overlap, list)
    assert overlap == []  # PASS run -> empty overlap set


def test_missing_arena_snapshot_raises_with_refresh_hint(tmp_path: Path, fake_checkpoints):
    """The script must fail loudly (not silently mis-audit) when the cache is missing."""
    empty_cache = tmp_path / "no_cache"
    empty_cache.mkdir()
    with pytest.raises(FileNotFoundError) as exc:
        routerarena_contamination.run_audit(
            splits=["sub_10"],
            arena_cache_dir=empty_cache,
            triples_path=tmp_path / "irrelevant.jsonl",
            source="jsonl",
            checkpoint_paths=fake_checkpoints,
        )
    assert "RouterArena snapshot missing" in str(exc.value)
    assert "download_routerarena" in str(exc.value)
