"""
API routes for health check.

Returns overall service status and dependency health for load balancers.
"""
import logging
from typing import Dict, Any

from fastapi import APIRouter

from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint.

    Returns 200 if the service can handle requests (core dependencies healthy).
    Returns 503 if critical dependencies are down.
    """
    checks: Dict[str, str] = {}
    degraded = False
    critical_down = False

    # 1. Supabase connectivity
    try:
        from app.database.supabase_db import supabase_db
        is_healthy = await supabase_db.health_check()
        if is_healthy:
            checks["supabase"] = "ok"
        else:
            checks["supabase"] = "degraded"
            critical_down = True
    except Exception as e:
        checks["supabase"] = f"error: {type(e).__name__}"
        critical_down = True

    # 2. Provider API keys configured
    has_keys = any([settings.OPENAI_API_KEY, settings.ANTHROPIC_API_KEY, settings.GOOGLE_API_KEY])
    checks["provider_keys"] = "ok" if has_keys else "missing"
    if not has_keys:
        critical_down = True

    # 3. Complexity analyzer availability
    try:
        from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
        analyzer_info = ComplexityAnalyzerFactory.get_analyzer_info()
        checks["complexity_analyzer"] = "ok" if settings.COMPLEXITY_ANALYZER_TYPE in analyzer_info else "unavailable"
    except Exception:
        checks["complexity_analyzer"] = "unavailable"
        degraded = True

    # 4. Background task health
    try:
        from app.services.supabase_unified_llm_service import SupabaseUnifiedLLMService
        bg_stats = SupabaseUnifiedLLMService.get_background_task_stats()
        if not bg_stats["bg_task_healthy"]:
            checks["background_tasks"] = (
                f"degraded (failure_rate={bg_stats['bg_task_failure_rate']:.1%}, "
                f"failures={bg_stats['bg_task_failures']}/{bg_stats['bg_task_total']})"
            )
            degraded = True
        else:
            checks["background_tasks"] = "ok"
    except Exception:
        checks["background_tasks"] = "unknown"

    overall = "unhealthy" if critical_down else ("degraded" if degraded else "ok")
    status_code = 503 if critical_down else 200

    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall,
            "service": "nadir-api",
            "version": settings.APP_VERSION,
            "checks": checks,
        },
    )
