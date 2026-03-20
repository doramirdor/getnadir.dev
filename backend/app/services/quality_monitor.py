"""
Quality Monitor for Distilled Models.

Implements the quality gate (post-training check) and ongoing periodic
quality monitoring for expert models created via teacher-student distillation.
"""

import logging
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class QualityCheckResult:
    expert_model_id: str
    check_type: str
    prompts_evaluated: int
    avg_similarity: float
    pass_rate: float
    passed: bool
    details: dict


class QualityMonitor:
    """Quality gate and ongoing monitoring for distilled models."""

    def __init__(self):
        self.quality_threshold = settings.DISTILLATION_QUALITY_THRESHOLD
        self.pass_rate_threshold = settings.DISTILLATION_PASS_RATE_THRESHOLD

    async def _compute_response_similarity(self, response_a: str, response_b: str) -> float:
        """Compute cosine similarity between two responses using shared encoder."""
        try:
            from app.services.embedding_cache import get_shared_encoder

            encoder = await get_shared_encoder()
            embeddings = encoder.encode([response_a, response_b], show_progress_bar=False)
            similarity = float(
                np.dot(embeddings[0], embeddings[1])
                / (np.linalg.norm(embeddings[0]) * np.linalg.norm(embeddings[1]))
            )
            return similarity
        except Exception as e:
            logger.error(f"Error computing response similarity: {e}")
            return 0.0

    async def compare_models_on_prompt(
        self, prompt: str, distilled_model: str, teacher_response: str
    ) -> dict:
        """Compare a distilled model's response against teacher response."""
        try:
            import litellm

            distilled_result = await litellm.acompletion(
                model=distilled_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1024,
            )
            distilled_response = distilled_result.choices[0].message.content

            similarity = await self._compute_response_similarity(
                distilled_response, teacher_response
            )
            return {
                "prompt": prompt,
                "distilled_response": distilled_response,
                "teacher_response": teacher_response,
                "similarity": similarity,
                "passed": similarity >= self.quality_threshold,
            }
        except Exception as e:
            logger.error(f"Error comparing models on prompt: {e}")
            return {
                "prompt": prompt,
                "error": str(e),
                "similarity": 0.0,
                "passed": False,
            }

    async def run_quality_gate(
        self, expert_model_id: str, sample_size: int = 20
    ) -> QualityCheckResult:
        """
        Run quality gate after training completes.
        Uses validation samples from training_samples where validation_set=True.
        If avg_similarity >= threshold AND pass_rate >= threshold: model passes.
        """
        from app.auth.supabase_auth import supabase

        # Get expert model info
        model_result = (
            supabase.table("expert_models")
            .select("*")
            .eq("id", expert_model_id)
            .single()
            .execute()
        )
        model = model_result.data
        if not model:
            return QualityCheckResult(
                expert_model_id=expert_model_id,
                check_type="quality_gate",
                prompts_evaluated=0,
                avg_similarity=0.0,
                pass_rate=0.0,
                passed=False,
                details={"error": "Expert model not found"},
            )

        # Get validation samples
        val_result = (
            supabase.table("training_samples")
            .select("prompt, response, model_used")
            .eq("user_id", model["user_id"])
            .eq("cluster_id", model["cluster_id"])
            .eq("validation_set", True)
            .limit(sample_size)
            .execute()
        )
        val_samples = val_result.data or []

        # Fall back to recent samples if no validation set
        if not val_samples:
            val_result = (
                supabase.table("training_samples")
                .select("prompt, response, model_used")
                .eq("user_id", model["user_id"])
                .eq("cluster_id", model["cluster_id"])
                .order("created_at", desc=True)
                .limit(sample_size)
                .execute()
            )
            val_samples = val_result.data or []

        if not val_samples:
            return QualityCheckResult(
                expert_model_id=expert_model_id,
                check_type="quality_gate",
                prompts_evaluated=0,
                avg_similarity=0.0,
                pass_rate=0.0,
                passed=False,
                details={"error": "No validation samples available"},
            )

        # Evaluate: send each prompt to distilled model, compare vs teacher response
        scores = []
        individual_results = []
        for sample in val_samples:
            result = await self.compare_models_on_prompt(
                prompt=sample["prompt"],
                distilled_model=model["model_id"],
                teacher_response=sample["response"],
            )
            if "error" not in result:
                scores.append(result["similarity"])
            individual_results.append(result)

        if not scores:
            return QualityCheckResult(
                expert_model_id=expert_model_id,
                check_type="quality_gate",
                prompts_evaluated=0,
                avg_similarity=0.0,
                pass_rate=0.0,
                passed=False,
                details={"error": "All evaluations failed", "results": individual_results},
            )

        avg_similarity = sum(scores) / len(scores)
        pass_rate = sum(1 for s in scores if s >= self.quality_threshold) / len(scores)
        passed = avg_similarity >= self.quality_threshold and pass_rate >= self.pass_rate_threshold

        # Save evaluation to DB
        supabase.table("expert_model_evaluations").insert(
            {
                "expert_model_id": expert_model_id,
                "check_type": "quality_gate",
                "prompt": f"[quality gate: {len(scores)} samples]",
                "expert_response": "",
                "teacher_model": model.get("teacher_model"),
                "prompts_evaluated": len(scores),
                "avg_similarity": avg_similarity,
                "pass_rate": pass_rate,
                "quality_score": avg_similarity,
                "passed": passed,
                "evaluation_details": {"individual_scores": scores},
            }
        ).execute()

        # If passed, activate the model
        if passed:
            from app.services.expert_model_service import ExpertModelService
            expert_service = ExpertModelService()
            await expert_service.on_quality_gate_pass(expert_model_id, avg_similarity)

            # Update job status to deployed
            if model.get("fine_tuning_job_id"):
                supabase.table("fine_tuning_jobs").update(
                    {"status": "deployed"}
                ).eq("id", model["fine_tuning_job_id"]).execute()

        logger.info(
            f"Quality gate for {expert_model_id}: "
            f"avg_similarity={avg_similarity:.2f}, pass_rate={pass_rate:.2f}, passed={passed}"
        )

        return QualityCheckResult(
            expert_model_id=expert_model_id,
            check_type="quality_gate",
            prompts_evaluated=len(scores),
            avg_similarity=avg_similarity,
            pass_rate=pass_rate,
            passed=passed,
            details={"individual_scores": scores},
        )

    async def run_periodic_check(
        self, expert_model_id: str, sample_size: int = 10
    ) -> QualityCheckResult:
        """
        Run periodic quality check on an active expert model.
        If quality drops below threshold, deactivates the model.
        """
        from app.services.expert_model_service import ExpertModelService

        expert_service = ExpertModelService()
        result = await expert_service.run_quality_check_batch(
            expert_model_id, sample_size=sample_size, check_type="periodic"
        )

        if "error" in result:
            return QualityCheckResult(
                expert_model_id=expert_model_id,
                check_type="periodic",
                prompts_evaluated=0,
                avg_similarity=0.0,
                pass_rate=0.0,
                passed=False,
                details={"error": result["error"]},
            )

        return QualityCheckResult(
            expert_model_id=expert_model_id,
            check_type="periodic",
            prompts_evaluated=result.get("samples_evaluated", 0),
            avg_similarity=result.get("average_score", 0.0),
            pass_rate=result.get("pass_rate", 0.0),
            passed=result.get("is_active", False),
            details=result,
        )
