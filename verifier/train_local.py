"""Local trainer for the verifier-gated cascade discriminator (IP-1).

Mirrors the workflow in verifier/colab_train.ipynb but runs from a terminal
against the JSONL corpus in verifier/data/routerbench_triples.jsonl.

The script is intentionally split into small, testable functions so the
smoke test in backend/tests/test_train_local_smoke.py can exercise
argparse, JSONL streaming, tokenization formatting, and split logic
without importing transformers or torch.

Heavy ML imports (transformers, torch, sklearn) are loaded lazily inside
the functions that need them. This keeps the module importable in
environments that only need to introspect the CLI or unit-test the
data-side helpers.

Usage:
    python verifier/train_local.py \
        --data verifier/data/routerbench_triples.jsonl \
        --output verifier/weights/

See verifier/README.md for realistic timings per device.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator


DEFAULT_DATA = "verifier/data/routerbench_triples.jsonl"
DEFAULT_OUTPUT = "verifier/weights/"
DEFAULT_MODEL_NAME = "microsoft/deberta-v3-small"
DEFAULT_MAX_LENGTH = 512
# Reference-free deploy gate. The old 0.82 was set for the ORACLE-fed verifier
# (trained+evaluated WITH the expensive answer, AUROC 0.961) — an operating mode
# production never has (it calls reference=None). Reference-free, the signal caps
# ~0.77-0.78 (the expensive answer is exactly what's unavailable), so 0.82 is
# unreachable by design. 0.74 gates out a near-random verifier (≈0.52) while
# passing an honest reference-free one (deployed model: 0.776). Re-calibrate if a
# richer decision-time signal (logprobs / self-consistency) lifts the ceiling.
PRODUCTION_AUROC_GATE = 0.74
LATENCY_BENCH_ITERATIONS = 50

# When True, the cross-encoder pair omits the expensive (reference) answer, so
# the verifier learns to judge the cheap answer ALONE -- matching how production
# calls it (cascade_router.py: score(prompt, cheap, None)). Set from --reference-free.
REFERENCE_FREE = False


# Fields we always expect from the JSONL corpus.
REQUIRED_FIELDS = ("prompt", "cheap_answer", "expensive_answer", "label")


@dataclass
class Triple:
    """One labeled cross-encoder example."""

    prompt: str
    cheap_answer: str
    expensive_answer: str
    label: int
    split: str | None = None


def build_arg_parser() -> argparse.ArgumentParser:
    """Construct the CLI parser. Kept separate so tests can inspect defaults."""
    parser = argparse.ArgumentParser(
        description=(
            "Train the Nadir verifier (DeBERTa-v3-small cross-encoder) on the "
            "RouterBench triples corpus, locally on CPU, MPS, or CUDA."
        )
    )
    parser.add_argument("--data", type=str, default=DEFAULT_DATA)
    parser.add_argument("--output", type=str, default=DEFAULT_OUTPUT)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=DEFAULT_MAX_LENGTH)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument(
        "--device",
        type=str,
        choices=("auto", "cpu", "mps", "cuda"),
        default="auto",
    )
    parser.add_argument(
        "--quantize",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Produce an INT8 dynamic-quantized CPU checkpoint after training.",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=None,
        help="Cap the number of triples loaded. Useful for smoke runs.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--model-name",
        type=str,
        default=DEFAULT_MODEL_NAME,
        help="Override the base HuggingFace model id.",
    )
    parser.add_argument(
        "--reference-free",
        action="store_true",
        help="Train the verifier WITHOUT the expensive answer in the pair, so it "
        "judges the cheap answer alone -- matching production (reference=None).",
    )
    return parser


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    return build_arg_parser().parse_args(argv)


def load_jsonl_streaming(path: str | Path, max_rows: int | None = None) -> list[Triple]:
    """Stream the JSONL corpus into a list of Triple records.

    Rows missing any of the required fields are skipped (with a count
    printed at the end). Labels are coerced to int when not None.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Triples file not found: {path}")

    out: list[Triple] = []
    skipped = 0
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            if any(row.get(field) is None for field in REQUIRED_FIELDS):
                skipped += 1
                continue
            try:
                label = int(row["label"])
            except (TypeError, ValueError):
                skipped += 1
                continue
            out.append(
                Triple(
                    prompt=str(row["prompt"]),
                    cheap_answer=str(row["cheap_answer"]),
                    expensive_answer=str(row["expensive_answer"]),
                    label=label,
                    split=row.get("split") or None,
                )
            )
            if max_rows is not None and len(out) >= max_rows:
                break
    if skipped:
        print(f"load_jsonl_streaming: skipped {skipped} malformed rows.")
    return out


def build_cross_encoder_pair(
    prompt: str, cheap_answer: str, expensive_answer: str
) -> tuple[str, str]:
    """Return the (text, text_pair) inputs for the cross-encoder tokenizer.

    Format mirrors the Colab notebook: prompt on side A, a labeled
    concatenation of cheap and expensive answers on side B. The
    tokenizer then emits [CLS] prompt [SEP] CHEAP:... EXPENSIVE:... [SEP].
    """
    exp = "" if REFERENCE_FREE else expensive_answer
    pair = f"CHEAP:\n{cheap_answer}\n\nEXPENSIVE:\n{exp}"
    return prompt, pair


