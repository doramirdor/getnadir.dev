"""
Decision-only routing endpoint for RouterArena evaluation.

Operational precondition (MF1):
  The eval API key MUST NOT have any clusters configured AND MUST NOT have any
  expert models configured. Those features short-circuit the production
  classifier path (see production_completion.py:562-617) and would hijack
  routing decisions. This endpoint enforces that precondition by returning
  HTTP 503 if the authenticated user has either set.

Operational precondition (rate limit, MF4):
  The rate limiter is a single global token bucket keyed by API key but
  capped by RATE_LIMIT_PER_MINUTE which is process-global. We CANNOT raise
  the limit for a single eval key. The smoke + full sub run must use a
  dedicated eval deployment with RATE_LIMIT_PER_MINUTE raised in env,
  NOT shared production.

The endpoint terminates after the trained classifier returns. No LLM call is
ever made. It mirrors the production smart-routing decision (the
``get_intelligent_model_recommendation_with_analysis`` function in
``production_completion.py``) so the leaderboard score reflects the actual
production router, not a Gemini-backed ranker.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.api.production_completion import (
    ChatMessage,
    get_intelligent_model_recommendation_with_analysis,
)
from app.auth.supabase_auth import UserSession
from app.middleware.rate_limiter import check_rate_limit
from app.middleware.subscription_guard import require_active_subscription


logger = logging.getLogger(__name__)

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────
# Tier mapping (matches RouterArena's expected three-tier router contract).
# ──────────────────────────────────────────────────────────────────────────

_TIER_INT_TO_NAME: Dict[int, str] = {1: "simple", 2: "medium", 3: "complex"}
_TIER_TO_MODEL: Dict[str, str] = {
    "simple": "claude-haiku-4-5",
    "medium": "claude-sonnet-4-6",
    "complex": "claude-opus-4-6",
}

# Selection methods that count as the trained smart-routing path. Anything
# ending in ``_fallback`` is rejected (MF2).
_VALID_MODEL_SELECTION_TYPES = {
    "wide_deep_asym_analysis",
    "trained_analysis",
    "bert_analysis",
    "matrix_factorization_analysis",
    "ensemble_analysis",
    "gemini_analysis",
    "two_tower_analysis",
}


# ──────────────────────────────────────────────────────────────────────────
# Request / response schemas.
# ──────────────────────────────────────────────────────────────────────────


class RouteOnlyRequest(BaseModel):
    """Routing-only request body. Mirrors a minimal completion request."""

    messages: List[ChatMessage] = Field(..., description="Chat messages")
    model: Optional[str] = Field(
        None, description="Optional model override (ignored by router; kept for parity)"
    )


class RouteOnlyResponse(BaseModel):
    """Decision-only response. The set of keys here drives the schema fingerprint."""

    schema_fingerprint: str = Field(..., description="SHA-256 fingerprint of sorted response field names")
    tier: str = Field(..., description="Routing tier: simple | medium | complex")
    model: str = Field(..., description="Recommended model")
    complexity_score: float = Field(..., description="Raw complexity score from analyzer")
    classifier_confidence: float = Field(..., description="Classifier confidence in [0, 1]")
    latency_ms: int = Field(..., description="End-to-end classifier latency in ms")
    classifier_version: str = Field(..., description="Analyzer version tag")


# ──────────────────────────────────────────────────────────────────────────
# Schema fingerprint (MF3).
# ──────────────────────────────────────────────────────────────────────────


def _compute_schema_fingerprint() -> str:
    """Hash the sorted set of response field names. Any drift (add/remove/rename)
    flips the fingerprint, the adapter asserts equality on startup, and a run
    aborts before publishing a bogus leaderboard score."""
    field_names = sorted(RouteOnlyResponse.model_fields.keys())
    payload = ",".join(field_names).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


_ROUTE_ONLY_SCHEMA_FINGERPRINT: str = _compute_schema_fingerprint()


# ──────────────────────────────────────────────────────────────────────────
# Classifier SHA, computed lazily on first hit (SF7).
# ──────────────────────────────────────────────────────────────────────────

# Resolved at import time so we don't import the analyzer module just to read a
# path constant. If wide_deep_asym_analyzer changes its layout, update both.
_MODEL_FILENAME = "wide_deep_asym_v3.pt"
_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "complexity",
    "models",
    _MODEL_FILENAME,
)

_classifier_sha_cache: Optional[str] = None


def _get_classifier_sha() -> str:
    """Compute the SHA-256 of the classifier artifact on first call, cache forever.

    Done lazily because the .pt file is ~hundreds of MB and reading it at module
    load would block Uvicorn startup (SF7). The chunked reader matches
    ``audit_runner._file_sha256``.
    """
    global _classifier_sha_cache
    if _classifier_sha_cache is not None:
        return _classifier_sha_cache

    path = _MODEL_PATH
    if not os.path.exists(path) or not os.path.isfile(path):
        logger.warning("Classifier artifact not found at %s; reporting 'unavailable'", path)
        _classifier_sha_cache = "unavailable"
        return _classifier_sha_cache

    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
    except OSError as e:
        logger.warning("Failed to hash classifier artifact %s: %s", path, e)
        _classifier_sha_cache = "unavailable"
        return _classifier_sha_cache

    _classifier_sha_cache = h.hexdigest()
    return _classifier_sha_cache


# ──────────────────────────────────────────────────────────────────────────
# Endpoint.
# ──────────────────────────────────────────────────────────────────────────


def _build_eval_user_config() -> Dict[str, Any]:
    """Synthetic config that forces the smart-routing path."""
    return {
        "selected_models": [
            "claude-haiku-4-5",
            "claude-sonnet-4-6",
            "claude-opus-4-6",
        ],
        "sort_strategy": "smart-routing",
        "load_balancing_policy": "round-robin",
        "use_fallback": False,
        "model_parameters": {},
        "layers": {"routing": True, "fallback": False, "optimize": "off"},
    }


@router.post(
    "/v1/route_only",
    response_model=RouteOnlyResponse,
    dependencies=[Depends(check_rate_limit)],
)
async def route_only(
    payload: RouteOnlyRequest,
    response: Response,
    current_user: UserSession = Depends(require_active_subscription),
) -> RouteOnlyResponse:
    """Return the trained classifier's routing decision without invoking an LLM.

    Preconditions enforced (return 503 on violation):
      - MF1: caller has no clusters AND no expert models configured.
      - MF2: the classifier path actually ran (selection method is on the
        whitelist; not a ``*_fallback`` path).
    """

    # ── MF1: clusters / expert models would hijack routing. ───────────────
    if getattr(current_user, "clusters", None):
        logger.warning(
            "route_only blocked: user %s has clusters configured (eval key must have none)",
            current_user.id,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "error": "eval_precondition_violated",
                "message": (
                    "Eval API keys must have no clusters configured. "
                    "Cluster routing would short-circuit the trained classifier."
                ),
            },
        )

    if getattr(current_user, "expert_models", None):
        logger.warning(
            "route_only blocked: user %s has expert_models configured", current_user.id
        )
        raise HTTPException(
            status_code=503,
            detail={
                "error": "eval_precondition_violated",
                "message": (
                    "Eval API keys must have no expert models configured. "
                    "Expert model routing would short-circuit the trained classifier."
                ),
            },
        )

    # ── Input validation. ────────────────────────────────────────────────
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    user_msgs = [m for m in payload.messages if m.role == "user"]
    if not user_msgs:
        raise HTTPException(status_code=400, detail="at least one user message required")

    user_config = _build_eval_user_config()

    # ── Run the production classifier path. ──────────────────────────────
    start = time.perf_counter()
    recommended_model, analysis = await get_intelligent_model_recommendation_with_analysis(
        messages=payload.messages,
        user_config=user_config,
        current_user=current_user,
    )
    wall_ms = int((time.perf_counter() - start) * 1000)

    # ── MF2: reject if the classifier path didn't actually run. ──────────
    model_selection_type = analysis.get("model_selection_type", "")
    if model_selection_type.endswith("_fallback") or model_selection_type not in _VALID_MODEL_SELECTION_TYPES:
        logger.error(
            "route_only got non-classifier selection method '%s' for user %s",
            model_selection_type,
            current_user.id,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "error": "classifier_unavailable",
                "message": (
                    f"Routing fell back to '{model_selection_type}'. The trained classifier "
                    "did not run. Refusing to return a degraded decision to a leaderboard."
                ),
            },
        )

    # ── Extract fields. ──────────────────────────────────────────────────
    metrics = analysis.get("extracted_metrics", {}) or {}
    tier_int = metrics.get("tier", 2)
    try:
        tier_int = int(tier_int)
    except (TypeError, ValueError):
        tier_int = 2
    tier_name = _TIER_INT_TO_NAME.get(tier_int, "medium")
    model_name = _TIER_TO_MODEL[tier_name]

    complexity_score = float(metrics.get("complexity_score", analysis.get("complexity_score", 0.5)))
    classifier_confidence = float(metrics.get("confidence", 0.0))

    # Prefer the analyzer's own latency if it surfaced one (best-effort).
    analyzer_latency_ms = metrics.get("analyzer_latency_ms")
    if isinstance(analyzer_latency_ms, (int, float)) and analyzer_latency_ms > 0:
        latency_ms = int(analyzer_latency_ms)
    else:
        latency_ms = wall_ms

    classifier_version = metrics.get("selection_method") or analysis.get("analyzer_used", "unknown")
    # Prefer the canonical constant if importable; fall back to selection_method.
    try:
        from app.complexity.wide_deep_asym_analyzer import WideDeepAsymAnalyzer

        if classifier_version in ("wide_deep_asym", "trained"):
            classifier_version = WideDeepAsymAnalyzer.ANALYZER_VERSION
    except Exception:  # pragma: no cover - defensive
        pass

    # ── Set the classifier-SHA response header. ──────────────────────────
    response.headers["x-nadir-classifier-sha"] = _get_classifier_sha()

    return RouteOnlyResponse(
        schema_fingerprint=_ROUTE_ONLY_SCHEMA_FINGERPRINT,
        tier=tier_name,
        model=model_name,
        complexity_score=complexity_score,
        classifier_confidence=classifier_confidence,
        latency_ms=latency_ms,
        classifier_version=str(classifier_version),
    )
