"""
Ternary complexity classifier with fine-tuned DistilBERT.

Primary mode: fine-tuned DistilBERT for direct 3-class classification (~15ms).
Fallback mode: centroid-based classification using SentenceTransformer embeddings.

The DistilBERT model is loaded from app/complexity/models/distilbert_classifier/
if available.  If not found, falls back to the centroid approach.

Backwards-compatible: still exports `classify` as binary via `classify_binary()`.
"""

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch

logger = logging.getLogger(__name__)

# DistilBERT model path
_DISTILBERT_MODEL_DIR = os.path.join(
    os.path.dirname(__file__), "models", "distilbert_classifier"
)
_DISTILBERT_LABEL_NAMES = ["simple", "medium", "complex"]
_DISTILBERT_MAX_LENGTH = 128

# Minimal fallback prototypes (used only if JSON file is missing)
_FALLBACK_SIMPLE = [
    "What is the capital of France?",
    "How many continents are there?",
    "What is 25 times 4?",
    "Hello, how are you?",
    "What is the boiling point of water?",
]
_FALLBACK_MEDIUM = [
    "Write a function to check if a string is a palindrome, handling edge cases",
    "Explain the difference between SQL joins with examples",
    "Create a Python class for a linked list with insert, delete, and search",
    "Implement a binary search tree with insert and traversal",
    "Write unit tests for a shopping cart class",
]
_FALLBACK_COMPLEX = [
    "Design a microservices architecture for a real-time multiplayer game",
    "Architect a distributed event-sourcing system for a financial trading platform",
    "Implement a thread-safe LRU cache with TTL support and statistics tracking",
    "Debug this memory leak in a Node.js application under high concurrency",
    "Design a zero-trust security architecture for a multi-cloud environment",
]


def _load_prototypes(path: Optional[str] = None) -> Tuple[List[str], List[str], List[str]]:
    """Load prototypes from JSON file.  Falls back to minimal hardcoded set."""
    if path is None:
        path = os.path.join(
            os.path.dirname(__file__), "..", "reference_data", "classifier_prototypes.json"
        )

    try:
        with open(path) as f:
            data = json.load(f)
        simple = [p["text"] for p in data.get("simple", [])]
        medium = [p["text"] for p in data.get("medium", [])]
        complex_ = [p["text"] for p in data.get("complex", [])]
        if simple and medium and complex_:
            return simple, medium, complex_
    except Exception as e:
        logger.warning("Could not load prototypes from %s: %s — using fallback", path, e)

    return list(_FALLBACK_SIMPLE), list(_FALLBACK_MEDIUM), list(_FALLBACK_COMPLEX)


