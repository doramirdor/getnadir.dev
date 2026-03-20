"""
Schema models for LLM models information.
"""
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class Architecture(BaseModel):
    """Model architecture information."""
    input_modalities: List[str] = Field(default_factory=lambda: ["text"])
    output_modalities: List[str] = Field(default_factory=lambda: ["text"])
    tokenizer: str = "Unknown"


class TopProvider(BaseModel):
    """Provider information."""
    is_moderated: bool = True


class Pricing(BaseModel):
    """Model pricing information."""
    prompt: str = "0"
    completion: str = "0"
    image: str = "0"
    request: str = "0"
    input_cache_read: str = "0"


class PerformanceMetrics(BaseModel):
    """Performance metrics for a model."""
    MMLU: Union[str, float, None] = None
    GPQA: Union[str, float, None] = None
    LiveCodeBench: Union[str, float, None] = None
    SciCode: Union[str, float, None] = None
    HumanEval: Union[str, float, None] = None
    MATH_500: Union[str, float, None] = None
    tokens_per_second: Union[str, float, None] = None
    first_token_latency: Union[str, float, None] = None
    
    model_config = ConfigDict(
        extra="allow"
    )


class ModelInfo(BaseModel):
    """
    Information about a model.
    
    Enhanced with better validation and type conversion.
    """
    id: str
    name: str
    model_name: str
    created: Optional[datetime] = None
    description: str = ""
    architecture: Architecture = Field(default_factory=Architecture)
    top_provider: TopProvider = Field(default_factory=TopProvider)
    pricing: Pricing = Field(default_factory=Pricing)
    context_window: Union[str, int, None] = None
    qualityIndex: Optional[str] = None
    quality_index: Optional[str] = None
    provider: str
    function_calling: Optional[str] = None
    json_mode: Optional[str] = None
    tier: int = 3
    confidence: float = 0.0
    strong_win_rate: float = 0.0
    cost_per_million_tokens: float = 0.0
    reasoning: str = ""
    performance_metrics: PerformanceMetrics = Field(default_factory=PerformanceMetrics)
    
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra="allow"
    )


class ModelsResponse(BaseModel):
    """Response model for the models endpoint."""
    data: List[ModelInfo] = Field(default_factory=list)


class AvailableModel(BaseModel):
    """Information about an available model."""
    id: str
    model: str
    provider: str
    created_at: Optional[datetime] = None


class AvailableModelsResponse(BaseModel):
    """Response model for the available models endpoint."""
    models: List[AvailableModel] = Field(default_factory=list) 