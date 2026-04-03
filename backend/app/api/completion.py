"""
API routes for chat completions.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import json
import uuid
import time

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, Request, HTTPException, Header
from pydantic import BaseModel, Field

from app.auth.supabase_auth import get_current_user, UserSession, check_user_budget, check_rate_limit
from app.middleware.subscription_guard import require_active_subscription
from app.schemas.completion import (
    CompletionRequest, CompletionResponse, PlaygroundRequest,
    RecommendationRequest, RecommendationResponse,
    Choice, Message, Usage, ModelAnalysis, AlternativeModel, 
    CostAnalysis, NadirExtensions
)
from app.services.supabase_unified_llm_service import SupabaseUnifiedLLMService
from app.services.preset_router_service import PresetRouterService
# test_ui was removed; stub add_log as a no-op logger
import logging as _logging
_completion_logger = _logging.getLogger("app.api.completion")
def add_log(level: str, message: str, data: dict = None):
    _completion_logger.info("[%s] %s", level, message)


router = APIRouter(prefix="/v1", tags=["completion"])


# Pydantic models for enhanced features
class CostEstimationRequest(BaseModel):
    """Request model for cost estimation."""
    model: str = Field(..., description="Model to use")
    prompt: str = Field(..., description="Input prompt")
    max_tokens: Optional[int] = Field(None, ge=1, le=8192, description="Maximum tokens to generate")


class BudgetRequest(BaseModel):
    """Request model for budget creation."""
    total_budget: float = Field(..., gt=0, description="Total budget in USD")
    duration: str = Field("monthly", description="Budget duration")


class EnhancedCompletionRequest(BaseModel):
    """Enhanced completion request with additional parameters."""
    prompt: str = Field(..., description="User prompt")
    system_message: Optional[str] = Field(None, description="System message")
    model: Optional[str] = Field(None, description="Specific model to use (overrides selection)")
    providers: Optional[List[str]] = Field(None, description="Allowed providers override")
    models: Optional[List[str]] = Field(None, description="Allowed models override")
    temperature: float = Field(0.7, ge=0, le=2, description="Sampling temperature")
    max_tokens: Optional[int] = Field(None, ge=1, le=8192, description="Maximum tokens to generate")
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="Tool definitions for function calling")


@router.post("/chat/completions", response_model=CompletionResponse, dependencies=[Depends(check_rate_limit)])
async def chat_completion(
    request: CompletionRequest,
    current_user: UserSession = Depends(require_active_subscription),
    http_request: Request = None,
    x_nadir_mode: Optional[str] = Header(None, alias="X-Nadir-Mode"),
    x_nadir_max_models: Optional[int] = Header(3, alias="X-Nadir-Max-Models"),
    x_nadir_include_analysis: Optional[bool] = Header(True, alias="X-Nadir-Include-Analysis"),
    x_nadir_benchmark: Optional[str] = Header(None, alias="X-Nadir-Benchmark"),
    x_tag: Optional[str] = Header(None, alias="X-Tag")
) -> CompletionResponse:
    """Generate chat completion with OpenAI compatibility and optional Nadir recommendations."""
    # Determine mode - check headers first, then request body
    nadir_mode = x_nadir_mode or request.nadir_mode or "standard"
    if request.model == "auto" or nadir_mode == "recommendation":
        nadir_mode = "recommendation"
    
    # Extract prompt from messages or legacy prompt field
    if request.messages:
        # OpenAI format - convert messages to prompt
        user_messages = [msg.content for msg in request.messages if msg.role == "user"]
        system_messages = [msg.content for msg in request.messages if msg.role == "system"]
        prompt = "\n".join(user_messages)
        system_message = "\n".join(system_messages) if system_messages else request.system_message
    else:
        # Legacy format
        prompt = request.prompt or ""
        system_message = request.system_message
    
    # Log the incoming request with X-Tag for funnel tracking
    log_data = {
        "user_id": str(current_user.id),
        "prompt_length": len(prompt),
        "model_requested": request.model,
        "nadir_mode": nadir_mode,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens
    }
    
    # Add funnel/tag tracking if provided
    if x_tag:
        log_data["funnel_tag"] = x_tag
        log_data["tracking_tag"] = x_tag
    
    add_log("info", f"Chat completion request from user {current_user.email}", log_data)
    
    try:
        # Check rate limit
        await check_rate_limit(current_user.id)

        # Handle @preset/ model references via PresetRouterService
        if request.model and request.model.startswith("@preset/"):
            preset_service = PresetRouterService(current_user)
            messages_dicts = [msg.dict() for msg in request.messages] if request.messages else [{"role": "user", "content": prompt}]
            preset_result = await preset_service.completion(
                messages=messages_dicts,
                model=request.model,
                temperature=request.temperature or 0.7,
                max_tokens=request.max_tokens,
                stream=False,
                request_id=f"chatcmpl-{uuid.uuid4().hex[:10]}"
            )
            if "error" in preset_result and not preset_result.get("response"):
                raise HTTPException(status_code=500, detail=preset_result["error"])

            # Normalize to expected response format
            response_content = preset_result.get("response", "")
            if not response_content and "choices" in preset_result:
                response_content = preset_result["choices"][0].get("message", {}).get("content", "")

            request_id = f"chatcmpl-{uuid.uuid4().hex[:10]}"
            return CompletionResponse(
                id=request_id,
                object="chat.completion",
                created=int(time.time()),
                model=preset_result.get("model", request.model),
                choices=[Choice(
                    index=0,
                    message=Message(role="assistant", content=response_content),
                    finish_reason="stop"
                )],
                usage=Usage(
                    prompt_tokens=preset_result.get("usage", {}).get("prompt_tokens", 0),
                    completion_tokens=preset_result.get("usage", {}).get("completion_tokens", 0),
                    total_tokens=preset_result.get("usage", {}).get("total_tokens", 0)
                )
            )

        # Initialize Supabase unified LLM service
        unified_service = SupabaseUnifiedLLMService(current_user)
        
        # Get cost estimate and check user budget BEFORE processing
        estimated_cost = await unified_service.estimate_cost(
            prompt=prompt,
            model=request.model,
            max_tokens=request.max_tokens or 1000,
            system_message=system_message
        )
        
        # Check if user has sufficient funds
        estimated_cost_usd = estimated_cost.get("estimated_cost_usd", 0.0) if isinstance(estimated_cost, dict) else float(estimated_cost)
        can_afford = await check_user_budget(current_user, estimated_cost_usd)
        if not can_afford:
            raise HTTPException(
                status_code=402,  # Payment Required
                detail=f"Insufficient credit balance. Estimated cost: ${estimated_cost_usd:.4f}. Please add credits to your account."
            )
        
        # If in recommendation mode and no specific model, get recommendations first
        alternatives = None
        model_analysis = None
        
        if (nadir_mode == "recommendation" and (not request.model or request.model == "auto")) or request.debug:
            # Get model recommendations using Gemini analyzer with user constraints
            logger.debug(f"Entering recommendation mode with model={request.model}")
            try:
                from app.complexity.gemini_analyzer import GeminiModelRecommender
                
                # Get user's allowed models and providers for the recommender
                user_providers = current_user.allowed_providers or []
                user_models = current_user.allowed_models or []
                
                # Special handling: if allowed_models contains "auto", treat as "allow all models"
                if user_models and "auto" in user_models:
                    user_models = None  # Allow all models
                    logger.debug("Converted allowed_models ['auto'] to None for recommendation")
                
                recommender = GeminiModelRecommender(
                    allowed_providers=user_providers if user_providers else None,
                    allowed_models=user_models if user_models else None
                )
                
                recommendation_result = await recommender.ranker(
                    text=prompt,
                    system_message=system_message,
                    max_models=x_nadir_max_models,
                    benchmark_model=x_nadir_benchmark or current_user.benchmark_model
                )
                
                ranked_models = recommendation_result.get("ranked_models", [])
                if ranked_models:
                    # In debug mode, get recommendations but still use specified model if provided
                    if request.debug and request.model and request.model != "auto":
                        # Use specified model but get recommendations for comparison
                        selected_model = request.model
                        selection_reasoning = f"User specified model: {request.model} (with debug recommendations)"
                    else:
                        # Use top recommended model (should now be properly mapped to LiteLLM format)
                        top_model = ranked_models[0]
                        selected_model = top_model.get("model_name")
                        selection_reasoning = top_model.get("reasoning", "")
                    
                    # Build analysis for response (include in debug mode or recommendation mode)
                    if x_nadir_include_analysis or request.debug:
                        model_analysis = ModelAnalysis(
                            task_complexity=recommendation_result.get("task_complexity", 3),
                            complexity_reasoning=recommendation_result.get("complexity_reasoning", ""),
                            selected_model=selected_model,
                            selection_reasoning=selection_reasoning
                        )
                        
                        # Get alternatives from remaining models (or all models in debug mode)
                        if len(ranked_models) > 1:
                            alternatives = [
                                AlternativeModel(
                                    model=model.get("model_name", ""),
                                    provider=model.get("provider", ""),
                                    confidence=model.get("confidence", 0.5),
                                    reasoning=model.get("reasoning", ""),
                                    cost_estimate=model.get("cost_per_million_tokens", 0.0),
                                    # Additional identifying information
                                    performance_name=model.get("performance_name"),
                                    quality_index=model.get("quality_index"),
                                    cost_per_1m_tokens=model.get("cost_per_1m_tokens"),
                                    api_id=model.get("api_id"),
                                    context_window=model.get("context_window"),
                                    function_calling=model.get("function_calling"),
                                    json_mode=model.get("json_mode")
                                )
                                for model in ranked_models[:x_nadir_max_models]  # Include all models for debug
                            ]
                        else:
                            alternatives = None
                else:
                    # No recommendations returned, use fallback
                    selected_model = request.model
                    selection_reasoning = "No recommendations from Gemini analyzer, using fallback"
                    
            except Exception as e:
                logger.error(f"Error getting Gemini recommendations: {e}")
                selected_model = request.model
                selection_reasoning = f"Error in Gemini analyzer: {str(e)}"
        else:
            selected_model = request.model
        
        # Extract additional analytics data for enhanced logging
        funnel_tag = x_tag
        session_id = http_request.headers.get("x-session-id") if http_request else None
        ip_address = http_request.client.host if http_request and http_request.client else None
        user_agent = http_request.headers.get("user-agent") if http_request else None
        
        # Extract fallback models from extra_body if provided (OpenRouter-style fallback)
        fallback_models = None
        if request.extra_body and "models" in request.extra_body:
            fallback_models = request.extra_body["models"]
            logger.debug(f"Extracted fallback models from extra_body: {fallback_models}")
        
        # Process the prompt through the complete flow
        # If we already selected a model via recommendation mode or debug mode, use it directly
        if (nadir_mode == "recommendation" or request.debug) and selected_model and selected_model != "auto":
            result = await unified_service.process_prompt(
                prompt=prompt,
                system_message=system_message,
                model=selected_model,  # Use the recommended model (now properly mapped to LiteLLM format)
                providers=getattr(request, 'providers', None),
                models=getattr(request, 'models', None),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                stream=False,
                skip_model_selection=True,  # Skip model selection in unified service
                fallback_models=fallback_models,  # Pass fallback models
                # Pass analytics data
                funnel_tag=funnel_tag,
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                nadir_mode=nadir_mode
            )
        else:
            result = await unified_service.process_prompt(
                prompt=prompt,
                system_message=system_message,
                model=selected_model,
                providers=getattr(request, 'providers', None),
                models=getattr(request, 'models', None),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                stream=False,
                fallback_models=fallback_models,  # Pass fallback models
                # Pass analytics data
                funnel_tag=funnel_tag,
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                nadir_mode=nadir_mode
            )
        
        # Log the successful response with funnel tracking
        success_log_data = {
            "user_id": str(current_user.id),
            "model_used": result["model_used"],
            "provider": result["provider"],
            "latency_ms": result["latency_ms"],
            "cost_usd": result["cost"]["total_cost_usd"],
            "prompt_tokens": result.get("usage", {}).get("prompt_tokens", 0),
            "completion_tokens": result.get("usage", {}).get("completion_tokens", 0),
            "selection_reasoning": result.get("model_selection_reasoning", ""),
            "nadir_mode": nadir_mode
        }
        
        # Add funnel/tag tracking if provided
        if x_tag:
            success_log_data["funnel_tag"] = x_tag
            success_log_data["tracking_tag"] = x_tag
        
        add_log("success", f"Chat completion successful for user {current_user.email}", success_log_data)
        
        # Build OpenAI-compatible response
        request_id = f"chatcmpl-{uuid.uuid4().hex[:10]}"
        created_timestamp = int(time.time())
        
        usage_info = result.get("usage", {})
        prompt_tokens = usage_info.get("prompt_tokens", 0)
        completion_tokens = usage_info.get("completion_tokens", 0)
        
        # Build response message
        response_message = Message(
            role="assistant",
            content=result["response"]
        )
        
        choice = Choice(
            index=0,
            message=response_message,
            finish_reason="stop"
        )
        
        usage = Usage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens
        )
        
        # Build Nadir extensions if in recommendation mode or debug mode
        nadir_extensions = None
        if (nadir_mode == "recommendation" and x_nadir_include_analysis) or request.debug:
            cost_analysis = None
            if alternatives:
                alt_costs = [alt.cost_estimate for alt in alternatives if alt.cost_estimate]
                if alt_costs:
                    cost_analysis = CostAnalysis(
                        selected_model_cost=result["cost"]["total_cost_usd"],
                        alternatives_cost_range=[min(alt_costs), max(alt_costs)]
                    )
            
            nadir_extensions = NadirExtensions(
                mode=nadir_mode,
                model_analysis=model_analysis,
                alternatives=alternatives,
                cost_analysis=cost_analysis,
                funnel_tag=x_tag
            )
        
        return CompletionResponse(
            # OpenAI-compatible fields
            id=request_id,
            object="chat.completion",
            created=created_timestamp,
            model=result["model_used"],
            usage=usage,
            choices=[choice],
            
            # Nadir extensions
            nadir=nadir_extensions,
            
            # Legacy fields for backward compatibility
            response=result["response"],
            model_used=result["model_used"],
            provider=result["provider"],
            latency_ms=result["latency_ms"],
            cost_usd=result["cost"]["total_cost_usd"],
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            request_id=request_id,
            estimated_cost_usd=result.get("estimated_cost_usd", 0.0),
            cost_accuracy=result.get("cost_accuracy", "estimated"),
            selection_reasoning=result.get("model_selection_reasoning", {}) if request.debug else result.get("selection_reasoning", {}),
            user_profile=result.get("user_profile", {}) if request.debug else {},
            session_usage=result.get("session_usage", {}) if request.debug else {}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        # Log the error with funnel tracking
        error_log_data = {
            "user_id": str(current_user.id),
            "error_type": type(e).__name__,
            "error_message": str(e),
            "prompt_length": len(prompt),
            "model_requested": request.model,
            "nadir_mode": nadir_mode
        }

        # Add funnel/tag tracking if provided
        if x_tag:
            error_log_data["funnel_tag"] = x_tag
            error_log_data["tracking_tag"] = x_tag

        add_log("error", f"Chat completion failed for user {current_user.email}: {str(e)}", error_log_data)

        # Map known exception types to appropriate HTTP status codes
        error_msg = str(e).lower()
        if "rate limit" in error_msg or "rate_limit" in error_msg or "429" in error_msg:
            raise HTTPException(status_code=429, detail="Rate limit exceeded from LLM provider. Please retry after a moment.")
        elif "authentication" in error_msg or "api key" in error_msg or "unauthorized" in error_msg or "401" in error_msg:
            raise HTTPException(status_code=502, detail="LLM provider authentication failed. Please check your configuration.")
        elif "timeout" in error_msg or "timed out" in error_msg:
            raise HTTPException(status_code=504, detail="Request timed out waiting for LLM provider response.")
        elif "budget" in error_msg or "insufficient" in error_msg:
            raise HTTPException(status_code=402, detail="Insufficient credits to complete this request.")
        elif "context length" in error_msg or "too many tokens" in error_msg or "maximum context" in error_msg:
            raise HTTPException(status_code=400, detail="Prompt is too long for the selected model. Try a shorter prompt or a model with a larger context window.")
        else:
            raise HTTPException(status_code=500, detail=f"Completion failed: {type(e).__name__}. Please try again.")


@router.post("/enhanced/completions", dependencies=[Depends(check_rate_limit)])
async def enhanced_completion(
    request: EnhancedCompletionRequest,
    current_user: UserSession = Depends(require_active_subscription),
) -> Dict[str, Any]:
    """Enhanced completion endpoint with full control over the flow."""
    # Check rate limit
    await check_rate_limit(current_user.id)
    
    # Initialize Supabase unified LLM service
    unified_service = SupabaseUnifiedLLMService(current_user)
    
    # Get cost estimate and check user budget BEFORE processing
    estimated_cost = await unified_service.estimate_cost(
        prompt=request.prompt,
        model=request.model,
        max_tokens=request.max_tokens or 1000,
        system_message=request.system_message
    )
    
    # Check if user has sufficient funds
    can_afford = await check_user_budget(current_user, estimated_cost)
    if not can_afford:
        raise HTTPException(
            status_code=402,  # Payment Required
            detail=f"Insufficient credit balance. Estimated cost: ${estimated_cost:.4f}. Please add credits to your account."
        )
    
    # Process the prompt through the complete flow
    result = await unified_service.process_prompt(
        prompt=request.prompt,
        system_message=request.system_message,
        model=request.model,
        providers=request.providers,
        models=request.models,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        tools=request.tools,
        stream=False
    )
    
    return {
        "success": True,
        "result": result
    }


@router.post("/playground")
async def playground(
    request: PlaygroundRequest,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Generate streaming playground completion using the unified flow."""
    from fastapi.responses import StreamingResponse
    
    # Check rate limit
    await check_rate_limit(current_user.id)
    
    # Initialize Supabase unified LLM service
    unified_service = SupabaseUnifiedLLMService(current_user)
    
    # Get cost estimate and check user budget BEFORE processing
    estimated_cost = await unified_service.estimate_cost(
        prompt=request.prompt,
        model=request.model,
        max_tokens=request.max_tokens or 1000,
        system_message=request.system_message
    )
    
    # Check if user has sufficient funds
    can_afford = await check_user_budget(current_user, estimated_cost)
    if not can_afford:
        raise HTTPException(
            status_code=402,  # Payment Required
            detail=f"Insufficient credit balance. Estimated cost: ${estimated_cost:.4f}. Please add credits to your account."
        )
    
    async def event_generator():
        try:
            # Get the streaming generator from the unified service
            stream_generator = await unified_service.process_prompt(
                prompt=request.prompt,
                system_message=request.system_message,
                model=request.model,
                providers=request.provider_list,
                models=request.model_names,
                temperature=getattr(request, 'temperature', 0.7),
                max_tokens=getattr(request, 'max_tokens', None),
                stream=True
            )
            
            # Stream the results
            async for chunk in stream_generator:
                yield f"data: {json.dumps(chunk)}\n\n"
                
        except Exception as e:
            error_chunk = {
                "type": "error",
                "error": str(e)
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"}
    )


