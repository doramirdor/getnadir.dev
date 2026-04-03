"""
Prometheus /metrics endpoint.

Protected by a bearer token (METRICS_TOKEN env var) to prevent public access
to internal operational data. Intended for scraping by Prometheus/Grafana.
Dynamic gauges (circuit breaker state, batcher queue size) are snapshotted
on each scrape so they reflect the current system state.
"""

import logging
import os

from fastapi import APIRouter, Response, HTTPException, Header
from typing import Optional
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.metrics import (
    REGISTRY,
    CIRCUIT_BREAKER_STATE,
    EVENT_BATCHER_QUEUE_SIZE,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["monitoring"])

_CB_STATE_MAP = {"closed": 0, "half_open": 1, "open": 2}

_METRICS_TOKEN = os.getenv("METRICS_TOKEN", "")


def _collect_dynamic_gauges():
    """Snapshot circuit breaker states and batcher queue size into gauges."""
    try:
        from app.middleware.circuit_breaker import circuit_breaker

        for provider, info in circuit_breaker.get_status().items():
            CIRCUIT_BREAKER_STATE.labels(provider=provider).set(
                _CB_STATE_MAP.get(info["state"], 0)
            )
    except Exception as e:
        logger.debug("Failed to collect circuit breaker gauges: %s", e)

    try:
        from app.services.event_batcher import analytics_batcher

        EVENT_BATCHER_QUEUE_SIZE.set(len(analytics_batcher._buffer))
    except Exception as e:
        logger.debug("Failed to collect batcher queue gauge: %s", e)


@router.get("/metrics", include_in_schema=False)
async def prometheus_metrics(authorization: Optional[str] = Header(None)):
    """Return Prometheus-formatted metrics. Requires METRICS_TOKEN bearer auth."""
    if _METRICS_TOKEN:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing metrics authorization token")
        token = authorization.removeprefix("Bearer ").strip()
        if token != _METRICS_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid metrics token")
    else:
        logger.warning("METRICS_TOKEN not set — /metrics endpoint is unprotected")

    _collect_dynamic_gauges()
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
