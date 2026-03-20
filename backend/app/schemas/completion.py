"""
Schema models for completion requests and responses.
"""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


class Message(BaseModel):
    """Chat message in OpenAI format."""
    role: Literal["user", "assistant", "system", "tool"] = Field(..., description="Role of the message sender")
    content: str = Field(..., max_length=500_000, description="Content of the message")


class NadirOptions(BaseModel):
    """Nadir-specific options for enhanced functionality."""
    max_models: Optional[int] = Field(3, ge=1, le=10, description="Maximum number of model recommendations")
    include_analysis: Optional[bool] = Field(True, description="Include detailed analysis in response")
    benchmark_model: Optional[str] = Field(None, description="Benchmark model for comparison")
    return_alternatives: Optional[bool] = Field(True, description="Return alternative model suggestions")


class CompletionRequest(BaseModel):
    """Request for chat completion supporting both OpenAI and Nadir formats."""
    # OpenAI-compatible fields
    messages: Optional[List[Message]] = Field(None, description="List of messages for chat completion")
    model: Optional[str] = Field(None, description="Model to use (or 'auto' for recommendation)")
    temperature: Optional[float] = Field(0.7, ge=0, le=2, description="Sampling temperature")
    max_tokens: Optional[int] = Field(None, ge=1, le=128_000, description="Maximum tokens to generate")

    # Nadir legacy support
    prompt: Optional[str] = Field(None, description="Single prompt (legacy support)")
    provider: Optional[str] = Field(None, description="Optional provider to use")
    system_message: Optional[str] = Field(None, description="Optional system message")

    # Nadir enhancement options
    nadir_mode: Optional[Literal["recommendation", "standard"]] = Field(None, description="Nadir mode: 'recommendation' or 'standard'")
    nadir_options: Optional[NadirOptions] = Field(None, description="Nadir-specific options")
    debug: Optional[bool] = Field(False, description="Enable debug mode to include recommendation details")
    
    # OpenRouter-style fallback support
    extra_body: Optional[Dict[str, Any]] = Field(None, description="Extra body parameters including fallback models")


class Choice(BaseModel):
    """OpenAI-compatible choice object."""
    index: int = Field(0, description="Choice index")
    message: Message = Field(..., description="Response message")
    finish_reason: str = Field("stop", description="Reason for completion")


class Usage(BaseModel):
    """OpenAI-compatible usage object."""
    prompt_tokens: int = Field(..., description="Number of tokens in prompt")
    completion_tokens: int = Field(..., description="Number of tokens in completion")
    total_tokens: int = Field(..., description="Total number of tokens")


class ModelAnalysis(BaseModel):
    """Nadir model analysis details."""
    task_complexity: int = Field(..., description="Task complexity score (1-5)")
    complexity_reasoning: str = Field(..., description="Explanation of complexity assessment")
    selected_model: str = Field(..., description="Selected model name")
    selection_reasoning: str = Field(..., description="Why this model was selected")


class AlternativeModel(BaseModel):
    """Alternative model suggestion."""
    model: str = Field(..., description="Model name")
    provider: str = Field(..., description="Provider name")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score (0-1)")
    reasoning: str = Field(..., description="Why this model is suitable")
    cost_estimate: Optional[float] = Field(None, description="Estimated cost")
    
    # Additional identifying information to distinguish similar models
    performance_name: Optional[str] = Field(None, description="Original model name from performance data")
    quality_index: Optional[float] = Field(None, description="Quality index score")
    cost_per_1m_tokens: Optional[float] = Field(None, description="Cost per 1M tokens")
    api_id: Optional[str] = Field(None, description="Unique API identifier")
    context_window: Optional[str] = Field(None, description="Context window size")
    function_calling: Optional[str] = Field(None, description="Function calling support")
    json_mode: Optional[str] = Field(None, description="JSON mode support")


class CostAnalysis(BaseModel):
    """Cost analysis for selected and alternative models."""
    selected_model_cost: float = Field(..., description="Cost for selected model")
    alternatives_cost_range: List[float] = Field(..., description="[min_cost, max_cost] for alternatives")


