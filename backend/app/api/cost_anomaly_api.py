"""
Cost anomaly detection and forecasting endpoints.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.auth.supabase_auth import validate_api_key, UserSession
from app.services.cost_anomaly_service import CostAnomalyService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/cost", tags=["Cost Analytics"])


@router.get("/anomalies")
async def get_cost_anomalies(
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Get recent cost anomalies for the authenticated user."""
    service = CostAnomalyService()
    anomalies = await service.get_anomalies(user_id=str(current_user.id))
    return {"anomalies": anomalies, "count": len(anomalies)}


@router.get("/forecast")
async def get_cost_forecast(
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Get projected daily/weekly cost based on current trend."""
    service = CostAnomalyService()
    return await service.get_forecast(user_id=str(current_user.id))
