"""
Per-cluster routing policy service.

Users define per-cluster routing rules via API/dashboard.
Production completion checks cluster policy in the routing decision tree.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class ClusterRoutingPolicyService:
    """Manages user-defined per-cluster routing policies."""

    def __init__(self):
        from app.auth.supabase_auth import supabase
        self.supabase = supabase

    async def get_policy(
        self, user_id: str, cluster_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get active routing policy for a user+cluster."""
        try:
            response = (
                self.supabase.table("cluster_routing_policies")
                .select("*")
                .eq("user_id", user_id)
                .eq("cluster_id", cluster_id)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
            if response.data:
                return response.data[0]
        except Exception as e:
            logger.debug("Error fetching cluster routing policy: %s", e)
        return None

    async def resolve_model(
        self,
        user_id: str,
        cluster_id: str,
        available_models: Optional[List[str]] = None,
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Resolve a model from cluster routing policy.

        Returns:
            (has_policy, model_name, policy_metadata)
        """
        policy = await self.get_policy(user_id, cluster_id)
        if not policy:
            return (False, None, None)

        primary = policy.get("primary_model")
        fallbacks = policy.get("fallback_models") or []

        # Check if primary model is in available models (if constrained)
        if available_models:
            if primary in available_models:
                return (True, primary, {"policy_type": "cluster_primary", "cluster_id": cluster_id})
            # Try fallbacks
            for fb in fallbacks:
                if fb in available_models:
                    return (True, fb, {"policy_type": "cluster_fallback", "cluster_id": cluster_id, "primary_unavailable": primary})
            # Policy exists but no model available
            return (False, None, None)

        return (True, primary, {"policy_type": "cluster_primary", "cluster_id": cluster_id})

    async def list_policies(self, user_id: str) -> List[Dict[str, Any]]:
        """List all routing policies for a user."""
        try:
            response = (
                self.supabase.table("cluster_routing_policies")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error("Error listing cluster routing policies: %s", e)
            return []

    async def upsert_policy(
        self,
        user_id: str,
        cluster_id: str,
        primary_model: str,
        fallback_models: Optional[List[str]] = None,
        min_quality_threshold: float = 0.0,
    ) -> Dict[str, Any]:
        """Create or update a routing policy."""
        data = {
            "user_id": user_id,
            "cluster_id": cluster_id,
            "primary_model": primary_model,
            "fallback_models": fallback_models or [],
            "min_quality_threshold": min_quality_threshold,
            "is_active": True,
        }
        try:
            response = (
                self.supabase.table("cluster_routing_policies")
                .upsert(data, on_conflict="user_id,cluster_id")
                .execute()
            )
            return response.data[0] if response.data else data
        except Exception as e:
            logger.error("Error upserting cluster routing policy: %s", e)
            raise

    async def delete_policy(self, user_id: str, cluster_id: str) -> bool:
        """Deactivate a routing policy."""
        try:
            self.supabase.table("cluster_routing_policies").update({
                "is_active": False,
            }).eq("user_id", user_id).eq("cluster_id", cluster_id).execute()
            return True
        except Exception as e:
            logger.error("Error deleting cluster routing policy: %s", e)
            return False


# Module-level singleton
_service: Optional[ClusterRoutingPolicyService] = None


def get_cluster_routing_policy_service() -> ClusterRoutingPolicyService:
    global _service
    if _service is None:
        _service = ClusterRoutingPolicyService()
    return _service
