"""
Fine-Tuning Service for Distillation Pipeline.

Manages OpenAI fine-tuning jobs and local LoRA fine-tuning for
cluster-based teacher-student distillation.
"""

import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from app.services.training_data_service import TrainingDataService
from app.settings import settings

logger = logging.getLogger(__name__)


class FineTuningService:
    """Service for managing fine-tuning jobs (OpenAI and local LoRA)."""

    def __init__(self):
        self.training_data_service = TrainingDataService()

    async def create_openai_fine_tune(
        self,
        user_id: str,
        cluster_id: str,
        base_model: str = None,
        teacher_model: str = None,
        system_prompt: str = "",
        hyperparameters: Dict = None,
        validation_split: float = None,
        trigger_type: str = "manual",
    ) -> Dict[str, Any]:
        """Create an OpenAI fine-tuning job for a user+cluster."""
        from app.auth.supabase_auth import supabase

        if base_model is None:
            base_model = settings.DISTILLATION_BASE_MODEL
        if validation_split is None:
            validation_split = settings.DISTILLATION_VALIDATION_SPLIT
        if hyperparameters is None:
            hyperparameters = {}

        job_id = None
        try:
            # 1. Create job record
            job_result = (
                supabase.table("fine_tuning_jobs")
                .insert(
                    {
                        "user_id": user_id,
                        "cluster_id": cluster_id,
                        "job_type": "openai",
                        "base_model": base_model,
                        "teacher_model": teacher_model,
                        "status": "preparing_data",
                        "hyperparameters": hyperparameters,
                        "trigger_type": trigger_type,
                    }
                )
                .execute()
            )
            job_id = job_result.data[0]["id"]

            # 2. Get and split samples
            train_samples, val_samples = await self.training_data_service.prepare_training_set(
                user_id, cluster_id, validation_split=validation_split
            )
            if not train_samples:
                raise ValueError("No training samples available")

            # Update sample counts
            supabase.table("fine_tuning_jobs").update({
                "training_samples_count": len(train_samples),
                "validation_samples_count": len(val_samples),
            }).eq("id", job_id).execute()

            # 3. Format as JSONL
            train_jsonl = self.training_data_service.format_openai_jsonl(
                train_samples, system_prompt=system_prompt
            )
            val_jsonl = self.training_data_service.format_openai_jsonl(
                val_samples, system_prompt=system_prompt
            ) if val_samples else None

            # 4. Upload to OpenAI Files API
            supabase.table("fine_tuning_jobs").update({"status": "uploading"}).eq("id", job_id).execute()

            import openai
            client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

            # Upload training file
            with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
                f.write(train_jsonl)
                f.flush()
                with open(f.name, "rb") as upload_file:
                    train_file = client.files.create(file=upload_file, purpose="fine-tune")
            os.unlink(f.name)

            # Upload validation file if available
            val_file_id = None
            if val_jsonl:
                with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
                    f.write(val_jsonl)
                    f.flush()
                    with open(f.name, "rb") as upload_file:
                        val_file = client.files.create(file=upload_file, purpose="fine-tune")
                        val_file_id = val_file.id
                os.unlink(f.name)

            # 5. Create fine-tuning job
            ft_kwargs = {
                "training_file": train_file.id,
                "model": base_model,
            }
            if val_file_id:
                ft_kwargs["validation_file"] = val_file_id
            if hyperparameters:
                ft_kwargs["hyperparameters"] = hyperparameters

            ft_response = client.fine_tuning.jobs.create(**ft_kwargs)

            # 6. Update job record
            supabase.table("fine_tuning_jobs").update(
                {
                    "openai_job_id": ft_response.id,
                    "openai_file_id": train_file.id,
                    "status": "training",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", job_id).execute()

            logger.info(f"Created OpenAI fine-tuning job {ft_response.id} for user={user_id} cluster={cluster_id}")
            return {
                "job_id": job_id,
                "openai_job_id": ft_response.id,
                "status": "training",
                "training_samples": len(train_samples),
                "validation_samples": len(val_samples),
            }

        except Exception as e:
            logger.error(f"Error creating OpenAI fine-tune: {e}")
            if job_id:
                supabase.table("fine_tuning_jobs").update(
                    {
                        "status": "failed",
                        "error_message": str(e),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", job_id).execute()
            return {"error": str(e), "status": "failed"}

    async def create_local_fine_tune(
        self,
        user_id: str,
        cluster_id: str,
        base_model: str = None,
        teacher_model: str = None,
        system_prompt: str = "",
        hyperparameters: Dict = None,
        validation_split: float = None,
        trigger_type: str = "manual",
    ) -> Dict[str, Any]:
        """
        Create a local LoRA fine-tuning job.
        Exports training data to disk and records the job for local training.
        """
        from app.auth.supabase_auth import supabase

        if base_model is None:
            base_model = settings.DISTILLATION_LOCAL_BASE_MODEL
        if validation_split is None:
            validation_split = settings.DISTILLATION_VALIDATION_SPLIT
        if hyperparameters is None:
            hyperparameters = {}

        job_id = None
        try:
            # 1. Create job record
            job_result = (
                supabase.table("fine_tuning_jobs")
                .insert(
                    {
                        "user_id": user_id,
                        "cluster_id": cluster_id,
                        "job_type": "local",
                        "base_model": base_model,
                        "teacher_model": teacher_model,
                        "status": "preparing_data",
                        "hyperparameters": hyperparameters,
                        "trigger_type": trigger_type,
                    }
                )
                .execute()
            )
            job_id = job_result.data[0]["id"]

            # 2. Get and split samples
            train_samples, val_samples = await self.training_data_service.prepare_training_set(
                user_id, cluster_id, validation_split=validation_split
            )
            if not train_samples:
                raise ValueError("No training samples available")

            supabase.table("fine_tuning_jobs").update({
                "training_samples_count": len(train_samples),
                "validation_samples_count": len(val_samples),
            }).eq("id", job_id).execute()

            # 3. Export training data to disk
            output_dir = os.path.join("app", "models", "distilled", user_id, cluster_id)
            os.makedirs(output_dir, exist_ok=True)

            train_path = os.path.join(output_dir, "train.jsonl")
            val_path = os.path.join(output_dir, "val.jsonl")

            train_jsonl = self.training_data_service.format_openai_jsonl(
                train_samples, system_prompt=system_prompt
            )
            with open(train_path, "w") as f:
                f.write(train_jsonl)

            if val_samples:
                val_jsonl = self.training_data_service.format_openai_jsonl(
                    val_samples, system_prompt=system_prompt
                )
                with open(val_path, "w") as f:
                    f.write(val_jsonl)

            # 4. Update job with export location
            supabase.table("fine_tuning_jobs").update(
                {
                    "status": "training",
                    "export_file_url": output_dir,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", job_id).execute()

            logger.info(
                f"Local fine-tune job {job_id} prepared: {len(train_samples)} train, "
                f"{len(val_samples)} val samples exported to {output_dir}"
            )
            return {
                "job_id": job_id,
                "status": "training",
                "job_type": "local",
                "base_model": base_model,
                "output_dir": output_dir,
                "training_samples": len(train_samples),
                "validation_samples": len(val_samples),
            }

        except Exception as e:
            logger.error(f"Error creating local fine-tune: {e}")
            if job_id:
                supabase.table("fine_tuning_jobs").update(
                    {
                        "status": "failed",
                        "error_message": str(e),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", job_id).execute()
            return {"error": str(e), "status": "failed"}

    async def check_openai_job_status(self, job_id: str) -> Dict[str, Any]:
        """Poll OpenAI API for fine-tuning job status and update DB."""
        from app.auth.supabase_auth import supabase

        try:
            job_result = supabase.table("fine_tuning_jobs").select("*").eq("id", job_id).single().execute()
            job = job_result.data
            if not job or not job.get("openai_job_id"):
                return {"error": "Job not found or no OpenAI job ID"}

            import openai
            client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
            ft_job = client.fine_tuning.jobs.retrieve(job["openai_job_id"])

            status_map = {
                "validating_files": "preparing_data",
                "queued": "training",
                "running": "training",
                "succeeded": "completed",
                "failed": "failed",
                "cancelled": "cancelled",
            }
            new_status = status_map.get(ft_job.status, job["status"])

            update_data = {
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            # Capture metrics if available
            if hasattr(ft_job, "result_files") and ft_job.result_files:
                update_data["metrics"] = {"result_files": ft_job.result_files}

            if ft_job.status == "succeeded" and ft_job.fine_tuned_model:
                update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
                update_data["status"] = "evaluating"  # Go to evaluation, not directly completed
                supabase.table("fine_tuning_jobs").update(update_data).eq("id", job_id).execute()
                await self.on_training_complete(job_id, ft_job.fine_tuned_model)
            elif ft_job.status in ("failed", "cancelled"):
                error_msg = "Training failed"
                if hasattr(ft_job, "error") and ft_job.error:
                    error_msg = getattr(ft_job.error, "message", str(ft_job.error))
                update_data["error_message"] = error_msg
                supabase.table("fine_tuning_jobs").update(update_data).eq("id", job_id).execute()
            else:
                supabase.table("fine_tuning_jobs").update(update_data).eq("id", job_id).execute()

            return {"job_id": job_id, "status": new_status, "openai_status": ft_job.status}

        except Exception as e:
            logger.error(f"Error checking OpenAI job status: {e}")
            return {"error": str(e)}

    async def on_training_complete(self, job_id: str, fine_tuned_model_id: str) -> Dict[str, Any]:
        """
        Create expert_models entry when training completes.
        Sets is_active=False and quality_gate_passed=False — activation
        requires passing the quality gate.
        """
        from app.auth.supabase_auth import supabase

        try:
            job_result = supabase.table("fine_tuning_jobs").select("*").eq("id", job_id).single().execute()
            job = job_result.data

            result = (
                supabase.table("expert_models")
                .insert(
                    {
                        "user_id": job["user_id"],
                        "cluster_id": job["cluster_id"],
                        "fine_tuning_job_id": job_id,
                        "model_id": fine_tuned_model_id,
                        "base_model": job.get("base_model"),
                        "teacher_model": job.get("teacher_model"),
                        "is_active": False,
                        "quality_gate_passed": False,
                        "quality_score": None,
                    }
                )
                .execute()
            )

            expert_model_id = result.data[0]["id"]
            logger.info(f"Created expert model {fine_tuned_model_id} (inactive, pending quality gate) for job {job_id}")
            return {"expert_model_id": expert_model_id, "model_id": fine_tuned_model_id}
        except Exception as e:
            logger.error(f"Error creating expert model entry: {e}")
            return {"error": str(e)}

    async def get_jobs(self, user_id: str) -> List[Dict[str, Any]]:
        """List all fine-tuning jobs for a user."""
        try:
            from app.auth.supabase_auth import supabase

            result = (
                supabase.table("fine_tuning_jobs")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return result.data or []
        except Exception as e:
            logger.error(f"Error listing fine-tuning jobs: {e}")
            return []

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed job status."""
        try:
            from app.auth.supabase_auth import supabase

            result = supabase.table("fine_tuning_jobs").select("*").eq("id", job_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error getting job {job_id}: {e}")
            return None

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job."""
        from app.auth.supabase_auth import supabase

        try:
            job = await self.get_job(job_id)
            if not job:
                return False

            if job.get("openai_job_id") and job["status"] == "training":
                import openai
                client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
                client.fine_tuning.jobs.cancel(job["openai_job_id"])

            supabase.table("fine_tuning_jobs").update(
                {
                    "status": "cancelled",
                    "error_message": "Cancelled by user",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", job_id).execute()

            return True
        except Exception as e:
            logger.error(f"Error cancelling job {job_id}: {e}")
            return False
