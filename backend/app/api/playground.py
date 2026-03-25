"""
Playground API endpoints for testing recommendations without provider calls.

This module provides endpoints for testing the recommendation system
and complexity analysis without actually calling LLM providers.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Dict, Any, List, Optional
import logging
import uuid
import time
from datetime import datetime

from app.auth.supabase_auth import get_current_user
# from app.services.supabase_unified_llm_service import SupabaseUnifiedLLMService
# from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
from app.database.supabase_db import supabase_db
from pydantic import BaseModel, Field
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

router = APIRouter()
logger = logging.getLogger(__name__)
templates = Jinja2Templates(directory="app/templates")

# Initialize services
# llm_service = SupabaseUnifiedLLMService()


# Complexity analysis now handled by the unified service and ML analyzers


# Removed hardcoded model selection functions - now using actual unified service


class FallbackModel(BaseModel):
    """Fallback model configuration."""
    model_id: str = Field(..., description="Model ID to fallback to")
    provider: str = Field(..., description="Provider for the fallback model")
    priority: int = Field(..., description="Priority order (1 = first fallback, 2 = second, etc.)")


class LoadBalancingModel(BaseModel):
    """Load balancing model configuration."""
    model_id: str = Field(..., description="Model ID")
    provider: str = Field(..., description="Provider name")
    traffic_percentage: float = Field(..., ge=0, le=100, description="Percentage of traffic to route to this model")
    enabled: bool = Field(True, description="Whether this model is enabled")


class FallbackConfig(BaseModel):
    """Enhanced fallback configuration."""
    enabled: bool = Field(True, description="Whether fallback is enabled")
    max_attempts: int = Field(2, ge=1, le=10, description="Maximum number of fallback attempts")
    auto_select_alternatives: bool = Field(True, description="Whether to auto-select alternative models")
    custom_fallback_models: Optional[List[FallbackModel]] = Field(None, description="User-defined fallback models in priority order")
    timeout_seconds: int = Field(30, ge=5, le=300, description="Timeout in seconds for each request")
    retry_on_rate_limit: bool = Field(True, description="Whether to retry when hitting rate limits")
    retry_on_timeout: bool = Field(True, description="Whether to retry on timeout errors")
    retry_on_content_filter: bool = Field(False, description="Whether to retry on content filter violations")


class LoadBalancingPolicy(BaseModel):
    """Enhanced load balancing policy."""
    name: str = Field(..., description="Policy name")
    enabled: bool = Field(True, description="Whether the policy is enabled")
    models: List[LoadBalancingModel] = Field(..., description="Models with traffic distribution")
    strategy: str = Field("traffic_percentage", description="Load balancing strategy")


class UserProfileOverride(BaseModel):
    """User profile override for playground testing."""
    benchmark_model: Optional[str] = Field(None, description="Benchmark model to compare against")
    allowed_providers: Optional[List[str]] = Field(None, description="List of allowed providers")
    allowed_models: Optional[List[str]] = Field(None, description="List of allowed models")
    fallback_config: Optional[FallbackConfig] = Field(None, description="Enhanced fallback configuration")
    load_balancing_policy: Optional[LoadBalancingPolicy] = Field(None, description="Enhanced load balancing policy")


class PlaygroundRequest(BaseModel):
    """Request schema for playground recommendations."""
    prompt: str = Field(..., description="The user's prompt")
    messages: Optional[List[Dict[str, str]]] = Field(None, description="Optional chat messages")
    model_overrides: Optional[Dict[str, Any]] = Field(None, description="Optional model overrides")
    complexity_analyzer: Optional[str] = Field("bert", description="Complexity analyzer to use")
    user_profile_override: Optional[UserProfileOverride] = Field(None, description="User profile overrides for testing")
    

class PlaygroundResponse(BaseModel):
    """Response schema for playground recommendations."""
    success: bool = Field(..., description="Whether the request was successful")
    request_id: str = Field(..., description="Unique request identifier")
    recommended_model: str = Field(..., description="Recommended model")
    recommended_provider: str = Field(..., description="Recommended provider")
    complexity_analysis: Dict[str, Any] = Field(..., description="Detailed complexity analysis")
    model_selection_reasoning: str = Field(..., description="Why this model was selected")
    available_models: List[Dict[str, Any]] = Field(..., description="All available models")
    user_preferences: Dict[str, Any] = Field(..., description="User's preferences and restrictions")
    processing_time_ms: int = Field(..., description="Time taken for analysis")
    timestamp: str = Field(..., description="Response timestamp")
    error: Optional[str] = Field(None, description="Error message if failed")


@router.post("/v1/playground/recommend")
async def get_recommendation(
    request: PlaygroundRequest,
    http_request: Request
):
    """
    Get model recommendation without calling providers.
    
    This endpoint analyzes the prompt complexity and returns the recommended
    model along with detailed reasoning, without making actual API calls.
    """
    start_time = time.time()
    request_id = str(uuid.uuid4())
    
    try:
        # Try to get user from auth header, otherwise use demo user
        try:
            current_user = await get_current_user(http_request)
            user_id = current_user["id"]
        except Exception:
            user_id = "demo-user-playground"
        
        # Get user profile and preferences
        try:
            user_profile = await supabase_db.get_user_profile(user_id)
        except Exception as e:
            logger.warning("Failed to load user profile for playground: %s", e)
            user_profile = None
            
        if not user_profile:
            # Use demo profile for playground
            user_profile = {
                "allowed_models": [],  # Empty means all allowed
                "allowed_providers": [],  # Empty means all allowed
                "benchmark_model": None,
                "fallback_config": None
            }
        
        # Apply user profile overrides if provided
        if request.user_profile_override:
            override = request.user_profile_override
            if override.benchmark_model is not None:
                user_profile["benchmark_model"] = override.benchmark_model
            if override.allowed_providers is not None:
                user_profile["allowed_providers"] = override.allowed_providers
            if override.allowed_models is not None:
                user_profile["allowed_models"] = override.allowed_models
            if override.fallback_config is not None:
                user_profile["fallback_config"] = override.fallback_config
            if override.load_balancing_policy is not None:
                user_profile["load_balancing_policy"] = override.load_balancing_policy
        
        # Get user's allowed models and providers
        allowed_models = user_profile.get("allowed_models", [])
        allowed_providers = user_profile.get("allowed_providers", [])
        benchmark_model = user_profile.get("benchmark_model")
        fallback_config = user_profile.get("fallback_config")
        load_balancing_policy = user_profile.get("load_balancing_policy")
        
        # Complexity analysis will be done by the unified service
        complexity_result = {
            "analyzer_type": request.complexity_analyzer or "unified_service",
            "prompt_length": len(request.prompt),
            "word_count": len(request.prompt.split()),
            "analysis_notes": "Complexity analysis delegated to unified service"
        }
        
        # Get available models using the same logic as the models-and-providers endpoint
        try:
            # First try cached models
            cached_data = load_cached_models()
            if cached_data:
                available_models_response = cached_data["models"]
                logger.info(f"Using {len(available_models_response)} cached models for recommendation")
            else:
                # Fallback to database if no cache
                available_models_response = await supabase_db.get_available_models()
        except Exception as e:
            # Use mock data if database unavailable
            logger.warning("Failed to load models for playground, using mock data: %s", e)
            available_models_response = [
                {
                    "model_id": "gpt-4o",
                    "provider": "openai",
                    "display_name": "GPT-4o",
                    "description": "Most advanced GPT-4 model",
                    "context_length": 128000,
                    "pricing_input_per_1m_tokens": 5.0,
                    "pricing_output_per_1m_tokens": 15.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "claude-3-5-sonnet-20241022",
                    "provider": "anthropic",
                    "display_name": "Claude 3.5 Sonnet",
                    "description": "Latest Claude model with improved capabilities",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 3.0,
                    "pricing_output_per_1m_tokens": 15.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gemini-1.5-pro",
                    "provider": "google",
                    "display_name": "Gemini 1.5 Pro",
                    "description": "Google's flagship multimodal model",
                    "context_length": 1000000,
                    "pricing_input_per_1m_tokens": 1.25,
                    "pricing_output_per_1m_tokens": 5.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                }
            ]
        
        available_models = []
        
        # Use the same enhanced models with pricing as the curated list
        curated_with_pricing = get_curated_models_for_playground(available_models_response)
        
        for model in curated_with_pricing:
            # Filter by user permissions
            # If allowed_providers is specified, model must be from allowed provider
            if allowed_providers and model["provider"] not in allowed_providers:
                continue
            # If allowed_models is specified, model must be in allowed list  
            if allowed_models and model["model_id"] not in allowed_models:
                continue
                
            available_models.append({
                "model_id": model["model_id"],
                "provider": model["provider"],
                "display_name": model.get("display_name", model["model_id"]),
                "description": model.get("description", ""),
                "context_length": model.get("context_length"),
                "pricing_input_per_1m_tokens": model.get("pricing_input_per_1m_tokens"),
                "pricing_output_per_1m_tokens": model.get("pricing_output_per_1m_tokens"),
                "supports_function_calling": model.get("supports_function_calling", False),
                "lifecycle_status": model.get("lifecycle_status", "active")
            })
        
        if not available_models:
            raise HTTPException(
                status_code=400, 
                detail="No models available for this user"
            )
        
        # Simulate model selection logic (simplified version of the actual routing)
        recommended_model = None
        selection_reasoning = ""
        routing_method = "intelligent"
        
        # Check if load balancing policy is defined
        if load_balancing_policy:
            routing_method = "load_balanced"
            # Handle both dict and Pydantic model objects
            if hasattr(load_balancing_policy, 'models'):
                policy_models = load_balancing_policy.models
                strategy = load_balancing_policy.strategy
            else:
                policy_models = load_balancing_policy.get("models", [])
                strategy = load_balancing_policy.get("strategy", "traffic_percentage")
                
            # Debug: log available models for load balancing
            available_model_ids = [f"{m['model_id']} ({m['provider']})" for m in available_models]
            logger.info(f"Load balancing: {len(available_models)} available models: {available_model_ids}")
                
            if policy_models:
                # Simulate load balancing selection based on traffic percentages
                
                if strategy == "traffic_percentage":
                    # Select based on traffic percentages (simplified - select highest percentage for demo)
                    enabled_models = []
                    for m in policy_models:
                        # Handle both dict and Pydantic model objects
                        if hasattr(m, 'enabled'):
                            enabled = m.enabled
                        else:
                            enabled = m.get("enabled", True)
                        if enabled:
                            enabled_models.append(m)
                    
                    if enabled_models:
                        # For demo, select the model with highest traffic percentage
                        def get_traffic_percentage(model):
                            if hasattr(model, 'traffic_percentage'):
                                return model.traffic_percentage
                            return model.get("traffic_percentage", 0)
                        
                        best_model = max(enabled_models, key=get_traffic_percentage)
                        
                        # Extract model details
                        if hasattr(best_model, 'model_id'):
                            model_id = best_model.model_id
                            provider = best_model.provider
                            traffic_pct = best_model.traffic_percentage
                        else:
                            model_id = best_model["model_id"]
                            provider = best_model["provider"]
                            traffic_pct = best_model.get("traffic_percentage", 0)
                        
                        # Find this model in available models
                        for model in available_models:
                            if model["model_id"] == model_id and model["provider"] == provider:
                                recommended_model = model
                                selection_reasoning = f"Load balancing (traffic %): selected {model_id} with {traffic_pct}% traffic allocation"
                                break
                        else:
                            # Model not found in available models
                            logger.warning(f"Load balancing model {model_id} from {provider} not found in available models")
                
                elif strategy == "weighted":
                    # Legacy weighted strategy for backward compatibility
                    best_model = max(policy_models, key=lambda x: x.get("weight", 0))
                    model_id = best_model["model_id"]
                    provider = best_model["provider"]
                    
                    for model in available_models:
                        if model["model_id"] == model_id and model["provider"] == provider:
                            recommended_model = model
                            selection_reasoning = f"Load balancing (weighted): selected {model_id} with weight {best_model.get('weight', 0)}"
                            break
        
        # Check if model overrides are provided (takes precedence over load balancing and complexity)
        if request.model_overrides and not recommended_model:
            preferred_provider = request.model_overrides.get("preferred_provider")
            preferred_model = request.model_overrides.get("preferred_model")
            
            if preferred_model:
                # Find the specific model
                for model in available_models:
                    if model["model_id"] == preferred_model:
                        recommended_model = model
                        selection_reasoning = f"User explicitly requested model: {preferred_model}"
                        break
            elif preferred_provider:
                # Find best model from preferred provider
                provider_models = [m for m in available_models if m["provider"] == preferred_provider]
                if provider_models:
                    # Sort by pricing or capabilities
                    recommended_model = provider_models[0]
                    selection_reasoning = f"User preferred provider: {preferred_provider}"
        
        # Use the actual unified service for model selection (same as production)
        if not recommended_model:
            try:
                from app.services.supabase_unified_llm_service import SupabaseUnifiedLLMService
                from app.auth.supabase_auth import UserSession
                
                # Create a demo user session with profile overrides
                demo_user_data = {
                    "id": user_id,
                    "email": "demo@playground.com",
                    "name": "Playground Demo User",
                    "allowed_providers": allowed_providers or [],
                    "allowed_models": allowed_models or [],
                    "benchmark_model": benchmark_model,
                    "budget_limit": None,
                    "budget_used": 0.0,
                    "clusters": []
                }
                demo_session = UserSession(demo_user_data)
                
                # Use the actual unified service
                service = SupabaseUnifiedLLMService(demo_session)
                selected_model, selection_reasoning, complexity_analysis = await service._select_best_model(
                    prompt=request.prompt,
                    providers_override=allowed_providers,
                    models_override=allowed_models
                )
                
                recommended_model = selected_model
                if complexity_analysis:
                    complexity_result.update(complexity_analysis)
                    
            except Exception as e:
                logger.warning(f"Failed to use unified service: {e}")
                # Fallback to simple selection
                recommended_model = available_models[0] if available_models else None
                selection_reasoning = f"Fallback selection due to service error: {str(e)}"
        
        # Default fallback
        if not recommended_model:
            recommended_model = available_models[0]
            selection_reasoning = "Default model selection"
        
        # Simulate fallback logic if enabled
        fallback_info = None
        if fallback_config:
            # Handle both dict and Pydantic model objects
            if hasattr(fallback_config, 'enabled'):
                enabled = fallback_config.enabled
                max_attempts = fallback_config.max_attempts
                auto_select = fallback_config.auto_select_alternatives
                custom_models = fallback_config.custom_fallback_models
                timeout_sec = fallback_config.timeout_seconds
            else:
                enabled = fallback_config.get("enabled", False)
                max_attempts = fallback_config.get("max_attempts", 2)
                auto_select = fallback_config.get("auto_select_alternatives", True)
                custom_models = fallback_config.get("custom_fallback_models")
                timeout_sec = fallback_config.get("timeout_seconds", 30)
            
            if enabled:
                fallback_models_list = []
                
                # Get user-defined fallback models or auto-select
                if custom_models:
                    # Use user-defined fallback models
                    for fb_model in custom_models:
                        # Handle both dict and Pydantic model objects
                        if hasattr(fb_model, 'model_id'):
                            fb_model_id = fb_model.model_id
                            fb_provider = fb_model.provider
                            fb_priority = fb_model.priority
                        else:
                            fb_model_id = fb_model["model_id"]
                            fb_provider = fb_model["provider"]
                            fb_priority = fb_model.get("priority", 1)
                        
                        # Verify the fallback model is available
                        for available_model in available_models:
                            if (available_model["model_id"] == fb_model_id and 
                                available_model["provider"] == fb_provider):
                                fallback_models_list.append({
                                    "model_id": fb_model_id,
                                    "provider": fb_provider,
                                    "priority": fb_priority,
                                    "available": True
                                })
                                break
                        else:
                            # Model not available
                            fallback_models_list.append({
                                "model_id": fb_model_id,
                                "provider": fb_provider,
                                "priority": fb_priority,
                                "available": False
                            })
                
                elif auto_select:
                    # Auto-select fallback models (choose different provider/cheaper models)
                    current_provider = recommended_model["provider"]
                    
                    # Find models from different providers or cheaper models
                    fallback_candidates = []
                    for model in available_models:
                        if model["model_id"] != recommended_model["model_id"]:
                            # Prefer different provider or cheaper model
                            model_price = model.get("pricing_input_per_1m_tokens") or 999
                            recommended_price = recommended_model.get("pricing_input_per_1m_tokens") or 999
                            if (model["provider"] != current_provider or model_price < recommended_price):
                                fallback_candidates.append(model)
                    
                    # Sort by provider difference then by cost
                    fallback_candidates.sort(key=lambda x: (
                        0 if x["provider"] != current_provider else 1,  # Different provider first
                        x.get("pricing_input_per_1m_tokens") or 999  # Then by cost
                    ))
                    
                    # Take up to max_attempts - 1 fallback models
                    max_fallbacks = min(max_attempts - 1, len(fallback_candidates))
                    for i, model in enumerate(fallback_candidates[:max_fallbacks]):
                        fallback_models_list.append({
                            "model_id": model["model_id"],
                            "provider": model["provider"],
                            "priority": i + 1,
                            "available": True
                        })
                
                fallback_info = {
                    "enabled": True,
                    "max_attempts": max_attempts,
                    "auto_select_alternatives": auto_select,
                    "timeout_seconds": timeout_sec,
                    "available_fallback_models": fallback_models_list,
                    "total_fallback_models": len(fallback_models_list)
                }
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return PlaygroundResponse(
            success=True,
            request_id=request_id,
            recommended_model=recommended_model["model_id"],
            recommended_provider=recommended_model["provider"],
            complexity_analysis=complexity_result,
            model_selection_reasoning=selection_reasoning,
            available_models=available_models,
            user_preferences={
                "allowed_models": allowed_models,
                "allowed_providers": allowed_providers,
                "benchmark_model": benchmark_model,
                "fallback_config": fallback_config,
                "fallback_info": fallback_info,
                "load_balancing_policy": load_balancing_policy,
                "routing_method": routing_method,
                "total_available_models": len(available_models)
            },
            processing_time_ms=processing_time_ms,
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        processing_time_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Error in playground recommendation: {str(e)}")
        
        return PlaygroundResponse(
            success=False,
            request_id=request_id,
            recommended_model="",
            recommended_provider="",
            complexity_analysis={},
            model_selection_reasoning="",
            available_models=[],
            user_preferences={},
            processing_time_ms=processing_time_ms,
            timestamp=datetime.utcnow().isoformat(),
            error=str(e)
        )


@router.get("/v1/playground/analyzers")
async def get_available_analyzers():
    """
    Get list of available complexity analyzers.
    
    Returns information about all available complexity analyzers
    that can be used in the playground.
    """
    try:
        analyzers = [
            {
                "id": "bert",
                "name": "BERT Analyzer",
                "description": "Fast BERT-based complexity analysis",
                "speed": "Very Fast (~1-10ms)",
                "accuracy": "High",
                "cost": "Free (local)",
                "recommended_for": "Production environments requiring fast routing"
            },
            {
                "id": "matrix_factorization", 
                "name": "Matrix Factorization Analyzer",
                "description": "Neural collaborative filtering with embeddings",
                "speed": "Fast (~10-50ms)",
                "accuracy": "Very High",
                "cost": "Low (OpenAI embeddings)",
                "recommended_for": "High-accuracy routing with moderate speed requirements"
            },
            {
                "id": "ensemble",
                "name": "Ensemble Analyzer",
                "description": "Combines multiple analyzers for best results",
                "speed": "Medium",
                "accuracy": "Very High",
                "cost": "Medium",
                "recommended_for": "Maximum accuracy when speed is less critical"
            },
            {
                "id": "gemini",
                "name": "Gemini Analyzer",
                "description": "Google Gemini API-based analysis",
                "speed": "Slow (~100-500ms)",
                "accuracy": "Very High",
                "cost": "Medium-High (Gemini API)",
                "recommended_for": "When maximum reasoning quality is required"
            }
        ]
        
        return {
            "success": True,
            "analyzers": analyzers,
            "total_analyzers": len(analyzers),
            "default_analyzer": "bert"
        }
        
    except Exception as e:
        logger.error(f"Error getting analyzers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v1/playground/complexity-examples")
async def get_complexity_examples():
    """
    Get example prompts with different complexity levels.
    
    Returns a set of example prompts that demonstrate different
    complexity levels for testing the analyzers.
    """
    try:
        examples = [
            {
                "category": "Simple",
                "complexity_range": "0.1 - 0.3",
                "examples": [
                    {
                        "prompt": "What is 2 + 2?",
                        "description": "Basic arithmetic"
                    },
                    {
                        "prompt": "Hello, how are you?",
                        "description": "Simple greeting"
                    },
                    {
                        "prompt": "What color is the sky?",
                        "description": "Basic factual question"
                    }
                ]
            },
            {
                "category": "Medium",
                "complexity_range": "0.3 - 0.7",
                "examples": [
                    {
                        "prompt": "Explain the difference between REST and GraphQL APIs",
                        "description": "Technical explanation"
                    },
                    {
                        "prompt": "Write a Python function to calculate fibonacci numbers",
                        "description": "Programming task"
                    },
                    {
                        "prompt": "What are the pros and cons of remote work?",
                        "description": "Analysis and comparison"
                    }
                ]
            },
            {
                "category": "Complex",
                "complexity_range": "0.7 - 1.0",
                "examples": [
                    {
                        "prompt": "Design a distributed system architecture for a global e-commerce platform that can handle 1 million concurrent users",
                        "description": "System design and architecture"
                    },
                    {
                        "prompt": "Analyze the economic implications of cryptocurrency adoption on traditional banking systems",
                        "description": "Deep analysis and reasoning"
                    },
                    {
                        "prompt": "Create a comprehensive machine learning model to predict stock prices using multiple data sources and explain the methodology",
                        "description": "Complex technical implementation"
                    }
                ]
            }
        ]
        
        return {
            "success": True,
            "examples": examples,
            "total_categories": len(examples)
        }
        
    except Exception as e:
        logger.error(f"Error getting complexity examples: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/playground", response_class=HTMLResponse)
async def playground_ui(request: Request):
    """
    Serve the playground UI.
    
    This endpoint serves the HTML interface for testing model recommendations
    and complexity analysis without making actual provider calls.
    """
    return templates.TemplateResponse("playground.html", {"request": request})


@router.get("/playground/enhanced", response_class=HTMLResponse)
async def playground_enhanced_ui(request: Request):
    """
    Serve the enhanced playground UI with user profile configuration.
    
    This endpoint serves the enhanced HTML interface that includes
    user profile configuration options for comprehensive testing.
    """
    return templates.TemplateResponse("playground_enhanced.html", {"request": request})


@router.get("/playground/production", response_class=HTMLResponse)
async def playground_production_ui(request: Request):
    """
    Serve the production-ready playground UI.
    
    This endpoint serves the production-ready HTML interface that dynamically
    loads all available models and providers for realistic user profile testing.
    """
    return templates.TemplateResponse("playground_production.html", {"request": request})


@router.get("/playground/presets", response_class=HTMLResponse)
async def playground_presets_ui(request: Request):
    """
    Serve the playground UI with preset configuration support.
    
    This endpoint serves the enhanced HTML interface that allows users to:
    - Load and select preset configurations from their API keys
    - View raw preset data from the database
    - Test model recommendations with preset-specific settings
    - Analyze complexity with different analyzers
    """
    return templates.TemplateResponse("playground_with_presets.html", {"request": request})


def load_cached_models():
    """Load models from local cache file."""
    import json
    import os
    from datetime import datetime, timedelta
    
    cache_file = "cached_models.json"
    
    try:
        if not os.path.exists(cache_file):
            return None
            
        with open(cache_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Check if cache is still valid (24 hours)
        cached_time = datetime.fromisoformat(data.get('cached_at', '1970-01-01'))
        expiry_time = cached_time + timedelta(hours=24)
        
        if datetime.now() > expiry_time:
            logger.warning(f"Model cache expired (cached at {cached_time})")
            return None
            
        logger.info(f"Using cached models from {cached_time} ({len(data['models'])} models)")
        return data
        
    except Exception as e:
        logger.error(f"Error loading model cache: {e}")
        return None


def get_curated_models_for_playground(all_models: List[Dict]) -> List[Dict]:
    """
    Get a curated subset of models optimized for playground UI.
    Returns the most useful/popular models from each provider.
    """
    # Known pricing data (APIs don't provide this, so we add static data)
    model_pricing = {
        # OpenAI pricing (as of 2025)
        "gpt-4o": {"input": 5.0, "output": 15.0},
        "gpt-4o-mini": {"input": 0.15, "output": 0.6},
        "gpt-4-turbo": {"input": 10.0, "output": 30.0},
        "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
        "gpt-4": {"input": 30.0, "output": 60.0},
        "o3-mini": {"input": 2.0, "output": 8.0},
        "gpt-4.1": {"input": 4.0, "output": 12.0},
        "gpt-4.1-mini": {"input": 1.0, "output": 4.0},
        "gpt-4.1-nano": {"input": 0.5, "output": 2.0},
        
        # Anthropic pricing
        "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
        "claude-3-5-haiku-20241022": {"input": 1.0, "output": 5.0},
        "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
        "claude-3-opus-20240229": {"input": 15.0, "output": 75.0},
        "claude-3-sonnet-20240229": {"input": 3.0, "output": 15.0},
        
        # Google pricing
        "gemini-1.5-pro": {"input": 1.25, "output": 5.0},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.3},
        "gemini-1.5-flash-8b": {"input": 0.0375, "output": 0.15},
        "gemini-pro": {"input": 0.5, "output": 1.5},
        "gemini-2.5-pro": {"input": 1.0, "output": 4.0},
        "gemini-2.5-flash": {"input": 0.05, "output": 0.2},
        "gemini-2.0-flash": {"input": 0.075, "output": 0.3},
        "gemini-2.0-pro-exp": {"input": 1.0, "output": 4.0},
    }
    
    curated = []
    
    # Define the most useful models per provider for playground use (prioritizing latest models)
    priority_models = {
        "openai": [
            # Latest o3 and GPT-4.1 models first
            "o3-mini", "o3-mini-2025-01-31", 
            "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
            # Then current popular models
            "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-4"
        ],
        "anthropic": [
            "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", 
            "claude-3-haiku-20240307", "claude-3-opus-20240229", "claude-3-sonnet-20240229"
        ],
        "google": [
            # Latest Gemini 2.5 and 2.0 models first
            "gemini-2.5-pro", "gemini-2.5-flash", 
            "gemini-2.0-flash", "gemini-2.0-pro-exp", "gemini-2.0-flash-thinking-exp",
            # Then current models
            "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-pro"
        ],
        "bedrock": [
            "anthropic.claude-3-5-sonnet-20241022-v2:0", "anthropic.claude-3-haiku-20240307-v1:0",
            "amazon.titan-text-premier-v1:0", "meta.llama3-2-90b-instruct-v1:0"
        ]
    }
    
    # Add priority models first
    for provider, model_ids in priority_models.items():
        provider_models = [m for m in all_models if m["provider"] == provider]
        for model_id in model_ids:
            model = next((m for m in provider_models if m["model_id"] == model_id), None)
            if model:
                # Filter out phantom models
                if "opus-4" in model_id or "3.7" in model_id:
                    continue
                    
                # Create enhanced model with pricing data
                enhanced_model = model.copy()
                if model_id in model_pricing:
                    pricing = model_pricing[model_id]
                    enhanced_model["pricing_input_per_1m_tokens"] = pricing["input"]
                    enhanced_model["pricing_output_per_1m_tokens"] = pricing["output"]
                
                curated.append(enhanced_model)
    
    # Add a few more popular models from each provider (up to 10 per provider)
    for provider in ["openai", "anthropic", "google", "bedrock"]:
        provider_models = [m for m in all_models if m["provider"] == provider]
        already_added = [m["model_id"] for m in curated if m["provider"] == provider]
        
        # Sort by pricing (cheaper first) and add up to 10 total per provider
        remaining_models = [m for m in provider_models if m["model_id"] not in already_added]
        
        # Filter out phantom models and add pricing data
        enhanced_remaining = []
        for model in remaining_models:
            # Skip phantom models
            if "opus-4" in model["model_id"] or "3.7" in model["model_id"]:
                continue
                
            enhanced_model = model.copy()
            if model["model_id"] in model_pricing:
                pricing = model_pricing[model["model_id"]]
                enhanced_model["pricing_input_per_1m_tokens"] = pricing["input"]
                enhanced_model["pricing_output_per_1m_tokens"] = pricing["output"]
            
            enhanced_remaining.append(enhanced_model)
        
        enhanced_remaining.sort(key=lambda x: x.get("pricing_input_per_1m_tokens") or 999)
        
        needed = max(0, 10 - len(already_added))
        curated.extend(enhanced_remaining[:needed])
    
    return curated


@router.get("/v1/playground/models-and-providers")
async def get_models_and_providers(all_models: bool = False):
    """
    Get available models and providers for playground configuration.
    
    Args:
        all_models: If True, return all cached models. If False, return curated subset.
    
    Returns comprehensive lists of models and providers that can be used
    in user profile configuration, fallback settings, and load balancing.
    Uses local cache for performance, falls back to live API calls if needed.
    """
    try:
        # First try to load from cache
        cached_data = load_cached_models()
        available_models_response = []
        
        if cached_data:
            if all_models:
                available_models_response = cached_data["models"]
                logger.info(f"Using all {len(available_models_response)} cached models from {cached_data['metadata']['collection_method']}")
            else:
                available_models_response = get_curated_models_for_playground(cached_data["models"])
                logger.info(f"Using {len(available_models_response)} curated models from {len(cached_data['models'])} total cached models")
        else:
            logger.info("No valid cache found, attempting live collection")
            
            # Import collectors
            from app.collectors import (
                OpenAIModelCollector,
                AnthropicModelCollector, 
                GoogleModelCollector,
                BedrockModelCollector
            )
            
            collectors = {
                "openai": OpenAIModelCollector(timeout=30),
                "anthropic": AnthropicModelCollector(timeout=30),
                "google": GoogleModelCollector(timeout=30),
                "bedrock": BedrockModelCollector(timeout=30)
            }
            
            # Collect models from each provider
            for provider_name, collector in collectors.items():
                try:
                    if collector._check_api_credentials():
                        logger.info(f"Collecting models from {provider_name}")
                        provider_models = await collector.collect_models()
                        
                        # Convert to our expected format
                        for model in provider_models:
                            available_models_response.append({
                                "model_id": model.get("model_id", model.get("id", "")),
                                "provider": provider_name,
                                "display_name": model.get("display_name", model.get("model_id", model.get("id", ""))),
                                "description": model.get("description", ""),
                                "context_length": model.get("context_length", model.get("max_tokens")),
                                "pricing_input_per_1m_tokens": model.get("pricing_input_per_1m_tokens", model.get("input_cost_per_1m_tokens")),
                                "pricing_output_per_1m_tokens": model.get("pricing_output_per_1m_tokens", model.get("output_cost_per_1m_tokens")),
                                "supports_function_calling": model.get("supports_function_calling", model.get("supports_tools", False)),
                                "lifecycle_status": model.get("lifecycle_status", "active"),
                                "input_modalities": model.get("input_modalities", ["text"]),
                                "output_modalities": model.get("output_modalities", ["text"]),
                                "supports_streaming": model.get("supports_streaming", True),
                                "max_output_tokens": model.get("max_output_tokens"),
                                "model_metadata": model.get("model_metadata", {})
                            })
                    else:
                        logger.warning(f"No valid credentials for {provider_name}")
                except Exception as provider_error:
                    logger.error(f"Error collecting from {provider_name}: {provider_error}")
                    continue
                    
            logger.info(f"Collected {len(available_models_response)} models from live APIs")
            
        if not available_models_response:
            # Last resort: comprehensive fallback data with models from all major providers
            logger.warning("No models collected from any source, using comprehensive fallback")
            available_models_response = [
                # OpenAI Models
                {
                    "model_id": "gpt-4o",
                    "provider": "openai",
                    "display_name": "GPT-4o",
                    "description": "Most advanced GPT-4 model with multimodal capabilities",
                    "context_length": 128000,
                    "pricing_input_per_1m_tokens": 5.0,
                    "pricing_output_per_1m_tokens": 15.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gpt-4o-mini",
                    "provider": "openai",
                    "display_name": "GPT-4o Mini",
                    "description": "Lightweight version of GPT-4o for faster responses",
                    "context_length": 128000,
                    "pricing_input_per_1m_tokens": 0.15,
                    "pricing_output_per_1m_tokens": 0.6,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gpt-4-turbo",
                    "provider": "openai",
                    "display_name": "GPT-4 Turbo",
                    "description": "Advanced GPT-4 model optimized for performance",
                    "context_length": 128000,
                    "pricing_input_per_1m_tokens": 10.0,
                    "pricing_output_per_1m_tokens": 30.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gpt-3.5-turbo",
                    "provider": "openai",
                    "display_name": "GPT-3.5 Turbo",
                    "description": "Fast and cost-effective model for most tasks",
                    "context_length": 16385,
                    "pricing_input_per_1m_tokens": 0.5,
                    "pricing_output_per_1m_tokens": 1.5,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                
                # Anthropic Models
                {
                    "model_id": "claude-3-5-sonnet-20241022",
                    "provider": "anthropic",
                    "display_name": "Claude 3.5 Sonnet",
                    "description": "Latest Claude model with improved capabilities",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 3.0,
                    "pricing_output_per_1m_tokens": 15.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "claude-3-5-haiku-20241022",
                    "provider": "anthropic",
                    "display_name": "Claude 3.5 Haiku",
                    "description": "Fast and efficient Claude model with updated capabilities",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 1.0,
                    "pricing_output_per_1m_tokens": 5.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "claude-3-haiku-20240307",
                    "provider": "anthropic",
                    "display_name": "Claude 3 Haiku",
                    "description": "Fast and lightweight Claude model",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 0.25,
                    "pricing_output_per_1m_tokens": 1.25,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "claude-3-opus-20240229",
                    "provider": "anthropic",
                    "display_name": "Claude 3 Opus",
                    "description": "Most powerful Claude model for complex tasks",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 15.0,
                    "pricing_output_per_1m_tokens": 75.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                
                # Google Models
                {
                    "model_id": "gemini-1.5-pro",
                    "provider": "google",
                    "display_name": "Gemini 1.5 Pro",
                    "description": "Google's flagship multimodal model",
                    "context_length": 1000000,
                    "pricing_input_per_1m_tokens": 1.25,
                    "pricing_output_per_1m_tokens": 5.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gemini-1.5-flash",
                    "provider": "google",
                    "display_name": "Gemini 1.5 Flash",
                    "description": "Fast and efficient Gemini model",
                    "context_length": 1000000,
                    "pricing_input_per_1m_tokens": 0.075,
                    "pricing_output_per_1m_tokens": 0.3,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gemini-1.5-flash-8b",
                    "provider": "google",
                    "display_name": "Gemini 1.5 Flash-8B",
                    "description": "Ultra-fast and cost-effective Gemini model",
                    "context_length": 1000000,
                    "pricing_input_per_1m_tokens": 0.0375,
                    "pricing_output_per_1m_tokens": 0.15,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "gemini-pro",
                    "provider": "google",
                    "display_name": "Gemini Pro",
                    "description": "Balanced Gemini model for general tasks",
                    "context_length": 30720,
                    "pricing_input_per_1m_tokens": 0.5,
                    "pricing_output_per_1m_tokens": 1.5,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                
                # AWS Bedrock Models
                {
                    "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
                    "provider": "bedrock",
                    "display_name": "Claude 3.5 Sonnet (Bedrock)",
                    "description": "Claude 3.5 Sonnet available through AWS Bedrock",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 3.0,
                    "pricing_output_per_1m_tokens": 15.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "anthropic.claude-3-haiku-20240307-v1:0",
                    "provider": "bedrock",
                    "display_name": "Claude 3 Haiku (Bedrock)",
                    "description": "Claude 3 Haiku available through AWS Bedrock",
                    "context_length": 200000,
                    "pricing_input_per_1m_tokens": 0.25,
                    "pricing_output_per_1m_tokens": 1.25,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "amazon.titan-text-premier-v1:0",
                    "provider": "bedrock",
                    "display_name": "Amazon Titan Text Premier",
                    "description": "Amazon's flagship text generation model",
                    "context_length": 32000,
                    "pricing_input_per_1m_tokens": 0.5,
                    "pricing_output_per_1m_tokens": 1.5,
                    "supports_function_calling": False,
                    "lifecycle_status": "active"
                },
                {
                    "model_id": "meta.llama3-2-90b-instruct-v1:0",
                    "provider": "bedrock",
                    "display_name": "Llama 3.2 90B Instruct (Bedrock)",
                    "description": "Meta's Llama 3.2 90B model via AWS Bedrock",
                    "context_length": 131072,
                    "pricing_input_per_1m_tokens": 2.0,
                    "pricing_output_per_1m_tokens": 2.0,
                    "supports_function_calling": True,
                    "lifecycle_status": "active"
                }
            ]
        
        # Process models data
        models = []
        providers = set()
        
        for model in available_models_response:
            providers.add(model["provider"])
            models.append({
                "model_id": model["model_id"],
                "provider": model["provider"],
                "display_name": model.get("display_name", model["model_id"]),
                "description": model.get("description", ""),
                "context_length": model.get("context_length"),
                "pricing_input_per_1m_tokens": model.get("pricing_input_per_1m_tokens"),
                "pricing_output_per_1m_tokens": model.get("pricing_output_per_1m_tokens"),
                "supports_function_calling": model.get("supports_function_calling", False),
                "lifecycle_status": model.get("lifecycle_status", "active")
            })
        
        # Sort models by provider then by pricing
        models.sort(key=lambda x: (x["provider"], x.get("pricing_input_per_1m_tokens") or 0))
        
        return {
            "success": True,
            "providers": sorted(list(providers)),
            "models": models,
            "models_by_provider": {
                provider: [m for m in models if m["provider"] == provider]
                for provider in sorted(providers)
            },
            "total_models": len(models),
            "total_providers": len(providers)
        }
        
    except Exception as e:
        logger.error(f"Error getting models and providers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))