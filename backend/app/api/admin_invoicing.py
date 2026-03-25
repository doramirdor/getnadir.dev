"""
Admin endpoint for manually triggering monthly savings invoicing.

Protected by ADMIN_API_KEY environment variable.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, status

from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin", tags=["admin"])


@router.post("/run-invoicing")
async def run_invoicing(x_admin_key: str = Header(alias="X-Admin-Key")):
    """
    Manually trigger monthly savings invoicing for all active subscribers.

    Requires the ``X-Admin-Key`` header to match the ``ADMIN_API_KEY`` env var.
    """
    if not settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADMIN_API_KEY is not configured on this server",
        )

    if x_admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin key",
        )

    from app.services.invoice_scheduler import run_monthly_invoicing

    logger.info("Admin-triggered monthly invoicing starting")
    summary = await run_monthly_invoicing()
    return {"status": "completed", **summary}
