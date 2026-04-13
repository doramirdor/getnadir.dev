"""
Provider key management API — securely stores BYOK keys with server-side encryption.

Keys are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before being written to the
database.  The frontend must use these endpoints instead of writing directly to Supabase.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, validate_jwt, UserSession, supabase
from app.services.key_encryption import encrypt_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/provider-keys", tags=["provider-keys"])


class UpsertProviderKeyRequest(BaseModel):
    provider: str = Field(..., description="Provider identifier (openai, anthropic, google, etc.)")
    api_key: str = Field(..., min_length=1, description="Plaintext provider API key to encrypt and store")


class ProviderKeySummary(BaseModel):
    provider: str
    is_active: bool
    has_key: bool
    prefix: Optional[str] = None  # First 8 chars for identification


@router.put("/setup")
async def upsert_provider_key_jwt(
    body: UpsertProviderKeyRequest,
    current_user: UserSession = Depends(validate_jwt),
):
    """Create or update a provider API key during onboarding (JWT auth, no API key needed)."""
    return await _upsert_provider_key(body, current_user)


@router.put("")
async def upsert_provider_key(
    body: UpsertProviderKeyRequest,
    current_user: UserSession = Depends(validate_api_key),
):
    """Create or update a provider API key (encrypted server-side)."""
    return await _upsert_provider_key(body, current_user)


async def _upsert_provider_key(body: UpsertProviderKeyRequest, current_user: UserSession):
    """Shared implementation for provider key upsert."""
    encrypted = encrypt_key(body.api_key)

    # Show first 8 chars as a prefix for identification (safe — not the full key)
    prefix = body.api_key[:8] + "..." if len(body.api_key) > 8 else "***"

    try:
        supabase.table("provider_keys").upsert(
            {
                "user_id": current_user.id,
                "provider": body.provider,
                "encrypted_key": encrypted,
                "is_active": True,
            },
            on_conflict="user_id,provider",
        ).execute()

        logger.info("Provider key upserted for user %s, provider %s", current_user.id, body.provider)
        return {"status": "ok", "provider": body.provider, "prefix": prefix}

    except Exception as e:
        logger.error("Failed to upsert provider key for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to save provider key")


@router.get("")
async def list_provider_keys(current_user: UserSession = Depends(validate_api_key)):
    """List configured provider keys (without revealing the actual keys)."""
    try:
        result = supabase.table("provider_keys") \
            .select("provider, is_active, encrypted_key") \
            .eq("user_id", current_user.id) \
            .execute()

        keys = []
        for row in result.data or []:
            keys.append(ProviderKeySummary(
                provider=row["provider"],
                is_active=row.get("is_active", True),
                has_key=bool(row.get("encrypted_key")),
                prefix=None,  # Never expose any part of the encrypted key
            ))
        return {"keys": keys}

    except Exception as e:
        logger.error("Failed to list provider keys for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to list provider keys")


@router.delete("/{provider}")
async def delete_provider_key(
    provider: str,
    current_user: UserSession = Depends(validate_api_key),
):
    """Remove a provider key."""
    try:
        supabase.table("provider_keys") \
            .delete() \
            .eq("user_id", current_user.id) \
            .eq("provider", provider) \
            .execute()

        logger.info("Provider key deleted for user %s, provider %s", current_user.id, provider)
        return {"status": "ok", "provider": provider}

    except Exception as e:
        logger.error("Failed to delete provider key for user %s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail="Failed to delete provider key")
