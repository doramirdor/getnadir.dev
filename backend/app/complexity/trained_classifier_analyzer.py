"""Trained classifier analyzer — ported from NadirClaw.

GradientBoosting on 384-dim sentence embeddings + 33 structural features = 417 dims.
96% accuracy, ~5ms inference. Uses the same model artifact as NadirClaw.
"""

import logging
import os
import pickle
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.complexity.structural_features import StructuralFeatureExtractor

logger = logging.getLogger(__name__)

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH = os.path.join(_PKG_DIR, "trained_model.pkl")
_TIER_MAP = {0: "simple", 1: "medium", 2: "complex"}

# Singleton instances
_classifier_instance = None
_encoder = None
_extractor = None


def _get_encoder():
    """Lazily load shared SentenceTransformer encoder."""
    global _encoder
    if _encoder is None:
        t0 = time.time()
        logger.info("Loading SentenceTransformer encoder: all-MiniLM-L6-v2")
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        from sentence_transformers import SentenceTransformer
        _encoder = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("SentenceTransformer loaded (%dms)", int((time.time() - t0) * 1000))
    return _encoder


def _get_extractor():
    """Get shared structural feature extractor."""
    global _extractor
    if _extractor is None:
        _extractor = StructuralFeatureExtractor()
    return _extractor


class TrainedClassifierAnalyzer:
    """Supervised 3-class complexity analyzer using sklearn GradientBoosting.

    Combines sentence embeddings (all-MiniLM-L6-v2, 384-dim) with
    33 structural features for 96%+ accuracy ternary classification.

    Implements the Horizen analyzer interface (async analyze()).
    """

    CLASSIFIER_VERSION = "2.0"

    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        model_path: Optional[str] = None,
    ):
        self.allowed_providers = allowed_providers
        self.allowed_models = allowed_models

        path = model_path or _MODEL_PATH
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Trained model not found at {path}. "
                "Copy trained_model.pkl from NadirClaw."
            )

        with open(path, "rb") as f:
            artifact = pickle.load(f)

        self._model = artifact["model"]
        self._version = artifact.get("version", "unknown")
        self._accuracy = artifact.get("accuracy", 0)
        self._n_samples = artifact.get("n_samples", 0)

        logger.info(
            "TrainedClassifierAnalyzer v%s loaded (accuracy=%.1f%%, samples=%d)",
            self._version, self._accuracy * 100, self._n_samples,
        )

    def classify(self, prompt: str, system_prompt: str = "") -> Tuple[str, float, Dict[str, Any]]:
        """Classify a prompt as simple/medium/complex.

        Returns (tier_name, confidence, metadata).
        """
        start = time.time()
        encoder = _get_encoder()
        extractor = _get_extractor()

        # Embedding — include system prompt for richer context
        if system_prompt:
            embed_text = f"{system_prompt[:500]} | {prompt}"
        else:
            embed_text = prompt

        emb = encoder.encode([embed_text], show_progress_bar=False, normalize_embeddings=True)

        # Structural features
        messages = [{"role": "user", "content": prompt}]
        struct_vec = extractor.extract_vector(messages, system_prompt=system_prompt)

        # Combine and predict
        X = np.hstack([emb, np.array([struct_vec], dtype=np.float32)])
        probs = self._model.predict_proba(X)[0]
        pred_idx = int(np.argmax(probs))
        tier = _TIER_MAP[pred_idx]
        confidence = float(probs[pred_idx])
        escalated = False

        # Safety escalation: if "simple" but low confidence, bump up
        if tier == "simple" and confidence < 0.70:
            if probs[2] >= probs[1]:
                tier, confidence = "complex", float(probs[2])
            else:
                tier, confidence = "medium", float(probs[1])
            escalated = True

        classify_ms = int((time.time() - start) * 1000)

        metadata = {
            "tier_probabilities": {
                "simple": float(probs[0]),
                "medium": float(probs[1]),
                "complex": float(probs[2]),
            },
            "confidence_escalated": escalated,
            "stage1_tier": _TIER_MAP[pred_idx],
            "stage1_confidence": float(probs[pred_idx]),
            "classify_ms": classify_ms,
            "classifier_version": self.CLASSIFIER_VERSION,
        }

        return tier, confidence, metadata

    async def analyze(self, text: str = "", system_message: str = "", **kwargs) -> Dict[str, Any]:
        """Async analyzer interface matching Horizen's expected API.

        Returns dict with tier_name, confidence, complexity_score,
        recommended_model, reasoning, etc.
        """
        tier, confidence, meta = self.classify(text, system_prompt=system_message)

        probs = meta.get("tier_probabilities", {})
        # Map tier probabilities to a 0-1 complexity score
        complexity_score = probs.get("medium", 0) * 0.5 + probs.get("complex", 0) * 1.0

        # Model selection from allowed models based on tier
        recommended_model, recommended_provider = self._select_model(tier)

        return {
            "recommended_model": recommended_model,
            "recommended_provider": recommended_provider,
            "confidence": confidence,
            "complexity_score": complexity_score,
            "tier": {"simple": 1, "medium": 2, "complex": 3}.get(tier, 2),
            "tier_name": tier,
            "complexity_tier": {"simple": 1, "medium": 2, "complex": 3}.get(tier, 2),
            "complexity_name": tier,
            "reasoning": f"TrainedClassifier v{self.CLASSIFIER_VERSION}: {tier} ({confidence:.0%})",
            "ranked_models": [],
            "analyzer_latency_ms": meta.get("classify_ms", 0),
            "analyzer_type": f"trained-v{self.CLASSIFIER_VERSION}",
            "selection_method": "trained_classifier",
            "model_type": "trained_classifier_analyzer",
            "tier_probabilities": probs,
            **meta,
        }

    def _select_model(self, tier: str) -> Tuple[str, str]:
        """Pick a model from allowed_models based on tier.

        This is a basic fallback — OCR overrides this in production.
        """
        if not self.allowed_models:
            # Sensible defaults
            defaults = {
                "simple": ("gpt-4o-mini", "openai"),
                "medium": ("claude-haiku-4-5", "anthropic"),
                "complex": ("claude-sonnet-4-20250514", "anthropic"),
            }
            return defaults.get(tier, ("gpt-4o-mini", "openai"))

        # Simple heuristic: first model for simple, last for complex, middle for medium
        models = self.allowed_models
        if len(models) == 1:
            return models[0], "unknown"
        elif tier == "simple":
            return models[0], "unknown"
        elif tier == "complex":
            return models[-1], "unknown"
        else:
            mid = len(models) // 2
            return models[mid], "unknown"


def get_trained_classifier(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
) -> TrainedClassifierAnalyzer:
    """Get or create the singleton trained classifier analyzer."""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = TrainedClassifierAnalyzer(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
        )
    # Update filters on existing instance
    _classifier_instance.allowed_providers = allowed_providers
    _classifier_instance.allowed_models = allowed_models
    return _classifier_instance
