"""
Request ID propagation middleware.

Sets X-Request-ID from the incoming header or generates a UUID.
Available via contextvars throughout the request lifecycle.
Also records Prometheus HTTP request metrics.
"""

import time
import uuid
import logging
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.metrics import HTTP_REQUEST_TOTAL, HTTP_REQUEST_DURATION_SECONDS

logger = logging.getLogger(__name__)

# Context variable for request ID — accessible from anywhere during a request
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Get the current request ID from context."""
    return request_id_var.get()


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware that sets and propagates X-Request-ID."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Use incoming header or generate new
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        token = request_id_var.set(req_id)

        start = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = req_id

            # Record HTTP metrics — use the route template to avoid cardinality explosion
            route = request.scope.get("route")
            endpoint = route.path if route else request.url.path
            method = request.method
            HTTP_REQUEST_TOTAL.labels(
                method=method, endpoint=endpoint, status_code=response.status_code
            ).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(
                method=method, endpoint=endpoint
            ).observe(time.perf_counter() - start)

            return response
        finally:
            request_id_var.reset(token)
