"""Unit tests for /v1/route_only.

All external dependencies are mocked:
  - The trained classifier (get_intelligent_model_recommendation_with_analysis)
    is patched per-test.
  - Auth + rate-limit dependencies are overridden via FastAPI's
    dependency_overrides so tests don't need a Supabase connection.
  - litellm.completion is patched to raise, proving no LLM call is made.

We use httpx.AsyncClient + ASGITransport instead of starlette.TestClient
because the installed httpx version is incompatible with this repo's
starlette TestClient.
"""
from __future__ import annotations

import asyncio
import hashlib
from typing import Any, Dict, List
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI

from app.api.route_only import (
    RouteOnlyResponse,
    _ROUTE_ONLY_SCHEMA_FINGERPRINT,
    router as route_only_router,
)
from app.auth.supabase_auth import UserSession
from app.middleware.rate_limiter import check_rate_limit
from app.middleware.subscription_guard import require_active_subscription


# ──────────────────────────────────────────────────────────────────────────
# Fixtures / helpers.
# ──────────────────────────────────────────────────────────────────────────


def _make_user_session(
    *, clusters: List[Any] | None = None, expert_models: List[Any] | None = None
) -> UserSession:
    user = UserSession(
        {
            "id": "eval-user-1",
            "email": "eval@example.com",
            "allowed_models": [
                "claude-haiku-4-5",
                "claude-sonnet-4-6",
                "claude-opus-4-6",
            ],
            "subscription_status": "active",
            "subscription_plan": "pro",
            "key_mode": "byok",
            "clusters": clusters or [],
        }
    )
    if expert_models is not None:
        user.expert_models = expert_models  # type: ignore[attr-defined]
    return user


def _build_app(user: UserSession | None = None) -> FastAPI:
    app = FastAPI()
    app.include_router(route_only_router)

    user = user or _make_user_session()
    app.dependency_overrides[require_active_subscription] = lambda: user
    app.dependency_overrides[check_rate_limit] = lambda: None
    return app


def _classifier_result(
    *,
    tier: int = 2,
    selection: str = "wide_deep_asym",
    selection_type: str = "wide_deep_asym_analysis",
    confidence: float = 0.85,
    complexity_score: float = 0.5,
) -> tuple[str, Dict[str, Any]]:
    return (
        "claude-sonnet-4-6",
        {
            "model_selection_type": selection_type,
            "strategy": "smart-routing",
            "analyzer_used": "wide_deep_asym",
            "selected_model": "claude-sonnet-4-6",
            "complexity_score": complexity_score,
            "reasoning": "test",
            "extracted_metrics": {
                "complexity_score": complexity_score,
                "tier": tier,
                "confidence": confidence,
                "selection_method": selection,
                "model_type": "trained_classifier",
            },
        },
    )


async def _post_async(app: FastAPI, body: Dict[str, Any]) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        return await ac.post("/v1/route_only", json=body)


def _post(app: FastAPI, body: Dict[str, Any] | None = None) -> httpx.Response:
    body = body or {"messages": [{"role": "user", "content": "what is 2 + 2?"}]}
    return asyncio.get_event_loop().run_until_complete(_post_async(app, body))


# Use a fresh event loop per test to avoid contamination.
@pytest.fixture
def loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


def _run(app: FastAPI, body: Dict[str, Any] | None = None) -> httpx.Response:
    body = body or {"messages": [{"role": "user", "content": "what is 2 + 2?"}]}
    return asyncio.run(_post_async(app, body))


# ──────────────────────────────────────────────────────────────────────────
# 1. Schema fingerprint present and stable.
# ──────────────────────────────────────────────────────────────────────────


def test_schema_fingerprint_in_response():
    app = _build_app()
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        mock_rec.return_value = _classifier_result(tier=2)
        resp = _run(app)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "schema_fingerprint" in body
    assert body["schema_fingerprint"] == _ROUTE_ONLY_SCHEMA_FINGERPRINT
    expected = hashlib.sha256(
        ",".join(sorted(RouteOnlyResponse.model_fields.keys())).encode("utf-8")
    ).hexdigest()
    assert body["schema_fingerprint"] == expected


# ──────────────────────────────────────────────────────────────────────────
# 2-4. Tier mapping.
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tier,expected_model,expected_name",
    [
        (1, "claude-haiku-4-5", "simple"),
        (2, "claude-sonnet-4-6", "medium"),
        (3, "claude-opus-4-6", "complex"),
    ],
)
def test_tier_mapping(tier: int, expected_model: str, expected_name: str):
    app = _build_app()
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        mock_rec.return_value = _classifier_result(tier=tier)
        resp = _run(app)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tier"] == expected_name
    assert body["model"] == expected_model


