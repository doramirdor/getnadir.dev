"""
Schema models for request logs.
"""
from typing import Optional, List, Any, Dict, Union
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class LogEntry(BaseModel):
    """
    Information about a single log entry.
    
    Enhanced with better validation and type conversion.
    """
    id: str
    total_cost: float = 0.0
    created_at: Union[str, datetime]
    model: str
    provider: str
    origin: str = "api"
    usage: float = 0.0
    is_byok: bool = False
    upstream_id: str
    cache_discount: float = 0.0
    app_id: Optional[str] = None
    streamed: bool = False
    cancelled: bool = False
    provider_name: str
    latency: int
    moderation_latency: int = 0
    generation_time: int = 0
    finish_reason: str = "stop"
    native_finish_reason: str = "stop"
    tokens_prompt: int = 0
    tokens_completion: int = 0
    native_tokens_prompt: int = 0
    native_tokens_completion: int = 0
    native_tokens_reasoning: int = 0
    num_media_prompt: int = 0
    num_media_completion: int = 0
    num_search_results: int = 0
    cluster_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra="allow"
    )


class LogEntryResponse(BaseModel):
    """Response model for the log endpoint."""
    data: LogEntry


class LogSummary(BaseModel):
    """Summary information for a log entry in list view."""
    id: str
    total_cost: float = 0.0
    created_at: Union[str, datetime]
    model: str
    provider: str
    origin: str = "api"
    usage: float = 0.0
    is_byok: bool = False
    upstream_id: str
    latency: int
    tokens_prompt: int = 0
    tokens_completion: int = 0
    cluster_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class PaginationMeta(BaseModel):
    """Metadata for paginated responses."""
    page: int
    total_pages: int
    total_count: int
    has_more: bool


class LogsResponse(BaseModel):
    """Response model for the logs endpoint."""
    data: List[LogSummary] = Field(default_factory=list)
    meta: PaginationMeta


class LogRequest(BaseModel):
    """
    Request model for recording a new log entry.
    
    Enhanced with better validation.
    """
    model: str
    provider: str
    prompt: str
    response: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    cost_usd: float
    cluster_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    
    model_config = ConfigDict(
        arbitrary_types_allowed=True
    ) 