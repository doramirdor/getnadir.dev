"""
API routes for request logs.
"""
from typing import Dict, Any, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth.supabase_auth import get_current_user, UserSession
from app.database.supabase_db import supabase_db
from app.schemas.logs import LogEntry, LogEntryResponse, LogSummary, LogsResponse, PaginationMeta, LogRequest


router = APIRouter()


@router.get("/api/v1/log", response_model=LogEntryResponse)
async def get_request_log(
    id: str,
    current_user: UserSession = Depends(get_current_user)
) -> LogEntryResponse:
    """
    Get detailed information about a specific request by ID.
    
    Args:
        id: The ID of the request to retrieve
        current_user: Authenticated user from bearer token
    
    Returns:
        Dictionary with request metadata
    """
    try:
        # Convert string ID to UUID for query
        request_id = uuid.UUID(id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request ID format")
    
    # Query the usage event from Supabase
    usage_event = await supabase_db.get_usage_event(str(request_id), current_user.id)
    
    if not usage_event:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Calculate additional metrics
    generation_time = usage_event.get("latency_ms", 0)
    moderation_latency = 0  # Not tracked separately, could be added in future
    
    # Format the response using our Pydantic model
    log_entry = LogEntry(
        id=str(usage_event["id"]),
        total_cost=usage_event["cost_usd"],
        created_at=usage_event["created_at"],
        model=usage_event["model_name"],
        provider=usage_event["provider"],
        provider_name=usage_event["provider"],
        origin="api",
        usage=usage_event["cost_usd"],
        is_byok=bool(current_user.provider_api_keys and 
                  current_user.provider_api_keys.get("provider_keys", {}).get(usage_event["provider"].lower())),
        upstream_id=str(usage_event["id"]),
        cache_discount=0.0,  # Not implementing caching yet
        app_id=None,
        streamed=False,  # Could add this flag to usage event in the future
        cancelled=False,  # Could add this flag to usage event in the future
        latency=usage_event.get("latency_ms", 0),
        moderation_latency=moderation_latency,
        generation_time=generation_time,
        finish_reason="stop",  # Default, could be added to model in future
        native_finish_reason="stop",  # Default, could be added to model in future
        tokens_prompt=usage_event["tokens_in"],
        tokens_completion=usage_event["tokens_out"],
        native_tokens_prompt=usage_event["tokens_in"],
        native_tokens_completion=usage_event["tokens_out"],
        native_tokens_reasoning=0,  # Not tracked separately
        num_media_prompt=0,  # Not tracking media yet
        num_media_completion=0,  # Not tracking media yet
        num_search_results=0,  # Not tracking search results yet
        cluster_id=usage_event.get("cluster_id"),
        tags=usage_event.get("metadata", {}).get("tags", [])
    )
    
    return LogEntryResponse(data=log_entry)


@router.get("/api/v1/logs", response_model=LogsResponse)
async def get_request_logs(
    page: int = 1,
    current_user: UserSession = Depends(get_current_user)
) -> LogsResponse:
    """
    Get paginated list of request logs for the authenticated user.
    
    Args:
        page: Page number (1-indexed)
        current_user: Authenticated user from bearer token
        
    Returns:
        Dictionary with list of request metadata
    """
    # Validate page number
    if page < 1:
        page = 1
        
    page_size = 50
    
    # Get paginated usage events from Supabase
    usage_events, total_count = await supabase_db.get_user_usage_events(
        user_id=current_user.id,
        page=page,
        page_size=page_size
    )
    
    # Format the response using our Pydantic models
    logs = []
    for event in usage_events:
        # Determine if client's own API key was used
        is_byok = bool(current_user.provider_api_keys and 
                      current_user.provider_api_keys.get("provider_keys", {}).get(event["provider"].lower()))
        
        logs.append(LogSummary(
            id=str(event["id"]),
            total_cost=event["cost_usd"],
            created_at=event["created_at"],
            model=event["model_name"],
            provider=event["provider"],
            origin="api",
            usage=event["cost_usd"],
            is_byok=is_byok,
            upstream_id=str(event["id"]),
            latency=event.get("latency_ms", 0),
            tokens_prompt=event["tokens_in"],
            tokens_completion=event["tokens_out"],
            cluster_id=event.get("cluster_id"),
            tags=event.get("metadata", {}).get("tags", [])
        ))
    
    # Calculate pagination metadata
    total_pages = (total_count + page_size - 1) // page_size
    has_more = page < total_pages
    
    # Create the response using our Pydantic models
    pagination_meta = PaginationMeta(
        page=page,
        total_pages=total_pages,
        total_count=total_count,
        has_more=has_more
    )
    
    return LogsResponse(data=logs, meta=pagination_meta) 