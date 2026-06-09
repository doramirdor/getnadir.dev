"""Standalone post-training quantizer for the verifier checkpoint.

Use this when:
  - Colab's quantization step failed (sometimes happens with fbgemm vs qnnpack
    engine mismatch on macOS / different CPUs).
  - You want to re-quantize an existing fp32 checkpoint at a different
    bitwidth or against a different backend.

Inputs:
  - Path to an unquantized DeBERTa-v3-small checkpoint directory (containing
    config.json + model.safetensors or pytorch_model.bin produced by
    `verifier/train_local.py` or `verifier/colab_train.ipynb`).

Outputs:
  - `verifier_int8.pt` (state_dict only) in the same directory.
  - Latency benchmark printed to stdout.

The script forces the qnnpack engine first, falls back to fbgemm if qnnpack
is unregistered. Documents in the output JSON which engine was used.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


def _bench_latency(model, tokenizer, max_length: int, n: int = 50) -> float:
    """Return p50 latency in ms for batch-1 inference on CPU."""
    import torch
    sample = tokenizer(
        text="What is the capital of France?",
        text_pair="CHEAP:\nParis.\n\nEXPENSIVE:\nParis is the capital of France.",
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )
    # Warmup.
    for _ in range(3):
        with torch.no_grad():
            model(**sample)
    times: list[float] = []
    for _ in range(n):
        t0 = time.perf_counter()
        with torch.no_grad():
            model(**sample)
        times.append((time.perf_counter() - t0) * 1000)
    times.sort()
    return times[len(times) // 2]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Post-training INT8 dynamic quantizer for the verifier checkpoint."
    )
    parser.add_argument(
        "checkpoint",
        type=str,
        help="Path to an unquantized checkpoint directory (e.g. verifier/weights/best).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Where to write verifier_int8.pt (default: <checkpoint>/../verifier_int8.pt).",
    )
    parser.add_argument(
        "--max-length", type=int, default=512, help="Max sequence length for benchmark."
    )
    parser.add_argument(
        "--engine",
        choices=["qnnpack", "fbgemm", "auto"],
        default="auto",
        help="Quantization engine. auto = try qnnpack, fall back to fbgemm.",
    )
    args = parser.parse_args(argv)

    ckpt = Path(args.checkpoint)
    if not ckpt.exists():
        print(f"ERROR: checkpoint not found: {ckpt}", file=sys.stderr)
        return 1

    out_path = Path(args.output) if args.output else ckpt.parent / "verifier_int8.pt"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    # Engine selection.
    engines_to_try: list[str] = []
    if args.engine == "auto":
        engines_to_try = ["qnnpack", "fbgemm"]
    else:
        engines_to_try = [args.engine]

    last_err: Exception | None = None
    engine_used: str | None = None
    quantized = None
    for engine in engines_to_try:
        try:
            torch.backends.quantized.engine = engine
            print(f"[quantize_post] trying engine={engine}")
            cpu_model = AutoModelForSequenceClassification.from_pretrained(
                str(ckpt)
            ).to("cpu").eval()
            quantized = torch.quantization.quantize_dynamic(
                cpu_model, {torch.nn.Linear}, dtype=torch.qint8
            )
            engine_used = engine
            print(f"[quantize_post] quantization succeeded with engine={engine}")
            break
        except RuntimeError as e:
            last_err = e
            print(f"[quantize_post] engine={engine} failed: {e}")

    if quantized is None:
        print(
            f"ERROR: all quantization engines failed; last error: {last_err}",
            file=sys.stderr,
        )
        return 2

    torch.save(quantized.state_dict(), str(out_path))
    print(f"[quantize_post] wrote {out_path} ({out_path.stat().st_size / 1e6:.1f} MB)")

    # Benchmark.
    try:
        tokenizer = AutoTokenizer.from_pretrained(str(ckpt))
        latency_p50_ms = _bench_latency(quantized, tokenizer, args.max_length)
        print(f"[quantize_post] CPU inference latency p50: {latency_p50_ms:.1f} ms")
    except Exception as e:  # noqa: BLE001
        print(f"[quantize_post] benchmark skipped: {e}")
        latency_p50_ms = None

    summary = {
        "checkpoint": str(ckpt),
        "output": str(out_path),
        "engine_used": engine_used,
        "max_length": args.max_length,
        "latency_p50_ms": latency_p50_ms,
        "size_mb": out_path.stat().st_size / 1e6,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
