"""
OpenAI SDK compatibility middleware.

The OpenAI Python/JS SDK sends credentials via `Authorization: Bearer <key>`.
Nadir's auth layer expects `X-API-Key: <key>`.

This middleware bridges the gap so that `openai.OpenAI(api_key="ndr_...")` works
out of the box. If `X-API-Key` is already present, it takes priority.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class OpenAICompatMiddleware(BaseHTTPMiddleware):
    """Map Authorization: Bearer <key> → X-API-Key header when X-API-Key is absent."""

    async def dispatch(self, request: Request, call_next):
        # Only inject if X-API-Key is missing
        if "x-api-key" not in request.headers:
            auth = request.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
                if token:
                    # Starlette headers are immutable, so we build a new scope
                    # with the extra header injected.
                    raw_headers = list(request.scope["headers"])
                    raw_headers.append((b"x-api-key", token.encode("utf-8")))
                    request.scope["headers"] = raw_headers

        return await call_next(request)
