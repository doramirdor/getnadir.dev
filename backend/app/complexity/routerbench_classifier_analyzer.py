"""RouterBench-distilled pre-generation classifier.

Replacement for the broken `wide_deep_asym_v3.pt` checkpoint, trained
on the same cross-family RouterBench triples the verifier saw so it
does not suffer the distribution-shift collapse that breaks
wide_deep_asym on benchmark-style prompts.

Output: binary {cheap, expensive} prediction with calibrated probability,
plus a 3-tier projection for backwards compatibility with the existing
analyzer interface. Calibration is Platt-scaled out of LogisticRegression
at training time; we do not re-calibrate at inference.

The 3-tier projection is intentionally conservative: high-confidence
"cheap" → simple, high-confidence "expensive" → complex, anything else
→ medium. This keeps the existing tier-to-model mapping intact while
letting the cascade router use the binary prediction directly when it
wants raw access (see `predict_binary`).

Production wiring: this analyzer is opt-in via
``COMPLEXITY_ANALYZER_TYPE=routerbench_v2`` or by passing
``analyzer_type="routerbench_v2"`` to the factory. Default routing is
unchanged.
"""
from __future__ import annotations

import logging
import os
import pickle
import time
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)


_PKG_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _PKG_DIR.parent.parent.parent
_DEFAULT_ARTIFACT = _REPO_ROOT / "verifier" / "weights" / "router_v2.pkl"


# Confidence threshold at which the classifier's accuracy on held-out
# RouterBench reaches 99%. Below this, the cascade router falls through
# to the verifier instead of trusting the classifier directly. Calibrated
# on the test split during training; re-derive after each retrain.
HIGH_CONFIDENCE_THRESHOLD: float = 0.90


_TIER_NUM = {"simple": 1, "medium": 2, "complex": 3}