class RecommendationRequest(BaseModel):
    """Request for model recommendation only (no completion)."""
    # OpenAI-compatible fields
    messages: Optional[List[Message]] = Field(None, description="List of messages for analysis")
    model: Optional[str] = Field(None, description="Model to compare against (benchmark)")
    temperature: Optional[float] = Field(0.7, ge=0, le=2, description="Sampling temperature")
    max_tokens: Optional[int] = Field(None, ge=1, le=128_000, description="Maximum tokens to generate")

    # Legacy support
    prompt: Optional[str] = Field(None, description="Single prompt (legacy support)")
    system_message: Optional[str] = Field(None, description="Optional system message")

    # Recommendation options
    max_models: Optional[int] = Field(3, ge=1, le=10, description="Maximum number of recommendations")
    include_analysis: Optional[bool] = Field(True, description="Include detailed analysis")
    benchmark_model: Optional[str] = Field(None, description="Benchmark model for comparison")
    providers: Optional[List[str]] = Field(None, description="Allowed providers")
    models: Optional[List[str]] = Field(None, description="Allowed models")


class RecommendationResponse(BaseModel):
    """Response with model recommendations (no completion)."""
    success: bool = Field(True, description="Request success status")
    request_id: str = Field(..., description="Unique request ID")
    created: int = Field(..., description="Unix timestamp")
    
    # Analysis results
    task_complexity: int = Field(..., description="Task complexity score (1-5)")
    complexity_reasoning: str = Field(..., description="Explanation of complexity assessment")
    
    # Recommendations
    recommendations: List[AlternativeModel] = Field(..., description="Ranked model recommendations")
    selected_model: Optional[str] = Field(None, description="Top recommended model")
    
    # Benchmark comparison (if provided)
    benchmark_comparison: Optional[Dict[str, Any]] = Field(None, description="Comparison with benchmark model")
    
    # Cost analysis
    cost_analysis: Optional[CostAnalysis] = Field(None, description="Cost comparison")
    
    # Tracking
    funnel_tag: Optional[str] = Field(None, description="Funnel/tracking tag")


class NadirExtensions(BaseModel):
    """Nadir-specific response extensions."""
    mode: str = Field(..., description="Request mode (recommendation/standard)")
    model_analysis: Optional[ModelAnalysis] = Field(None, description="Model analysis details")
    alternatives: Optional[List[AlternativeModel]] = Field(None, description="Alternative model suggestions")
    cost_analysis: Optional[CostAnalysis] = Field(None, description="Cost analysis")
    funnel_tag: Optional[str] = Field(None, description="Funnel/tracking tag")


class CompletionResponse(BaseModel):
    """OpenAI-compatible completion response with Nadir extensions."""
    # OpenAI-compatible fields
    id: str = Field(..., description="Unique completion ID")
    object: str = Field("chat.completion", description="Object type")
    created: int = Field(..., description="Unix timestamp")
    model: str = Field(..., description="Model used for completion")
    usage: Usage = Field(..., description="Token usage information")
    choices: List[Choice] = Field(..., description="Completion choices")
    
    # Nadir extensions (optional)
    nadir: Optional[NadirExtensions] = Field(None, description="Nadir-specific extensions")
    
    # Legacy fields for backward compatibility
    response: Optional[str] = Field(None, description="Legacy response field")
    model_used: Optional[str] = Field(None, description="Legacy model_used field")
    provider: Optional[str] = Field(None, description="Provider used for completion")
    latency_ms: Optional[int] = Field(None, description="Latency in milliseconds")
    cost_usd: Optional[float] = Field(None, description="Cost in USD")
    prompt_tokens: Optional[int] = Field(None, description="Legacy prompt_tokens field")
    completion_tokens: Optional[int] = Field(None, description="Legacy completion_tokens field")
    request_id: Optional[str] = Field(None, description="Legacy request_id field")
    estimated_cost_usd: Optional[float] = Field(None, description="Estimated cost before request")
    cost_accuracy: Optional[str] = Field(None, description="Cost accuracy indicator")
    selection_reasoning: Optional[Dict[str, Any]] = Field(None, description="Model selection reasoning")
    user_profile: Optional[Dict[str, Any]] = Field(None, description="User profile information")
    session_usage: Optional[Dict[str, Any]] = Field(None, description="Session usage statistics")


class PlaygroundRequest(BaseModel):
    """Request for playground chat completion."""
    prompt: str = Field(..., max_length=500_000, description="The prompt to complete")
    model: Optional[str] = Field(None, description="Optional model to use")
    provider: Optional[str] = Field(None, description="Optional provider to use")
    model_names: Optional[List[str]] = Field(None, description="Optional list of models to choose from")
    provider_list: Optional[List[str]] = Field(None, description="Optional list of providers to choose from")
    max_tokens: Optional[int] = Field(None, ge=1, le=128_000, description="Maximum tokens to generate")
    temperature: Optional[float] = Field(0.7, ge=0, le=2, description="Sampling temperature")
    system_message: Optional[str] = Field(None, description="Optional system message to guide the model's behavior") 