"""
Expert Model Service for Distillation Pipeline.

Manages expert models created via fine-tuning, including routing decisions,
quality evaluation, and lifecycle management.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from app.settings import settings

logger = logging.getLogger(__name__)


# In-memory cache for should_route_to_expert to avoid per-request DB queries
_expert_model_cache: Dict[str, Tuple[float, bool, Optional[str]]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


class ExpertModelService:
    """Service for managing expert models created via distillation."""

    async def should_route_to_expert(
        self, user_id: str, cluster_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if an active expert model exists for user+cluster.
        Uses in-memory cache with 5min TTL to avoid per-request DB queries.

        Returns:
            (should_use, model_id) — model_id is the fine-tuned model identifier
        """
        cache_key = f"{user_id}:{cluster_id}"
        now = time.time()

        # Check cache
        if cache_key in _expert_model_cache:
            cached_time, cached_result, cached_model = _expert_model_cache[cache_key]
            if now - cached_time < _CACHE_TTL_SECONDS:
                return (cached_result, cached_model)

        try:
            from app.auth.supabase_auth import supabase

            result = (
                supabase.table("expert_models")
                .select("id, model_id, quality_score, quality_gate_passed")
                .eq("user_id", user_id)
                .eq("cluster_id", cluster_id)
                .eq("is_active", True)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if result.data:
                model = result.data[0]
                quality = model.get("quality_score") or 0
                gate_passed = model.get("quality_gate_passed", False)
                if gate_passed and quality >= settings.DISTILLATION_QUALITY_THRESHOLD:
                    _expert_model_cache[cache_key] = (now, True, model["model_id"])
                    return (True, model["model_id"])

            _expert_model_cache[cache_key] = (now, False, None)
            return (False, None)
        except Exception as e:
            logger.error(f"Error checking expert model: {e}")
            return (False, None)

    async def on_quality_gate_pass(self, expert_model_id: str, quality_score: float) -> bool:
        """Activate a model after quality gate passes."""
        try:
            from app.auth.supabase_auth import supabase

            supabase.table("expert_models").update(
                {
                    "is_active": True,
                    "quality_gate_passed": True,
                    "quality_score": quality_score,
                    "last_quality_check": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", expert_model_id).execute()

            # Invalidate cache for this model's user+cluster
            model_result = supabase.table("expert_models").select("user_id, cluster_id").eq("id", expert_model_id).single().execute()
            if model_result.data:
                cache_key = f"{model_result.data['user_id']}:{model_result.data['cluster_id']}"
                _expert_model_cache.pop(cache_key, None)

            logger.info(f"Expert model {expert_model_id} activated after quality gate pass (score={quality_score:.2f})")
            return True
        except Exception as e:
            logger.error(f"Error activating expert model after quality gate: {e}")
            return False

    async def evaluate_quality(
        self,
        expert_model_id: str,
        prompt: str,
        expert_response: str,
        reference_model: str = "gpt-4o",
    ) -> float:
        """Compare expert model output vs reference model using embedding similarity."""
        try:
            from app.auth.supabase_auth import supabase

            # Get reference response
            import litellm

            ref_result = await litellm.acompletion(
                model=reference_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1024,
            )
            reference_response = ref_result.choices[0].message.content

            # Compute similarity
            from app.services.embedding_cache import get_shared_encoder

            encoder = await get_shared_encoder()
            embeddings = encoder.encode(
                [expert_response, reference_response], show_progress_bar=False
            )
            import numpy as np

            similarity = float(
                np.dot(embeddings[0], embeddings[1])
                / (np.linalg.norm(embeddings[0]) * np.linalg.norm(embeddings[1]))
            )

            quality_pass = similarity >= settings.DISTILLATION_QUALITY_THRESHOLD

            # Save evaluation
            supabase.table("expert_model_evaluations").insert(
                {
                    "expert_model_id": expert_model_id,
                    "check_type": "periodic",
                    "prompt": prompt,
                    "expert_response": expert_response,
                    "reference_response": reference_response,
                    "similarity_score": similarity,
                    "quality_pass": quality_pass,
                    "teacher_model": reference_model,
                }
            ).execute()

            return similarity
        except Exception as e:
            logger.error(f"Error evaluating expert model quality: {e}")
            return 0.0

    async def run_quality_check_batch(
        self, expert_model_id: str, sample_size: int = 10, check_type: str = "periodic"
    ) -> Dict[str, Any]:
        """Run quality audit on an expert model with enhanced evaluation tracking."""
        try:
            from app.auth.supabase_auth import supabase

            # Get the expert model info
            model_result = (
                supabase.table("expert_models")
                .select("*")
                .eq("id", expert_model_id)
                .single()
                .execute()
            )
            model = model_result.data
            if not model:
                return {"error": "Expert model not found"}

            teacher_model = model.get("teacher_model", "gpt-4o")

            # Get recent training samples for this cluster
            samples_result = (
                supabase.table("training_samples")
                .select("prompt, response")
                .eq("user_id", model["user_id"])
                .eq("cluster_id", model["cluster_id"])
                .order("created_at", desc=True)
                .limit(sample_size)
                .execute()
            )
            samples = samples_result.data or []
            if not samples:
                return {"error": "No samples available for evaluation"}

            # Get expert model responses and evaluate
            scores = []
            for sample in samples:
                try:
                    import litellm

                    expert_result = await litellm.acompletion(
                        model=model["model_id"],
                        messages=[{"role": "user", "content": sample["prompt"]}],
                        max_tokens=1024,
                    )
                    expert_response = expert_result.choices[0].message.content

                    score = await self.evaluate_quality(
                        expert_model_id, sample["prompt"], expert_response, teacher_model
                    )
                    scores.append(score)
                except Exception as eval_err:
                    logger.warning(f"Evaluation failed for sample: {eval_err}")

            if not scores:
                return {"error": "All evaluations failed"}

            avg_score = sum(scores) / len(scores)
            pass_rate = sum(1 for s in scores if s >= settings.DISTILLATION_QUALITY_THRESHOLD) / len(scores)

            # Save batch evaluation summary
            supabase.table("expert_model_evaluations").insert(
                {
                    "expert_model_id": expert_model_id,
                    "check_type": check_type,
                    "prompt": f"[batch evaluation: {len(scores)} samples]",
                    "expert_response": "",
                    "teacher_model": teacher_model,
                    "prompts_evaluated": len(scores),
                    "avg_similarity": avg_score,
                    "pass_rate": pass_rate,
                    "quality_score": avg_score,
                    "passed": avg_score >= settings.DISTILLATION_QUALITY_THRESHOLD and pass_rate >= settings.DISTILLATION_PASS_RATE_THRESHOLD,
                    "evaluation_details": {"individual_scores": scores},
                }
            ).execute()

            # Update model quality score and last check time
            update_data = {
                "quality_score": avg_score,
                "last_quality_check": datetime.now(timezone.utc).isoformat(),
            }

            # Deactivate if quality drops below threshold
            if avg_score < settings.DISTILLATION_QUALITY_THRESHOLD:
                update_data["is_active"] = False
                update_data["deactivated_at"] = datetime.now(timezone.utc).isoformat()
                update_data["deactivation_reason"] = f"Quality dropped below threshold ({avg_score:.2f})"

                # Invalidate cache
                cache_key = f"{model['user_id']}:{model['cluster_id']}"
                _expert_model_cache.pop(cache_key, None)

                logger.warning(
                    f"Expert model {expert_model_id} deactivated due to low quality ({avg_score:.2f})"
                )

            supabase.table("expert_models").update(update_data).eq("id", expert_model_id).execute()

            return {
                "expert_model_id": expert_model_id,
                "check_type": check_type,
                "samples_evaluated": len(scores),
                "average_score": avg_score,
                "pass_rate": pass_rate,
                "is_active": avg_score >= settings.DISTILLATION_QUALITY_THRESHOLD,
            }
        except Exception as e:
            logger.error(f"Error running quality check batch: {e}")
            return {"error": str(e)}

    async def increment_usage(self, expert_model_id: str, cost_saved: float = 0.0) -> None:
        """Track request_count and total_cost_saved for an expert model."""
        try:
            from app.auth.supabase_auth import supabase

            # Use RPC or manual increment
            model_result = supabase.table("expert_models").select("request_count, total_cost_saved").eq("id", expert_model_id).single().execute()
            if model_result.data:
                new_count = (model_result.data.get("request_count") or 0) + 1
                new_saved = (model_result.data.get("total_cost_saved") or 0.0) + cost_saved
                supabase.table("expert_models").update(
                    {"request_count": new_count, "total_cost_saved": new_saved}
                ).eq("id", expert_model_id).execute()
        except Exception as e:
            logger.debug(f"Error incrementing expert model usage: {e}")

    async def get_expert_models(self, user_id: str) -> List[Dict[str, Any]]:
        """List all expert models for a user."""
        try:
            from app.auth.supabase_auth import supabase

            result = (
                supabase.table("expert_models")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return result.data or []
        except Exception as e:
            logger.error(f"Error listing expert models: {e}")
            return []

    async def get_cluster_recommendation(
        self, user_id: str, cluster_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Lightweight recommendation based on cluster performance data.

        Falls back to this when no fine-tuned expert model exists.
        Returns (has_recommendation, model_name).
        """
        try:
            from app.services.cluster_performance_service import get_cluster_performance_service
            perf_service = get_cluster_performance_service()
            best = await perf_service.get_best_model_for_cluster(user_id, cluster_id)
            if best:
                return (True, best)
        except Exception as e:
            logger.debug("Cluster performance recommendation unavailable: %s", e)
        return (False, None)

    async def toggle_expert_model(self, expert_model_id: str, is_active: bool, reason: str = None) -> bool:
        """Enable/disable an expert model."""
        try:
            from app.auth.supabase_auth import supabase

            update_data = {"is_active": is_active}
            if not is_active:
                update_data["deactivated_at"] = datetime.now(timezone.utc).isoformat()
                if reason:
                    update_data["deactivation_reason"] = reason

            # Invalidate cache
            model_result = supabase.table("expert_models").select("user_id, cluster_id").eq("id", expert_model_id).single().execute()
            if model_result.data:
                cache_key = f"{model_result.data['user_id']}:{model_result.data['cluster_id']}"
                _expert_model_cache.pop(cache_key, None)

            supabase.table("expert_models").update(update_data).eq(
                "id", expert_model_id
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Error toggling expert model: {e}")
            return False


async def train_expert_model(user_id, cluster_id):
    """Trigger fine-tuning via the restored FineTuningService."""
    try:
        from app.services.fine_tuning_service import FineTuningService
        ft_service = FineTuningService()
        result = await ft_service.create_openai_fine_tune(
            user_id=user_id,
            cluster_id=cluster_id,
            trigger_type="auto",
        )
        logger.info(f"train_expert_model triggered for user={user_id} cluster={cluster_id}: {result}")
        return result
    except Exception as e:
        logger.error(f"train_expert_model failed: {e}")
        return {"error": str(e)}
