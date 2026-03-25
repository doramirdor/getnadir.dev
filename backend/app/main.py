"""
Main FastAPI application for Nadir.
Intelligent LLM routing and analytics platform.
"""
import asyncio
import concurrent.futures
import os
import logging
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

# Configure structured logging before any other imports
from app.logging_config import configure_logging
configure_logging()

logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.clusters.supabase_clustering import clustering_service
from app.database.supabase_db import supabase_db
from app.settings import settings

# Import API routers
from app.api.completion import router as completion_router
from app.api.models import router as models_router
from app.api.logs import router as logs_router
from app.api.health import router as health_router
from app.api.recommendation import router as recommendation_router
from app.api.user_profile import router as user_profile_router
from app.api.enhanced_router import router as enhanced_router
from app.api.playground import router as playground_router
from app.api.production_completion import router as production_completion_router
from app.api.clustering_api import router as clustering_api_router
from app.api.organizations import router as organizations_router
from app.api.classifier_analytics import router as classifier_analytics_router
from app.api.routing_analytics import router as routing_analytics_router
from app.api.cost_anomaly_api import router as cost_anomaly_router
from app.api.metrics_endpoint import router as metrics_router
from app.api.distillation_api import router as distillation_router
from app.api.savings_api import router as savings_router
from app.api.stripe_webhooks import router as stripe_webhook_router
from app.api.billing_api import router as billing_router
from app.api.admin_invoicing import router as admin_invoicing_router
from app.api.support_api import router as support_router


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API for LLM routing and optimization"
)

# Add Request Context middleware (must be added before CORS)
from app.middleware.request_context import RequestContextMiddleware
app.add_middleware(RequestContextMiddleware)

# Add CORS middleware
# In production, set CORS_ORIGINS to explicit origins (e.g. "https://app.nadir.dev,https://admin.nadir.dev")
_DEFAULT_LOCAL_ORIGINS = "http://localhost:8084,http://localhost:5173,http://localhost:3000"
_raw_cors = os.getenv("CORS_ORIGINS", "").strip()
if not _raw_cors:
    # Empty / unset: default to localhost origins (never wildcard)
    _cors_origins = [o.strip() for o in _DEFAULT_LOCAL_ORIGINS.split(",")]
    logger.info("CORS_ORIGINS not set — defaulting to localhost origins: %s", _cors_origins)
else:
    _cors_origins = [o.strip() for o in _raw_cors.split(",") if o.strip()]
_allow_all = "*" in _cors_origins
_is_production = os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")
if _allow_all and (_is_production or not settings.DEBUG):
    raise ValueError(
        "CORS_ORIGINS='*' is not allowed in production or non-debug mode. "
        "Set explicit origins via CORS_ORIGINS environment variable "
        "(e.g. 'https://app.nadir.dev,https://admin.nadir.dev')."
    )
if _allow_all:
    logger.warning(
        "CORS_ORIGINS is set to wildcard '*' (debug mode only). "
        "This MUST NOT be used in production — set ENVIRONMENT=production to enforce."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=(not _allow_all),  # credentials require explicit origins
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Request-ID", "Authorization"],
)

