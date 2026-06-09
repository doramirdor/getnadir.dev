"""Real-data smoke test for a trained verifier checkpoint.

Run this immediately after dropping verifier_int8.pt (or an unquantized
checkpoint directory) into verifier/weights/. It:

  1. Loads the trained verifier
  2. Pulls 10 sample triples from verifier_training_corpus (Supabase)
  3. Runs each through the verifier
  4. Prints (prompt, cheap_score, label_in_dataset, verifier_score) per row
  5. Computes simple agreement: when verifier_score >= 0.5 vs dataset label

This is NOT a full eval (no AUROC, no held-out test split). It's a 2-minute
confidence check that the checkpoint is wired up correctly, produces
sensible scores, and agrees with the training labels on a tiny sample.

For full eval, see verifier/eval.py (when the eval harness is built).

Usage:
  python verifier/verifier_smoke.py
  python verifier/verifier_smoke.py --weights verifier/weights/best --n 25
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-check a trained verifier checkpoint against real triples."
    )
    parser.add_argument(
        "--weights",
        type=str,
        default="verifier/weights/best",
        help="Path to a checkpoint directory (must have config.json + model weights).",
    )
    parser.add_argument(
        "--n",
        type=int,
        default=10,
        help="Number of triples to pull from Supabase (default 10, max 50).",
    )
    parser.add_argument(
        "--label-source",
        type=str,
        default="routerbench_0shot",
        help="Filter triples by label_source. Default is RouterBench.",
    )
    parser.add_argument(
        "--max-length", type=int, default=512, help="Tokenizer max length."
    )
    args = parser.parse_args(argv)

    if args.n > 50:
        print("ERROR: --n capped at 50 to keep this quick.", file=sys.stderr)
        return 1

    ckpt = Path(args.weights)
    if not ckpt.exists():
        print(f"ERROR: checkpoint not found: {ckpt}", file=sys.stderr)
        return 1

    # Load env / Supabase.
    from dotenv import load_dotenv
    backend_env = Path(__file__).resolve().parent.parent / "backend" / ".env"
    if backend_env.exists():
        load_dotenv(backend_env)
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.",
            file=sys.stderr,
        )
        return 1

    from supabase import create_client
    sb = create_client(url, key)

    # Pull n triples.
    print(f"[smoke] pulling {args.n} triples (label_source={args.label_source}) ...")
    r = (
        sb.table("verifier_training_corpus")
        .select("id,prompt,cheap_answer,expensive_answer,label,label_confidence,domain_hint")
        .eq("label_source", args.label_source)
        .not_.is_("label", "null")
        .limit(args.n)
        .execute()
    )
    rows = r.data or []
    if not rows:
        print("ERROR: no triples found.", file=sys.stderr)
        return 1
    print(f"[smoke] fetched {len(rows)} rows.")

    # Load model on CPU.
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print(f"[smoke] loading verifier from {ckpt} ...")
    tokenizer = AutoTokenizer.from_pretrained(str(ckpt))
    model = AutoModelForSequenceClassification.from_pretrained(str(ckpt)).to("cpu").eval()
    print(f"[smoke] verifier loaded ({sum(p.numel() for p in model.parameters()) / 1e6:.1f}M params).")

    # Score each triple.
    print()
    print(f"{'#':>2}  {'label':>5}  {'score':>5}  {'agree':>5}  prompt")
    print("-" * 80)
    agree = 0
    for i, row in enumerate(rows, start=1):
        inputs = tokenizer(
            text=row["prompt"],
            text_pair=f"CHEAP:\n{row['cheap_answer']}\n\nEXPENSIVE:\n{row['expensive_answer']}",
            truncation=True,
            max_length=args.max_length,
            return_tensors="pt",
        )
        with torch.no_grad():
            logits = model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1)
            # Class 1 = "acceptable" (cheap is good enough).
            verifier_score = float(probs[1].item())
        verifier_label = 1 if verifier_score >= 0.5 else 0
        gold_label = int(row["label"])
        matches = verifier_label == gold_label
        agree += int(matches)
        prompt_short = (row["prompt"] or "").replace("\n", " ")[:55]
        print(
            f"{i:>2}  {gold_label:>5}  {verifier_score:.3f}  {'OK' if matches else 'NO':>5}  {prompt_short!r}"
        )

    print()
    print(f"[smoke] agreement: {agree}/{len(rows)} ({100 * agree / len(rows):.1f}%)")
    if agree / len(rows) >= 0.7:
        print("[smoke] PASS: verifier agrees with training labels on a healthy fraction.")
        return 0
    print("[smoke] WARN: low agreement. Check training metrics and threshold.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