# ──────────────────────────────────────────────────────────────────────────
# 5. No LLM call.
# ──────────────────────────────────────────────────────────────────────────


def test_no_llm_call():
    app = _build_app()

    def boom(*args, **kwargs):  # noqa: ARG001
        raise AssertionError("LLM must not be invoked from /v1/route_only")

    with patch("litellm.completion", side_effect=boom), patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        mock_rec.return_value = _classifier_result(tier=1)
        resp = _run(app)
    assert resp.status_code == 200, resp.text


# ──────────────────────────────────────────────────────────────────────────
# 6. Classifier SHA response header.
# ──────────────────────────────────────────────────────────────────────────


def test_classifier_sha_header_present():
    app = _build_app()
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        mock_rec.return_value = _classifier_result(tier=2)
        resp = _run(app)
    assert resp.status_code == 200
    assert "x-nadir-classifier-sha" in {k.lower() for k in resp.headers.keys()}
    sha = resp.headers["x-nadir-classifier-sha"]
    assert sha == "unavailable" or (
        len(sha) == 64 and all(c in "0123456789abcdef" for c in sha)
    )


# ──────────────────────────────────────────────────────────────────────────
# 7. Empty messages → 400.
# ──────────────────────────────────────────────────────────────────────────


def test_empty_messages_returns_400():
    app = _build_app()
    resp = _run(app, body={"messages": []})
    assert resp.status_code == 400


def test_assistant_only_messages_returns_400():
    app = _build_app()
    resp = _run(app, body={"messages": [{"role": "assistant", "content": "hi"}]})
    assert resp.status_code == 400


# ──────────────────────────────────────────────────────────────────────────
# 8. MF1: clusters / expert_models → 503.
# ──────────────────────────────────────────────────────────────────────────


def test_user_with_clusters_returns_503():
    user = _make_user_session(clusters=["cluster-abc"])
    app = _build_app(user)
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        resp = _run(app)
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail["error"] == "eval_precondition_violated"
    mock_rec.assert_not_called()


def test_user_with_expert_models_returns_503():
    user = _make_user_session(clusters=[], expert_models=["expert-xyz"])
    app = _build_app(user)
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        resp = _run(app)
    assert resp.status_code == 503
    mock_rec.assert_not_called()


# ──────────────────────────────────────────────────────────────────────────
# 9. MF2: fallback selection type → 503.
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "selection_type",
    ["binary_centroid_fallback", "error_fallback", "timeout_fallback"],
)
def test_fallback_selection_returns_503(selection_type: str):
    app = _build_app()
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        mock_rec.return_value = _classifier_result(selection_type=selection_type)
        resp = _run(app)
    assert resp.status_code == 503
    assert resp.json()["detail"]["error"] == "classifier_unavailable"


def test_load_balancing_selection_returns_503():
    app = _build_app()
    with patch(
        "app.api.route_only.get_intelligent_model_recommendation_with_analysis",
        new_callable=AsyncMock,
    ) as mock_rec:
        mock_rec.return_value = _classifier_result(selection_type="load_balancing")
        resp = _run(app)
    assert resp.status_code == 503


# ──────────────────────────────────────────────────────────────────────────
# 10. SF7: lazy SHA caches.
# ──────────────────────────────────────────────────────────────────────────


def test_lazy_classifier_sha_caches(monkeypatch, tmp_path):
    from app.api import route_only as ro

    monkeypatch.setattr(ro, "_classifier_sha_cache", None)

    fake_artifact = tmp_path / "wide_deep_asym_v3.pt"
    fake_artifact.write_bytes(b"abc")
    monkeypatch.setattr(ro, "_MODEL_PATH", str(fake_artifact))

    call_count = {"n": 0}
    real_open = open

    def counting_open(path, *args, **kwargs):
        if str(path) == str(fake_artifact):
            call_count["n"] += 1
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("builtins.open", counting_open)

    sha1 = ro._get_classifier_sha()
    sha2 = ro._get_classifier_sha()
    assert sha1 == sha2
    assert sha1 == hashlib.sha256(b"abc").hexdigest()
    assert call_count["n"] == 1


def test_classifier_sha_unavailable_when_file_missing(monkeypatch, tmp_path):
    from app.api import route_only as ro

    monkeypatch.setattr(ro, "_classifier_sha_cache", None)
    monkeypatch.setattr(ro, "_MODEL_PATH", str(tmp_path / "does_not_exist.pt"))

    assert ro._get_classifier_sha() == "unavailable"
