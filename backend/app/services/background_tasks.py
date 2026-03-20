"""
Background task processing for Nadir.

This module provides functions for running tasks in the background
to avoid impacting API latency. It can use either asyncio or Celery
depending on configuration.
"""
import asyncio
import logging
import uuid
import pickle
from typing import Callable, Coroutine, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Optional Celery import
try:
    from celery import Celery
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    Celery = None

from app.settings import settings

# Create Celery instance if enabled
celery_app = None
if CELERY_AVAILABLE and hasattr(settings, 'USE_CELERY') and settings.USE_CELERY:
    celery_app = Celery("nadir")
    celery_app.conf.broker_url = settings.REDIS_URI
    celery_app.conf.result_backend = settings.REDIS_URI


def run_async(coro):
    """Run an async function in a synchronous context."""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)


class BackgroundTaskService:
    """Service for managing background tasks."""
    
    @staticmethod
    async def run_in_background(
        func: Callable[..., Coroutine[Any, Any, Any]], 
        *args, 
        **kwargs
    ) -> None:
        """
        Run a task in the background using asyncio.
        
        Args:
            func: Async function to run
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function
        """
        if CELERY_AVAILABLE and hasattr(settings, 'USE_CELERY') and settings.USE_CELERY:
            # Run using Celery
            BackgroundTaskService._run_with_celery(func, *args, **kwargs)
        else:
            # Run using asyncio
            asyncio.create_task(func(*args, **kwargs))
    
    @staticmethod
    def _run_with_celery(func, *args, **kwargs):
        """Run a task using Celery."""
        if not celery_app:
            raise RuntimeError("Celery is not configured")
        
        @celery_app.task
        def _celery_task(*task_args, **task_kwargs):
            run_async(func(*task_args, **task_kwargs))
        
        _celery_task.delay(*args, **kwargs)


async def refresh_classifier_centroids() -> None:
    """
    Periodically recompute classifier centroids from production data.

    Uses a validation gate: new centroids are only applied if they improve
    (or don't degrade) classification accuracy on a held-out eval set built
    from admin-corrected examples + seed prototypes.
    """
    try:
        from app.complexity.classifier_learning import get_learning_service
        from app.complexity.binary_classifier import get_singleton, _load_prototypes
        import numpy as np

        service = get_learning_service()
        singleton = get_singleton()
        if singleton is None:
            logger.info("Classifier centroid refresh skipped (no singleton)")
            return

        # Compute new centroids
        new_centroids = service.compute_refined_centroids()
        if new_centroids is None:
            logger.info("Classifier centroid refresh skipped (no data)")
            return

        new_simple, new_medium, new_complex = new_centroids

        # Build a small validation set from seed prototypes (random 20 each)
        import random
        seed_simple, seed_medium, seed_complex = _load_prototypes()
        val_set = (
            [(t, "simple") for t in random.sample(seed_simple, min(20, len(seed_simple)))]
            + [(t, "medium") for t in random.sample(seed_medium, min(20, len(seed_medium)))]
            + [(t, "complex") for t in random.sample(seed_complex, min(20, len(seed_complex)))]
        )

        if len(val_set) < 10:
            # Not enough validation data — apply unconditionally
            singleton.refresh_centroids(new_simple, new_medium, new_complex)
            logger.info("Classifier centroids refreshed (no validation set available)")
            return

        # Evaluate accuracy with OLD centroids
        old_correct = 0
        for text, true_tier in val_set:
            tier, _, _ = singleton.classify(text)
            if tier == true_tier:
                old_correct += 1
        old_acc = old_correct / len(val_set)

        # Save old centroids for potential rollback
        old_simple = singleton._simple_centroid.copy()
        old_medium = singleton._medium_centroid.copy()
        old_complex = singleton._complex_centroids.copy()

        # Apply new centroids temporarily
        singleton.refresh_centroids(new_simple, new_medium, new_complex)

        # Evaluate accuracy with NEW centroids
        new_correct = 0
        for text, true_tier in val_set:
            tier, _, _ = singleton.classify(text)
            if tier == true_tier:
                new_correct += 1
        new_acc = new_correct / len(val_set)

        if new_acc >= old_acc:
            logger.info(
                "Classifier centroids refreshed — accuracy: %.1f%% → %.1f%% (%+.1f%%)",
                old_acc * 100, new_acc * 100, (new_acc - old_acc) * 100,
            )
        else:
            # Rollback
            singleton.refresh_centroids(old_simple, old_medium, old_complex)
            logger.warning(
                "Classifier centroid refresh ROLLED BACK — accuracy would drop: %.1f%% → %.1f%%",
                old_acc * 100, new_acc * 100,
            )

    except Exception as e:
        logger.error("Error refreshing classifier centroids: %s", e)