class RouterBenchClassifierAnalyzer:
    """BGE + struct → LR classifier trained on RouterBench triples.

    Parameters
    ----------
    artifact_path:
        Path to the pickle written by ``verifier/train_routerbench_classifier.py``.
        Falls back to ``verifier/weights/router_v2.pkl`` at the repo root.
    high_confidence_threshold:
        Predictions with ``max(p, 1-p) >= this`` are flagged
        ``high_confidence=True`` in the analyze output so the cascade
        router can choose to skip the verifier on them.
    """

    ANALYZER_VERSION = "routerbench_v2"

    def __init__(
        self,
        artifact_path: Optional[str] = None,
        high_confidence_threshold: float = HIGH_CONFIDENCE_THRESHOLD,
    ) -> None:
        path = Path(artifact_path) if artifact_path else _DEFAULT_ARTIFACT
        if not path.exists():
            raise FileNotFoundError(
                f"RouterBench classifier artifact not found at {path}. "
                f"Run `python verifier/train_routerbench_classifier.py` first."
            )
        with path.open("rb") as f:
            artifact: Dict[str, Any] = pickle.load(f)
        self._model = artifact["model"]
        self._encoder_name: str = artifact.get("encoder_name", "BAAI/bge-base-en-v1.5")
        self._struct_dim: int = int(artifact.get("struct_dim", 33))
        self._emb_dim: int = int(artifact.get("emb_dim", 768))
        self._metrics: Dict[str, Any] = artifact.get("metrics", {})
        self.high_confidence_threshold: float = float(high_confidence_threshold)
        self._encoder: Any = None
        self._extractor: Any = None
        logger.info(
            "RouterBenchClassifierAnalyzer loaded (artifact=%s, test_auroc=%.3f, "
            "high_conf_threshold=%.2f)",
            path,
            float(self._metrics.get("test", {}).get("auroc", 0.0)),
            self.high_confidence_threshold,
        )

    # ------------------------------------------------------------------
    # Lazy heavy imports
    # ------------------------------------------------------------------

    def _get_encoder(self) -> Any:
        if self._encoder is None:
            from sentence_transformers import SentenceTransformer
            self._encoder = SentenceTransformer(self._encoder_name, device="cpu")
        return self._encoder

    def _get_extractor(self) -> Any:
        if self._extractor is None:
            from app.complexity.structural_features import StructuralFeatureExtractor
            self._extractor = StructuralFeatureExtractor()
        return self._extractor

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def predict_binary(self, prompt: str) -> Dict[str, Any]:
        """Return {p_cheap_acceptable, predicted_class, confidence, ...}.

        This is the raw classifier interface. ``predicted_class`` is one
        of {"cheap", "expensive"} and ``high_confidence`` flags whether
        the cascade router should trust the prediction without
        consulting the verifier.
        """
        t0 = time.time()
        emb = self._get_encoder().encode(
            [prompt or ""],
            show_progress_bar=False,
            normalize_embeddings=True,
            device="cpu",
        )
        emb = np.asarray(emb, dtype=np.float32)
        struct_vec = np.asarray(
            self._get_extractor().extract_vector([{"role": "user", "content": prompt or ""}]),
            dtype=np.float32,
        ).reshape(1, -1)
        if struct_vec.shape[1] != self._struct_dim:
            raise ValueError(
                f"Structural feature vector has dim {struct_vec.shape[1]}, "
                f"model expects {self._struct_dim}"
            )
        x = np.concatenate([emb, struct_vec], axis=1)
        proba = self._model.predict_proba(x)[0]
        p_cheap = float(proba[1])  # class 1 = cheap is acceptable
        predicted_class = "cheap" if p_cheap >= 0.5 else "expensive"
        confidence = float(max(p_cheap, 1.0 - p_cheap))
        return {
            "p_cheap_acceptable": p_cheap,
            "predicted_class": predicted_class,
            "confidence": confidence,
            "high_confidence": confidence >= self.high_confidence_threshold,
            "latency_ms": int((time.time() - t0) * 1000),
        }

    def classify(self, prompt: str, system_prompt: str = "") -> tuple[str, float, Dict[str, Any]]:
        """Tier-shaped wrapper, mirrors WideDeepAsymAnalyzer.classify."""
        raw = self.predict_binary(prompt)
        p_cheap = raw["p_cheap_acceptable"]
        # Three-way projection: only commit to simple / complex when the
        # binary prediction is high-confidence; otherwise route through
        # the safer "medium" tier and let the verifier cascade adjust.
        if raw["high_confidence"]:
            tier = "simple" if p_cheap >= 0.5 else "complex"
        else:
            tier = "medium"
        info = {
            "tier_probabilities": {
                "simple": p_cheap if raw["high_confidence"] and tier == "simple" else 0.0,
                "medium": 0.0 if raw["high_confidence"] else 1.0,
                "complex": (1.0 - p_cheap) if raw["high_confidence"] and tier == "complex" else 0.0,
            },
            "p_cheap_acceptable": p_cheap,
            "binary_prediction": raw["predicted_class"],
            "binary_confidence": raw["confidence"],
            "high_confidence": raw["high_confidence"],
            "high_confidence_threshold": self.high_confidence_threshold,
            "classify_ms": raw["latency_ms"],
            "analyzer_version": self.ANALYZER_VERSION,
        }
        return tier, raw["confidence"], info

    async def analyze(
        self, text: str = "", system_message: str = "", **kwargs
    ) -> Dict[str, Any]:
        tier, confidence, meta = self.classify(text, system_prompt=system_message)
        return {
            "recommended_model": None,
            "recommended_provider": None,
            "confidence": confidence,
            "complexity_score": 1.0 - meta["p_cheap_acceptable"],
            "tier": _TIER_NUM[tier],
            "tier_name": tier,
            "complexity_tier": _TIER_NUM[tier],
            "complexity_name": tier,
            "reasoning": (
                f"RouterBenchClassifier v2: p_cheap={meta['p_cheap_acceptable']:.3f}, "
                f"confidence={confidence:.2f}, tier={tier}"
                + (" [high_confidence]" if meta["high_confidence"] else " [low_confidence, defer to verifier]")
            ),
            "ranked_models": [],
            "analyzer_latency_ms": meta["classify_ms"],
            "analyzer_type": self.ANALYZER_VERSION,
            "selection_method": "routerbench_v2",
            "model_type": "routerbench_classifier_analyzer",
            "tier_probabilities": meta["tier_probabilities"],
            "binary_prediction": meta["binary_prediction"],
            "high_confidence": meta["high_confidence"],
            **{k: v for k, v in meta.items() if k not in ("tier_probabilities",)},
        }


_singleton: Optional[RouterBenchClassifierAnalyzer] = None


def get_routerbench_classifier(
    artifact_path: Optional[str] = None,
) -> RouterBenchClassifierAnalyzer:
    """Singleton getter. The model is small (~10kB) but the encoder lazy-loads
    on first inference so import cost stays low.
    """
    global _singleton
    if _singleton is None:
        _singleton = RouterBenchClassifierAnalyzer(artifact_path=artifact_path)
    return _singleton
