"""Wide&Deep (asymmetric-cost) complexity analyzer.

Loads the v3-trained checkpoint at app/complexity/models/wide_deep_asym_v3.pt.
Architecture: BGE-base-en-v1.5 (768-d sentence embedding) deep tower +
33 structural features wide tower → 3-way softmax (simple/medium/complex).

Trained with asymmetric expected-cost loss (λ=3) so the model prefers
upgrading over downgrading. On v3 (2,479 prompts, 497 test):
  - argmax:             95.4% safe / 4.6% down / 0.0% catastrophic
  - cost-sens λ=20:     97.8% safe / 2.2% down / 0.0% catastrophic

Latency: ~40ms/prompt CPU once the BGE encoder is warmed.

Implements the Horizen/getnadir analyzer interface (async `analyze`).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.complexity.structural_features import StructuralFeatureExtractor

logger = logging.getLogger(__name__)

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH = os.path.join(_PKG_DIR, "models", "wide_deep_asym_v3.pt")
_TIER_MAP = {0: "simple", 1: "medium", 2: "complex"}
_TIER_NUM = {"simple": 1, "medium": 2, "complex": 3}

# Shared singletons
_analyzer_instance: Optional["WideDeepAsymAnalyzer"] = None
_encoder = None
_extractor: Optional[StructuralFeatureExtractor] = None


def _get_encoder():
    global _encoder
    if _encoder is None:
        t0 = time.time()
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        from sentence_transformers import SentenceTransformer

        # CPU is plenty fast and avoids the MPS hang we saw on py3.14.
        _encoder = SentenceTransformer("BAAI/bge-base-en-v1.5", device="cpu")
        logger.info(
            "BGE-base-en-v1.5 encoder loaded in %dms",
            int((time.time() - t0) * 1000),
        )
    return _encoder


def _get_extractor() -> StructuralFeatureExtractor:
    global _extractor
    if _extractor is None:
        _extractor = StructuralFeatureExtractor()
    return _extractor


def _build_model(cfg):
    """Construct the exact same module architecture used at training time."""
    import torch.nn as nn
    import torch

    class WideAndDeep(nn.Module):
        def __init__(self, emb_dim, struct_dim, hidden, dropout, out_dim=3):
            super().__init__()
            self.deep = nn.Sequential(
                nn.Linear(emb_dim, hidden),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(hidden, hidden // 2),
                nn.ReLU(),
                nn.Dropout(dropout),
            )
            self.struct_bn = nn.BatchNorm1d(struct_dim)
            self.head = nn.Linear(hidden // 2 + struct_dim, out_dim)

        def forward(self, emb, struct):
            return self.head(
                torch.cat([self.deep(emb), self.struct_bn(struct)], dim=1)
            )

    return WideAndDeep(
        cfg["emb_dim"], cfg["struct_dim"], cfg["hidden"], cfg["dropout"]
    )


def _cost_matrix(lam: float, k: int = 3):
    """C[i,j] = λ·(i-j) for downgrades (j<i), (j-i) for upgrades, 0 diag."""
    C = np.zeros((k, k), dtype=np.float32)
    for i in range(k):
        for j in range(k):
            if j < i:
                C[i, j] = lam * (i - j)
            elif j > i:
                C[i, j] = j - i
    return C


class WideDeepAsymAnalyzer:
    """Wide&Deep ternary complexity analyzer.

    Parameters
    ----------
    decision_rule
        ``"argmax"`` (default) or ``"cost_sensitive"``. With ``cost_sensitive``
        the prediction minimises expected asymmetric cost under ``cost_lambda``.
    cost_lambda
        Downgrade penalty multiplier for cost-sensitive decoding. Larger →
        safer, more upgrades. Recommended: 3 (balanced) or 20 (max-safe).
    """

    ANALYZER_VERSION = "wide_deep_asym_v3"

    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        model_path: Optional[str] = None,
        decision_rule: str = "argmax",
        cost_lambda: float = 3.0,
    ):
        import torch

        self.allowed_providers = allowed_providers
        self.allowed_models = allowed_models
        if decision_rule not in ("argmax", "cost_sensitive"):
            raise ValueError(
                f"decision_rule must be 'argmax' or 'cost_sensitive', got {decision_rule!r}"
            )
        self.decision_rule = decision_rule
        self.cost_lambda = float(cost_lambda)
        self._cost = _cost_matrix(self.cost_lambda) if decision_rule == "cost_sensitive" else None

        path = model_path or _MODEL_PATH
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Wide&Deep asym checkpoint not found at {path}."
            )

        ckpt = torch.load(path, map_location="cpu", weights_only=False)
        cfg = ckpt["config"]
        self._cfg = cfg
        self._trained_lambda = float(ckpt.get("lambda", 3.0))

        self._model = _build_model(cfg)
        self._model.load_state_dict(ckpt["state_dict"])
        self._model.eval()

        self._struct_mean = np.asarray(ckpt["struct_scaler_mean"], dtype=np.float32)
        self._struct_scale = np.asarray(ckpt["struct_scaler_scale"], dtype=np.float32)
        self._encoder_name = ckpt.get("encoder", "BAAI/bge-base-en-v1.5")

        logger.info(
            "WideDeepAsymAnalyzer loaded (encoder=%s, struct_dim=%d, trained λ=%.1f, rule=%s, λ=%.1f)",
            self._encoder_name,
            cfg["struct_dim"],
            self._trained_lambda,
            self.decision_rule,
            self.cost_lambda,
        )

    # ------------------------------------------------------------------
    # Core prediction
    # ------------------------------------------------------------------
    def _predict_proba(self, prompt: str, system_prompt: str = "") -> Tuple[np.ndarray, Dict[str, Any]]:
        import torch

        encoder = _get_encoder()
        extractor = _get_extractor()

        t0 = time.time()
        if system_prompt:
            embed_text = f"{system_prompt[:500]} | {prompt}"
        else:
            embed_text = prompt

        emb = encoder.encode(
            [embed_text],
            show_progress_bar=False,
            normalize_embeddings=True,
            device="cpu",
        )
        emb = np.asarray(emb, dtype=np.float32)

        messages = [{"role": "user", "content": prompt}]
        struct_vec = np.asarray(
            extractor.extract_vector(messages, system_prompt=system_prompt),
            dtype=np.float32,
        )
        if struct_vec.shape[0] != self._cfg["struct_dim"]:
            raise ValueError(
                f"Structural feature vector has dim {struct_vec.shape[0]}, "
                f"model was trained with {self._cfg['struct_dim']}"
            )
        struct_s = (struct_vec - self._struct_mean) / self._struct_scale
        struct_s = struct_s.reshape(1, -1)

        with torch.no_grad():
            logits = self._model(
                torch.from_numpy(emb),
                torch.from_numpy(struct_s),
            )
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

        latency_ms = int((time.time() - t0) * 1000)
        return probs, {"latency_ms": latency_ms}

    def classify(self, prompt: str, system_prompt: str = "") -> Tuple[str, float, Dict[str, Any]]:
        probs, meta = self._predict_proba(prompt, system_prompt=system_prompt)

        if self.decision_rule == "cost_sensitive":
            # E[cost | j] = Σ_i P(i) · C[i, j]  →  argmin_j
            expected_cost = probs @ self._cost
            pred_idx = int(np.argmin(expected_cost))
        else:
            pred_idx = int(np.argmax(probs))

        tier = _TIER_MAP[pred_idx]
        confidence = float(probs[pred_idx])

        info = {
            "tier_probabilities": {
                "simple": float(probs[0]),
                "medium": float(probs[1]),
                "complex": float(probs[2]),
            },
            "argmax_tier": _TIER_MAP[int(np.argmax(probs))],
            "decision_rule": self.decision_rule,
            "cost_lambda": self.cost_lambda,
            "classify_ms": meta["latency_ms"],
            "analyzer_version": self.ANALYZER_VERSION,
        }
        return tier, confidence, info

    # ------------------------------------------------------------------
    # Async analyze() — getnadir expected interface
    # ------------------------------------------------------------------
    async def analyze(
        self,
        text: str = "",
        system_message: str = "",
        **kwargs,
    ) -> Dict[str, Any]:
        tier, confidence, meta = self.classify(text, system_prompt=system_message)
        probs = meta["tier_probabilities"]
        complexity_score = probs["medium"] * 0.5 + probs["complex"] * 1.0

        recommended_model, recommended_provider = self._select_model(tier)

        return {
            "recommended_model": recommended_model,
            "recommended_provider": recommended_provider,
            "confidence": confidence,
            "complexity_score": complexity_score,
            "tier": _TIER_NUM[tier],
            "tier_name": tier,
            "complexity_tier": _TIER_NUM[tier],
            "complexity_name": tier,
            "reasoning": (
                f"WideDeepAsym v3 ({self.decision_rule}"
                f"{', λ=' + f'{self.cost_lambda:g}' if self.decision_rule == 'cost_sensitive' else ''}): "
                f"{tier} ({confidence:.0%})"
            ),
            "ranked_models": [],
            "analyzer_latency_ms": meta["classify_ms"],
            "analyzer_type": self.ANALYZER_VERSION,
            "selection_method": "wide_deep_asym",
            "model_type": "wide_deep_asym_analyzer",
            "tier_probabilities": probs,
            **meta,
        }

    # ------------------------------------------------------------------
    # Trivial model picker (same fallback shape as TrainedClassifierAnalyzer)
    # ------------------------------------------------------------------
    def _select_model(self, tier: str) -> Tuple[str, str]:
        if not self.allowed_models:
            defaults = {
                "simple": ("gpt-4o-mini", "openai"),
                "medium": ("claude-haiku-4-5", "anthropic"),
                "complex": ("claude-sonnet-4-20250514", "anthropic"),
            }
            return defaults.get(tier, ("gpt-4o-mini", "openai"))

        models = self.allowed_models
        if len(models) == 1:
            return models[0], "unknown"
        if tier == "simple":
            return models[0], "unknown"
        if tier == "complex":
            return models[-1], "unknown"
        return models[len(models) // 2], "unknown"


def get_wide_deep_asym_analyzer(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
    decision_rule: str = "argmax",
    cost_lambda: float = 3.0,
) -> WideDeepAsymAnalyzer:
    """Singleton accessor."""
    global _analyzer_instance
    if _analyzer_instance is None:
        _analyzer_instance = WideDeepAsymAnalyzer(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            decision_rule=decision_rule,
            cost_lambda=cost_lambda,
        )
    else:
        _analyzer_instance.allowed_providers = allowed_providers
        _analyzer_instance.allowed_models = allowed_models
        if (
            _analyzer_instance.decision_rule != decision_rule
            or _analyzer_instance.cost_lambda != cost_lambda
        ):
            _analyzer_instance.decision_rule = decision_rule
            _analyzer_instance.cost_lambda = float(cost_lambda)
            _analyzer_instance._cost = (
                _cost_matrix(cost_lambda) if decision_rule == "cost_sensitive" else None
            )
    return _analyzer_instance
