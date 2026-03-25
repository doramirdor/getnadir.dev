"""
Routing analytics endpoints.

Exposes routing accuracy metrics and override detection.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.auth.supabase_auth import validate_api_key, UserSession
from app.services.routing_quality_tracker import get_routing_quality_tracker

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/routing", tags=["Routing Analytics"])


@router.get("/accuracy")
async def get_routing_accuracy(
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Get routing accuracy metrics for the authenticated user."""
    tracker = get_routing_quality_tracker()
    metrics = await tracker.compute_accuracy_metrics(user_id=str(current_user.id))
    return metrics
