"""
Supabase API Key Authentication module for Horizen API.
Handles secure authentication, user sessions, and authorization.
"""
from typing import Optional, Dict, Any
import asyncio
import base64
import hashlib
import logging

from fastapi import Depends, HTTPException, status, Header
from supabase import create_client, Client
from sqlalchemy.ext.asyncio import AsyncSession

from app.settings import settings

logger = logging.getLogger(__name__)

# Initialize Supabase client with validation
if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
    logger.critical(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
        "The API will not function without Supabase credentials."
    )
    # Create a placeholder so imports don't crash; endpoints will fail with clear errors
    supabase: Client = None  # type: ignore[assignment]
else:
    try:
        supabase: Client = create_client(
            supabase_url=settings.SUPABASE_URL,
            supabase_key=settings.SUPABASE_SERVICE_KEY
        )
    except Exception as e:
        logger.critical("Failed to initialize Supabase client: %s", e)
        supabase: Client = None  # type: ignore[assignment]


class UserSession:
    """User session data from Supabase."""
    def __init__(self, user_data: Dict[str, Any]):
        self.id = user_data.get("id")
        self.email = user_data.get("email")
        self.name = user_data.get("name")
        self.benchmark_model = user_data.get("benchmark_model")
        self.allowed_providers = user_data.get("allowed_providers", [])
        self.allowed_models = user_data.get("allowed_models", [])
        self.budget_limit = user_data.get("budget_limit")
        self.budget_used = user_data.get("cost_this_month", 0.0)
        self.clusters = user_data.get("clusters", [])
        self.api_key_config = user_data.get("api_key_config", {})  # Store the API key configuration used
        # Subscription / billing
        self.subscription_status: str = user_data.get("subscription_status", "inactive")  # active, past_due, canceled, inactive
        self.subscription_plan: str = user_data.get("subscription_plan", "free")  # free, pro, enterprise
        self.raw_data = user_data

    @property
    def is_subscribed(self) -> bool:
        """True if user has an active paid subscription."""
        return self.subscription_status == "active"

    @property
    def is_free_tier(self) -> bool:
        return self.subscription_plan == "free" or self.subscription_status != "active"