# Initialize services on startup
@app.on_event("startup")
async def startup_event():
    """Initialize Supabase and other services on startup."""
    healthy_services = []
    degraded_services = []

    # Configure thread pool for blocking I/O (Supabase client uses asyncio.to_thread).
    # Default pool is min(32, os.cpu_count()+4) which is too small under load.
    _max_workers = int(os.getenv("THREAD_POOL_MAX_WORKERS", "200"))
    _executor = concurrent.futures.ThreadPoolExecutor(
        max_workers=_max_workers,
        thread_name_prefix="nadir-io",
    )
    asyncio.get_running_loop().set_default_executor(_executor)
    app.state.executor = _executor
    logger.info("Thread pool executor configured (max_workers=%d)", _max_workers)

    # Check Supabase connection
    is_healthy = await supabase_db.health_check()
    if not is_healthy:
        if _is_production and not settings.DEBUG:
            raise RuntimeError(
                "Supabase connection failed during startup. "
                "Cannot serve traffic without database access. "
                "Set DEBUG=True to allow degraded startup."
            )
        logger.warning("Supabase connection failed during startup")
        degraded_services.append("supabase")
    else:
        logger.info("Supabase connection established")
        healthy_services.append("supabase")

    # Initialize litellm
    import litellm
    litellm.set_verbose = settings.DEBUG

    # Configure default model list
    if settings.LITELLM_MODEL_LIST:
        litellm.model_list = settings.LITELLM_MODEL_LIST

    # Check that at least one provider API key is configured
    has_api_keys = any([
        settings.OPENAI_API_KEY,
        settings.ANTHROPIC_API_KEY,
        settings.GOOGLE_API_KEY,
    ])
    if not has_api_keys:
        logger.warning("No provider API keys configured (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY) — LLM calls will fail")
        degraded_services.append("provider_keys")
    else:
        healthy_services.append("provider_keys")

    # Initialize predefined clusters in Supabase
    try:
        await clustering_service.initialize_clusters()
        logger.info("Clustering service initialized")
        healthy_services.append("clustering")
    except Exception as e:
        logger.warning(f"Failed to initialize clustering service: {e}")
        degraded_services.append("clustering")

    # Initialize local embedding clustering for fast classification
    try:
        from app.clusters.supabase_clustering import local_clustering_service
        await local_clustering_service.load_clusters()
        logger.info("Local embedding clustering initialized")
        healthy_services.append("local_clustering")
    except Exception as e:
        logger.warning(f"Failed to initialize local clustering: {e}")
        degraded_services.append("local_clustering")

    # Preload Gemma-3-270m model for fast routing
    try:
        from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
        logger.info("Preloading Gemma-3-270m model for fast routing...")

        # Create analyzer with preload=True to load model during startup
        gemma_analyzer = ComplexityAnalyzerFactory.create_analyzer(
            'phi2',
            preload_model=True
        )
        logger.info("Gemma-3-270m model preloaded successfully")

        # Store in app state for reuse
        app.state.gemma_analyzer = gemma_analyzer
        healthy_services.append("gemma_model")

    except Exception as e:
        logger.warning(f"Failed to preload Gemma-3-270m model: {e} — model will be loaded on first request")
        degraded_services.append("gemma_model")

    # Pre-warm binary complexity classifier (encode prototypes once)
    try:
        from app.complexity.binary_classifier import warmup as warmup_binary_classifier
        logger.info("Warming up binary complexity classifier...")
        warmup_binary_classifier()
        logger.info("Binary complexity classifier ready")
        healthy_services.append("binary_classifier")
    except Exception as e:
        logger.warning(f"Failed to warm up binary classifier: {e}")
        degraded_services.append("binary_classifier")

    # Schedule periodic centroid refresh from production data
    try:
        from app.services.background_tasks import refresh_classifier_centroids

        async def _centroid_refresh_loop():
            """Run one refresh 60s after startup, then every CLASSIFIER_CENTROID_REFRESH_HOURS."""
            await asyncio.sleep(60)
            interval = settings.CLASSIFIER_CENTROID_REFRESH_HOURS * 3600
            while True:
                try:
                    await refresh_classifier_centroids()
                except Exception as e:
                    logger.error("Centroid refresh failed: %s", e)
                await asyncio.sleep(interval)

        app.state.centroid_refresh_task = asyncio.create_task(_centroid_refresh_loop())
        logger.info(
            "Centroid refresh scheduled (first in 60s, then every %dh)",
            settings.CLASSIFIER_CENTROID_REFRESH_HOURS,
        )
        healthy_services.append("centroid_refresh")
    except Exception as e:
        logger.warning(f"Failed to schedule centroid refresh: {e}")
        degraded_services.append("centroid_refresh")

    # Schedule adaptive cluster discovery (daily)
    try:
        from app.services.adaptive_cluster_discovery import get_cluster_discovery

        async def _cluster_discovery_loop():
            await asyncio.sleep(3600)  # first run 1h after startup
            while True:
                try:
                    discovery = get_cluster_discovery()
                    saved = await discovery.run_and_save()
                    if saved:
                        logger.info("Cluster discovery: %d new suggestions", saved)
                except Exception as e:
                    logger.warning("Cluster discovery failed: %s", e)
                await asyncio.sleep(86400)  # 24 hours

        app.state.cluster_discovery_task = asyncio.create_task(_cluster_discovery_loop())
        logger.info("Adaptive cluster discovery scheduled (daily)")
        healthy_services.append("cluster_discovery")
    except Exception as e:
        logger.warning(f"Failed to schedule cluster discovery: {e}")
        degraded_services.append("cluster_discovery")

    # Schedule routing quality tracker (every 30 min)
    try:
        from app.services.routing_quality_tracker import get_routing_quality_tracker

        async def _routing_quality_loop():
            await asyncio.sleep(120)  # first run 2 min after startup
            while True:
                try:
                    tracker = get_routing_quality_tracker()
                    await tracker.run_periodic_check()
                except Exception as e:
                    logger.warning("Routing quality check failed: %s", e)
                await asyncio.sleep(1800)  # 30 minutes

        app.state.routing_quality_task = asyncio.create_task(_routing_quality_loop())
        logger.info("Routing quality tracker scheduled (every 30min)")
        healthy_services.append("routing_quality")
    except Exception as e:
        logger.warning(f"Failed to schedule routing quality tracker: {e}")
        degraded_services.append("routing_quality")

    # Start analytics event batcher
    try:
        from app.services.event_batcher import analytics_batcher
        await analytics_batcher.start()
        logger.info("Analytics event batcher started")
        healthy_services.append("event_batcher")
    except Exception as e:
        logger.warning(f"Failed to start event batcher: {e}")
        degraded_services.append("event_batcher")

    # Schedule provider health snapshot logging
    try:
        from app.middleware.provider_health_monitor import health_monitor

        async def _health_snapshot_loop():
            interval = settings.HEALTH_MONITOR_SNAPSHOT_INTERVAL
            await asyncio.sleep(interval)
            while True:
                try:
                    snapshot = health_monitor.get_all_health()
                    if snapshot:
                        logger.info("Provider health snapshot: %s", snapshot)
                except Exception as e:
                    logger.warning("Health snapshot failed: %s", e)
                await asyncio.sleep(interval)

        app.state.health_snapshot_task = asyncio.create_task(_health_snapshot_loop())
        logger.info(
            "Provider health snapshot scheduled (every %ds)",
            settings.HEALTH_MONITOR_SNAPSHOT_INTERVAL,
        )
        healthy_services.append("health_monitor")
    except Exception as e:
        logger.warning(f"Failed to schedule health monitor: {e}")
        degraded_services.append("health_monitor")

    # Schedule distillation monitor (polls training jobs, runs quality checks)
    try:
        if settings.DISTILLATION_ENABLED:
            from app.services.distillation_monitor import DistillationMonitor

            async def _distillation_monitor_loop():
                monitor = DistillationMonitor()
                interval = settings.DISTILLATION_MONITOR_INTERVAL_MINUTES * 60
                await asyncio.sleep(300)  # first run 5 min after startup
                while True:
                    try:
                        await monitor.run_poll_cycle()
                    except Exception as e:
                        logger.warning("Distillation monitor cycle failed: %s", e)
                    await asyncio.sleep(interval)

            app.state.distillation_monitor_task = asyncio.create_task(_distillation_monitor_loop())
            logger.info(
                "Distillation monitor scheduled (every %d min)",
                settings.DISTILLATION_MONITOR_INTERVAL_MINUTES,
            )
            healthy_services.append("distillation_monitor")
        else:
            logger.info("Distillation monitor disabled (DISTILLATION_ENABLED=False)")
    except Exception as e:
        logger.warning(f"Failed to schedule distillation monitor: {e}")
        degraded_services.append("distillation_monitor")

    # Schedule monthly savings invoice generation (1st of each month, 00:05 UTC)
    try:
        from app.services.invoice_scheduler import invoice_scheduler_loop

        app.state.invoice_scheduler_task = asyncio.create_task(invoice_scheduler_loop())
        logger.info("Monthly invoice scheduler started")
        healthy_services.append("invoice_scheduler")
    except Exception as e:
        logger.warning(f"Failed to start invoice scheduler: {e}")
        degraded_services.append("invoice_scheduler")

    # Startup summary
    logger.info(
        f"Startup complete — healthy: [{', '.join(healthy_services)}], "
        f"degraded: [{', '.join(degraded_services) or 'none'}]"
    )