def assign_splits(
    triples: list[Triple], seed: int = 42
) -> tuple[list[Triple], list[Triple], list[Triple]]:
    """Group triples by their `split` field.

    If at least one row carries a non-empty split value, all rows are
    grouped by that field and rows with empty/unknown splits go to train.
    Otherwise a deterministic 80/10/10 random split is applied with the
    provided seed.
    """
    has_splits = any(t.split in ("train", "val", "test") for t in triples)

    if has_splits:
        train = [t for t in triples if t.split == "train"]
        val = [t for t in triples if t.split == "val"]
        test = [t for t in triples if t.split == "test"]
        # Any row with a missing/unknown split falls into train.
        leftover = [t for t in triples if t.split not in ("train", "val", "test")]
        train.extend(leftover)
        return train, val, test

    rng = random.Random(seed)
    shuffled = list(triples)
    rng.shuffle(shuffled)
    n = len(shuffled)
    n_train = int(0.8 * n)
    n_val = int(0.9 * n) - n_train
    train = shuffled[:n_train]
    val = shuffled[n_train : n_train + n_val]
    test = shuffled[n_train + n_val :]
    return train, val, test


def auto_detect_device(requested: str) -> str:
    """Pick a device. Prefers CUDA > MPS > CPU when `requested == "auto"`."""
    if requested != "auto":
        return requested

    try:
        import torch
    except ImportError:
        return "cpu"

    if torch.cuda.is_available():
        return "cuda"
    mps_available = getattr(torch.backends, "mps", None)
    if mps_available is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _tokenize_triples(triples: list[Triple], tokenizer, max_length: int) -> list[dict[str, Any]]:
    """Tokenize a batch of Triples as cross-encoder inputs."""
    examples = []
    for t in triples:
        text, text_pair = build_cross_encoder_pair(t.prompt, t.cheap_answer, t.expensive_answer)
        enc = tokenizer(
            text=text,
            text_pair=text_pair,
            truncation=True,
            max_length=max_length,
            padding=False,
        )
        enc["labels"] = t.label
        examples.append(enc)
    return examples


def _compute_metrics_factory():
    """Return a compute_metrics function bound to the imported numpy/sklearn/torch."""
    import numpy as np
    import torch
    from sklearn.metrics import precision_recall_fscore_support, roc_auc_score

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        probs = torch.softmax(torch.from_numpy(logits), dim=-1).numpy()[:, 1]
        preds = (probs >= 0.5).astype(int)
        p, r, f1, _ = precision_recall_fscore_support(
            labels, preds, average="binary", zero_division=0
        )
        try:
            auc = roc_auc_score(labels, probs)
        except ValueError:
            auc = float("nan")
        return {"auroc": auc, "precision": p, "recall": r, "f1": f1}

    return compute_metrics


def _benchmark_cpu_latency(model, tokenizer, max_length: int) -> float:
    """Return the mean inference latency in milliseconds (CPU)."""
    import torch

    sample = tokenizer(
        text="benchmark prompt",
        text_pair="CHEAP:\nfoo\n\nEXPENSIVE:\nbar",
        return_tensors="pt",
        truncation=True,
        max_length=max_length,
    )
    model.eval()
    with torch.no_grad():
        for _ in range(3):
            model(**sample)  # warmup
        t0 = time.perf_counter()
        for _ in range(LATENCY_BENCH_ITERATIONS):
            model(**sample)
        elapsed = (time.perf_counter() - t0) / LATENCY_BENCH_ITERATIONS * 1000.0
    return elapsed


