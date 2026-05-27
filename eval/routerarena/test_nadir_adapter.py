"""Tests for the Nadir RouterArena adapter.

All HTTP is mocked via httpx.MockTransport. No network is touched.
Run from the package dir:

    pytest test_nadir_adapter.py

Or from the repo root:

    pytest eval/routerarena/test_nadir_adapter.py
"""
from __future__ import annotations

import pathlib
import sys
from typing import Callable, Dict

import httpx
import pytest

# Make the adapter importable whether pytest is invoked from this dir, from
# the repo root, or from getnadir.dev/.
_HERE = pathlib.Path(__file__).resolve().parent
for _candidate in (_HERE, *_HERE.parents):
    if (_candidate / "nadir_adapter.py").exists():
        sys.path.insert(0, str(_candidate))
        break
    if (_candidate / "eval" / "routerarena" / "nadir_adapter.py").exists():
        sys.path.insert(0, str(_candidate))
        break

try:
    from nadir_adapter import (  # type: ignore
        EXPECTED_SCHEMA_FINGERPRINT,
        LOW_CONFIDENCE_FLAG_RATIO,
        NadirRouter,
        NadirRouterError,
        confidence_histogram,
        flag_smoke_run,
    )
except ImportError:
    from eval.routerarena.nadir_adapter import (  # type: ignore
        EXPECTED_SCHEMA_FINGERPRINT,
        LOW_CONFIDENCE_FLAG_RATIO,
        NadirRouter,
        NadirRouterError,
        confidence_histogram,
        flag_smoke_run,
    )


# ──────────────────────────────────────────────────────────────────────────
# Test helpers.
# ──────────────────────────────────────────────────────────────────────────


def _make_router(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    timeout: float = 2.0,
) -> NadirRouter:
    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, timeout=timeout)
    return NadirRouter(
        config_path="",
        client=client,
        base_url="http://nadir.test",
        api_key="test-key",
        timeout=timeout,
    )


def _ok_body(
    *,
    tier: str = "medium",
    confidence: float = 0.85,
    fingerprint: str = EXPECTED_SCHEMA_FINGERPRINT,
    classifier_version: str = "wide_deep_asym_v3",
    latency_ms: int = 42,
    complexity_score: float = 0.5,
) -> Dict:
    return {
        "schema_fingerprint": fingerprint,
        "tier": tier,
        "model": {
            "simple": "claude-haiku-4-5",
            "medium": "claude-sonnet-4-6",
            "complex": "claude-opus-4-6",
        }[tier],
        "complexity_score": complexity_score,
        "classifier_confidence": confidence,
        "latency_ms": latency_ms,
        "classifier_version": classifier_version,
    }


def _ok_response(
    classifier_sha: str = "a" * 64,
    **kwargs,
) -> httpx.Response:
    return httpx.Response(
        200,
        json=_ok_body(**kwargs),
        headers={"x-nadir-classifier-sha": classifier_sha},
    )


# ──────────────────────────────────────────────────────────────────────────
# (a) Adapter encodes input correctly.
# ──────────────────────────────────────────────────────────────────────────


def test_adapter_encodes_input_correctly() -> None:
    captured: Dict[str, object] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        captured["url"] = str(req.url)
        captured["method"] = req.method
        captured["api_key"] = req.headers.get("x-api-key")
        captured["content_type"] = req.headers.get("content-type")
        import json as _json

        captured["body"] = _json.loads(req.content.decode("utf-8"))
        return _ok_response(tier="medium")

    router = _make_router(handler)
    try:
        router.route("test prompt here")
    finally:
        router.close()

    assert captured["method"] == "POST"
    assert captured["url"] == "http://nadir.test/v1/route_only"
    assert captured["api_key"] == "test-key"
    assert "application/json" in str(captured["content_type"])
    assert captured["body"] == {
        "messages": [{"role": "user", "content": "test prompt here"}]
    }


