"""Smoke tests for verifier/train_local.py.

These tests only exercise the lightweight, transformers-free parts of
the trainer: argparse defaults, JSONL streaming, the cross-encoder
tokenization format, and split-assignment logic. The Trainer / model
download / training loop are NOT invoked.

Heavy imports (transformers, torch, sklearn) are mocked so the file is
importable in any environment, including CI without GPU / without ML
deps installed. The conftest in backend/tests already puts the
verifier/ directory on sys.path, so `import train_local` resolves to
verifier/train_local.py.
"""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pytest


# Ensure heavy deps are mocked BEFORE importing train_local, in case the
# test env does not have them installed. If they are installed for real
# (the backend venv has them), the real modules are used as-is.
def _ensure_module(name: str) -> types.ModuleType:
    if name in sys.modules:
        return sys.modules[name]
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


# Best effort: only inject stubs for modules that are NOT importable.
for _modname in ("transformers", "datasets", "accelerate", "sklearn", "sklearn.metrics"):
    try:
        __import__(_modname)
    except ImportError:
        _ensure_module(_modname)

# torch is referenced in auto_detect_device. If absent, the helper falls
# back to CPU on its own; no stub needed.

import train_local  # noqa: E402  imported after stubs


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")


def _row(
    *,
    prompt: str = "What is 2+2?",
    cheap: str = "4",
    expensive: str = "The answer is 4.",
    label: int = 1,
    split: str | None = None,
    extra: dict | None = None,
) -> dict:
    row = {
        "prompt": prompt,
        "cheap_answer": cheap,
        "expensive_answer": expensive,
        "label": label,
    }
    if split is not None:
        row["split"] = split
    if extra:
        row.update(extra)
    return row


# --------------------------------------------------------------------------
# 1. argparse defaults
# --------------------------------------------------------------------------


def test_argparse_defaults() -> None:
    args = train_local.parse_args([])
    assert args.data == "verifier/data/routerbench_triples.jsonl"
    assert args.output == "verifier/weights/"
    assert args.epochs == 4
    assert args.batch_size == 8
    assert args.max_length == 512
    assert args.learning_rate == pytest.approx(2e-5)
    assert args.device == "auto"
    assert args.quantize is True
    assert args.max_rows is None
    assert args.seed == 42
    assert args.model_name == "microsoft/deberta-v3-small"


# --------------------------------------------------------------------------
# 2. JSONL streaming loader
# --------------------------------------------------------------------------


def test_load_jsonl_streaming(tmp_path: Path) -> None:
    path = tmp_path / "tiny.jsonl"
    rows = [
        _row(prompt=f"p{i}", cheap=f"c{i}", expensive=f"e{i}", label=i % 2)
        for i in range(5)
    ]
    _write_jsonl(path, rows)

    triples = train_local.load_jsonl_streaming(path)
    assert len(triples) == 5
    for i, t in enumerate(triples):
        assert t.prompt == f"p{i}"
        assert t.cheap_answer == f"c{i}"
        assert t.expensive_answer == f"e{i}"
        assert t.label == i % 2
        assert t.split is None


def test_load_jsonl_streaming_skips_malformed(tmp_path: Path) -> None:
    path = tmp_path / "messy.jsonl"
    with path.open("w", encoding="utf-8") as fh:
        fh.write(json.dumps(_row(prompt="ok")) + "\n")
        fh.write("not valid json\n")
        # missing required field
        fh.write(json.dumps({"prompt": "x", "cheap_answer": "y", "label": 1}) + "\n")
        fh.write(json.dumps(_row(prompt="ok2", label=0)) + "\n")
    triples = train_local.load_jsonl_streaming(path)
    assert len(triples) == 2
    assert {t.prompt for t in triples} == {"ok", "ok2"}


def test_load_jsonl_respects_max_rows(tmp_path: Path) -> None:
    path = tmp_path / "many.jsonl"
    _write_jsonl(path, [_row(prompt=f"p{i}") for i in range(20)])
    triples = train_local.load_jsonl_streaming(path, max_rows=3)
    assert len(triples) == 3


# --------------------------------------------------------------------------
# 3. Cross-encoder tokenization format
# --------------------------------------------------------------------------


def test_tokenize_cross_encoder_format() -> None:
    text, text_pair = train_local.build_cross_encoder_pair(
        prompt="Explain transformers.",
        cheap_answer="They are NN models.",
        expensive_answer="Transformers are neural networks based on attention.",
    )
    # The tokenizer receives prompt on side A, labeled concat on side B.
    # The resulting [CLS] prompt [SEP] CHEAP:... EXPENSIVE:... [SEP] shape
    # is produced by the tokenizer; we assert the pre-tokenization inputs
    # contain the expected CHEAP / EXPENSIVE markers.
    assert text == "Explain transformers."
    assert text_pair.startswith("CHEAP:\n")
    assert "EXPENSIVE:\n" in text_pair
    assert "They are NN models." in text_pair
    assert "Transformers are neural networks based on attention." in text_pair
    # Order matters: cheap must come before expensive in the pair string.
    assert text_pair.index("CHEAP:") < text_pair.index("EXPENSIVE:")


# --------------------------------------------------------------------------
# 4. Split assignment with explicit field
# --------------------------------------------------------------------------


def test_split_assignment_with_field() -> None:
    triples = [
        train_local.Triple("p1", "c", "e", 1, split="train"),
        train_local.Triple("p2", "c", "e", 0, split="train"),
        train_local.Triple("p3", "c", "e", 1, split="val"),
        train_local.Triple("p4", "c", "e", 0, split="test"),
        train_local.Triple("p5", "c", "e", 1, split="test"),
    ]
    train, val, test = train_local.assign_splits(triples, seed=42)
    assert [t.prompt for t in train] == ["p1", "p2"]
    assert [t.prompt for t in val] == ["p3"]
    assert [t.prompt for t in test] == ["p4", "p5"]


def test_split_assignment_unknown_value_falls_to_train() -> None:
    triples = [
        train_local.Triple("p1", "c", "e", 1, split="train"),
        train_local.Triple("p2", "c", "e", 0, split="garbage"),
        train_local.Triple("p3", "c", "e", 1, split="val"),
        train_local.Triple("p4", "c", "e", 0, split="test"),
    ]
    train, val, test = train_local.assign_splits(triples, seed=42)
    assert "p1" in [t.prompt for t in train]
    assert "p2" in [t.prompt for t in train]  # leftover bucketed into train
    assert [t.prompt for t in val] == ["p3"]
    assert [t.prompt for t in test] == ["p4"]


# --------------------------------------------------------------------------
# 5. Split assignment random fallback when no split field
# --------------------------------------------------------------------------


def test_split_assignment_fallback_random() -> None:
    triples = [train_local.Triple(f"p{i}", "c", "e", i % 2, split=None) for i in range(100)]
    train, val, test = train_local.assign_splits(triples, seed=42)
    assert len(train) == 80
    assert len(val) == 10
    assert len(test) == 10
    # Determinism: same seed must produce identical assignment.
    train2, val2, test2 = train_local.assign_splits(triples, seed=42)
    assert [t.prompt for t in train] == [t.prompt for t in train2]
    assert [t.prompt for t in val] == [t.prompt for t in val2]
    assert [t.prompt for t in test] == [t.prompt for t in test2]
    # Different seed should reshuffle.
    train3, _, _ = train_local.assign_splits(triples, seed=7)
    assert [t.prompt for t in train] != [t.prompt for t in train3]
    # All triples accounted for, no overlap.
    all_prompts = {t.prompt for t in train + val + test}
    assert len(all_prompts) == 100
