"""
OCR integration for Horizen — per-user adaptive routing.

Each user gets their own OCR router instance, initialized from their
API key's tier_models config. State is persisted in Supabase so the
router keeps learning across server restarts.

Usage in the completion flow:
    from app.complexity.ocr_integration import ocr_select, ocr_observe

    # During model selection (after complexity analysis produces r_hat):
    result = await ocr_select(user_id, r_hat, tier_models, prompt_length)
    if result:
        selected_model, tier, meta = result

    # After LLM response (feedback loop):
    await ocr_observe(user_id, model, r_hat, quality, latency_ms, cost)
"""

import asyncio
import json
import logging
import time
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

from app.complexity.ocr import OCROutcome, OCRRouter

logger = logging.getLogger(__name__)

# Per-user OCR router instances (user_id → OCRRouter)
_routers: Dict[str, OCRRouter] = {}
_routers_lock = Lock()

# Max routers in memory (LRU eviction)
_MAX_ROUTERS = 500
_access_order: Dict[str, float] = {}


def _get_or_create_router(
    user_id: str,
    tier_models: Dict[str, List[str]],
) -> OCRRouter:
    """Get or create an OCR router for a user.

    The router is initialized from the user's tier_models config.
    If the user's config changes (different models), a new router is created.
    """
    with _routers_lock:
        # Check if existing router matches current config
        if user_id in _routers:
            existing = _routers[user_id]
            if existing.tier_models == tier_models:
                _access_order[user_id] = time.time()
                return existing
            else:
                # Config changed — create a new router
                logger.info(f"OCR config changed for user {user_id}, re-initializing")
                del _routers[user_id]

        # Evict oldest if at capacity
        if len(_routers) >= _MAX_ROUTERS:
            oldest = min(_access_order, key=_access_order.get)
            del _routers[oldest]
            del _access_order[oldest]
            logger.debug(f"Evicted OCR router for user {oldest}")

        # Create new router (no file persistence — we'll use Supabase)
        router = OCRRouter(tier_models=tier_models)
        _routers[user_id] = router
        _access_order[user_id] = time.time()
        logger.info(
            f"Created OCR router for user {user_id}: "
            f"tiers={list(tier_models.keys())}, "
            f"models={[m for ms in tier_models.values() for m in ms]}"
        )
        return router


def build_tier_models_from_config(
    selected_models: List[str],
    model_params: Dict[str, Any],
) -> Optional[Dict[str, List[str]]]:
    """Build tier_models dict from user's API key config.

    Reads tier_models from model_parameters. If not configured,
    auto-assigns models to tiers based on position in selected_models.

    Returns None if there are fewer than 2 models (OCR needs tiers).
    """
    if not selected_models or len(selected_models) < 2:
        return None

    # Try explicit tier config first
    tier_config = model_params.get("tier_models", {})
    if tier_config:
        # tier_config is like {"simple": "gpt-4o-mini", "medium": "claude-haiku", "complex": "claude-sonnet"}
        tier_models: Dict[str, List[str]] = {}
        for tier in ("simple", "medium", "complex"):
            model = tier_config.get(tier)
            if model and model in selected_models:
                tier_models[tier] = [model]
        if len(tier_models) >= 2:
            return tier_models

    # Auto-assign: split selected_models into tiers by position
    n = len(selected_models)
    if n == 2:
        return {
            "simple": [selected_models[0]],
            "complex": [selected_models[1]],
        }
    elif n == 3:
        return {
            "simple": [selected_models[0]],
            "medium": [selected_models[1]],
            "complex": [selected_models[2]],
        }
    else:
        # 4+ models: first goes to simple, last to complex, rest to medium
        return {
            "simple": [selected_models[0]],
            "medium": selected_models[1:-1],
            "complex": [selected_models[-1]],
        }


def ocr_select(
    user_id: str,
    r_hat: float,
    tier_models: Dict[str, List[str]],
    prompt_length: int = 0,
) -> Optional[Tuple[str, str, Dict[str, Any]]]:
    """Select a model using OCR adaptive routing.

    Args:
        user_id: User identifier for per-user state.
        r_hat: Complexity score from the static classifier [0, 1].
        tier_models: User's tier→models mapping.
        prompt_length: Prompt character count (for TS context).

    Returns:
        (selected_model, tier_name, metadata) or None if OCR can't route.
    """
    if not tier_models or len(tier_models) < 2:
        return None

    try:
        router = _get_or_create_router(user_id, tier_models)
        model, tier, meta = router.select(
            r_hat=r_hat,
            prompt_length=prompt_length,
        )
        meta["ocr_enabled"] = True
        return model, tier, meta
    except Exception as e:
        logger.warning(f"OCR select failed for user {user_id}: {e}")
        return None


def ocr_observe(
    user_id: str,
    model: str,
    r_hat: float,
    quality: float,
    actual_latency_ms: float,
    actual_cost: float,
    expected_latency_ms: float = 1000.0,
    expected_cost: float = 0.01,
    prompt_length: int = 0,
) -> None:
    """Report an outcome to the OCR router (feedback loop).

    Call this after every LLM response to update the adaptive state.
    """
    with _routers_lock:
        router = _routers.get(user_id)

    if router is None:
        return

    try:
        outcome = OCROutcome(
            quality=quality,
            actual_latency_ms=actual_latency_ms,
            expected_latency_ms=expected_latency_ms,
            actual_cost=actual_cost,
            expected_cost=expected_cost,
        )
        router.observe(
            model=model,
            r_hat=r_hat,
            outcome=outcome,
            prompt_length=prompt_length,
        )
    except Exception as e:
        logger.warning(f"OCR observe failed for user {user_id}: {e}")


def ocr_status(user_id: str) -> Optional[Dict[str, Any]]:
    """Get OCR state for a user (for dashboard display)."""
    with _routers_lock:
        router = _routers.get(user_id)

    if router is None:
        return None

    return router.get_status()


def ocr_status_all() -> Dict[str, Any]:
    """Get aggregate OCR stats (admin endpoint)."""
    with _routers_lock:
        return {
            "active_routers": len(_routers),
            "max_routers": _MAX_ROUTERS,
            "users": list(_routers.keys()),
        }