async def validate_api_key(api_key: str = Header(alias="X-API-Key")) -> UserSession:
    """
    Validate API key against Supabase and return user session data.
    
    Args:
        api_key: API key from request header
        
    Returns:
        UserSession object with user data
        
    Raises:
        HTTPException: If API key is invalid or user not found
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Primary lookup: SHA-256 hash (industry standard for high-entropy API keys)
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        response = await asyncio.to_thread(
            lambda: supabase.table("api_keys").select("*").eq("key_hash", api_key_hash).eq("is_active", True).execute()
        )

        if not response.data or len(response.data) == 0:
            # Fallback: legacy base64 lookup (transition period)
            legacy_hash = base64.b64encode(api_key.encode()).decode()
            response = await asyncio.to_thread(
                lambda: supabase.table("api_keys").select("*").eq("key_hash", legacy_hash).eq("is_active", True).execute()
            )

            if not response.data or len(response.data) == 0:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid API key",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Auto-migrate: update legacy base64 hash to SHA-256 in-place
            matched_key_id = response.data[0].get("id")
            try:
                await asyncio.to_thread(
                    lambda: supabase.table("api_keys").update({"key_hash": api_key_hash}).eq("id", matched_key_id).execute()
                )
                logger.info("Auto-migrated API key %s from base64 to SHA-256", matched_key_id)
            except Exception as migrate_err:
                logger.warning("Failed to auto-migrate API key %s: %s", matched_key_id, migrate_err)

        api_key_data = response.data[0]
        user_id = api_key_data.get("user_id")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID not found for API key",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Get user profile and subscription status in parallel
        profile_future = asyncio.to_thread(
            lambda: supabase.table("profiles").select("*").eq("id", user_id).execute()
        )
        subscription_future = asyncio.to_thread(
            lambda: supabase.table("user_subscriptions").select("status").eq("user_id", user_id).execute()
        )
        profile_response, subscription_response = await asyncio.gather(
            profile_future, subscription_future, return_exceptions=True
        )

        # Handle profile
        if isinstance(profile_response, Exception) or not getattr(profile_response, 'data', None):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User profile not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        profile_data = profile_response.data[0]

        # Resolve subscription status (default to inactive/free if not found)
        sub_status = "inactive"
        sub_plan = "free"
        if not isinstance(subscription_response, Exception) and getattr(subscription_response, 'data', None):
            sub_status = subscription_response.data[0].get("status", "inactive")
            sub_plan = "pro" if sub_status == "active" else "free"

        # Compile user session data using both API key config and profile data
        user_session_data = {
            "id": user_id,
            "email": profile_data.get("email"),
            "name": profile_data.get("name"),
            "benchmark_model": api_key_data.get("benchmark_model"),
            "allowed_providers": [],  # Will be populated from provider_budgets if needed
            "allowed_models": api_key_data.get("selected_models", []),
            "budget_limit": sum(profile_data.get("provider_budgets", {}).values()) if profile_data.get("provider_budgets") else None,
            "budget_used": profile_data.get("cost_this_month", 0.0),
            "clusters": [],  # Will be populated when clustering tables are created
            "api_key_config": api_key_data,  # Store the full API key configuration
            "subscription_status": sub_status,
            "subscription_plan": sub_plan,
        }
        
        return UserSession(user_session_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating API key: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during authentication",
        )


async def get_current_user(user_session: UserSession = Depends(validate_api_key)) -> UserSession:
    """
    Get the current user session.
    
    Args:
        user_session: User session from API key validation
        
    Returns:
        UserSession object
    """
    return user_session


async def get_user_usage_stats(user_id: str) -> Dict[str, Any]:
    """
    Get user usage statistics from Supabase.
    
    Args:
        user_id: User ID
        
    Returns:
        Usage statistics dictionary
    """
    try:
        response = supabase.table("usage_logs").select("*").eq("user_id", user_id).execute()
        
        total_requests = len(response.data) if response.data else 0
        total_cost = sum(log.get("cost", 0) for log in response.data) if response.data else 0
        
        return {
            "total_requests": total_requests,
            "total_cost": total_cost,
            "logs": response.data[:100]  # Return last 100 logs
        }
    except Exception as e:
        logger.error(f"Error getting usage stats for user {user_id}: {str(e)}")
        return {"total_requests": 0, "total_cost": 0, "logs": []}


async def log_usage_event(
    user_id: str,
    request_id: str,
    model_name: str,
    provider: str,
    tokens_in: int,
    tokens_out: int,
    cost: float,
    route: str,
    prompt: Optional[str] = None,
    response: Optional[str] = None,
    latency_ms: Optional[int] = None,
    cluster_id: Optional[str] = None,
    embedding: Optional[bytes] = None,
    metadata: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None
) -> None:
    """
    Log comprehensive usage event to Supabase.
    
    Args:
        user_id: User ID
        request_id: Request ID
        model_name: Model name
        provider: Provider name
        tokens_in: Input tokens
        tokens_out: Output tokens
        cost: Request cost
        route: API route
        prompt: Optional prompt text
        response: Optional response text
        latency_ms: Optional latency in milliseconds
        cluster_id: Optional cluster ID
        embedding: Optional prompt embedding
        metadata: Optional additional metadata
        error: Optional error message
    """
    try:
        # Use the new comprehensive logging RPC function with write permissions
        logger.debug(f"log_usage_event called for user {user_id}, request {request_id}, cost ${cost}")
        try:
            result = await asyncio.to_thread(
                lambda: supabase.rpc("log_usage_comprehensive", {
                    "p_request_id": request_id,
                    "p_user_id": user_id,
                    "p_model_name": model_name,
                    "p_provider": provider,
                    "p_tokens_in": tokens_in,
                    "p_tokens_out": tokens_out,
                    "p_cost": cost,
                    "p_route": route,
                    "p_prompt": prompt,
                    "p_response": response,
                    "p_latency_ms": latency_ms,
                    "p_cluster_id": cluster_id,
                    "p_metadata": metadata
                }).execute()
            )
            
            if result.data:
                logger.info(f"✅ Successfully logged usage for user {user_id}: ${cost} for {model_name} (Event ID: {result.data})")
            else:
                logger.warning(f"⚠️ RPC function executed but returned no data for user {user_id}")
                
        except Exception as rpc_error:
            logger.error(f"❌ Error using RPC function for user {user_id}: {str(rpc_error)}")
            # Fallback to original database method
            logger.info(f"🔄 Falling back to supabase_db.log_usage_event for user {user_id}")
            
            from app.database.supabase_db import supabase_db
            
            await supabase_db.log_usage_event(
                request_id=request_id,
                user_id=user_id,
                model_name=model_name,
                provider=provider,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost=cost,
                route=route,
                prompt=prompt,
                response=response,
                latency_ms=latency_ms,
                cluster_id=cluster_id,
                embedding=embedding,
                metadata=metadata,
                error=error
            )
        
    except Exception as e:
        logger.error(f"Error logging usage event: {str(e)}")


async def check_user_budget(user_session: UserSession, estimated_cost: float) -> bool:
    """
    Atomically check if user has sufficient budget for the request.

    Uses an atomic RPC call to prevent race conditions where concurrent
    requests could pass the budget check simultaneously. Falls back to
    non-atomic check if the RPC function is not available.

    Args:
        user_session: User session
        estimated_cost: Estimated cost of the request

    Returns:
        True if user has sufficient budget, False otherwise
    """
    try:
        # Try atomic budget check via RPC first (prevents race condition)
        try:
            result = await asyncio.to_thread(
                lambda: supabase.rpc("check_and_reserve_budget", {
                    "p_user_id": user_session.id,
                    "p_estimated_cost": estimated_cost,
                }).execute()
            )
            if result.data is not None:
                allowed = bool(result.data)
                if not allowed:
                    logger.warning(f"User {user_session.id} budget check denied (atomic) for ${estimated_cost}")
                return allowed
        except Exception as rpc_err:
            logger.warning(
                "Atomic budget RPC unavailable for user %s, falling back to non-atomic check: %s",
                user_session.id, rpc_err,
            )

        # Non-atomic fallback: use session data already loaded during auth.
        # This has a small race window under concurrent requests but is far
        # better than denying ALL traffic when the RPC is unavailable.
        try:
            if user_session.budget_limit is None:
                return True  # No budget limit configured — allow

            budget_used = float(user_session.budget_used or 0.0)
            remaining = float(user_session.budget_limit) - budget_used
            if remaining >= estimated_cost:
                logger.info(
                    "Non-atomic budget check PASSED for user %s (remaining: $%.4f, requested: $%.4f)",
                    user_session.id, remaining, estimated_cost,
                )
                return True
            else:
                logger.warning(
                    "User %s budget exceeded (non-atomic): $%.4f remaining, $%.4f requested",
                    user_session.id, remaining, estimated_cost,
                )
                return False
        except Exception as fallback_err:
            logger.error(
                "Non-atomic budget fallback failed for user %s: %s",
                user_session.id, fallback_err,
            )
            return False

    except Exception as e:
        logger.error(f"Budget check error for user {user_session.id}: {str(e)}")
        return False


async def update_user_preference(
    user_id: str,
    preference_type: str,
    preference_value: Any
) -> bool:
    """
    Update user preference in Supabase.
    
    Args:
        user_id: User ID
        preference_type: Type of preference (benchmark_model, allowed_providers, etc.)
        preference_value: New preference value
        
    Returns:
        True if successful, False otherwise
    """
    ALLOWED_PREFERENCES = {
        "benchmark_model", "allowed_providers", "allowed_models",
        "temperature", "provider_budgets", "name", "email",
    }
    if preference_type not in ALLOWED_PREFERENCES:
        logger.warning("Rejected invalid preference type %r for user %s", preference_type, user_id)
        return False

    try:
        supabase.table("profiles").update({
            preference_type: preference_value
        }).eq("id", user_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating user preference: {str(e)}")
        return False


async def check_rate_limit(user_id: str) -> None:
    """
    Check rate limit for the user using Supabase.
    
    Args:
        user_id: User ID to check rate limit for
        
    Raises:
        HTTPException: If rate limit exceeded
    """
    try:
        # Check recent requests in the last minute
        from datetime import datetime, timedelta
        one_minute_ago = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
        
        response = await asyncio.to_thread(
            lambda: supabase.table("usage_logs").select("id").eq("user_id", user_id).gt("created_at", one_minute_ago).execute()
        )

        request_count = len(response.data) if response.data else 0
        
        if request_count > 60:  # Default rate limit
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later.",
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking rate limit: {str(e)}")
        # Don't block requests if rate limiting fails