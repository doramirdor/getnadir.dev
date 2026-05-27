"""Discriminative verifier model for IP-1 verifier-gated cascade routing.

Wraps the trained DeBERTa-v3-small cross-encoder that scores whether a cheap
LLM response is "good enough" relative to an optional expensive reference.
The production artifact is INT8-quantized; CPU inference target is p95 < 50ms.

This module ships the orchestration surface only. The actual weights file is
trained out-of-band (see verifier/train.py per IP-1 Section 8). When weights
are missing, the module stays importable and `is_available()` returns False so
the cascade router can short-circuit to a zero-overhead noop. Tests inject a
synchronous `transport_fn` to bypass the real model entirely.

Blueprint: competitor-profiles/blueprints/ip-1-verifier-gated-cascade.md
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)


class VerifierUnavailable(RuntimeError):
    """Raised when `score()` is called without a usable verifier backend."""


class VerifierModel:
    """Pairwise cross-encoder verifier.

    Parameters
    ----------
    weights_path:
        Filesystem path to the INT8 weights artifact. If the file does not
        exist, `is_available()` returns False and `score()` raises
        VerifierUnavailable. Weight load is deferred to the first `score()`
        call so importing this module never touches disk or GPU.
    transport_fn:
        Test seam. When provided, `score()` calls `transport_fn(input_dict)`
        synchronously inside an executor and treats the return value as the
        raw score. Real weights are never loaded. Used by the unit tests and
        by shadow-mode validation harnesses.
    """

    def __init__(
        self,
        weights_path: Optional[str] = None,
        transport_fn: Optional[Callable[[Dict[str, Any]], float]] = None,
        quantize: bool = True,
        max_length: int = 512,
    ) -> None:
        self._weights_path: Optional[str] = weights_path or None
        self._transport_fn: Optional[Callable[[Dict[str, Any]], float]] = transport_fn
        self._quantize: bool = quantize
        self._max_length: int = max_length
        self._model: Any = None
        self._tokenizer: Any = None
        self._loaded: bool = False

        if transport_fn is not None:
            # Test seam — always "available", weights never touched.
            self._available: bool = True
            return

        if weights_path and os.path.exists(weights_path):
            self._available = True
        else:
            if weights_path:
                logger.warning(
                    "VerifierModel weights not found at %s; verifier disabled",
                    weights_path,
                )
            else:
                logger.info(
                    "VerifierModel constructed without weights_path; verifier disabled"
                )
            self._available = False

    def is_available(self) -> bool:
        """True iff a usable backend (real weights file or injected transport) exists."""
        return bool(self._available)

    async def score(
        self,
        prompt: str,
        cheap_answer: str,
        reference_answer: Optional[str] = None,
    ) -> float:
        """Return p_accept in [0, 1].

        Raises
        ------
        VerifierUnavailable
            If `is_available()` is False at call time.
        """
        if not self._available:
            raise VerifierUnavailable(
                "VerifierModel has no weights and no transport_fn; "
                "score() is not callable in this configuration"
            )

        payload: Dict[str, Any] = {
            "prompt": prompt,
            "cheap_answer": cheap_answer,
            "reference_answer": reference_answer,
        }

        loop = asyncio.get_event_loop()

        if self._transport_fn is not None:
            raw = await loop.run_in_executor(None, self._transport_fn, payload)
        else:
            if not self._loaded:
                self._load_weights()
            raw = await loop.run_in_executor(None, self._infer_sync, payload)

        return _clamp_unit(float(raw))

    def _load_weights(self) -> None:
        """Lazy load the trained DeBERTa-v3-small cross-encoder from disk.

        Loads via `transformers.AutoModelForSequenceClassification.from_pretrained`
        against the directory at `weights_path` (expects `config.json` +
        `model.safetensors` or `pytorch_model.bin`). If `self._quantize` is
        True (the production default), applies INT8 dynamic quantization to
        all Linear layers via qnnpack with fbgemm fallback.

        Raises VerifierUnavailable on any failure so cascade_router can fail
        open rather than crash the request.
        """
        if not self._weights_path:
            raise VerifierUnavailable("No weights_path configured")
        try:
            import torch
            from transformers import (
                AutoModelForSequenceClassification,
                AutoTokenizer,
            )
        except ImportError as e:
            raise VerifierUnavailable(
                f"transformers/torch not installed: {e}"
            ) from e

        try:
            logger.info("VerifierModel: loading from %s", self._weights_path)
            self._tokenizer = AutoTokenizer.from_pretrained(self._weights_path)
            self._model = (
                AutoModelForSequenceClassification.from_pretrained(self._weights_path)
                .to("cpu")
                .eval()
            )
        except Exception as e:  # noqa: BLE001 — load surface is broad
            raise VerifierUnavailable(
                f"failed to load verifier from {self._weights_path}: {e}"
            ) from e

        if self._quantize:
            try:
                # qnnpack is registered on macOS + ARM; fbgemm on x86 Linux.
                # Try qnnpack first, fall back silently to whatever the
                # default engine is (typically fbgemm on Linux).
                try:
                    torch.backends.quantized.engine = "qnnpack"
                except Exception:  # noqa: BLE001
                    pass
                self._model = torch.quantization.quantize_dynamic(
                    self._model, {torch.nn.Linear}, dtype=torch.qint8
                )
                logger.info("VerifierModel: INT8 dynamic quantization applied")
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "VerifierModel: INT8 quantization failed; using FP32 (%s)",
                    e,
                )

        self._loaded = True
        logger.info("VerifierModel: ready")

    def _infer_sync(self, payload: Dict[str, Any]) -> float:
        """Synchronous cross-encoder inference. Returns p(acceptable) in [0,1].

        Tokenizes as the pair `(prompt, "CHEAP:\\n{cheap}\\n\\nEXPENSIVE:\\n{ref}")`
        matching the training format in `verifier/train_local.py`. Returns the
        softmax probability of class 1 ("cheap answer acceptable").
        """
        if not self._loaded:
            raise VerifierUnavailable("inference called before load completed")
        import torch

        prompt = payload.get("prompt") or ""
        cheap = payload.get("cheap_answer") or ""
        reference = payload.get("reference_answer") or ""
        text_pair = f"CHEAP:\n{cheap}\n\nEXPENSIVE:\n{reference}"

        inputs = self._tokenizer(
            text=prompt,
            text_pair=text_pair,
            truncation=True,
            max_length=self._max_length,
            return_tensors="pt",
        )
        with torch.no_grad():
            logits = self._model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1)
        # Class 1 = "acceptable" (cheap is good enough).
        return float(probs[1].item())


def _clamp_unit(x: float) -> float:
    """Clamp a scalar into [0.0, 1.0]. Handles NaN by returning 0.0."""
    if x != x:  # NaN check without importing math
        return 0.0
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


# ---------------------------------------------------------------------------
# Shared singleton
# ---------------------------------------------------------------------------
#
# The cascade insertion in production_completion.py imports `_shared_verifier`
# so a single VerifierModel instance is reused across requests. In v0 the
# weights path resolves from settings (default empty), `is_available()`
# returns False, and the cascade router skips verifier work entirely.


def _build_shared_verifier() -> VerifierModel:
    try:
        from app.settings import settings
        weights_path = getattr(settings, "CASCADE_VERIFIER_WEIGHTS_PATH", "") or None
    except Exception:  # pragma: no cover — settings import is robust in prod
        weights_path = None
    return VerifierModel(weights_path=weights_path)


_shared_verifier: VerifierModel = _build_shared_verifier()
