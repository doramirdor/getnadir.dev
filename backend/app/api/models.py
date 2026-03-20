"""
API routes for model information.
"""
from typing import Dict, Any, Optional, List
import json
import os

from fastapi import APIRouter, Depends, HTTPException

from app.auth.supabase_auth import get_current_user, UserSession
from app.schemas.models import ModelInfo, ModelsResponse, AvailableModel, AvailableModelsResponse


router = APIRouter()
models_data = []


@router.on_event("startup")
async def load_models_data():
    """Load model performance data from JSON file."""
    global models_data
    try:
        with open("app/reference_data/model_performance_clean.json", "r") as f:
            data = json.load(f)
            models_data = data.get("models", [])
    except FileNotFoundError:
        # Try with a different path for production
        try:
            with open(os.path.join(os.path.dirname(__file__), "../reference_data/model_performance_clean.json"), "r") as f:
                data = json.load(f)
                models_data = data.get("models", [])
        except FileNotFoundError:
            print("Warning: Model performance data file not found.")
            models_data = []


@router.get("/v1/models/detailed")
async def list_models_detailed(
    current_user: UserSession = Depends(get_current_user),
    include_litellm_info: bool = True
) -> Dict[str, Any]:
    """List available models with pricing and LiteLLM enhancements (detailed view)."""
    from app.services.litellm_service import LiteLLMService
    from app.pricing.pricing_manager import get_prices_by_provider
    
    if include_litellm_info:
        # Use LiteLLM service for enhanced model information
        litellm_service = LiteLLMService()
        
        # Get available models from LiteLLM model list
        from litellm import get_valid_models
        try:
            available_models = get_valid_models()
        except Exception:
            available_models = [
                "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo",
                "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", 
                "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"
            ]
        
        # Get detailed information for each model
        models = []
        for model_name in available_models:
            try:
                model_info = await litellm_service.get_model_info(model_name)
                
                # Add validation status
                is_valid = await litellm_service.validate_model(model_name)
                
                model_dict = {
                    "id": model_name,
                    "name": model_name,
                    "provider": model_info.get("provider", "unknown"),
                    "max_tokens": model_info.get("max_tokens", 0),
                    "input_cost_per_token": model_info.get("input_cost_per_token", 0),
                    "output_cost_per_token": model_info.get("output_cost_per_token", 0),
                    "supports_streaming": model_info.get("supports_streaming", True),
                    "supports_function_calling": model_info.get("supports_function_calling", False),
                    "is_available": is_valid,
                    "litellm_enhanced": True
                }
                
                models.append(model_dict)
                
            except Exception as e:
                # If model info fails, add basic info
                models.append({
                    "id": model_name,
                    "name": model_name,
                    "provider": "unknown",
                    "is_available": False,
                    "error": str(e),
                    "litellm_enhanced": True
                })
        
        # Get budget info from user session
        budget_info = current_user.budget_info
        
        return {
            "models": models,
            "total_models": len(models),
            "budget_info": budget_info,
            "session_usage": {},  # Placeholder for session usage
            "litellm_enhanced": True
        }
    
    else:
        # Fallback to traditional method
        import litellm
        
        # Get litellm model list
        model_list = litellm.utils.get_litellm_model_list()
        model_list_dict = [model.dict() for model in model_list]
        
        # Get models by provider
        models_by_provider = {}
        for model_info in model_list_dict:
            provider_name = model_info["litellm_provider"]
            model_name = model_info["model_name"]
            
            if provider_name not in models_by_provider:
                models_by_provider[provider_name] = []
            
            models_by_provider[provider_name].append(model_name)
        
        # Get pricing
        pricing = {}
        
        for provider, model_names in models_by_provider.items():
            provider_pricing = get_prices_by_provider(provider, model_names)
            pricing[provider] = provider_pricing
        
        # Format models with pricing
        models = []
        
        for model_info in model_list_dict:
            provider = model_info["litellm_provider"]
            model_name = model_info["model_name"]
            
            model_dict = {
                "id": model_info["id"],
                "provider": provider,
                "model": model_name,
                "litellm_enhanced": False
            }
            
            if provider in pricing and model_name in pricing[provider]:
                model_dict.update(pricing[provider][model_name])
            
            models.append(model_dict)
        
        return {
            "models": models,
            "litellm_enhanced": False
        }


