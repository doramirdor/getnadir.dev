"""
Central Prometheus metrics registry for Nadir.

All metrics are registered on a custom CollectorRegistry so they don't
collide with the default process/platform collectors from prometheus-client.
"""

from prometheus_client import CollectorRegistry, Counter, Histogram, Gauge

REGISTRY = CollectorRegistry()

# ---------------------------------------------------------------------------
# HTTP request metrics (recorded by RequestContextMiddleware)
# ---------------------------------------------------------------------------
HTTP_REQUEST_TOTAL = Counter(
    "http_request_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
    registry=REGISTRY,
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    registry=REGISTRY,
)

# ---------------------------------------------------------------------------
# LLM provider metrics (recorded in litellm_service)
# ---------------------------------------------------------------------------
LLM_REQUEST_TOTAL = Counter(
    "llm_request_total",
    "Total LLM provider requests",
    ["provider", "model", "status"],
    registry=REGISTRY,
)

LLM_REQUEST_DURATION_SECONDS = Histogram(
    "llm_request_duration_seconds",
    "LLM request latency in seconds",
    ["provider", "model"],
    registry=REGISTRY,
)

LLM_TOKENS_TOTAL = Counter(
    "llm_tokens_total",
    "Total tokens processed",
    ["provider", "model", "direction"],
    registry=REGISTRY,
)

LLM_COST_USD_TOTAL = Counter(
    "llm_cost_usd_total",
    "Cumulative LLM cost in USD",
    ["provider", "model"],
    registry=REGISTRY,
)

# ---------------------------------------------------------------------------
# Complexity analyzer metrics (recorded in production_completion)
# ---------------------------------------------------------------------------
ANALYZER_DURATION_SECONDS = Histogram(
    "analyzer_duration_seconds",
    "Complexity analyzer latency in seconds",
    ["analyzer_type"],
    registry=REGISTRY,
)

ANALYZER_TIER_TOTAL = Counter(
    "analyzer_tier_total",
    "Complexity analysis results by tier",
    ["analyzer_type", "tier"],
    registry=REGISTRY,
)

# ---------------------------------------------------------------------------
# Cache metrics (recorded in embedding_cache)
# ---------------------------------------------------------------------------
CACHE_OPERATIONS_TOTAL = Counter(
    "cache_operations_total",
    "Embedding cache operations",
    ["cache_name", "result"],
    registry=REGISTRY,
)

# ---------------------------------------------------------------------------
# Infrastructure metrics (dynamic gauges set at scrape time)
# ---------------------------------------------------------------------------
CIRCUIT_BREAKER_STATE = Gauge(
    "circuit_breaker_state",
    "Circuit breaker state per provider (0=closed, 1=half_open, 2=open)",
    ["provider"],
    registry=REGISTRY,
)

RATE_LIMIT_REJECTIONS_TOTAL = Counter(
    "rate_limit_rejections_total",
    "Total rate-limit rejections",
    registry=REGISTRY,
)

EVENT_BATCHER_QUEUE_SIZE = Gauge(
    "event_batcher_queue_size",
    "Current event batcher queue depth",
    registry=REGISTRY,
)

# ---------------------------------------------------------------------------
# Auth cache metrics (recorded in supabase_auth)
# ---------------------------------------------------------------------------
AUTH_CACHE_TOTAL = Counter(
    "auth_cache_total",
    "Auth cache lookups",
    ["result"],  # "hit" or "miss"
    registry=REGISTRY,
)

AUTH_CACHE_SIZE = Gauge(
    "auth_cache_size",
    "Current number of entries in the auth cache",
    registry=REGISTRY,
)
