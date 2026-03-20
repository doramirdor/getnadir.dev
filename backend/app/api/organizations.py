"""
Organizations API endpoints for B2B/B2C support.

Provides CRUD for organizations, members, API keys, and usage analytics per org.
"""

import logging
import secrets
import hashlib
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, UserSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/organizations", tags=["Organizations"])


class CreateOrgRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    plan_type: str = Field(default="free")


class AddMemberRequest(BaseModel):
    user_id: str
    role: str = Field(default="member", pattern=r"^(owner|admin|member|viewer)$")
    usage_quota_monthly: Optional[float] = None


class CreateOrgApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1)
    permissions: Dict[str, Any] = Field(default_factory=dict)


@router.post("")
async def create_organization(
    request: CreateOrgRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Create a new organization."""
    try:
        from app.auth.supabase_auth import supabase

        org_result = (
            supabase.table("organizations")
            .insert(
                {
                    "name": request.name,
                    "slug": request.slug,
                    "owner_id": str(current_user.id),
                    "plan_type": request.plan_type,
                    "settings": {},
                }
            )
            .execute()
        )
        org = org_result.data[0]

        # Add owner as member
        supabase.table("organization_members").insert(
            {
                "org_id": org["id"],
                "user_id": str(current_user.id),
                "role": "owner",
            }
        ).execute()

        return org
    except Exception as e:
        logger.error(f"Error creating organization: {e}")
        raise HTTPException(status_code=500, detail="Failed to create organization")


@router.get("")
async def list_organizations(
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """List organizations the user belongs to."""
    try:
        from app.auth.supabase_auth import supabase

        memberships = (
            supabase.table("organization_members")
            .select("org_id, role")
            .eq("user_id", str(current_user.id))
            .execute()
        )
        org_ids = [m["org_id"] for m in (memberships.data or [])]
        if not org_ids:
            return {"organizations": []}

        orgs = (
            supabase.table("organizations")
            .select("*")
            .in_("id", org_ids)
            .execute()
        )
        return {"organizations": orgs.data or []}
    except Exception as e:
        logger.error(f"Error listing organizations: {e}")
        raise HTTPException(status_code=500, detail="Failed to list organizations")


@router.get("/{org_id}")
async def get_organization(
    org_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Get organization details."""
    try:
        from app.auth.supabase_auth import supabase

        org = supabase.table("organizations").select("*").eq("id", org_id).single().execute()
        members = (
            supabase.table("organization_members")
            .select("*")
            .eq("org_id", org_id)
            .execute()
        )
        return {**org.data, "members": members.data or []}
    except Exception as e:
        logger.error(f"Error getting organization {org_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get organization")


@router.post("/{org_id}/members")
async def add_member(
    org_id: str,
    request: AddMemberRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Add a member to an organization."""
    try:
        from app.auth.supabase_auth import supabase

        result = (
            supabase.table("organization_members")
            .insert(
                {
                    "org_id": org_id,
                    "user_id": request.user_id,
                    "role": request.role,
                    "usage_quota_monthly": request.usage_quota_monthly,
                }
            )
            .execute()
        )
        return result.data[0] if result.data else {}
    except Exception as e:
        logger.error(f"Error adding member to org {org_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to add member")


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(
    org_id: str,
    user_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Remove a member from an organization."""
    try:
        from app.auth.supabase_auth import supabase

        supabase.table("organization_members").delete().eq("org_id", org_id).eq("user_id", user_id).execute()
        return {"removed": True}
    except Exception as e:
        logger.error(f"Error removing member from org {org_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove member")


@router.post("/{org_id}/api-keys")
async def create_org_api_key(
    org_id: str,
    request: CreateOrgApiKeyRequest,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """Create an API key for an organization."""
    try:
        from app.auth.supabase_auth import supabase

        raw_key = f"ndr_org_{secrets.token_hex(24)}"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

        result = (
            supabase.table("organization_api_keys")
            .insert(
                {
                    "org_id": org_id,
                    "key_hash": key_hash,
                    "name": request.name,
                    "permissions": request.permissions,
                    "status": "active",
                }
            )
            .execute()
        )

        return {
            "id": result.data[0]["id"],
            "api_key": raw_key,
            "name": request.name,
            "note": "Save this key — it will not be shown again.",
        }
    except Exception as e:
        logger.error(f"Error creating API key for org {org_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create API key")


@router.get("/{org_id}/api-keys")
async def list_org_api_keys(
    org_id: str,
    current_user: UserSession = Depends(validate_api_key),
) -> Dict[str, Any]:
    """List API keys for an organization."""
    try:
        from app.auth.supabase_auth import supabase

        result = (
            supabase.table("organization_api_keys")
            .select("id, name, permissions, status, created_at")
            .eq("org_id", org_id)
            .execute()
        )
        return {"api_keys": result.data or []}
    except Exception as e:
        logger.error(f"Error listing API keys for org {org_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list API keys")