# ──────────────────────────────────────────────────────────────────────────
# (b) Adapter parses response correctly (incl. tier→model mapping).
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tier,expected_model",
    [
        ("simple", "claude-haiku-4-5"),
        ("medium", "claude-sonnet-4-6"),
        ("complex", "claude-opus-4-6"),
    ],
)
def test_adapter_parses_response_correctly(tier: str, expected_model: str) -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return _ok_response(
            tier=tier,
            confidence=0.77,
            latency_ms=123,
            complexity_score=0.42,
        )

    router = _make_router(handler)
    try:
        decision = router.route("anything")
    finally:
        router.close()

    assert decision.tier == tier
    assert decision.model == expected_model
    assert decision.classifier_confidence == 0.77
    assert decision.latency_ms == 123
    assert decision.complexity_score == 0.42
    assert decision.classifier_version == "wide_deep_asym_v3"


# ──────────────────────────────────────────────────────────────────────────
# (c) Adapter raises on non-2xx (strict route() path).
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [400, 401, 403, 429, 500, 503])
def test_adapter_raises_on_non_2xx(status: int) -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "err"})

    router = _make_router(handler)
    try:
        with pytest.raises(NadirRouterError) as exc_info:
            router.route("anything")
        assert f"HTTP {status}" in str(exc_info.value)
    finally:
        router.close()


