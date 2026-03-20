"""
Distillation API — REST endpoints for cluster-based teacher-student distillation.

Provides endpoints for managing training data, fine-tuning jobs, expert models,
quality evaluation, and data export.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, UserSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/distillation", tags=["distillation"])


# ──────────────────────────── Request Models ────────────────────────────

class TrainRequest(BaseModel):
    job_type: str = Field(default="openai", description="openai or local")
    base_model: Optional[str] = None
    teacher_model: Optional[str] = None
    system_prompt: str = ""
    n_epochs: Optional[int] = None
    learning_rate_multiplier: Optional[float] = None
    min_samples: Optional[int] = None
    validation_split: Optional[float] = None


class ExportRequest(BaseModel):
    format: str = Field(default="jsonl", description="jsonl, alpaca, or sharegpt")
    system_prompt: str = ""


# ──────────────────────────── Cluster Status ────────────────────────────

@router.get("/status")
async def distillation_status(current_user: UserSession = Depends(validate_api_key)):
    """Overview of all clusters' distillation readiness."""
    from app.auth.supabase_auth import supabase
    from app.services.training_data_service import TrainingDataService
    from app.settings import settings

    user_id = str(current_user.id)
    td_service = TrainingDataService()

    # Get all clusters with samples for this user
    samples_result = (
        supabase.table("training_samples")
        .select("cluster_id")
        .eq("user_id", user_id)
        .execute()
    )
    cluster_ids = list({s["cluster_id"] for s in (samples_result.data or [])})

    clusters = []
    for cluster_id in sorted(cluster_ids):
        count = await td_service.get_sample_count(user_id, cluster_id)
        ready = count >= settings.DISTILLATION_MIN_SAMPLES

        # Check for active model
        model_result = (
            supabase.table("expert_models")
            .select("id, model_id, is_active, quality_score, quality_gate_passed")
            .eq("user_id", user_id)
            .eq("cluster_id", cluster_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        active_model = model_result.data[0] if model_result.data else None

        # Check for pending job
        job_result = (
            supabase.table("fine_tuning_jobs")
            .select("id, status, job_type")
            .eq("user_id", user_id)
            .eq("cluster_id", cluster_id)
            .in_("status", ["pending", "preparing_data", "uploading", "training", "evaluating"])
            .limit(1)
            .execute()
        )
        pending_job = job_result.data[0] if job_result.data else None

        clusters.append({
            "cluster_id": cluster_id,
            "sample_count": count,
            "min_samples": settings.DISTILLATION_MIN_SAMPLES,
            "ready_to_train": ready,
            "active_model": active_model,
            "pending_job": pending_job,
        })

    return {
        "user_id": user_id,
        "clusters": clusters,
        "distillation_enabled": settings.DISTILLATION_ENABLED,
        "auto_train": settings.DISTILLATION_AUTO_TRAIN,
    }


@router.get("/clusters/{cluster_id}/status")
async def cluster_status(
    cluster_id: str,
    current_user: UserSession = Depends(validate_api_key),
):
    """Detailed distillation status for one cluster."""
    from app.auth.supabase_auth import supabase
    from app.services.training_data_service import TrainingDataService
    from app.settings import settings

    user_id = str(current_user.id)
    td_service = TrainingDataService()

    count = await td_service.get_sample_count(user_id, cluster_id)

    # Get models
    models_result = (
        supabase.table("expert_models")
        .select("*")
        .eq("user_id", user_id)
        .eq("cluster_id", cluster_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Get jobs
    jobs_result = (
        supabase.table("fine_tuning_jobs")
        .select("*")
        .eq("user_id", user_id)
        .eq("cluster_id", cluster_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    return {
        "cluster_id": cluster_id,
        "sample_count": count,
        "min_samples": settings.DISTILLATION_MIN_SAMPLES,
        "ready_to_train": count >= settings.DISTILLATION_MIN_SAMPLES,
        "models": models_result.data or [],
        "jobs": jobs_result.data or [],
    }


@router.get("/clusters/{cluster_id}/samples")
async def preview_samples(
    cluster_id: str,
    limit: int = Query(default=20, le=100),
    current_user: UserSession = Depends(validate_api_key),
):
    """Preview training samples for a cluster."""
    from app.services.training_data_service import TrainingDataService

    td_service = TrainingDataService()
    samples = await td_service.get_samples(str(current_user.id), cluster_id, limit=limit)

    return {
        "cluster_id": cluster_id,
        "count": len(samples),
        "samples": [
            {
                "id": s.get("id"),
                "prompt": s["prompt"][:200] + "..." if len(s["prompt"]) > 200 else s["prompt"],
                "response": s["response"][:200] + "..." if len(s["response"]) > 200 else s["response"],
                "model_used": s.get("model_used"),
                "created_at": s.get("created_at"),
            }
            for s in samples
        ],
    }


# ──────────────────────────── Training Jobs ─────────────────────────────

@router.post("/clusters/{cluster_id}/train")
async def trigger_training(
    cluster_id: str,
    request: TrainRequest,
    current_user: UserSession = Depends(validate_api_key),
):
    """Trigger fine-tuning for a cluster."""
    from app.services.fine_tuning_service import FineTuningService
    from app.services.training_data_service import TrainingDataService
    from app.settings import settings

    user_id = str(current_user.id)

    # Check minimum samples
    td_service = TrainingDataService()
    min_samples = request.min_samples or settings.DISTILLATION_MIN_SAMPLES
    count = await td_service.get_sample_count(user_id, cluster_id)
    if count < min_samples:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough samples ({count}/{min_samples}). Need at least {min_samples} samples.",
        )

    ft_service = FineTuningService()

    # Build hyperparameters
    hyperparameters = {}
    if request.n_epochs is not None:
        hyperparameters["n_epochs"] = request.n_epochs
    if request.learning_rate_multiplier is not None:
        hyperparameters["learning_rate_multiplier"] = request.learning_rate_multiplier

    if request.job_type == "local":
        result = await ft_service.create_local_fine_tune(
            user_id=user_id,
            cluster_id=cluster_id,
            base_model=request.base_model,
            teacher_model=request.teacher_model,
            system_prompt=request.system_prompt,
            hyperparameters=hyperparameters,
            validation_split=request.validation_split,
            trigger_type="manual",
        )
    else:
        result = await ft_service.create_openai_fine_tune(
            user_id=user_id,
            cluster_id=cluster_id,
            base_model=request.base_model,
            teacher_model=request.teacher_model,
            system_prompt=request.system_prompt,
            hyperparameters=hyperparameters,
            validation_split=request.validation_split,
            trigger_type="manual",
        )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return result


@router.get("/jobs")
async def list_jobs(current_user: UserSession = Depends(validate_api_key)):
    """List all distillation jobs."""
    from app.services.fine_tuning_service import FineTuningService

    ft_service = FineTuningService()
    jobs = await ft_service.get_jobs(str(current_user.id))
    return {"jobs": jobs}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, current_user: UserSession = Depends(validate_api_key)):
    """Get detailed job status."""
    from app.services.fine_tuning_service import FineTuningService

    ft_service = FineTuningService()
    job = await ft_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Verify ownership
    if job.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    return job


@router.delete("/jobs/{job_id}")
async def cancel_job(job_id: str, current_user: UserSession = Depends(validate_api_key)):
    """Cancel a running job."""
    from app.services.fine_tuning_service import FineTuningService

    ft_service = FineTuningService()
    job = await ft_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    success = await ft_service.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to cancel job")

    return {"status": "cancelled", "job_id": job_id}


# ──────────────────────────── Expert Models ─────────────────────────────

@router.get("/models")
async def list_models(current_user: UserSession = Depends(validate_api_key)):
    """List distilled models."""
    from app.services.expert_model_service import ExpertModelService

    expert_service = ExpertModelService()
    models = await expert_service.get_expert_models(str(current_user.id))
    return {"models": models}


@router.post("/models/{model_id}/activate")
async def activate_model(model_id: str, current_user: UserSession = Depends(validate_api_key)):
    """Manually activate an expert model."""
    from app.auth.supabase_auth import supabase
    from app.services.expert_model_service import ExpertModelService

    # Verify ownership
    model_result = supabase.table("expert_models").select("user_id").eq("id", model_id).single().execute()
    if not model_result.data or model_result.data["user_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    expert_service = ExpertModelService()
    success = await expert_service.toggle_expert_model(model_id, True)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to activate model")

    return {"status": "activated", "model_id": model_id}


@router.post("/models/{model_id}/deactivate")
async def deactivate_model(model_id: str, current_user: UserSession = Depends(validate_api_key)):
    """Deactivate an expert model."""
    from app.auth.supabase_auth import supabase
    from app.services.expert_model_service import ExpertModelService

    model_result = supabase.table("expert_models").select("user_id").eq("id", model_id).single().execute()
    if not model_result.data or model_result.data["user_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    expert_service = ExpertModelService()
    success = await expert_service.toggle_expert_model(model_id, False, reason="Manual deactivation")
    if not success:
        raise HTTPException(status_code=500, detail="Failed to deactivate model")

    return {"status": "deactivated", "model_id": model_id}


@router.post("/models/{model_id}/evaluate")
async def evaluate_model(
    model_id: str,
    sample_size: int = Query(default=10, le=50),
    current_user: UserSession = Depends(validate_api_key),
):
    """Run quality check on a model."""
    from app.auth.supabase_auth import supabase
    from app.services.quality_monitor import QualityMonitor

    model_result = supabase.table("expert_models").select("user_id").eq("id", model_id).single().execute()
    if not model_result.data or model_result.data["user_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    monitor = QualityMonitor()
    result = await monitor.run_quality_gate(model_id, sample_size=sample_size)

    return {
        "expert_model_id": result.expert_model_id,
        "check_type": result.check_type,
        "prompts_evaluated": result.prompts_evaluated,
        "avg_similarity": result.avg_similarity,
        "pass_rate": result.pass_rate,
        "passed": result.passed,
    }


@router.get("/models/{model_id}/quality")
async def quality_history(
    model_id: str,
    limit: int = Query(default=20, le=100),
    current_user: UserSession = Depends(validate_api_key),
):
    """Get quality check history for a model."""
    from app.auth.supabase_auth import supabase

    # Verify ownership
    model_result = supabase.table("expert_models").select("user_id").eq("id", model_id).single().execute()
    if not model_result.data or model_result.data["user_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    evals_result = (
        supabase.table("expert_model_evaluations")
        .select("*")
        .eq("expert_model_id", model_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    return {"model_id": model_id, "evaluations": evals_result.data or []}


# ──────────────────────────── Data Export ────────────────────────────────

@router.post("/clusters/{cluster_id}/export")
async def export_training_data(
    cluster_id: str,
    request: ExportRequest,
    current_user: UserSession = Depends(validate_api_key),
):
    """Export training data in various formats."""
    from app.services.training_data_service import TrainingDataService

    td_service = TrainingDataService()
    samples = await td_service.get_samples(str(current_user.id), cluster_id, limit=5000)

    if not samples:
        raise HTTPException(status_code=404, detail="No training samples found for this cluster")

    if request.format == "alpaca":
        content = td_service.format_alpaca(samples)
    elif request.format == "sharegpt":
        content = td_service.format_sharegpt(samples)
    else:
        content = td_service.format_openai_jsonl(samples, system_prompt=request.system_prompt)

    return {
        "cluster_id": cluster_id,
        "format": request.format,
        "sample_count": len(samples),
        "content": content,
    }
