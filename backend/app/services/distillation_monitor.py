"""
Distillation Monitor — Background Task.

Polls active OpenAI fine-tuning jobs, runs quality gates on newly completed
models, performs periodic quality checks on deployed models, and optionally
auto-triggers training for eligible clusters.
"""

import logging
from datetime import datetime, timezone, timedelta

from app.settings import settings

logger = logging.getLogger(__name__)


class DistillationMonitor:
    """Background monitor for the distillation pipeline."""

    def __init__(self):
        self.poll_interval_minutes = settings.DISTILLATION_MONITOR_INTERVAL_MINUTES
        self.quality_check_interval_hours = settings.DISTILLATION_QUALITY_CHECK_HOURS

    async def run_poll_cycle(self):
        """
        Single poll cycle:
        1. Poll all 'training' status OpenAI jobs for completion
        2. Run quality gates on 'evaluating' status jobs
        3. Run periodic quality checks on active expert models (every 24h)
        4. If auto_train enabled: scan for eligible clusters
        """
        await self._poll_training_jobs()
        await self._run_pending_quality_gates()
        await self._run_periodic_quality_checks()

        if settings.DISTILLATION_AUTO_TRAIN:
            await self._scan_eligible_clusters()

    async def _poll_training_jobs(self):
        """Poll OpenAI API for all in-progress fine-tuning jobs."""
        try:
            from app.auth.supabase_auth import supabase
            from app.services.fine_tuning_service import FineTuningService

            # Get all jobs that are currently training (OpenAI type)
            result = (
                supabase.table("fine_tuning_jobs")
                .select("id, openai_job_id, job_type")
                .eq("status", "training")
                .eq("job_type", "openai")
                .execute()
            )
            jobs = result.data or []

            if not jobs:
                return

            ft_service = FineTuningService()
            for job in jobs:
                try:
                    status_result = await ft_service.check_openai_job_status(job["id"])
                    if status_result.get("status") in ("completed", "evaluating"):
                        logger.info(f"Training job {job['id']} completed, quality gate pending")
                    elif status_result.get("status") in ("failed", "cancelled"):
                        logger.warning(f"Training job {job['id']} ended with status: {status_result.get('status')}")
                except Exception as e:
                    logger.warning(f"Error polling job {job['id']}: {e}")

        except Exception as e:
            logger.error(f"Error polling training jobs: {e}")

    async def _run_pending_quality_gates(self):
        """Run quality gates on models from jobs in 'evaluating' status."""
        try:
            from app.auth.supabase_auth import supabase
            from app.services.quality_monitor import QualityMonitor

            # Find expert models that haven't passed quality gate yet
            result = (
                supabase.table("expert_models")
                .select("id, fine_tuning_job_id")
                .eq("quality_gate_passed", False)
                .eq("is_active", False)
                .execute()
            )
            pending_models = result.data or []

            if not pending_models:
                return

            monitor = QualityMonitor()
            for model in pending_models:
                try:
                    gate_result = await monitor.run_quality_gate(model["id"])
                    logger.info(
                        f"Quality gate for {model['id']}: passed={gate_result.passed}, "
                        f"avg_similarity={gate_result.avg_similarity:.2f}"
                    )
                except Exception as e:
                    logger.warning(f"Quality gate failed for model {model['id']}: {e}")

        except Exception as e:
            logger.error(f"Error running quality gates: {e}")

    async def _run_periodic_quality_checks(self):
        """Run periodic quality checks on active expert models that haven't been checked recently."""
        try:
            from app.auth.supabase_auth import supabase
            from app.services.quality_monitor import QualityMonitor

            cutoff = (
                datetime.now(timezone.utc)
                - timedelta(hours=self.quality_check_interval_hours)
            ).isoformat()

            # Find active models that haven't been checked in quality_check_interval_hours
            result = (
                supabase.table("expert_models")
                .select("id, last_quality_check")
                .eq("is_active", True)
                .eq("quality_gate_passed", True)
                .execute()
            )
            models = result.data or []

            monitor = QualityMonitor()
            for model in models:
                last_check = model.get("last_quality_check")
                if last_check and last_check > cutoff:
                    continue  # Checked recently, skip

                try:
                    check_result = await monitor.run_periodic_check(model["id"])
                    logger.info(
                        f"Periodic check for {model['id']}: "
                        f"avg_similarity={check_result.avg_similarity:.2f}, passed={check_result.passed}"
                    )
                except Exception as e:
                    logger.warning(f"Periodic quality check failed for model {model['id']}: {e}")

        except Exception as e:
            logger.error(f"Error running periodic quality checks: {e}")

    async def _scan_eligible_clusters(self):
        """
        Auto-train: find clusters with enough samples that don't have an active
        expert model or pending training job.
        """
        try:
            from app.auth.supabase_auth import supabase
            from app.services.training_data_service import TrainingDataService

            min_samples = settings.DISTILLATION_MIN_SAMPLES

            # Get distinct user_id + cluster_id pairs with sample counts
            result = (
                supabase.rpc(
                    "get_cluster_sample_counts",
                    {}
                ).execute()
            )
            # If RPC doesn't exist, fall back to a simpler approach
            if not result.data:
                # Simple fallback: get all training samples grouped
                samples_result = (
                    supabase.table("training_samples")
                    .select("user_id, cluster_id", count="exact")
                    .execute()
                )
                # Can't easily group by in PostgREST, so skip auto-train for now
                logger.debug("Auto-train scan: no RPC available, skipping")
                return

            td_service = TrainingDataService()
            for row in result.data:
                user_id = row["user_id"]
                cluster_id = row["cluster_id"]
                count = row["count"]

                if count < min_samples:
                    continue

                # Check if there's already an active model or pending job
                active_model = (
                    supabase.table("expert_models")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("cluster_id", cluster_id)
                    .eq("is_active", True)
                    .limit(1)
                    .execute()
                )
                if active_model.data:
                    continue

                pending_job = (
                    supabase.table("fine_tuning_jobs")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("cluster_id", cluster_id)
                    .in_("status", ["pending", "preparing_data", "uploading", "training", "evaluating"])
                    .limit(1)
                    .execute()
                )
                if pending_job.data:
                    continue

                # Trigger training
                from app.services.fine_tuning_service import FineTuningService
                ft_service = FineTuningService()
                result = await ft_service.create_openai_fine_tune(
                    user_id=user_id,
                    cluster_id=cluster_id,
                    trigger_type="auto",
                )
                logger.info(f"Auto-triggered training for user={user_id} cluster={cluster_id}: {result}")

        except Exception as e:
            logger.debug(f"Auto-train scan failed (expected if RPC not configured): {e}")
