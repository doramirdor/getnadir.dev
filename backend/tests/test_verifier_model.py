"""Unit tests for VerifierModel (IP-1 verifier-gated cascade).

All tests use the `transport_fn` injection seam; no real DeBERTa weights are
loaded and no external services are hit. Covers the public contract:
availability gating, score clamping, transport injection, lazy load policy,
and the shared singleton.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from app.services.verifier_model import (
    VerifierModel,
    VerifierUnavailable,
    _shared_verifier,
)


def test_missing_weights_file_marks_unavailable():
    """Constructor with a non-existent weights path → is_available() False."""
    model = VerifierModel(weights_path="/tmp/definitely_does_not_exist_xyzzy.bin")
    assert model.is_available() is False


@pytest.mark.asyncio
async def test_score_raises_when_unavailable():
    """is_available() False → score() raises VerifierUnavailable."""
    model = VerifierModel(weights_path=None)
    assert model.is_available() is False
    with pytest.raises(VerifierUnavailable):
        await model.score("prompt", "cheap answer", None)


@pytest.mark.asyncio
async def test_transport_fn_returns_injected_value():
    """Injected transport_fn bypasses weights and returns its value clamped."""
    def fake_transport(payload):
        assert payload["prompt"] == "what is 2+2"
        assert payload["cheap_answer"] == "4"
        return 0.82

    model = VerifierModel(transport_fn=fake_transport)
    assert model.is_available() is True
    score = await model.score("what is 2+2", "4", None)
    assert score == pytest.approx(0.82)


@pytest.mark.asyncio
async def test_score_clamps_out_of_range_values():
    """Transport returning >1.0 or <0.0 is clamped into [0, 1]."""
    high = VerifierModel(transport_fn=lambda _: 1.7)
    low = VerifierModel(transport_fn=lambda _: -0.3)
    nanish = VerifierModel(transport_fn=lambda _: float("nan"))

    assert (await high.score("p", "a", None)) == 1.0
    assert (await low.score("p", "a", None)) == 0.0
    assert (await nanish.score("p", "a", None)) == 0.0


def test_shared_verifier_singleton_is_importable():
    """`_shared_verifier` is constructed at import time and the same object twice."""
    from app.services.verifier_model import _shared_verifier as first
    from app.services.verifier_model import _shared_verifier as second
    assert first is second
    assert first is _shared_verifier
    # In v0 there are no weights, so is_available() must be False.
    assert _shared_verifier.is_available() is False


_REPO_ROOT = Path(__file__).resolve().parents[2]
_REAL_CKPT = _REPO_ROOT / "verifier" / "weights" / "best"
_CKPT_PRESENT = (_REAL_CKPT / "config.json").exists()


@pytest.mark.skipif(not _CKPT_PRESENT, reason="trained verifier checkpoint not on disk")
@pytest.mark.asyncio
async def test_real_checkpoint_loads_and_scores():
    """End-to-end load + inference against the actual trained checkpoint.

    Skipped automatically when verifier/weights/best/ is not present so CI
    on a fresh clone still passes. When the checkpoint exists, this is the
    one test that proves the production wiring (transformers.from_pretrained
    + dynamic quantization + cross-encoder tokenization) actually works.

    Direction check: a clearly-acceptable triple (cheap is correct on a
    factual question) must score higher than a clearly-rejectable one
    (cheap is factually wrong).
    """
    v = VerifierModel(weights_path=str(_REAL_CKPT), quantize=True)
    assert v.is_available()

    accept_score = await v.score(
        prompt="What is 2 + 2?",
        cheap_answer="4",
        reference_answer="2 + 2 = 4. This is basic addition.",
    )
    reject_score = await v.score(
        prompt="In what year did World War II end?",
        cheap_answer="World War II ended in 1944.",
        reference_answer="World War II ended in 1945, with Japan's surrender.",
    )

    assert 0.0 <= accept_score <= 1.0
    assert 0.0 <= reject_score <= 1.0
    assert accept_score > reject_score, (
        f"verifier failed direction test: accept={accept_score:.3f} "
        f"reject={reject_score:.3f}"
    )


def test_weights_file_existing_marks_available_without_loading():
    """If the weights file exists on disk, is_available() is True but the
    file is NOT actually loaded until score() runs. This is the lazy-load
    contract that keeps `import` cheap.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
        f.write(b"fake weights blob")
        path = f.name
    try:
        model = VerifierModel(weights_path=path)
        assert model.is_available() is True
        # `_loaded` must still be False because we have not called score().
        assert model._loaded is False
    finally:
        os.unlink(path)