@router.post("/estimate_cost")
async def estimate_cost(
    request: CostEstimationRequest,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Estimate the cost of a completion before making the request."""
    try:
        # Initialize Supabase unified service
        unified_service = SupabaseUnifiedLLMService(current_user)
        
        cost_estimate = await unified_service.estimate_cost(
            request.prompt,
            model=request.model,
            max_tokens=request.max_tokens
        )
        
        return {
            "success": True,
            "cost_estimate": cost_estimate
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Cost estimation failed: {str(e)}"
        )


@router.get("/budget")
async def get_user_budget(
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get budget information for the current user."""
    try:
        # Get budget info from user session (stored in Supabase)
        budget_info = {
            "budget_limit": current_user.budget_limit,
            "budget_used": current_user.budget_used,
        }

        if not current_user.budget_limit:
            return {
                "success": True,
                "has_budget": False,
                "message": "No budget configured for this user"
            }
        
        return {
            "success": True,
            "has_budget": True,
            "budget_info": budget_info
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get budget info: {str(e)}"
        )


@router.post("/budget")
async def create_user_budget(
    request: BudgetRequest,
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a budget for the current user."""
    try:
        from app.database.supabase_db import supabase_db
        
        # Validate duration
        valid_durations = ["daily", "weekly", "monthly", "yearly"]
        if request.duration not in valid_durations:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid duration. Must be one of: {', '.join(valid_durations)}"
            )
        
        # Update user budget in Supabase via user_funds table
        from app.services.funds_validation_service import funds_service

        user_id = str(current_user.id)
        funds_status = await funds_service.get_user_funds_status(user_id)

        # Upsert spending limit into user_funds
        supabase_db.client.table("user_funds").upsert({
            "user_id": user_id,
            "spending_limit_usd": float(request.total_budget),
            "spending_limit_duration": request.duration,
            "updated_at": datetime.utcnow().isoformat(),
        }, on_conflict="user_id").execute()

        return {
            "success": True,
            "message": f"Budget of ${request.total_budget} set for {request.duration} duration",
            "current_balance_usd": float(funds_status.total_available_usd),
            "spent_this_month_usd": float(funds_status.spent_this_month_usd),
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Budget creation failed: {str(e)}"
        )


@router.get("/usage")
async def get_session_usage(
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get usage statistics for the current user."""
    try:
        from app.database.supabase_db import supabase_db
        
        # Get usage stats from Supabase
        usage_stats = await supabase_db.get_usage_stats(current_user.id)
        
        return {
            "success": True,
            "usage_stats": usage_stats
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get usage info: {str(e)}"
        )


@router.post("/chat/recommendation", response_model=RecommendationResponse)
async def chat_recommendation(
    request: RecommendationRequest,
    current_user: UserSession = Depends(get_current_user),
    http_request: Request = None,
    x_tag: Optional[str] = Header(None, alias="X-Tag")
) -> RecommendationResponse:
    """Get model recommendations without executing completion."""
    
    # Extract prompt from messages or legacy prompt field
    if request.messages:
        # OpenAI format - convert messages to prompt
        user_messages = [msg.content for msg in request.messages if msg.role == "user"]
        system_messages = [msg.content for msg in request.messages if msg.role == "system"]
        prompt = "\n".join(user_messages)
        system_message = "\n".join(system_messages) if system_messages else request.system_message
    else:
        # Legacy format
        prompt = request.prompt or ""
        system_message = request.system_message
    
    # Generate request ID
    request_id = f"rec-{uuid.uuid4().hex[:10]}"
    created_timestamp = int(time.time())
    
    # Log the incoming request with funnel tracking
    log_data = {
        "user_id": str(current_user.id),
        "prompt_length": len(prompt),
        "benchmark_model": request.benchmark_model,
        "max_models": request.max_models,
        "endpoint": "recommendation",
        "request_id": request_id
    }
    
    if x_tag:
        log_data["funnel_tag"] = x_tag
        log_data["tracking_tag"] = x_tag
    
    add_log("info", f"Model recommendation request from user {current_user.email}", log_data)
    
    try:
        # Check rate limit
        await check_rate_limit(current_user.id)
        
        # Get model recommendations
        # from app.complexity.gemini_analyzer import GeminiModelRecommender
        
        # recommender = GeminiModelRecommender(
        #     allowed_providers=request.providers,
        #     allowed_models=request.models
        # )

        from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
        recommender = ComplexityAnalyzerFactory.create_analyzer(
            analyzer_type="gemini",  # Use Gemini for "Gemini Recommendation" in UI
            allowed_providers=request.providers,
            allowed_models=request.models
        )
        
        recommendation_result = await recommender.ranker(
            text=prompt,
            system_message=system_message,
            max_models=request.max_models,
            benchmark_model=request.benchmark_model
        )
        
        ranked_models = recommendation_result.get("ranked_models", [])
        
        if not ranked_models:
            raise HTTPException(
                status_code=400,
                detail="No suitable models found for this request"
            )
        
        # Convert to AlternativeModel format
        recommendations = [
            AlternativeModel(
                model=model.get("model_name", ""),
                provider=model.get("provider", ""),
                confidence=model.get("confidence", 0.5),
                reasoning=model.get("reasoning", ""),
                cost_estimate=model.get("cost_per_million_tokens", 0.0),
                # Additional identifying information
                performance_name=model.get("performance_name"),
                quality_index=model.get("quality_index"),
                cost_per_1m_tokens=model.get("cost_per_1m_tokens"),
                api_id=model.get("api_id"),
                context_window=model.get("context_window"),
                function_calling=model.get("function_calling"),
                json_mode=model.get("json_mode")
            )
            for model in ranked_models
        ]
        
        # Get benchmark comparison if requested
        benchmark_comparison = None
        if request.benchmark_model and recommendations:
            top_model = recommendations[0]
            if request.benchmark_model != top_model.model:
                try:
                    from app.services.recommendation_service import compare_models
                    benchmark_comparison = await compare_models(
                        top_model_name=top_model.model,
                        benchmark_model_name=request.benchmark_model,
                        user_message=prompt,
                        system_message=system_message
                    )
                except Exception as comp_error:
                    benchmark_comparison = {
                        "error": f"Failed to generate comparison: {str(comp_error)}"
                    }
        
        # Calculate cost analysis
        cost_analysis = None
        if len(recommendations) > 1:
            costs = [rec.cost_estimate for rec in recommendations if rec.cost_estimate and rec.cost_estimate > 0]
            if costs:
                cost_analysis = CostAnalysis(
                    selected_model_cost=costs[0],
                    alternatives_cost_range=[min(costs[1:]), max(costs[1:])] if len(costs) > 1 else [costs[0], costs[0]]
                )
        
        # Log successful response
        success_log_data = {
            "user_id": str(current_user.id),
            "request_id": request_id,
            "recommendations_count": len(recommendations),
            "selected_model": recommendations[0].model if recommendations else None,
            "task_complexity": recommendation_result.get("task_complexity", 3),
            "endpoint": "recommendation"
        }
        
        if x_tag:
            success_log_data["funnel_tag"] = x_tag
            success_log_data["tracking_tag"] = x_tag
        
        add_log("success", f"Model recommendation successful for user {current_user.email}", success_log_data)
        
        return RecommendationResponse(
            success=True,
            request_id=request_id,
            created=created_timestamp,
            task_complexity=recommendation_result.get("task_complexity", 3),
            complexity_reasoning=recommendation_result.get("complexity_reasoning", ""),
            recommendations=recommendations,
            selected_model=recommendations[0].model if recommendations else None,
            benchmark_comparison=benchmark_comparison,
            cost_analysis=cost_analysis,
            funnel_tag=x_tag
        )
    
    except HTTPException:
        raise
    except Exception as e:
        # Log the error with funnel tracking
        error_log_data = {
            "user_id": str(current_user.id),
            "request_id": request_id,
            "error_type": type(e).__name__,
            "error_message": str(e),
            "prompt_length": len(prompt),
            "endpoint": "recommendation"
        }
        
        if x_tag:
            error_log_data["funnel_tag"] = x_tag
            error_log_data["tracking_tag"] = x_tag
        
        add_log("error", f"Model recommendation failed for user {current_user.email}: {str(e)}", error_log_data)

        error_msg = str(e).lower()
        if "rate limit" in error_msg or "429" in error_msg:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please retry after a moment.")
        elif "timeout" in error_msg or "timed out" in error_msg:
            raise HTTPException(status_code=504, detail="Recommendation timed out. Please try again.")
        else:
            raise HTTPException(status_code=500, detail=f"Recommendation failed: {type(e).__name__}. Please try again.")


@router.post("/log")
async def log_event(
    current_user: UserSession = Depends(get_current_user)
) -> Dict[str, Any]:
    """Log an event for the current user."""
    try:
        # Log the event using the test UI logging
        event_id = add_log("info", "Manual event logged", {
            "user_id": current_user.id,
            "event_type": "manual_log"
        })
        
        return {
            "success": True,
            "event_id": event_id
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to log event: {str(e)}"
        ) 