"""
Training Data Service for Smart Export / Distillation.

Collects prompt/response pairs from successful completions and formats them
for fine-tuning via OpenAI API or local LoRA training.
"""

import json
import logging
import random
from typing import List, Optional, Dict, Any, Tuple

from app.settings import settings

logger = logging.getLogger(__name__)


class TrainingDataService:
    """Service for collecting and formatting training data for distillation."""

    async def collect_sample(
        self,
        user_id: str,
        cluster_id: str,
        prompt: str,
        response: str,
        model_used: str,
        system_message: str = None,
        provider_used: str = None,
        tokens_in: int = None,
        tokens_out: int = None,
        quality_score: float = None,
        usage_event_id: str = None,
    ) -> bool:
        """Save a prompt/response pair from a successful completion."""
        try:
            from app.auth.supabase_auth import supabase

            data = {
                "user_id": user_id,
                "cluster_id": cluster_id,
                "prompt": prompt,
                "response": response,
                "model_used": model_used,
            }
            if system_message is not None:
                data["system_message"] = system_message
            if provider_used is not None:
                data["provider_used"] = provider_used
            if tokens_in is not None:
                data["tokens_in"] = tokens_in
            if tokens_out is not None:
                data["tokens_out"] = tokens_out
            if quality_score is not None:
                data["quality_score"] = quality_score
            if usage_event_id is not None:
                data["usage_event_id"] = usage_event_id

            result = supabase.table("training_samples").insert(data).execute()
            if result.data:
                logger.debug(f"Collected training sample for user={user_id} cluster={cluster_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error collecting training sample: {e}")
            return False

    async def get_sample_count(self, user_id: str, cluster_id: str) -> int:
        """Count training samples for a user+cluster combo."""
        try:
            from app.auth.supabase_auth import supabase

            result = (
                supabase.table("training_samples")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("cluster_id", cluster_id)
                .execute()
            )
            return result.count or 0
        except Exception as e:
            logger.error(f"Error counting training samples: {e}")
            return 0

    async def check_training_threshold(self, user_id: str, cluster_id: str) -> bool:
        """Check if user+cluster exceeds the distillation minimum samples threshold."""
        count = await self.get_sample_count(user_id, cluster_id)
        return count >= settings.DISTILLATION_MIN_SAMPLES

    async def get_samples(
        self, user_id: str, cluster_id: str, limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Retrieve training samples for a user+cluster."""
        try:
            from app.auth.supabase_auth import supabase

            result = (
                supabase.table("training_samples")
                .select("*")
                .eq("user_id", user_id)
                .eq("cluster_id", cluster_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception as e:
            logger.error(f"Error retrieving training samples: {e}")
            return []

    async def get_samples_from_usage_events(
        self, user_id: str, cluster_id: str, limit: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Fallback: query usage_events directly for prompt/response pairs.
        Useful when training_samples table has insufficient data but usage_events
        has stored responses.
        """
        try:
            from app.auth.supabase_auth import supabase

            result = (
                supabase.table("usage_events")
                .select("id, prompt, response, model_name, provider, tokens_in, tokens_out, metadata")
                .eq("user_id", user_id)
                .not_.is_("response", "null")
                .neq("response", "")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = result.data or []

            # Filter by cluster_id from metadata
            samples = []
            for row in rows:
                metadata = row.get("metadata") or {}
                row_cluster = metadata.get("cluster_id", "")
                if row_cluster == cluster_id:
                    samples.append({
                        "prompt": row["prompt"],
                        "response": row["response"],
                        "model_used": row.get("model_name", ""),
                        "provider_used": row.get("provider", ""),
                        "tokens_in": row.get("tokens_in"),
                        "tokens_out": row.get("tokens_out"),
                        "usage_event_id": row["id"],
                    })
            return samples
        except Exception as e:
            logger.error(f"Error retrieving samples from usage_events: {e}")
            return []

    async def prepare_training_set(
        self,
        user_id: str,
        cluster_id: str,
        validation_split: float = None,
        min_samples: int = None,
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Prepare deduplicated train/validation split from training_samples.
        Falls back to usage_events if training_samples is insufficient.

        Returns:
            (train_samples, validation_samples)
        """
        if validation_split is None:
            validation_split = settings.DISTILLATION_VALIDATION_SPLIT
        if min_samples is None:
            min_samples = settings.DISTILLATION_MIN_SAMPLES

        # Get from training_samples first
        samples = await self.get_samples(user_id, cluster_id, limit=5000)

        # Fallback to usage_events if not enough
        if len(samples) < min_samples:
            usage_samples = await self.get_samples_from_usage_events(
                user_id, cluster_id, limit=2000
            )
            # Merge, dedup by prompt text
            seen_prompts = {s["prompt"] for s in samples}
            for us in usage_samples:
                if us["prompt"] not in seen_prompts:
                    samples.append(us)
                    seen_prompts.add(us["prompt"])

        # Dedup by prompt
        seen = set()
        deduped = []
        for s in samples:
            key = s["prompt"].strip()
            if key not in seen:
                seen.add(key)
                deduped.append(s)

        # Split into train and validation
        random.shuffle(deduped)
        val_count = max(1, int(len(deduped) * validation_split))
        validation = deduped[:val_count]
        train = deduped[val_count:]

        # Mark validation samples in DB
        try:
            from app.auth.supabase_auth import supabase
            val_ids = [s["id"] for s in validation if "id" in s]
            if val_ids:
                supabase.table("training_samples").update(
                    {"validation_set": True}
                ).in_("id", val_ids).execute()
        except Exception as e:
            logger.warning(f"Could not mark validation samples in DB: {e}")

        return train, validation

    def format_openai_jsonl(self, samples: List[Dict], system_prompt: str = "") -> str:
        """Format samples as OpenAI fine-tuning JSONL."""
        lines = []
        for s in samples:
            messages = []
            sys_msg = system_prompt or s.get("system_message", "")
            if sys_msg:
                messages.append({"role": "system", "content": sys_msg})
            messages.append({"role": "user", "content": s["prompt"]})
            messages.append({"role": "assistant", "content": s["response"]})
            lines.append(json.dumps({"messages": messages}))
        return "\n".join(lines)

    def format_alpaca(self, samples: List[Dict]) -> str:
        """Format as Alpaca JSONL."""
        lines = []
        for s in samples:
            lines.append(
                json.dumps(
                    {"instruction": s["prompt"], "input": "", "output": s["response"]}
                )
            )
        return "\n".join(lines)

    def format_sharegpt(self, samples: List[Dict]) -> str:
        """Format as ShareGPT JSONL."""
        lines = []
        for s in samples:
            lines.append(
                json.dumps(
                    {
                        "conversations": [
                            {"from": "human", "value": s["prompt"]},
                            {"from": "gpt", "value": s["response"]},
                        ]
                    }
                )
            )
        return "\n".join(lines)