@router.get("/api/v1/models", response_model=ModelsResponse)
async def list_performance_models(provider: Optional[str] = None) -> ModelsResponse:
    """List models from performance data."""
    allowed_providers = ["Anthropic", "Google", "OpenAI"]
    
    # Filter models based on provider
    filtered_models = []
    for model in models_data:
        if model.get("api_provider") in allowed_providers:
            try:
                # Get quality metrics for determining tier
                if model.get("performance"):
                    mmlu = model.get("performance", {}).get("mmlu", 0)
                    gpqa = model.get("performance", {}).get("gpqa", 0)
                    
                    # Determine tier based on quality metrics
                    quality_index = model.get("performance", {}).get("quality_index")
                    tier = 3  # Default tier
                    if quality_index:
                        try:
                            quality_score = float(quality_index)
                            if quality_score >= 60:
                                tier = 1
                            elif quality_score >= 50:
                                tier = 2
                            else:
                                tier = 3
                        except (ValueError, TypeError):
                            tier = 3
                
                    # Get pricing information with defaults
                    pricing = model.get("pricing", {})
                    input_price = pricing.get("input_price_usd1m_tokens", 0)
                    output_price = pricing.get("output_price_usd1m_tokens", 0)
                    blended_price = input_price + output_price
                    
                    # Speed metrics
                    speed = model.get("speed", {})
                    first_token_latency = speed.get("medianfirst_chunk_s", "")
                    
                    # Calculate a strong win rate based on quality metrics (simulated)
                    strong_win_rate = min(0.95, max(0.1, (mmlu + gpqa) / 3))
                    
                    # Create a model info object using our Pydantic model
                    model_info = ModelInfo(
                        id=model.get("api_id", ""),
                        name=model.get("model", ""),
                        model_name=model.get("model", ""),
                        created=None,  # Not available in the data
                        description=f"Provider: {model.get('api_provider', '')}",
                        architecture={
                            "input_modalities": ["text"],
                            "output_modalities": ["text"],
                            "tokenizer": "Unknown"
                        },
                        top_provider={
                            "is_moderated": True
                        },
                        pricing={
                            "prompt": str(input_price / 1000000) if input_price > 0 else "0",
                            "completion": str(output_price / 1000000) if output_price > 0 else "0",
                            "image": "0",
                            "request": "0",
                            "input_cache_read": "0"
                        },
                        context_window=model.get("context_window", ""),
                        qualityIndex=quality_index,
                        quality_index=quality_index,
                        provider=model.get("api_provider", ""),
                        function_calling=model.get("function_calling", ""),
                        json_mode=model.get("json_mode", ""),
                        
                        # Additional fields for recommendation templates
                        tier=tier,
                        confidence=round(strong_win_rate - 0.1, 2),  # Slightly lower than win rate
                        strong_win_rate=round(strong_win_rate, 2),
                        cost_per_million_tokens=blended_price if blended_price is not None else (
                            (input_price + output_price) if input_price > 0 or output_price > 0 else -1
                        ),
                        reasoning=f"Based on quality index of {quality_index} and context window of {model.get('context_window', 'unknown')}",
                        
                        # Performance metrics
                        performance_metrics={
                            "MMLU": model.get("performance", {}).get("mmlu", ""),
                            "GPQA": model.get("performance", {}).get("gpqa", ""),
                            "LiveCodeBench": model.get("performance", {}).get("livecodebench_coding", ""),
                            "SciCode": model.get("performance", {}).get("scicode_coding", ""),
                            "HumanEval": model.get("performance", {}).get("humaneval", ""),
                            "MATH_500": model.get("performance", {}).get("math_500", ""),
                            "tokens_per_second": model.get("other", {}).get("median_tokenss", ""),
                            "first_token_latency": speed.get("medianfirst_chunk_s", "")
                        }
                    )
                    filtered_models.append(model_info)
            except Exception as e:
                print(f"Error processing model {model.get('model', 'unknown')}: {str(e)}")
                continue  # Skip this model and continue with the next one
    
    # If a provider was specified, filter further
    if provider:
        filtered_models = [m for m in filtered_models if m.provider.lower() == provider.lower()]
    
    return ModelsResponse(data=filtered_models)


@router.get("/v1/models/available", response_model=AvailableModelsResponse)
async def list_available_models() -> AvailableModelsResponse:
    """List available models for API gateway."""
    import litellm
    models = []
    
    for model in litellm.utils.get_litellm_model_list():
        models.append(AvailableModel(
            id=model.id,
            model=model.model_name,
            provider=model.litellm_provider,
            created_at=None
        ))
    
    return AvailableModelsResponse(models=models)


@router.get("/v1/models/{model}/validate")
async def validate_model(
    model: str,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Validate if a model is available and accessible."""
    from app.services.litellm_service import LiteLLMService
    
    try:
        litellm_service = LiteLLMService()
        is_valid = await litellm_service.validate_model(model)
        
        return {
            "success": True,
            "model": model,
            "is_valid": is_valid,
            "message": "Model is valid and accessible" if is_valid else "Model is not available or accessible"
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Model validation failed: {str(e)}"
        )


@router.get("/v1/models/{model}/info")
async def get_model_info(
    model: str,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get detailed information about a specific model."""
    from app.services.litellm_service import LiteLLMService
    
    try:
        litellm_service = LiteLLMService()
        model_info = await litellm_service.get_model_info(model)
        
        if "error" in model_info:
            raise HTTPException(
                status_code=404,
                detail=f"Model information not available: {model_info['error']}"
            )
        
        return {
            "success": True,
            "model_info": model_info
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get model info: {str(e)}"
        ) 