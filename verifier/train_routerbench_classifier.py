"""Train a pre-generation router classifier on RouterBench triples.

This trains the replacement for the broken `wide_deep_asym_v3.pt`
checkpoint shipped in production. The broken checkpoint had its
simple-class logit globally suppressed during training (asym loss with
λ=3) and now reports per-class F1 = {simple: 0.0, medium: 0.54,
complex: 0.60} on its own validation set. On RouterBench it collapses
to always-expensive.

This script trains a fresh classifier on the same data the verifier
was trained on (RouterBench cross-family triples), eliminating the
distribution-shift problem that breaks the production classifier on
benchmark-style traffic. Binary task: predict label ∈ {0, 1} where
label==1 means the cheap model's response is acceptable.

Features per prompt:
    BGE-base-en-v1.5 embedding (768-dim)
    StructuralFeatureExtractor vector (33-dim)
    → 801-dim concatenation → logistic regression

Why LR and not an MLP: the verifier already does the heavy lifting
post-generation. The pre-generation router only needs to be calibrated
enough that high-confidence "cheap" predictions can skip the verifier
to save 180ms per request. LR gives calibrated probabilities out of the
box (Platt scaling at sklearn defaults), trains in seconds on CPU, and
ships as a single tiny pickle. If we want more capacity later, the
training data and feature pipeline transfer to any classifier.

Usage:
    python verifier/train_routerbench_classifier.py
    python verifier/train_routerbench_classifier.py --limit 5000
    python verifier/train_routerbench_classifier.py --output verifier/weights/router_v2.pkl
"""
from __future__ import annotations

import argparse
import json
import pickle
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRIPLES = REPO_ROOT / "verifier" / "data" / "routerbench_triples.jsonl"
DEFAULT_OUTPUT = REPO_ROOT / "verifier" / "weights" / "router_v2.pkl"
DEFAULT_EMB_CACHE = REPO_ROOT / "verifier" / "weights" / "router_v2_embeddings.npz"


# We need to add backend to sys.path so we can reuse the production
# StructuralFeatureExtractor and the BGE encoder loader.
sys.path.insert(0, str(REPO_ROOT / "backend"))


# Importing StructuralFeatureExtractor transitively pulls in
# app.complexity.__init__ → gemini_analyzer → settings, which validates
# SUPABASE_URL etc. When this script runs from the repo root rather
# than backend/, those env vars are unset. Load backend/.env up front
# so settings validates cleanly without disturbing live env.
def _load_backend_env() -> None:
    backend_env = REPO_ROOT / "backend" / ".env"
    if not backend_env.exists():
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(backend_env, override=False)
    except ImportError:
        import os as _os
        for line in backend_env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            _os.environ.setdefault(key.strip(), val.strip().strip("'\""))


_load_backend_env()


def load_triples(path: Path, split: str, limit: int | None) -> list[dict]:
    rows: list[dict] = []
    with path.open() as f:
        for line in f:
            t = json.loads(line)
            if t.get("split") != split:
                continue
            rows.append(t)
            if limit is not None and len(rows) >= limit:
                break
    return rows


