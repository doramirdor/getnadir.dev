"""WideDeepAsym pre-generation classifier adapter for the cascade router.

Wraps the production ``WideDeepAsymAnalyzer`` (symmetric variant, trained on
Nadir production traffic) so it can stand in for the deprecated
``RouterBenchClassifierAnalyzer`` (router_v2) inside ``CascadeRouter``.

Why we swapped:
    The router_v2 LR head (BGE+struct → cheap/expensive) was trained on a 5k
    RouterBench slice, reached AUROC 0.62 on its own held-out test split, and
    fires its high-confidence shortcut on only ~0.9% of the 11,420-prompt
    eval set. In production it is effectively a no-op while still costing
    one extra encode per request. WideDeepAsym already runs once per request
    via the analyzer factory and produces a calibrated 3-tier softmax, so
    re-using its prediction here removes the duplicate encode AND gives the
    cascade a confidence signal that actually fires.

Interface contract (mirrors ``RouterBenchClassifierAnalyzer.predict_binary``):

    {
        "p_cheap_acceptable": float,   # = P(simple) from the 3-tier softmax
        "predicted_class":   "cheap" | "expensive",
        "confidence":         float,    # = max(P(simple), P(complex))
        "high_confidence":    bool,     # see ``_is_high_confidence`` below
        "latency_ms":         int,
    }

high_confidence semantics:
    True iff (P(simple) >= 0.9 OR P(complex) >= 0.9) AND P(medium) < 0.5.
    The P(medium) gate prevents a moderately-confident extreme (say,
    P(simple)=0.92, P(medium)=0.55 — a numerical artefact at the softmax
    boundary) from short-circuiting the verifier when the model is actually
    uncertain.

Fail-open posture:
    Any exception during prediction (analyzer not loaded, BGE encoder
    missing, struct extractor crashing, ...) returns
    ``high_confidence=False``. CascadeRouter then falls through to the
    standard cheap-then-verify path, so a broken pre-classifier never
    breaks the request.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# Calibrated against the 3-tier softmax distribution: when EITHER the
# simple OR complex probability dominates above this floor (and medium is
# clearly subordinate), we trust the prediction enough to skip the verifier.
HIGH_CONFIDENCE_PROB: float = 0.90
MEDIUM_GATE: float = 0.50


class WideDeepPreClassifier:
    """Adapter wrapping ``WideDeepAsymAnalyzer`` for the cascade shortcut.

    The wrapped analyzer is lazy: the first call to ``predict_binary``
    loads it via the singleton ``get_wide_deep_asym_analyzer``. Subsequent
    calls reuse the cached instance. The wrapper is itself a singleton
    via ``get_wide_deep_pre_classifier``.
    """

    def __init__(
        self,
        checkpoint_variant: str = "symmetric",
        high_confidence_threshold: float = HIGH_CONFIDENCE_PROB,
        medium_gate: float = MEDIUM_GATE,
    ) -> None:
        self.checkpoint_variant = checkpoint_variant
        self.high_confidence_threshold = float(high_confidence_threshold)
        self.medium_gate = float(medium_gate)
        self._analyzer: Optional[Any] = None
        self._analyzer_load_failed: bool = False

    # ------------------------------------------------------------------
    # Lazy analyzer accessor (fail-open)
    # ------------------------------------------------------------------

    def _get_analyzer(self) -> Optional[Any]:
        if self._analyzer is not None:
            return self._analyzer
        if self._analyzer_load_failed:
            return None
        try:
            from app.complexity.wide_deep_asym_analyzer import (
                get_wide_deep_asym_analyzer,
            )

            self._analyzer = get_wide_deep_asym_analyzer(
                checkpoint_variant=self.checkpoint_variant,
            )
            return self._analyzer
        except Exception as e:  # noqa: BLE001
            self._analyzer_load_failed = True
            logger.warning(
                "WideDeepPreClassifier: failed to load underlying analyzer "
                "(variant=%s); pre-classifier shortcut will be disabled "
                "for the lifetime of this process: %s",
                self.checkpoint_variant,
                e,
            )
            return None

    # ------------------------------------------------------------------
    # Public interface (matches RouterBenchClassifierAnalyzer.predict_binary)
    # ------------------------------------------------------------------

    def predict_binary(self, prompt: str) -> Dict[str, Any]:
        """Return a binary cheap/expensive prediction derived from the
        3-tier softmax of ``WideDeepAsymAnalyzer``.

        Fail-open: on any exception, returns a low-confidence "expensive"
        prediction so the cascade falls through to the verifier path.
        """
        t0 = time.time()
        analyzer = self._get_analyzer()
        if analyzer is None:
            return self._fail_open(t0)

        try:
            _tier, _confidence, info = analyzer.classify(prompt or "")
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "WideDeepPreClassifier.predict_binary failed; returning "
                "low-confidence so cascade falls through: %s",
                e,
            )
            return self._fail_open(t0)

        probs = info.get("tier_probabilities") or {}
        try:
            p_simple = float(probs.get("simple", 0.0))
            p_medium = float(probs.get("medium", 0.0))
            p_complex = float(probs.get("complex", 0.0))
        except (TypeError, ValueError):
            return self._fail_open(t0)

        return self._build_result(
            p_simple=p_simple,
            p_medium=p_medium,
            p_complex=p_complex,
            t0=t0,
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _build_result(
        self,
        p_simple: float,
        p_medium: float,
        p_complex: float,
        t0: float,
    ) -> Dict[str, Any]:
        predicted_class = "cheap" if p_simple >= p_complex else "expensive"
        confidence = float(max(p_simple, p_complex))
        high_confidence = self._is_high_confidence(p_simple, p_medium, p_complex)
        return {
            "p_cheap_acceptable": float(p_simple),
            "predicted_class": predicted_class,
            "confidence": confidence,
            "high_confidence": high_confidence,
            "latency_ms": int((time.time() - t0) * 1000),
        }

    def _is_high_confidence(
        self,
        p_simple: float,
        p_medium: float,
        p_complex: float,
    ) -> bool:
        extreme_strong = (
            p_simple >= self.high_confidence_threshold
            or p_complex >= self.high_confidence_threshold
        )
        return bool(extreme_strong and p_medium < self.medium_gate)

    def _fail_open(self, t0: float) -> Dict[str, Any]:
        """Return a deliberately low-confidence prediction so the cascade
        falls through to the verifier path. ``predicted_class`` is set to
        "expensive" as a defensive default — but ``high_confidence=False``
        means CascadeRouter ignores both fields and runs the verifier.
        """
        return {
            "p_cheap_acceptable": 0.0,
            "predicted_class": "expensive",
            "confidence": 0.0,
            "high_confidence": False,
            "latency_ms": int((time.time() - t0) * 1000),
        }


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


_singleton: Optional[WideDeepPreClassifier] = None


def get_wide_deep_pre_classifier(
    checkpoint_variant: str = "symmetric",
    high_confidence_threshold: float = HIGH_CONFIDENCE_PROB,
    medium_gate: float = MEDIUM_GATE,
) -> WideDeepPreClassifier:
    """Lazy-load + cache a process-wide ``WideDeepPreClassifier``.

    The underlying ``WideDeepAsymAnalyzer`` is itself a singleton keyed on
    ``checkpoint_variant``, so this just adds the adapter wrapper. Calling
    this getter does NOT eagerly load the BGE encoder — the encoder loads
    on the first ``predict_binary`` invocation.
    """
    global _singleton
    if _singleton is None:
        _singleton = WideDeepPreClassifier(
            checkpoint_variant=checkpoint_variant,
            high_confidence_threshold=high_confidence_threshold,
            medium_gate=medium_gate,
        )
    return _singleton


def _reset_singleton_for_tests() -> None:
    """Test hook: clear the cached singleton between tests that need
    different configurations. Not used in production code paths.
    """
    global _singleton
    _singleton = None
