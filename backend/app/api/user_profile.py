"""
API routes for user profile management.
"""
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.supabase_auth import get_current_user, update_user_preference, UserSession


router = APIRouter()


class UserProfileRequest(BaseModel):
    """Request model for updating user profile."""
    benchmark_model: Optional[str] = Field(None, description="Benchmark model for comparison")
    allowed_providers: Optional[List[str]] = Field(None, description="List of allowed providers")
    allowed_models: Optional[List[str]] = Field(None, description="List of allowed models")


class UserProfileResponse(BaseModel):
    """Response model for user profile."""
    user_id: str
    name: Optional[str]
    email: Optional[str]
    benchmark_model: Optional[str]
    allowed_providers: List[str]
    allowed_models: List[str]
    budget_limit: Optional[float]
    budget_used: float
    clusters_count: int


@router.get("/v1/profile", response_model=UserProfileResponse)
async def get_user_profile(
    current_user: UserSession = Depends(get_current_user)
) -> UserProfileResponse:
    """Get current user's profile."""
    return UserProfileResponse(
        user_id=str(current_user.id),
        name=current_user.name,
        email=current_user.email,
        benchmark_model=current_user.benchmark_model,
        allowed_providers=current_user.allowed_providers or [],
        allowed_models=current_user.allowed_models or [],
        budget_limit=current_user.budget_limit,
        budget_used=current_user.budget_used,
        clusters_count=len(current_user.clusters) if current_user.clusters else 0
    )


@router.put("/v1/profile")
async def update_user_profile(
    request: UserProfileRequest,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Update user profile settings."""
    try:
        updated_fields = []
        
        if request.benchmark_model is not None:
            success = await update_user_preference(current_user.id, "benchmark_model", request.benchmark_model)
            if success:
                updated_fields.append("benchmark_model")
        
        if request.allowed_providers is not None:
            success = await update_user_preference(current_user.id, "allowed_providers", request.allowed_providers)
            if success:
                updated_fields.append("allowed_providers")
        
        if request.allowed_models is not None:
            success = await update_user_preference(current_user.id, "allowed_models", request.allowed_models)
            if success:
                updated_fields.append("allowed_models")
        
        return {
            "success": True,
            "message": "Profile updated successfully",
            "updated_fields": updated_fields
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update profile: {str(e)}"
        )


@router.post("/v1/profile/benchmark")
async def set_benchmark_model(
    model: str,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Set the benchmark model for the user."""
    try:
        success = await update_user_preference(current_user.id, "benchmark_model", model)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update benchmark model in Supabase"
            )
        
        return {
            "success": True,
            "message": f"Benchmark model set to: {model}",
            "benchmark_model": model
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set benchmark model: {str(e)}"
        )


@router.delete("/v1/profile/benchmark")
async def remove_benchmark_model(
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Remove the benchmark model for the user."""
    try:
        success = await update_user_preference(current_user.id, "benchmark_model", None)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to remove benchmark model in Supabase"
            )
        
        return {
            "success": True,
            "message": "Benchmark model removed"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove benchmark model: {str(e)}"
        )


@router.post("/v1/profile/providers")
async def set_allowed_providers(
    providers: List[str],
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Set allowed providers for the user."""
    try:
        # Validate provider names
        valid_providers = ["openai", "anthropic", "google", "xai", "replicate", "together", "cohere", "mistral"]
        invalid_providers = [p for p in providers if p.lower() not in valid_providers]
        
        if invalid_providers:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid providers: {invalid_providers}. Valid providers: {valid_providers}"
            )
        
        success = await update_user_preference(current_user.id, "allowed_providers", providers)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update allowed providers in Supabase"
            )
        
        return {
            "success": True,
            "message": f"Allowed providers set to: {providers}",
            "allowed_providers": providers
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set allowed providers: {str(e)}"
        )


@router.post("/v1/profile/models")
async def set_allowed_models(
    models: List[str],
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Set allowed models for the user."""
    try:
        success = await update_user_preference(current_user.id, "allowed_models", models)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update allowed models in Supabase"
            )
        
        return {
            "success": True,
            "message": f"Allowed models set to: {models}",
            "allowed_models": models
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set allowed models: {str(e)}"
        )


@router.delete("/v1/profile/restrictions")
async def remove_all_restrictions(
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Remove all provider and model restrictions for the user."""
    try:
        providers_success = await update_user_preference(current_user.id, "allowed_providers", [])
        models_success = await update_user_preference(current_user.id, "allowed_models", [])
        
        if not (providers_success and models_success):
            raise HTTPException(
                status_code=500,
                detail="Failed to remove restrictions in Supabase"
            )
        
        return {
            "success": True,
            "message": "All provider and model restrictions removed"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove restrictions: {str(e)}"
        ) 