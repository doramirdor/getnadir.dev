"""
Clustering API endpoints.

Provides endpoints for classifying prompts, listing clusters,
and managing user-specific clusters.
"""

import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, UserSession
from app.clusters.supabase_clustering import clustering_service, local_clustering_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/clustering", tags=["Clustering"])


class ClassifyRequest(BaseModel):
    prompt: str = Field(..., description="Prompt text to classify")


class CreateClusterRequest(BaseModel):
    name: str = Field(..., description="Cluster name", max_length=200)
    description: str = Field(..., description="Cluster description", max_length=2000)
    examples: List[str] = Field(default_factory=list, description="Example prompts", max_length=100)
    classification_criteria: List[str] = Field(default_factory=list, description="Classification criteria", max_length=50)


class UpdateClusterRequest(BaseModel):
    description: Optional[str] = None
    examples: Optional[List[str]] = None
    classification_criteria: Optional[List[str]] = None


class UpsertRoutingPolicyRequest(BaseModel):
    cluster_id: str = Field(..., description="Cluster ID to set policy for")
    primary_model: str = Field(..., description="Primary model to use for this cluster")
    fallback_models: List[str] = Field(default_factory=list, description="Fallback models if primary unavailable")
    min_quality_threshold: float = Field(default=0.0, description="Minimum quality threshold")