def test_get_prediction_falls_back_on_non_2xx(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The RouterArena callable must NOT raise — it falls back to mid-tier."""

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "unavailable"})

    router = _make_router(handler)
    try:
        model = router._get_prediction("anything")
    finally:
        router.close()
    assert model == "claude-sonnet-4-6"
    err = capsys.readouterr().err
    assert "HTTP 503" in err


# ──────────────────────────────────────────────────────────────────────────
# (d) Adapter passes through schema fingerprint and classifier SHA.
# ──────────────────────────────────────────────────────────────────────────


def test_adapter_passes_through_schema_fingerprint_and_classifier_sha() -> None:
    sha = "deadbeef" * 8  # 64 hex chars

    def handler(req: httpx.Request) -> httpx.Response:
        return _ok_response(classifier_sha=sha, tier="simple")

    router = _make_router(handler)
    try:
        decision = router.route("hi")
        # Second call must see identical values (cached + reported).
        decision2 = router.route("hi again")
    finally:
        router.close()

    assert decision.schema_fingerprint == EXPECTED_SCHEMA_FINGERPRINT
    assert decision.classifier_sha == sha
    assert decision2.schema_fingerprint == EXPECTED_SCHEMA_FINGERPRINT
    assert decision2.classifier_sha == sha
    # The adapter caches the first observed header values for the smoke
    # script's constancy check.
    assert router.first_classifier_sha == sha
    assert router.first_schema_fingerprint == EXPECTED_SCHEMA_FINGERPRINT


def test_adapter_raises_on_schema_fingerprint_mismatch() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return _ok_response(fingerprint="not-the-right-fp", tier="complex")

    router = _make_router(handler)
    try:
        with pytest.raises(NadirRouterError) as exc_info:
            router.route("hi")
        assert "schema fingerprint mismatch" in str(exc_info.value)
    finally:
        router.close()


# ──────────────────────────────────────────────────────────────────────────
# (e) Adapter respects timeout.
# ──────────────────────────────────────────────────────────────────────────


def test_adapter_respects_timeout() -> None:
    def handler(req: httpx.Request) -> httpx.Response:  # noqa: ARG001
        # httpx.MockTransport supports raising ReadTimeout to simulate
        # a slow upstream.
        raise httpx.ReadTimeout("simulated timeout")

    router = _make_router(handler, timeout=0.5)
    try:
        with pytest.raises(NadirRouterError) as exc_info:
            router.route("anything")
        msg = str(exc_info.value).lower()
        assert "timeout" in msg
    finally:
        router.close()


def test_get_prediction_falls_back_on_timeout(
    capsys: pytest.CaptureFixture[str],
) -> None:
    def handler(req: httpx.Request) -> httpx.Response:  # noqa: ARG001
        raise httpx.ConnectTimeout("connect timeout")

    router = _make_router(handler, timeout=0.5)
    try:
        model = router._get_prediction("x")
    finally:
        router.close()
    assert model == "claude-sonnet-4-6"
    assert "timeout" in capsys.readouterr().err.lower()


# ──────────────────────────────────────────────────────────────────────────
# (f) Adapter works against a mocked httpx response.
# ──────────────────────────────────────────────────────────────────────────


def test_adapter_works_with_mocked_httpx_response() -> None:
    """End-to-end via httpx.MockTransport — same plumbing as production
    but the response is hand-rolled. Confirms the adapter is not coupled
    to a real backend."""

    call_log = []

    def handler(req: httpx.Request) -> httpx.Response:
        call_log.append(str(req.url))
        return _ok_response(tier="complex", confidence=0.92)

    router = _make_router(handler)
    try:
        model = router._get_prediction("solve P=NP")
    finally:
        router.close()

    assert model == "claude-opus-4-6"
    assert call_log == ["http://nadir.test/v1/route_only"]


# ──────────────────────────────────────────────────────────────────────────
# Edge cases discovered while reading the endpoint.
# ──────────────────────────────────────────────────────────────────────────


def test_get_prediction_falls_back_on_connect_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    def handler(req: httpx.Request) -> httpx.Response:  # noqa: ARG001
        raise httpx.ConnectError("refused")

    router = _make_router(handler)
    try:
        assert router._get_prediction("hi") == "claude-sonnet-4-6"
    finally:
        router.close()
    assert "request error" in capsys.readouterr().err.lower()


def test_unknown_tier_raises_in_strict_mode() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "schema_fingerprint": EXPECTED_SCHEMA_FINGERPRINT,
                "tier": "ULTRA_COMPLEX",
                "model": "?",
                "complexity_score": 0.9,
                "classifier_confidence": 0.9,
                "latency_ms": 1,
                "classifier_version": "wide_deep_asym_v3",
            },
            headers={"x-nadir-classifier-sha": "f" * 64},
        )

    router = _make_router(handler)
    try:
        with pytest.raises(NadirRouterError) as exc_info:
            router.route("x")
        assert "unknown tier" in str(exc_info.value).lower()
    finally:
        router.close()


def test_confidence_histogram_buckets_correctly() -> None:
    confidences = iter([0.1, 0.5, 0.7, 0.95])

    def handler(req: httpx.Request) -> httpx.Response:
        return _ok_response(tier="medium", confidence=next(confidences))

    router = _make_router(handler)
    try:
        for _ in range(4):
            router.route("q")
    finally:
        router.close()

    hist = router.histogram
    assert hist["<0.4"] == 1
    assert hist["0.4-0.6"] == 1
    assert hist["0.6-0.8"] == 1
    assert hist[">0.8"] == 1


def test_smoke_verdict_flags_low_confidence() -> None:
    hist = {"<0.4": 3, "0.4-0.6": 2, "0.6-0.8": 2, ">0.8": 3}
    out = flag_smoke_run(hist)
    assert out["verdict"] == "NEEDS_FOUNDER_REVIEW"
    assert out["low_confidence_ratio"] == 0.3


def test_smoke_verdict_passes_when_low_confidence_minimal() -> None:
    hist = {"<0.4": 1, "0.4-0.6": 1, "0.6-0.8": 4, ">0.8": 14}
    out = flag_smoke_run(hist)
    assert out["verdict"] == "PASS"
    assert out["low_confidence_ratio"] == 0.05


def test_empty_histogram_does_not_divide_by_zero() -> None:
    out = flag_smoke_run(confidence_histogram())
    assert out["total"] == 1
    assert out["verdict"] == "PASS"
    assert LOW_CONFIDENCE_FLAG_RATIO == 0.15


def test_missing_base_url_raises() -> None:
    """If neither env var nor base_url= is given, strict route() must raise."""
    router = NadirRouter(config_path="", base_url="", api_key="k")
    try:
        with pytest.raises(NadirRouterError) as exc_info:
            router.route("hi")
        assert "NADIR_BACKEND_URL" in str(exc_info.value)
    finally:
        router.close()