class BinaryComplexityClassifier:
    """
    Classifies prompts as simple, medium, or complex.

    Primary: Fine-tuned DistilBERT for direct 3-class classification (~15ms).
    Fallback: Centroid-based classification using SentenceTransformer embeddings.

    The DistilBERT model is loaded from app/complexity/models/distilbert_classifier/
    at init time.  If unavailable, falls back to the centroid approach transparently.
    """

    CLASSIFIER_VERSION = "4.0"
    COMPLEX_SUB_CLUSTERS = 5  # Number of sub-centroids for the complex tier

    # Shared DistilBERT model + tokenizer (class-level singleton)
    _distilbert_model = None
    _distilbert_tokenizer = None
    _distilbert_loaded = False
    _distilbert_load_attempted = False

    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
    ):
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []

        # Load model performance data for ranking
        self.performance_data = self._load_performance_data()

        # Try loading fine-tuned DistilBERT (class-level singleton)
        self._ensure_distilbert_loaded()

        # Load SentenceTransformer encoder (needed for centroid fallback and online learning)
        from app.services.embedding_cache import get_shared_encoder_sync
        self.encoder = get_shared_encoder_sync()

        # Load prototypes and compute centroids (needed for centroid fallback + refresh)
        from app.settings import settings
        proto_path = getattr(settings, "CLASSIFIER_PROTOTYPES_PATH", None)
        self._simple_texts, self._medium_texts, self._complex_texts = _load_prototypes(proto_path)

        centroid_cache = self._try_load_centroid_cache()
        if centroid_cache is not None:
            self._simple_centroid, self._medium_centroid, self._complex_centroids = centroid_cache
        else:
            self._simple_centroid, self._medium_centroid, self._complex_centroids = (
                self._compute_centroids()
            )
            self._save_centroid_cache()

        mode = "DistilBERT" if self._distilbert_loaded else "centroid"
        logger.info(
            "BinaryComplexityClassifier v%s ready [%s mode] — %d simple / %d medium / %d complex prototypes",
            self.CLASSIFIER_VERSION,
            mode,
            len(self._simple_texts),
            len(self._medium_texts),
            len(self._complex_texts),
        )

    # ------------------------------------------------------------------
    # DistilBERT model loading (class-level singleton)
    # ------------------------------------------------------------------

    @classmethod
    def _ensure_distilbert_loaded(cls):
        """Load fine-tuned DistilBERT model if available (once per process)."""
        if cls._distilbert_load_attempted:
            return
        cls._distilbert_load_attempted = True

        if not os.path.isdir(_DISTILBERT_MODEL_DIR):
            logger.info("DistilBERT model not found at %s — using centroid fallback", _DISTILBERT_MODEL_DIR)
            return

        try:
            from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

            cls._distilbert_tokenizer = DistilBertTokenizerFast.from_pretrained(_DISTILBERT_MODEL_DIR)
            cls._distilbert_model = DistilBertForSequenceClassification.from_pretrained(_DISTILBERT_MODEL_DIR)
            cls._distilbert_model.eval()
            cls._distilbert_loaded = True
            logger.info("Loaded fine-tuned DistilBERT classifier from %s", _DISTILBERT_MODEL_DIR)
        except Exception as e:
            logger.warning("Failed to load DistilBERT model: %s — using centroid fallback", e)
            cls._distilbert_loaded = False

    # ------------------------------------------------------------------
    # Centroid cache (.npy)
    # ------------------------------------------------------------------

    @staticmethod
    def _centroid_cache_path() -> str:
        return os.path.join(
            os.path.dirname(__file__), "..", "reference_data", "classifier_centroids.npy"
        )

    def _try_load_centroid_cache(self) -> Optional[Tuple[np.ndarray, np.ndarray, np.ndarray]]:
        path = self._centroid_cache_path()
        try:
            data = np.load(path, allow_pickle=True)
            if isinstance(data, np.ndarray) and data.dtype == object:
                # New format: [simple_centroid, medium_centroid, complex_centroids_2d]
                return data[0], data[1], data[2]
            elif data.shape[0] == 3:
                # Legacy format: 3 single centroids — convert complex to 2D
                logger.info("Loaded legacy centroid cache, converting complex to multi-centroid")
                return data[0], data[1], data[2].reshape(1, -1)
        except Exception:
            pass
        return None

    def _save_centroid_cache(self) -> None:
        path = self._centroid_cache_path()
        try:
            # Save as object array to support multi-centroid complex tier
            stacked = np.array([self._simple_centroid, self._medium_centroid, self._complex_centroids], dtype=object)
            np.save(path, stacked, allow_pickle=True)
            logger.info("Saved centroid cache to %s", path)
        except Exception as e:
            logger.warning("Could not save centroid cache: %s", e)

    # ------------------------------------------------------------------
    # Startup: pre-compute centroids
    # ------------------------------------------------------------------

    def _compute_centroids(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Embed all prototypes and return L2-normalised centroids.

        Simple and medium tiers get a single centroid each.
        Complex tier gets COMPLEX_SUB_CLUSTERS sub-centroids via k-means to
        capture its diverse sub-categories (architecture, debugging, research, etc.).
        """
        simple_embs = self.encoder.encode(self._simple_texts, show_progress_bar=False)
        medium_embs = self.encoder.encode(self._medium_texts, show_progress_bar=False)
        complex_embs = self.encoder.encode(self._complex_texts, show_progress_bar=False)

        simple_centroid = simple_embs.mean(axis=0)
        medium_centroid = medium_embs.mean(axis=0)

        # Normalise so dot product == cosine similarity
        simple_centroid = simple_centroid / np.linalg.norm(simple_centroid)
        medium_centroid = medium_centroid / np.linalg.norm(medium_centroid)

        # Multi-centroid for complex tier via k-means
        k = min(self.COMPLEX_SUB_CLUSTERS, len(complex_embs))
        if k >= 2:
            try:
                from sklearn.cluster import KMeans
                kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                labels = kmeans.fit_predict(complex_embs)
                sub_centroids = []
                for i in range(k):
                    cluster_embs = complex_embs[labels == i]
                    if len(cluster_embs) == 0:
                        continue
                    c = cluster_embs.mean(axis=0)
                    norm = np.linalg.norm(c)
                    if norm > 0:
                        c = c / norm
                    sub_centroids.append(c)
                complex_centroids = np.array(sub_centroids)
                logger.info("Complex tier: %d sub-centroids from %d prototypes", len(sub_centroids), len(complex_embs))
            except ImportError:
                logger.warning("sklearn not available for k-means, falling back to single complex centroid")
                c = complex_embs.mean(axis=0)
                c = c / np.linalg.norm(c)
                complex_centroids = c.reshape(1, -1)
        else:
            c = complex_embs.mean(axis=0)
            c = c / np.linalg.norm(c)
            complex_centroids = c.reshape(1, -1)

        return simple_centroid, medium_centroid, complex_centroids

    def refresh_centroids(
        self,
        simple_centroid: np.ndarray,
        medium_centroid: np.ndarray,
        complex_centroids: np.ndarray,
    ) -> None:
        """Hot-swap centroids (e.g. from online learning).

        complex_centroids can be a 1D array (single centroid, will be reshaped)
        or a 2D array of shape (k, dim) for multi-centroid complex tier.
        """
        self._simple_centroid = simple_centroid / np.linalg.norm(simple_centroid)
        self._medium_centroid = medium_centroid / np.linalg.norm(medium_centroid)
        # Support both single centroid (legacy) and multi-centroid
        if complex_centroids.ndim == 1:
            complex_centroids = complex_centroids.reshape(1, -1)
        # Normalise each sub-centroid
        norms = np.linalg.norm(complex_centroids, axis=1, keepdims=True)
        norms[norms == 0] = 1
        self._complex_centroids = complex_centroids / norms
        self._save_centroid_cache()
        logger.info("Centroids refreshed and cached")

    # ------------------------------------------------------------------
    # Core classification — ternary
    # ------------------------------------------------------------------

    # Temperature for softmax calibration (lower = sharper decisions)
    SOFTMAX_TEMPERATURE = 0.15

    def classify(self, prompt: str) -> Tuple[str, float, Dict[str, float]]:
        """
        Classify a prompt as simple, medium, or complex.

        If fine-tuned DistilBERT is available, uses direct 3-class classification.
        Otherwise, falls back to centroid-based approach.

        Returns:
            (tier_name, confidence, tier_probabilities) where confidence is the
            softmax probability for the winning tier (a real probability in [0,1]).
        """
        from app.complexity.base_analyzer import BaseAnalyzer
        prompt = BaseAnalyzer._validate_prompt(prompt)

        if self._distilbert_loaded:
            return self._classify_distilbert(prompt)
        return self._classify_centroid(prompt)

    def _classify_distilbert(self, prompt: str) -> Tuple[str, float, Dict[str, float]]:
        """Classify using fine-tuned DistilBERT model."""
        inputs = self._distilbert_tokenizer(
            prompt,
            truncation=True,
            padding="max_length",
            max_length=_DISTILBERT_MAX_LENGTH,
            return_tensors="pt",
        )

        with torch.no_grad():
            outputs = self._distilbert_model(**inputs)
            logits = outputs.logits[0]

        # Softmax to get calibrated probabilities
        probs = torch.nn.functional.softmax(logits, dim=-1).numpy()

        tier_probs = {
            "simple": float(probs[0]),
            "medium": float(probs[1]),
            "complex": float(probs[2]),
        }

        best_idx = int(np.argmax(probs))
        best_tier = _DISTILBERT_LABEL_NAMES[best_idx]
        confidence = float(probs[best_idx])

        # Calibrate confidence to consistent [0, 1] scale
        from app.complexity.analyzer_factory import _calibrate_confidence
        confidence = _calibrate_confidence(confidence, "binary_distilbert")

        return best_tier, confidence, tier_probs

    def _classify_centroid(self, prompt: str) -> Tuple[str, float, Dict[str, float]]:
        """Classify using centroid similarity (fallback)."""
        from app.settings import settings
        threshold = getattr(settings, "BINARY_CLASSIFIER_CONFIDENCE_THRESHOLD", 0.05)

        emb = self.encoder.encode([prompt], show_progress_bar=False)[0]
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        # Complex tier: max similarity across sub-centroids
        complex_sims = self._complex_centroids @ emb  # shape: (k,)
        complex_sim = float(np.max(complex_sims))

        sims = {
            "simple": float(np.dot(emb, self._simple_centroid)),
            "medium": float(np.dot(emb, self._medium_centroid)),
            "complex": complex_sim,
        }

        # Temperature-scaled softmax for calibrated probabilities
        logits = np.array([sims["simple"], sims["medium"], sims["complex"]])
        exp_logits = np.exp((logits - logits.max()) / self.SOFTMAX_TEMPERATURE)
        probs = exp_logits / exp_logits.sum()

        tier_probs = {
            "simple": float(probs[0]),
            "medium": float(probs[1]),
            "complex": float(probs[2]),
        }

        best_idx = int(np.argmax(probs))
        tier_names = ["simple", "medium", "complex"]
        best_tier = tier_names[best_idx]
        confidence = float(probs[best_idx])

        # Calibrate confidence to consistent [0, 1] scale
        from app.complexity.analyzer_factory import _calibrate_confidence
        confidence = _calibrate_confidence(confidence, "binary_centroid")

        if confidence < threshold:
            # Borderline → default to complex (safe bias)
            best_tier = "complex"

        return best_tier, confidence, tier_probs

    def classify_binary(self, prompt: str) -> Tuple[bool, float]:
        """Backwards-compatible binary API.  Medium is treated as complex."""
        tier, confidence, _ = self.classify(prompt)
        is_complex = tier in ("medium", "complex")
        return is_complex, confidence

    # ------------------------------------------------------------------
    # Public interface (matches what production_completion.py expects)
    # ------------------------------------------------------------------

    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        """Async analyse — conforms to the analyzer interface used by the factory."""
        return self._analyze_sync(text)

    def _analyze_sync(self, text: str) -> Dict[str, Any]:
        start = time.time()

        tier_name, confidence, tier_probs = self.classify(text)

        # Compute centroid similarities for explainability (even in DistilBERT mode)
        centroid_similarities = {}
        try:
            emb = self.encoder.encode([text], show_progress_bar=False)[0]
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            complex_sims_raw = self._complex_centroids @ emb
            centroid_similarities = {
                "simple": float(np.dot(emb, self._simple_centroid)),
                "medium": float(np.dot(emb, self._medium_centroid)),
                "complex": float(np.max(complex_sims_raw)),
                "complex_sub_centroids": [float(s) for s in complex_sims_raw],
            }
        except Exception:
            pass

        # Heuristic guardrail: catch obvious misroutes
        guardrail_applied = False
        heuristic_tier = 0
        heuristic_factors: List[str] = []
        heuristic_scores: Dict[str, float] = {}
        guardrail_explanation = ""
        try:
            heuristic_result = self._get_heuristic_analyzer().analyze_complexity(text)
            heuristic_tier = heuristic_result.tier
            heuristic_scores = {
                "length": heuristic_result.length_score,
                "technical": heuristic_result.technical_score,
                "domain": heuristic_result.domain_score,
                "structure": heuristic_result.structure_score,
                "keywords": heuristic_result.keywords_score,
            }
            # Collect detected factors above threshold
            for name, score in heuristic_scores.items():
                if score > 0.5:
                    heuristic_factors.append(name)

            if heuristic_tier >= 5 and tier_name in ("simple", "medium"):
                guardrail_explanation = f"Upgraded from {tier_name} to complex due to heuristic tier {heuristic_tier}"
                tier_name = "complex"
                guardrail_applied = True
            elif heuristic_tier >= 4 and tier_name == "simple":
                guardrail_explanation = f"Upgraded from simple to medium due to heuristic tier {heuristic_tier}"
                tier_name = "medium"
                guardrail_applied = True
        except Exception as e:
            logger.debug("Heuristic guardrail skipped: %s", e)

        tier_map = {"simple": 1, "medium": 2, "complex": 3}
        tier = tier_map[tier_name]

        recommended_model, recommended_provider = self._select_model(tier_name, confidence)
        ranked_models = self._build_ranked_models(tier_name, confidence)

        complexity_score = self._tier_to_score(tier_name, confidence)

        latency_ms = int((time.time() - start) * 1000)

        # Build human-readable reasoning
        mode = "DistilBERT" if self._distilbert_loaded else "centroid"
        reasoning = (
            f"Classifier v{self.CLASSIFIER_VERSION} [{mode}]: {tier_name} "
            f"(confidence={confidence:.3f})"
        )
        if guardrail_applied:
            reasoning += f" [{guardrail_explanation}]"

        # Model selection rationale
        rationale_map = {
            "simple": "Cheapest model meeting quality threshold for simple complexity",
            "medium": "Best quality-cost ratio model for medium complexity",
            "complex": "Highest quality model for complex prompt",
        }

        return {
            "recommended_model": recommended_model,
            "recommended_provider": recommended_provider,
            "confidence": confidence,
            "complexity_score": complexity_score,
            "complexity_tier": tier,
            "complexity_name": tier_name,
            "tier": tier,
            "tier_name": tier_name,
            "reasoning": reasoning,
            "ranked_models": ranked_models,
            "analyzer_latency_ms": latency_ms,
            "analyzer_type": "binary",
            "classifier_version": self.CLASSIFIER_VERSION,
            "selection_method": "binary_classifier",
            "model_type": "binary_classifier",
            "classification_mode": "distilbert" if self._distilbert_loaded else "centroid",
            "guardrail_applied": guardrail_applied,
            "heuristic_tier": heuristic_tier,
            # Explainability fields
            "tier_probabilities": tier_probs,
            "centroid_similarities": centroid_similarities,
            "heuristic_factors": heuristic_factors,
            "heuristic_scores": heuristic_scores,
            "guardrail_explanation": guardrail_explanation,
            "model_selection_rationale": rationale_map.get(tier_name, ""),
        }

    # ------------------------------------------------------------------
    # Heuristic guardrail (lazy singleton)
    # ------------------------------------------------------------------
    _heuristic_analyzer = None

    @classmethod
    def _get_heuristic_analyzer(cls):
        # EnhancedComplexityAnalyzer removed — heuristic guardrail disabled
        return None

    # ------------------------------------------------------------------
    # Model selection helpers
    # ------------------------------------------------------------------

    def _select_model(self, tier_name: str, confidence: float) -> Tuple[str, str]:
        """Pick the best model from allowed_models based on classification."""
        candidates = self._get_candidate_models()

        if not candidates:
            if self.allowed_models:
                model = self.allowed_models[0]
                provider = model.split("/")[0] if "/" in model else "unknown"
                return model, provider
            return "gpt-4o-mini", "openai"

        if tier_name == "complex":
            # Pick highest-quality model
            candidates.sort(key=lambda m: m["quality_index"], reverse=True)
        elif tier_name == "medium":
            # Balanced: sort by quality-cost ratio
            candidates.sort(
                key=lambda m: m["quality_index"] / max(m["cost"], 0.01), reverse=True
            )
        else:
            # Pick cheapest model
            candidates.sort(key=lambda m: m["cost"])

        best = candidates[0]
        return best["api_id"], best["provider"]

    def _build_ranked_models(self, tier_name: str, confidence: float) -> List[Dict[str, Any]]:
        """Build a ranked model list matching the format other analyzers return."""
        candidates = self._get_candidate_models()
        if not candidates:
            return []

        if tier_name == "complex":
            candidates.sort(key=lambda m: m["quality_index"], reverse=True)
        elif tier_name == "medium":
            candidates.sort(
                key=lambda m: m["quality_index"] / max(m["cost"], 0.01), reverse=True
            )
        else:
            candidates.sort(key=lambda m: m["cost"])

        label = {"simple": "cost", "medium": "balanced", "complex": "quality"}[tier_name]

        ranked = []
        for c in candidates[:10]:
            ranked.append({
                "model_name": c["api_id"],
                "provider": c["provider"],
                "confidence": confidence,
                "reasoning": f"Binary classifier: {tier_name} → {label} priority",
                "cost_per_million_tokens": c["cost"],
                "quality_index": c["quality_index"],
                "api_id": c["api_id"],
                "performance_name": c["model_name"],
                "suitability_score": (
                    c["quality_index"]
                    if tier_name == "complex"
                    else (c["quality_index"] / max(c["cost"], 0.01))
                    if tier_name == "medium"
                    else max(0, 100 - c["cost"] * 10)
                ),
            })
        return ranked

    def _get_candidate_models(self) -> List[Dict[str, Any]]:
        """Return a flat list of candidate models filtered by allowed_providers/models."""
        if not self.performance_data:
            return []

        candidates = []
        for model in self.performance_data:
            api_id = model.get("api_id", "")
            model_name = model.get("model", "")
            provider = model.get("api_provider", "").lower()
            route = (model.get("other", {}).get("other", {}).get("route", "") or "").lower()

            # Provider filter
            if self.allowed_providers:
                allowed_lower = [p.lower() for p in self.allowed_providers]
                if provider not in allowed_lower and route not in allowed_lower:
                    continue

            # Model filter
            if self.allowed_models:
                if not any(a in (model_name, api_id) for a in self.allowed_models):
                    continue

            perf = model.get("other", {}).get("performance", {})
            pricing = model.get("other", {}).get("pricing", {})

            try:
                quality_index = float(perf.get("quality_index", 50))
            except (ValueError, TypeError):
                quality_index = 50.0

            try:
                cost = float(pricing.get("blended_usd1m_tokens", 1.0))
            except (ValueError, TypeError):
                cost = 1.0

            candidates.append({
                "api_id": api_id,
                "model_name": model_name,
                "provider": route or provider,
                "quality_index": quality_index,
                "cost": cost,
            })

        # Add any allowed_models that weren't found in performance data
        known_ids = {c["api_id"] for c in candidates}
        for m in (self.allowed_models or []):
            if m not in known_ids:
                provider = m.split("/")[0] if "/" in m else "unknown"
                candidates.append({
                    "api_id": m,
                    "model_name": m,
                    "provider": provider,
                    "quality_index": 30.0,
                    "cost": 0.0,
                })

        return candidates

    @staticmethod
    def _tier_to_score(tier_name: str, confidence: float) -> float:
        """Map ternary tier + confidence to a 0-1 complexity score."""
        base = {"simple": 0.15, "medium": 0.5, "complex": 0.85}[tier_name]
        offset = min(confidence * 2, 0.15)
        if tier_name == "complex":
            return min(base + offset, 1.0)
        elif tier_name == "simple":
            return max(base - offset, 0.0)
        else:
            return base

    # Keep old name for backwards compat
    @staticmethod
    def _confidence_to_score(is_complex: bool, confidence: float) -> float:
        """Map binary decision + confidence to a 0-1 complexity score."""
        if is_complex:
            return 0.5 + min(confidence * 5, 0.5)
        else:
            return 0.5 - min(confidence * 5, 0.5)

    def _load_performance_data(self) -> List[Dict]:
        """Load model_performance_clean.json."""
        try:
            path = os.path.join(
                os.path.dirname(__file__),
                "..",
                "reference_data",
                "model_performance_clean.json",
            )
            with open(path) as f:
                data = json.load(f)
            return data.get("models", [])
        except Exception as e:
            logger.error("Error loading performance data: %s", e)
            return []


# ---------------------------------------------------------------------------
# Module-level singleton (created lazily on first import in the factory)
# ---------------------------------------------------------------------------
_singleton: Optional[BinaryComplexityClassifier] = None


def get_binary_classifier(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
) -> BinaryComplexityClassifier:
    """Return (or create) the binary classifier singleton.

    NOTE: allowed_providers/allowed_models are set per-request by the factory,
    so we always create a new lightweight instance.  The heavy part (encoder +
    centroids) is shared via get_shared_encoder_sync().
    """
    return BinaryComplexityClassifier(
        allowed_providers=allowed_providers,
        allowed_models=allowed_models,
    )


def get_singleton() -> Optional[BinaryComplexityClassifier]:
    """Return the warmed-up singleton (if any)."""
    return _singleton


def warmup() -> None:
    """Pre-warm the encoder and compute centroids once at startup."""
    global _singleton
    logger.info("Warming up BinaryComplexityClassifier …")
    _singleton = BinaryComplexityClassifier()
    logger.info("BinaryComplexityClassifier warmup complete")