def encode_features(
    triples: list[dict],
    encoder: Any,
    extractor: Any,
    batch_size: int = 32,
    verbose: bool = True,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (X, y) where X is [n, 801] features and y is [n] binary labels."""
    n = len(triples)
    prompts = [t["prompt"] for t in triples]
    labels = np.array([int(t["label"]) for t in triples], dtype=np.int64)

    t0 = time.time()
    embeddings: list[np.ndarray] = []
    for start in range(0, n, batch_size):
        batch = prompts[start : start + batch_size]
        embs = encoder.encode(
            batch,
            show_progress_bar=False,
            normalize_embeddings=True,
            device="cpu",
        )
        embeddings.append(np.asarray(embs, dtype=np.float32))
        if verbose and start % (batch_size * 25) == 0:
            elapsed = time.time() - t0
            rate = (start + batch_size) / max(elapsed, 1e-9)
            eta = (n - start) / max(rate, 1e-9)
            print(
                f"[encode]   {start + len(batch)}/{n} ({rate:.1f}/s, eta {eta:.0f}s)",
                flush=True,
            )
    emb_arr = np.concatenate(embeddings, axis=0)

    struct_arr = np.zeros((n, 33), dtype=np.float32)
    for i, p in enumerate(prompts):
        sv = extractor.extract_vector([{"role": "user", "content": p}])
        struct_arr[i] = np.asarray(sv, dtype=np.float32)

    # Concatenate. Embeddings are already L2-normalised; struct features
    # are arbitrary scale and will be standardised by LR's solver.
    X = np.concatenate([emb_arr, struct_arr], axis=1)
    return X, labels


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Train RouterBench-distilled pre-generation classifier."
    )
    parser.add_argument("--triples", type=str, default=str(DEFAULT_TRIPLES))
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap training-set size. Default: all train-split triples.",
    )
    parser.add_argument(
        "--test-limit",
        type=int,
        default=2000,
        help="Cap test-set size (default 2000 for fast evaluation).",
    )
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT))
    parser.add_argument(
        "--emb-cache",
        type=str,
        default=str(DEFAULT_EMB_CACHE),
        help="Reuse precomputed embeddings if this file exists; write to it otherwise.",
    )
    parser.add_argument("--C", type=float, default=1.0, help="LR inverse-regularisation strength.")
    parser.add_argument(
        "--class-weight", type=str, default=None,
        help="Pass 'balanced' for inverse-frequency weighting; default None matches the natural marginal.",
    )
    parser.add_argument(
        "--model-type", type=str, default="mlp", choices=("lr", "mlp"),
        help="lr = LogisticRegression (fast, capped at ~0.65 AUROC); "
             "mlp = MLPClassifier with isotonic calibration (slower, AUROC headroom).",
    )
    parser.add_argument(
        "--mlp-hidden", type=str, default="256,128",
        help="Comma-separated hidden layer widths. Default 256,128.",
    )
    parser.add_argument(
        "--calibrate", action="store_true", default=True,
        help="Apply isotonic calibration via 5-fold CV (default on for MLP). "
             "Critical for the composed_v2 shortcut: spreads probabilities so "
             "the high-confidence threshold picks a meaningful population.",
    )
    parser.add_argument("--no-calibrate", dest="calibrate", action="store_false")
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args(argv)

    triples_path = Path(args.triples)
    if not triples_path.exists():
        print(f"ERROR: triples not found at {triples_path}", file=sys.stderr)
        return 1

    print("[train] loading triples ...")
    train_triples = load_triples(triples_path, "train", args.limit)
    test_triples = load_triples(triples_path, "test", args.test_limit)
    print(f"[train] train n={len(train_triples)}  test n={len(test_triples)}")
    if not train_triples:
        print("ERROR: no train triples found.", file=sys.stderr)
        return 1

    # Lazy imports so --help is fast and so any sklearn/torch hiccups
    # show up here rather than at module import time.
    print("[train] loading BGE encoder + structural extractor ...")
    from sentence_transformers import SentenceTransformer
    from app.complexity.structural_features import StructuralFeatureExtractor
    from sklearn.linear_model import LogisticRegression
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.metrics import (
        accuracy_score,
        f1_score,
        roc_auc_score,
        log_loss,
    )

    encoder = SentenceTransformer("BAAI/bge-base-en-v1.5", device="cpu")
    extractor = StructuralFeatureExtractor()

    emb_cache_path = Path(args.emb_cache)
    cache_hit = False
    if emb_cache_path.exists():
        try:
            cached = np.load(emb_cache_path, allow_pickle=False)
            if (
                cached["X_train"].shape[0] == len(train_triples)
                and cached["X_test"].shape[0] == len(test_triples)
            ):
                X_train = cached["X_train"]
                y_train = cached["y_train"]
                X_test = cached["X_test"]
                y_test = cached["y_test"]
                cache_hit = True
                print(f"[train] reused embedding cache at {emb_cache_path}")
        except Exception as e:  # noqa: BLE001
            print(f"[train] cache load failed ({e}); recomputing")

    if not cache_hit:
        print("[train] encoding train features ...")
        X_train, y_train = encode_features(train_triples, encoder, extractor, args.batch_size)
        print("[train] encoding test features ...")
        X_test, y_test = encode_features(test_triples, encoder, extractor, args.batch_size)
        emb_cache_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            emb_cache_path,
            X_train=X_train, y_train=y_train,
            X_test=X_test, y_test=y_test,
        )
        print(f"[train] cached embeddings to {emb_cache_path}")

    print(
        f"[train] X_train.shape={X_train.shape}  X_test.shape={X_test.shape}  "
        f"train_pos_rate={y_train.mean():.3f}  test_pos_rate={y_test.mean():.3f}"
    )

    cw = None if args.class_weight in (None, "", "none") else args.class_weight
    if args.model_type == "mlp":
        # MLP on (BGE 768 + struct 33) = 801-dim input. Two-layer with
        # batch-of-200, early stopping, isotonic calibration on a 10%
        # validation split. This is the configuration that makes
        # composed_v2 actually pay off in production: the LR baseline
        # caps AUROC near 0.62-0.65 even on 89k samples because the
        # decision surface in BGE-space is non-linear, and we need
        # well-calibrated probabilities (not just argmax accuracy) to
        # cross the high-confidence threshold often enough that the
        # cascade short-circuit actually fires.
        print(f"[train] fitting MLPClassifier hidden={args.mlp_hidden} class_weight={cw or 'None'} ...")
        t0 = time.time()
        hidden = tuple(int(x) for x in args.mlp_hidden.split(","))
        base = Pipeline([
            ("scale", StandardScaler(with_mean=True, with_std=True)),
            ("mlp", MLPClassifier(
                hidden_layer_sizes=hidden,
                activation="relu",
                solver="adam",
                learning_rate_init=1e-3,
                alpha=1e-4,
                batch_size=min(200, len(X_train) // 4 or 32),
                max_iter=80,
                early_stopping=True,
                validation_fraction=0.1,
                n_iter_no_change=8,
                random_state=42,
            )),
        ])
        if args.calibrate:
            # Isotonic calibration via 5-fold CV. Spreads predicted
            # probabilities so high-confidence threshold actually picks
            # the population we want.
            model = CalibratedClassifierCV(base, method="isotonic", cv=5)
        else:
            model = base
        model.fit(X_train, y_train)
    else:
        print(f"[train] fitting LogisticRegression (C={args.C}, class_weight={cw or 'None'}) ...")
        t0 = time.time()
        model = LogisticRegression(
            C=args.C, max_iter=1000, solver="lbfgs", class_weight=cw
        )
        model.fit(X_train, y_train)
    train_time = time.time() - t0
    print(f"[train] fit done in {train_time:.1f}s")

    p_train = model.predict_proba(X_train)[:, 1]
    p_test = model.predict_proba(X_test)[:, 1]
    yhat_train = (p_train >= 0.5).astype(np.int64)
    yhat_test = (p_test >= 0.5).astype(np.int64)

    metrics = {
        "train": {
            "n": int(len(y_train)),
            "pos_rate": float(y_train.mean()),
            "accuracy": float(accuracy_score(y_train, yhat_train)),
            "f1": float(f1_score(y_train, yhat_train)),
            "auroc": float(roc_auc_score(y_train, p_train)),
            "log_loss": float(log_loss(y_train, p_train, labels=[0, 1])),
        },
        "test": {
            "n": int(len(y_test)),
            "pos_rate": float(y_test.mean()),
            "accuracy": float(accuracy_score(y_test, yhat_test)),
            "f1": float(f1_score(y_test, yhat_test)),
            "auroc": float(roc_auc_score(y_test, p_test)),
            "log_loss": float(log_loss(y_test, p_test, labels=[0, 1])),
        },
        "config": {
            "C": args.C,
            "limit": args.limit,
            "test_limit": args.test_limit,
            "n_features": int(X_train.shape[1]),
        },
    }

    print()
    print("=" * 64)
    print("RouterBench pre-generation classifier — training report")
    print("=" * 64)
    for split, m in (("train", metrics["train"]), ("test", metrics["test"])):
        print(
            f"{split:<5}  n={m['n']:>6}  acc={m['accuracy']:.3f}  "
            f"f1={m['f1']:.3f}  auroc={m['auroc']:.3f}  logloss={m['log_loss']:.3f}"
        )
    print()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": model,
        "encoder_name": "BAAI/bge-base-en-v1.5",
        "struct_dim": 33,
        "emb_dim": 768,
        "metrics": metrics,
        "version": "router_v2",
    }
    with output_path.open("wb") as f:
        pickle.dump(artifact, f)
    print(f"[train] wrote artifact to {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