@app.on_event("shutdown")
async def shutdown_event():
    """Graceful shutdown: stop background services and persist caches."""
    logger.info("Shutdown initiated — cleaning up services...")

    # Cancel periodic background loops and wait for clean exit
    for task_name in ("centroid_refresh_task", "routing_quality_task", "cluster_discovery_task", "health_snapshot_task", "distillation_monitor_task", "invoice_scheduler_task"):
        task = getattr(app.state, task_name, None)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            logger.info("%s cancelled", task_name)

    # Flush and stop event batcher
    try:
        from app.services.event_batcher import analytics_batcher
        await analytics_batcher.stop()
        logger.info("Analytics event batcher stopped")
    except Exception as e:
        logger.warning(f"Error stopping event batcher: {e}")

    # Persist embedding caches
    try:
        from app.services.embedding_cache import gemini_analyzer_cache, gemini_clustering_cache
        gemini_analyzer_cache._save_cache()
        gemini_clustering_cache._save_cache()
        logger.info("Embedding caches persisted")
    except Exception as e:
        logger.warning(f"Error persisting embedding caches: {e}")

    # Shutdown thread pool executor
    executor = getattr(app.state, "executor", None)
    if executor:
        executor.shutdown(wait=False)
        logger.info("Thread pool executor shut down")

    logger.info("Shutdown complete")

# Include API routers
app.include_router(production_completion_router)  # Production API endpoints
app.include_router(completion_router)
app.include_router(models_router)
app.include_router(logs_router)
app.include_router(health_router)
app.include_router(recommendation_router)
app.include_router(user_profile_router)
app.include_router(enhanced_router)             # Enhanced router API
app.include_router(playground_router)
app.include_router(clustering_api_router)         # Clustering API
app.include_router(organizations_router)          # Organizations API
app.include_router(classifier_analytics_router)    # Classifier Analytics API
app.include_router(routing_analytics_router)        # Routing Analytics API
app.include_router(cost_anomaly_router)             # Cost Anomaly Detection API
app.include_router(metrics_router)                   # Prometheus metrics
app.include_router(distillation_router)              # Distillation API
app.include_router(savings_router)                    # Savings tracking API
app.include_router(stripe_webhook_router)             # Stripe webhooks
app.include_router(billing_router)                     # Billing & subscription API
app.include_router(admin_invoicing_router)              # Admin invoicing trigger
app.include_router(support_router)                        # Support tickets API


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "ok",
    }