async def process_completion_in_background(
    completion_id: uuid.UUID,
    user_id: uuid.UUID,
    prompt: str,
    session = None,
    cluster_id: Optional[str] = None,
) -> None:
    """
    Process a completion in the background.
    
    Args:
        completion_id: Completion ID
        user_id: User ID
        prompt: Prompt text
        session: Database session
        cluster_id: Optional cluster ID
    """
    # Import here to avoid circular imports
    from app.clusters.gemini_clustering import GeminiClusteringService
    
    try:
        # Create a new session for the background task to avoid conflicts
        # with the main request session
        from app.database.base import get_session
        
        async with get_session().__anext__() as bg_session:
            # Run clustering if not already assigned
            if not cluster_id:
                clustering_service = GeminiClusteringService()
                
                # Check if user is a beta client
                from app.routing.core import check_if_beta_client
                is_beta = await check_if_beta_client(user_id, bg_session)
                
                if is_beta:
                    # For beta clients, use predefined clusters
                    result = await clustering_service.cluster_to_predefined(prompt, user_id)
                else:
                    # For other users, use user-specific clusters
                    result = await clustering_service.cluster_to_user_clusters(prompt, user_id)
                
                cluster_id = result["cluster_id"]
                
                # Update the completion with cluster_id
                try:
                    from sqlalchemy import update
                    from app.database.models import Completion
                    
                    await bg_session.execute(
                        update(Completion)
                        .where(Completion.id == completion_id)
                        .values(cluster_id=cluster_id)
                    )
                    
                    await bg_session.commit()
                except ImportError:
                    # SQLAlchemy not available, skip database update
                    pass
            
            # Check if we should train an expert model
            await check_for_expert_model_training(user_id, cluster_id, bg_session)
    
    except Exception as e:
        logger.error(f"Error in background task: {str(e)}")


async def check_for_expert_model_training(
    user_id: uuid.UUID, cluster_id: str, session = None
) -> bool:
    """
    Check if we should train an expert model for a user and cluster.
    
    Args:
        user_id: User ID
        cluster_id: Cluster ID
        session: Database session
    
    Returns:
        True if expert model training should be initiated
    """
    try:
        from sqlalchemy import select, func
        from app.database.models import Completion, ExpertModel
    except ImportError:
        # SQLAlchemy not available, return False
        return False
    
    # Check if user already has an expert model for this cluster
    result = await session.execute(
        select(ExpertModel)
        .where(
            ExpertModel.user_id == user_id,
            ExpertModel.cluster_id == cluster_id,
            ExpertModel.is_active == True
        )
    )
    
    if result.scalars().first():
        return False  # Expert model already exists
    
    # Count user's completions for this cluster
    result = await session.execute(
        select(func.count())
        .select_from(Completion)
        .where(
            Completion.user_id == user_id,
            Completion.cluster_id == cluster_id
        )
    )
    
    count = result.scalar_one()
    
    # Check if we have enough samples to train
    if count >= settings.MIN_SAMPLES_FOR_EXPERT_MODEL:
        # Queue expert model training in the background
        if CELERY_AVAILABLE and hasattr(settings, 'USE_CELERY') and settings.USE_CELERY:
            # Use Celery
            from app.services.expert_model_service import train_expert_model
            
            @celery_app.task
            def train_expert_model_task(user_id_str, cluster_id_str):
                run_async(train_expert_model(uuid.UUID(user_id_str), cluster_id_str))
            
            train_expert_model_task.delay(str(user_id), cluster_id)
        else:
            # Use asyncio
            from app.services.expert_model_service import train_expert_model
            asyncio.create_task(train_expert_model(user_id, cluster_id))
        
        return True
    
    return False 