@router.post("/classify")
async def classify_prompt(
    request: ClassifyRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Classify a prompt into a cluster."""
    user_id = str(current_user.id)

    # Try local first for speed
    cluster_id, confidence = await local_clustering_service.classify(request.prompt, user_id)
    method = "local_embedding"

    if not cluster_id:
        # Fall back to full classify
        cluster_id = await clustering_service.classify_prompt(request.prompt, user_id)
        confidence = 0.0
        method = "gemini" if clustering_service.client else "rules"

    if not cluster_id:
        return {"cluster_id": None, "confidence": 0.0, "method": method}

    return {
        "cluster_id": cluster_id,
        "confidence": confidence,
        "method": method,
    }


@router.get("/clusters")
async def list_clusters(
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """List clusters with sample counts."""
    user_id = str(current_user.id)
    clusters = await clustering_service.get_user_clusters(user_id)

    # Add sample counts
    enriched = []
    for cluster in clusters:
        stats = await clustering_service.get_cluster_stats(
            cluster.get("id") or cluster.get("cluster_id") or cluster.get("name")
        )
        enriched.append({**cluster, **stats})

    return {"clusters": enriched, "total": len(enriched)}


@router.get("/clusters/{cluster_id}/prompts")
async def get_cluster_prompts(
    cluster_id: str,
    limit: int = 50,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Get prompts in a cluster."""
    try:
        from app.auth.supabase_auth import supabase

        # Use cluster_id directly (TEXT type in database)
        result = (
            supabase.table("prompts")
            .select("id, prompt_text, created_at")
            .eq("user_id", str(current_user.id))
            .eq("cluster_id", cluster_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"cluster_id": cluster_id, "prompts": result.data or []}
    except Exception as e:
        logger.error(f"Error getting cluster prompts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clusters")
async def create_cluster(
    request: CreateClusterRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Create a user-specific cluster."""
    cluster_id = await clustering_service.create_user_cluster(
        user_id=str(current_user.id),
        name=request.name,
        description=request.description,
        examples=request.examples,
        classification_criteria=request.classification_criteria,
    )
    if not cluster_id:
        raise HTTPException(status_code=500, detail="Failed to create cluster")

    # Reload local clustering centroids
    try:
        await local_clustering_service.load_clusters()
    except Exception as e:
        logger.warning("Failed to reload clustering centroids: %s", e)

    return {"cluster_id": cluster_id, "name": request.name}


@router.get("/clusters/{cluster_id}/performance")
async def get_cluster_performance(
    cluster_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Get per-model performance stats for a cluster."""
    from app.services.cluster_performance_service import get_cluster_performance_service

    service = get_cluster_performance_service()
    stats = await service.compute_cluster_model_stats(
        user_id=str(current_user.id),
        cluster_id=cluster_id,
    )
    return stats.get(cluster_id, {"cluster_id": cluster_id, "models": []})


@router.post("/warmup/{warmup_id}/start")
async def start_warmup(
    warmup_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Cluster warmup pipeline (cluster_warmup_worker removed)."""
    return {"warmup_id": warmup_id, "status": "unavailable", "detail": "Warmup worker has been removed"}


@router.get("/warmup/{warmup_id}/status")
async def get_warmup_status(
    warmup_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Poll warmup progress."""
    from app.auth.supabase_auth import supabase

    try:
        resp = (
            supabase.table("cluster_warmups")
            .select("id, status, started_at, completed_at, clusters_generated, error_message")
            .eq("id", warmup_id)
            .single()
            .execute()
        )
        return resp.data or {"warmup_id": warmup_id, "status": "not_found"}
    except Exception as e:
        logger.error("Error fetching warmup status: %s", e)
        return {"warmup_id": warmup_id, "status": "error", "detail": str(e)}


@router.put("/clusters/{cluster_id}")
async def update_cluster(
    cluster_id: str,
    request: UpdateClusterRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Update a cluster (re-computes centroid)."""
    try:
        from app.database.supabase_db import supabase_db

        update_data = {}
        if request.description is not None:
            update_data["description"] = request.description
        if request.examples is not None:
            update_data["examples"] = request.examples
        if request.classification_criteria is not None:
            update_data["classification_criteria"] = request.classification_criteria

        if update_data:
            await supabase_db.update_cluster(cluster_id=cluster_id, **update_data)

        # Reload centroids
        try:
            await local_clustering_service.load_clusters()
        except Exception:
            pass

        return {"cluster_id": cluster_id, "updated": True}
    except Exception as e:
        logger.error(f"Error updating cluster: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Cluster suggestions (adaptive discovery)
# ---------------------------------------------------------------------------

@router.get("/suggestions")
async def list_suggestions(
    status: Optional[str] = "pending",
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """List cluster suggestions from adaptive discovery."""
    from app.auth.supabase_auth import supabase

    try:
        query = (
            supabase.table("cluster_suggestions")
            .select("*")
            .eq("user_id", str(current_user.id))
            .order("created_at", desc=True)
            .limit(50)
        )
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return {"suggestions": result.data or []}
    except Exception as e:
        logger.error("Error listing cluster suggestions: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggestions/{suggestion_id}/accept")
async def accept_suggestion(
    suggestion_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Accept a cluster suggestion and create a real cluster from it."""
    from app.auth.supabase_auth import supabase

    try:
        # Fetch suggestion
        resp = (
            supabase.table("cluster_suggestions")
            .select("*")
            .eq("id", suggestion_id)
            .eq("user_id", str(current_user.id))
            .single()
            .execute()
        )
        suggestion = resp.data
        if not suggestion:
            raise HTTPException(status_code=404, detail="Suggestion not found")

        # Create real cluster
        cluster_id = await clustering_service.create_user_cluster(
            user_id=str(current_user.id),
            name=suggestion["suggested_name"],
            description=suggestion.get("description", ""),
            examples=suggestion.get("sample_prompts", []),
            classification_criteria=[suggestion.get("description", "")],
        )

        # Mark suggestion as accepted
        supabase.table("cluster_suggestions").update({
            "status": "accepted",
        }).eq("id", suggestion_id).execute()

        # Reload centroids
        try:
            await local_clustering_service.load_clusters()
        except Exception:
            pass

        return {"suggestion_id": suggestion_id, "cluster_id": cluster_id, "status": "accepted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error accepting suggestion: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Reject a cluster suggestion."""
    from app.auth.supabase_auth import supabase

    try:
        supabase.table("cluster_suggestions").update({
            "status": "rejected",
        }).eq("id", suggestion_id).eq("user_id", str(current_user.id)).execute()
        return {"suggestion_id": suggestion_id, "status": "rejected"}
    except Exception as e:
        logger.error("Error rejecting suggestion: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Per-cluster routing policies
# ---------------------------------------------------------------------------

@router.get("/policies")
async def list_routing_policies(
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """List all cluster routing policies for the user."""
    from app.services.cluster_routing_policy_service import get_cluster_routing_policy_service

    service = get_cluster_routing_policy_service()
    policies = await service.list_policies(str(current_user.id))
    return {"policies": policies}


@router.post("/policies")
async def upsert_routing_policy(
    request: UpsertRoutingPolicyRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Create or update a per-cluster routing policy."""
    from app.services.cluster_routing_policy_service import get_cluster_routing_policy_service

    service = get_cluster_routing_policy_service()
    policy = await service.upsert_policy(
        user_id=str(current_user.id),
        cluster_id=request.cluster_id,
        primary_model=request.primary_model,
        fallback_models=request.fallback_models,
        min_quality_threshold=request.min_quality_threshold,
    )
    return {"policy": policy}


@router.delete("/policies/{cluster_id}")
async def delete_routing_policy(
    cluster_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Deactivate a routing policy for a cluster."""
    from app.services.cluster_routing_policy_service import get_cluster_routing_policy_service

    service = get_cluster_routing_policy_service()
    ok = await service.delete_policy(str(current_user.id), cluster_id)
    return {"cluster_id": cluster_id, "deleted": ok}
