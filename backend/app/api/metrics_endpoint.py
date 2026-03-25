"""
Prometheus /metrics endpoint.

Unauthenticated — intended for internal scraping by Prometheus/Grafana.
Dynamic gauges (circuit breaker state, batcher queue size) are snapshotted
on each scrape so they reflect the current system state.
"""

import logging
from fastapi import APIRouter, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.metrics import (
    REGISTRY,
    CIRCUIT_BREAKER_STATE,
    EVENT_BATCHER_QUEUE_SIZE,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["monitoring"])

_CB_STATE_MAP = {"closed": 0, "half_open": 1, "open": 2}


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
async def prometheus_metrics():
    """Return Prometheus-formatted metrics."""
    _collect_dynamic_gauges()
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