def train(args: argparse.Namespace) -> dict[str, Any]:
    """Run the full training pipeline. Heavy imports are local on purpose."""
    global REFERENCE_FREE
    REFERENCE_FREE = bool(getattr(args, "reference_free", False))
    if REFERENCE_FREE:
        print("[train_local] REFERENCE-FREE mode: expensive answer omitted from pair")
    import numpy as np
    import torch
    from datasets import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        DataCollatorWithPadding,
        Trainer,
        TrainingArguments,
    )

    device = auto_detect_device(args.device)
    print(f"[train_local] device={device}")

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    print(f"[train_local] loading triples from {args.data} ...")
    triples = load_jsonl_streaming(args.data, max_rows=args.max_rows)
    print(f"[train_local] loaded {len(triples)} triples.")

    train_rows, val_rows, test_rows = assign_splits(triples, seed=args.seed)
    print(
        f"[train_local] split sizes: train={len(train_rows)} "
        f"val={len(val_rows)} test={len(test_rows)}"
    )
    if not train_rows or not val_rows or not test_rows:
        raise RuntimeError("One of train/val/test is empty after splitting.")

    print(f"[train_local] loading tokenizer + model: {args.model_name}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(args.model_name, num_labels=2)

    print("[train_local] tokenizing splits ...")
    train_ds = Dataset.from_list(_tokenize_triples(train_rows, tokenizer, args.max_length))
    val_ds = Dataset.from_list(_tokenize_triples(val_rows, tokenizer, args.max_length))
    test_ds = Dataset.from_list(_tokenize_triples(test_rows, tokenizer, args.max_length))

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    compute_metrics = _compute_metrics_factory()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = output_dir / "checkpoints"

    training_args = TrainingArguments(
        output_dir=str(checkpoint_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=max(args.batch_size * 2, args.batch_size),
        gradient_accumulation_steps=2,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        warmup_ratio=0.1,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="auroc",
        greater_is_better=True,
        fp16=(device == "cuda"),
        logging_steps=10,
        report_to=[],
        seed=args.seed,
        # NaN/Inf guard: clip gradients aggressively. The classifier head is
        # randomly initialized on top of pretrained DeBERTa; without clipping,
        # the first few steps can produce divergent gradients on MPS.
        max_grad_norm=1.0,
        # Force fp32 on MPS — DeBERTa's disentangled attention occasionally
        # overflows in fp16 / bf16 on the metal backend.
        bf16=False,
    )

    # transformers 5.x renamed `tokenizer` -> `processing_class`. Try the new
    # API first; fall back for older installs.
    try:
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_ds,
            eval_dataset=val_ds,
            processing_class=tokenizer,
            data_collator=data_collator,
            compute_metrics=compute_metrics,
        )
    except TypeError:
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=train_ds,
            eval_dataset=val_ds,
            tokenizer=tokenizer,
            data_collator=data_collator,
            compute_metrics=compute_metrics,
        )

    trainer.train()

    print("[train_local] evaluating on test split ...")
    test_metrics = trainer.evaluate(eval_dataset=test_ds)
    for k, v in test_metrics.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        else:
            print(f"  {k}: {v}")

    import math
    auroc = test_metrics.get("eval_auroc", float("nan"))
    auroc_is_nan = isinstance(auroc, float) and math.isnan(auroc)
    if auroc_is_nan:
        print(
            "\n!!! ERROR: AUROC is NaN — training diverged. "
            "DO NOT DEPLOY. Check for NaN loss, gradient explosion, or label imbalance.\n"
        )
    elif auroc < PRODUCTION_AUROC_GATE:
        print(
            f"\n!!! WARNING: AUROC {auroc:.4f} below the {PRODUCTION_AUROC_GATE} production gate. "
            "DO NOT DEPLOY this checkpoint. Saving for inspection only.\n"
        )
    else:
        print(f"\n[train_local] AUROC {auroc:.4f} clears the {PRODUCTION_AUROC_GATE} production gate.")

    best_dir = output_dir / "best"
    trainer.save_model(str(best_dir))
    tokenizer.save_pretrained(str(best_dir))
    print(f"[train_local] best checkpoint saved to {best_dir}")

    quantized_path: Path | None = None
    if args.quantize:
        print("[train_local] quantizing to INT8 for CPU inference ...")
        # Force the qnnpack engine on macOS (default is fbgemm which lacks
        # quantized::linear_prepack registration in some PyTorch builds).
        # qnnpack works on x86 and ARM both.
        try:
            torch.backends.quantized.engine = "qnnpack"
        except Exception as e:  # noqa: BLE001
            print(f"[train_local] WARNING: could not set qnnpack engine: {e}")
        cpu_model = AutoModelForSequenceClassification.from_pretrained(str(best_dir)).to("cpu").eval()
        try:
            quantized = torch.quantization.quantize_dynamic(
                cpu_model, {torch.nn.Linear}, dtype=torch.qint8
            )
            quantized_path = output_dir / "verifier_int8.pt"
            torch.save(quantized.state_dict(), str(quantized_path))
            print(f"[train_local] quantized weights saved to {quantized_path}")
            latency_p50_ms = _benchmark_cpu_latency(quantized, tokenizer, args.max_length)
        except RuntimeError as e:
            print(f"[train_local] WARNING: dynamic quantization failed ({e}); skipping. Use the fp32 best/ checkpoint.")
            latency_p50_ms = _benchmark_cpu_latency(cpu_model, tokenizer, args.max_length)
    else:
        # Bench unquantized on CPU for comparability.
        cpu_model = AutoModelForSequenceClassification.from_pretrained(str(best_dir)).to("cpu").eval()
        latency_p50_ms = _benchmark_cpu_latency(cpu_model, tokenizer, args.max_length)

    summary = {
        "auroc": float(test_metrics.get("eval_auroc", float("nan"))),
        "precision": float(test_metrics.get("eval_precision", float("nan"))),
        "recall": float(test_metrics.get("eval_recall", float("nan"))),
        "f1": float(test_metrics.get("eval_f1", float("nan"))),
        "latency_p50_ms": float(latency_p50_ms),
        "checkpoint_path": str(best_dir),
        "quantized_path": str(quantized_path) if quantized_path else None,
        "device": device,
    }

    print("\n[train_local] === final summary ===")
    for k, v in summary.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        else:
            print(f"  {k}: {v}")

    return summary


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        train(args)
    except Exception as exc:  # noqa: BLE001  surface in CLI
        print(f"[train_local] ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
