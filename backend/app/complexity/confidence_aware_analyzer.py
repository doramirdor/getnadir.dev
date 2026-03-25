"""
Confidence-aware cascade analyzer.

Runs the binary classifier first (~12ms). If confidence is high, uses the result
directly.  If confidence is below CONFIDENCE_ESCALATION_THRESHOLD, escalates to
the Two-Tower neural network for a second opinion (~15ms more).  If both are
uncertain, falls back to the user's benchmark model (safest).

~12ms for clear cases (most requests), ~27ms for ambiguous ones.
"""

import logging
import time
from typing import Any, Dict, List, Optional

from app.settings import settings

logger = logging.getLogger(__name__)


class ConfidenceAwareAnalyzer:
    """Cascade analyzer: binary classifier → optional two-tower escalation."""

    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
    ):
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []
        self._binary = None
        self._two_tower = None

    def _get_binary(self):
        if self._binary is None:
            from app.complexity.binary_classifier import get_binary_classifier
            self._binary = get_binary_classifier(
                allowed_providers=self.allowed_providers,
                allowed_models=self.allowed_models,
            )
        return self._binary

    def _get_two_tower(self):
        if self._two_tower is None:
            from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
            self._two_tower = ComplexityAnalyzerFactory.create_analyzer(
                "two_tower",
                allowed_providers=self.allowed_providers,
                allowed_models=self.allowed_models,
            )
        return self._two_tower

    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        start = time.time()
        threshold = settings.CONFIDENCE_ESCALATION_THRESHOLD

        # Stage 1: binary classifier (fast)
        binary_result = self._get_binary()._analyze_sync(text)
        confidence = binary_result.get("confidence", 0.0)

        if confidence >= threshold:
            # High confidence — use binary result directly
            binary_result["selection_method"] = "confidence_aware_binary"
            binary_result["confidence_escalated"] = False
            binary_result["analyzer_latency_ms"] = int((time.time() - start) * 1000)
            return binary_result

        # Stage 2: two-tower second opinion
        try:
            tt_result = await self._get_two_tower().analyze(text=text, **kwargs)
            mean_uncertainty = tt_result.get("uncertainty", 0.0)

            if mean_uncertainty > 0.5:
                # Both uncertain — fall back to the safest choice (first allowed model)
                result = binary_result.copy()
                result["reasoning"] = (
                    f"Cascade: binary uncertain (conf={confidence:.3f}), "
                    f"two-tower also uncertain (unc={mean_uncertainty:.3f}). "
                    "Falling back to safest model."
                )
                result["selection_method"] = "confidence_aware_fallback"
                result["confidence_escalated"] = True
                result["two_tower_uncertainty"] = mean_uncertainty
                result["analyzer_latency_ms"] = int((time.time() - start) * 1000)
                return result

            # Use two-tower result (it had better certainty)
            tt_result["selection_method"] = "confidence_aware_two_tower"
            tt_result["confidence_escalated"] = True
            tt_result["binary_confidence"] = confidence
            tt_result["analyzer_type"] = "confidence_aware"
            tt_result["analyzer_latency_ms"] = int((time.time() - start) * 1000)
            return tt_result

        except Exception as e:
            logger.warning("Two-tower escalation failed (%s), using binary result", e)
            binary_result["selection_method"] = "confidence_aware_binary_fallback"
            binary_result["confidence_escalated"] = False
            binary_result["escalation_error"] = str(e)
            binary_result["analyzer_latency_ms"] = int((time.time() - start) * 1000)
            return binary_result
