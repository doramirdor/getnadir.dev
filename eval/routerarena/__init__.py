"""Nadir RouterArena submission adapter package.

Wraps the production /v1/route_only endpoint as a RouterArena-compatible
router. Two layers of API are exposed:

  - `NadirRouter.route(prompt)` — strict. Raises on transport / HTTP / schema
    errors. Used by tests and by callers that want to see failures.
  - `NadirRouter._get_prediction(query)` — RouterArena's contract. Never
    raises; falls back to mid-tier (claude-sonnet-4-6) on any failure so a
    leaderboard run completes deterministically.

Both layers go through the same HTTP call. The strict layer is the
implementation; the RouterArena layer is a thin try/except wrapper.
"""
from .nadir_adapter import (
    EXPECTED_SCHEMA_FINGERPRINT,
    LOW_CONFIDENCE_FLAG_RATIO,
    LOW_CONFIDENCE_THRESHOLD,
    NadirRouter,
    NadirRouterError,
    RouteDecision,
    confidence_histogram,
    flag_smoke_run,
)

__all__ = [
    "EXPECTED_SCHEMA_FINGERPRINT",
    "LOW_CONFIDENCE_FLAG_RATIO",
    "LOW_CONFIDENCE_THRESHOLD",
    "NadirRouter",
    "NadirRouterError",
    "RouteDecision",
    "confidence_histogram",
    "flag_smoke_run",
]
