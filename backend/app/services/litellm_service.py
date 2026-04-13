"""
LiteLLM service for unified LLM provider access with cost estimation and monitoring.

This service provides a unified interface to multiple LLM providers using LiteLLM,
including cost estimation, budget management, caching, and comprehensive monitoring.
"""
import os
import time
import uuid
import asyncio
from typing import Dict, Any, List, Optional, AsyncGenerator, Union
from datetime import datetime, timedelta
import json

import litellm
from litellm import completion, acompletion, BudgetManager, Cache
from litellm.caching.caching import Cache as LiteLLMCache
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.settings import settings
from app.middleware.circuit_breaker import circuit_breaker
from app.middleware.provider_health_monitor import health_monitor

import logging

logger = logging.getLogger(__name__)


class LiteLLMService:
    """
    Unified LLM service using LiteLLM for multi-provider access.
    
    Features:
    - Multi-provider support (OpenAI, Anthropic, Google, etc.)
    - Automatic cost calculation and tracking
    - Budget management per user
    - Response caching
    - Comprehensive monitoring and logging
    - Token counting and usage analytics
    """
    
    def __init__(self, session: Optional[AsyncSession] = None, user_id: Optional[uuid.UUID] = None):
        """
        Initialize the LiteLLM service.
        
        Args:
            session: Optional database session for recording usage
            user_id: Optional user ID for budget management
        """
        self.session = session
        self.user_id = user_id
        self.start_time = None
        
        # Initialize LiteLLM configuration
        self._setup_litellm()
        
        # Initialize budget manager if user_id is provided
        self.budget_manager = None
        if user_id:
            self.budget_manager = BudgetManager(
                project_name=f"nadir_{settings.APP_NAME}",
                client_type="local"  # Use local for now, can be upgraded to hosted
            )
        
        # Initialize cache
        self._setup_cache()
        
        # Track usage for this session
        self.session_usage = {
            "total_tokens": 0,
            "total_cost": 0.0,
            "requests": 0,
            "models_used": set(),
            "providers_used": set()
        }
    
    # Class-level flag to ensure env vars are only set once (thread-safe at import time)
    _litellm_configured = False

    def _setup_litellm(self):
        """Configure LiteLLM with API keys and settings.

        API keys are set in os.environ exactly once (class-level guard) to
        avoid race conditions when multiple instances are created concurrently.
        """
        if LiteLLMService._litellm_configured:
            return
        LiteLLMService._litellm_configured = True

        # Set API keys from environment/settings
        if settings.OPENAI_API_KEY:
            litellm.openai_key = settings.OPENAI_API_KEY
            os.environ.setdefault("OPENAI_API_KEY", settings.OPENAI_API_KEY)

        if settings.ANTHROPIC_API_KEY:
            litellm.anthropic_key = settings.ANTHROPIC_API_KEY
            os.environ.setdefault("ANTHROPIC_API_KEY", settings.ANTHROPIC_API_KEY)

        if settings.GOOGLE_API_KEY:
            litellm.google_key = settings.GOOGLE_API_KEY
            os.environ.setdefault("GOOGLE_API_KEY", settings.GOOGLE_API_KEY)
            os.environ.setdefault("GEMINI_API_KEY", settings.GOOGLE_API_KEY)
            os.environ.setdefault("GOOGLE_AI_STUDIO_API_KEY", settings.GOOGLE_API_KEY)
            # Ensure no vertex AI credentials are used accidentally
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            os.environ.pop("GOOGLE_CLOUD_PROJECT", None)
            os.environ.pop("GOOGLE_CLOUD_PROJECT_ID", None)
            os.environ.pop("VERTEX_AI_PROJECT", None)

        # Set additional provider keys if available (only if not already set)
        for provider, key in [
            ("XAI_API_KEY", os.getenv("XAI_API_KEY")),
            ("REPLICATE_API_KEY", os.getenv("REPLICATE_API_KEY")),
            ("TOGETHERAI_API_KEY", os.getenv("TOGETHERAI_API_KEY")),
            ("COHERE_API_KEY", os.getenv("COHERE_API_KEY")),
            ("MISTRAL_API_KEY", os.getenv("MISTRAL_API_KEY")),
            ("OPENROUTER_API_KEY", os.getenv("OPENROUTER_API_KEY")),
            ("GROQ_API_KEY", os.getenv("GROQ_API_KEY")),
        ]:
            if key:
                os.environ.setdefault(provider, key)

        # Configure LiteLLM settings
        litellm.drop_params = True  # Drop unsupported parameters
        litellm.set_verbose = settings.DEBUG

        # Set global budget if configured
        max_budget = os.getenv("LITELLM_MAX_BUDGET")
        if max_budget:
            litellm.max_budget = float(max_budget)
    
    def _setup_cache(self):
        """Setup caching for LiteLLM."""
        cache_type = os.getenv("LITELLM_CACHE_TYPE", "local")
        
        if cache_type == "redis" and settings.REDIS_URI:
            # Parse Redis URI for connection details
            import urllib.parse
            parsed = urllib.parse.urlparse(settings.REDIS_URI)
            
            litellm.cache = Cache(
                type="redis",
                host=parsed.hostname,
                port=parsed.port,
                password=parsed.password,
                ttl=3600  # 1 hour default TTL
            )
        else:
            # Use in-memory cache
            litellm.cache = Cache(type="local", ttl=1800)  # 30 minutes default TTL
    
    
    async def validate_model(self, model: str) -> bool:
        """
        Validate if a model is available and accessible.
        
        Args:
            model: Model name to validate
            
        Returns:
            True if model is valid and accessible
        """
        try:
            from litellm import validate_environment
            result = validate_environment(model)
            return result.get("keys_in_environment", False)
        except Exception:
            return False
    
    async def estimate_cost(
        self, 
        model: str, 
        prompt: str, 
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Estimate the cost of a completion before making the request.
        
        Args:
            model: Model to use
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            
        Returns:
            Dictionary with cost estimation details
        """
        try:
            from litellm import token_counter, cost_per_token
            
            # Count input tokens
            messages = [{"role": "user", "content": prompt}]
            input_tokens = token_counter(model=model, messages=messages)
            
            # Estimate output tokens (use max_tokens or a reasonable default)
            estimated_output_tokens = max_tokens or min(input_tokens, 1000)
            
            # Get cost per token
            input_cost, output_cost = cost_per_token(
                model=model,
                prompt_tokens=input_tokens,
                completion_tokens=estimated_output_tokens
            )
            
            total_estimated_cost = input_cost + output_cost
            
            return {
                "model": model,
                "input_tokens": input_tokens,
                "estimated_output_tokens": estimated_output_tokens,
                "input_cost_usd": input_cost,
                "output_cost_usd": output_cost,
                "total_estimated_cost_usd": total_estimated_cost,
                "cost_per_input_token": input_cost / input_tokens if input_tokens > 0 else 0,
                "cost_per_output_token": output_cost / estimated_output_tokens if estimated_output_tokens > 0 else 0
            }
        
        except Exception as e:
            return {
                "error": f"Cost estimation failed: {str(e)}",
                "model": model,
                "input_tokens": 0,
                "estimated_output_tokens": 0,
                "total_estimated_cost_usd": 0.0
            }
    
    async def check_budget(self, estimated_cost: float) -> bool:
        """
        Check if the user has sufficient budget for the estimated cost.
        
        Args:
            estimated_cost: Estimated cost in USD
            
        Returns:
            True if user has sufficient budget
        """
        if not self.budget_manager or not self.user_id:
            return True  # No budget restrictions if not configured
        
        try:
            current_cost = self.budget_manager.get_current_cost(str(self.user_id))
            total_budget = self.budget_manager.get_total_budget(str(self.user_id))
            
            return (current_cost + estimated_cost) <= total_budget
        
        except Exception:
            return True  # Allow if budget check fails
    
    async def completion(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        cache_ttl: Optional[int] = None,
        fallback_models: Optional[List[str]] = None,
        **kwargs
    ) -> Union[Dict[str, Any], AsyncGenerator[Dict[str, Any], None]]:
        """
        Generate a completion using LiteLLM with fallback support.
        
        Args:
            model: Primary model to use
            messages: List of messages in OpenAI format
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream the response
            cache_ttl: Cache TTL in seconds (if different from default)
            fallback_models: List of fallback models to try if primary fails
            **kwargs: Additional parameters to pass to LiteLLM
            
        Returns:
            Completion response or async generator for streaming
        """
        self.start_time = time.time()
        
        # Prepare cache settings
        cache_settings = {}
        if cache_ttl:
            cache_settings["ttl"] = cache_ttl
        
        # Prepare completion arguments
        completion_args = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": stream,
            **kwargs
        }
        
        if max_tokens:
            completion_args["max_tokens"] = max_tokens
        
        if cache_settings:
            completion_args["cache"] = cache_settings
        
        # Build list of models to try (primary + fallbacks)
        models_to_try = [model]
        if fallback_models:
            models_to_try.extend(fallback_models)
        
        # Try each model in sequence
        last_error = None
        for i, current_model in enumerate(models_to_try):
            provider = self._get_provider_from_model(current_model)

            # Check health monitor (wraps circuit breaker) before calling
            if not health_monitor.can_execute(provider):
                logger.warning(f"Circuit breaker OPEN for {provider}, skipping {current_model}")
                last_error = Exception(f"Circuit breaker open for provider {provider}")
                if i < len(models_to_try) - 1:
                    continue
                else:
                    break

            try:
                # Update completion args with current model
                current_completion_args = completion_args.copy()
                current_completion_args["model"] = current_model

                logger.debug(f"Trying model {i+1}/{len(models_to_try)}: {current_model}")

                if stream:
                    result = await self._stream_completion(**current_completion_args)
                else:
                    result = await self._complete(**current_completion_args)

                # Record success with health monitor (includes circuit breaker)
                latency = result.get("latency_ms", 0) if isinstance(result, dict) else 0
                health_monitor.record_success(provider, latency)

                # Add fallback info if we used a fallback model
                if i > 0:  # Not the primary model
                    if isinstance(result, dict):
                        result["fallback_used"] = True
                        result["original_model"] = model
                        result["fallback_model_index"] = i
                        result["fallback_reason"] = f"Primary model failed, used fallback #{i}"
                        result["models_tried"] = models_to_try[:i+1]

                logger.info(f"Success with model: {current_model}")
                return result

            except Exception as e:
                last_error = e
                health_monitor.record_failure(provider)
                logger.warning(f"Model {current_model} failed: {str(e)}")

                # If this isn't the last model, continue to next fallback
                if i < len(models_to_try) - 1:
                    await self._record_error(current_model, str(e))
                    continue
                else:
                    # This was the last model, record error and raise
                    await self._record_error(current_model, str(e))
                    break
        
        # All models failed
        raise HTTPException(
            status_code=500,
            detail=f"All models failed. Primary: {model}, Fallbacks: {fallback_models or 'None'}. Last error: {str(last_error)}"
        )
    
    async def _complete(self, **completion_args) -> Dict[str, Any]:
        """Execute a non-streaming completion."""
        try:
            # Use async completion with configurable timeout
            completion_args.setdefault("timeout", settings.LLM_REQUEST_TIMEOUT)
            try:
                response = await acompletion(**completion_args)
            except asyncio.TimeoutError:
                model_name = completion_args.get("model", "unknown")
                timeout_val = completion_args.get("timeout", settings.LLM_REQUEST_TIMEOUT)
                logger.error(f"LLM request timed out after {timeout_val}s for model {model_name}")
                raise HTTPException(
                    status_code=504,
                    detail=f"LLM request timed out after {timeout_val} seconds. The provider may be experiencing issues."
                )
            
            # Extract response details
            result = self._process_response(response, completion_args["model"])

            # Record Prometheus metrics
            self._record_llm_metrics(
                model=completion_args["model"],
                provider=result.get("provider", self._get_provider_from_model(completion_args["model"])),
                result=result,
                status="success",
            )

            # Update budget if configured
            if self.budget_manager and self.user_id:
                try:
                    # Use the correct method signature for LiteLLM budget manager
                    self.budget_manager.update_cost(
                        completion_obj=response,
                        user=str(self.user_id)
                    )
                except Exception as budget_error:
                    # Log budget error but don't fail the completion
                    logger.warning(f"Budget manager error: {budget_error}")
                    # Continue without failing the request
            
            # Record usage
            await self._record_usage(result)
            
            return result
        
        except Exception as e:
            # Check if this is a Google authentication error despite using gemini/ prefix
            error_str = str(e).lower()
            model_name = completion_args.get("model", "")
            
            if ("default credentials were not found" in error_str or 
                "vertex" in error_str or 
                "google.auth.exceptions" in error_str) and model_name.startswith("gemini/"):
                
                fallback_model = completion_args.pop("_fallback_model", None) or "gpt-4o-mini"
                logger.warning(f"Google model {model_name} failed despite gemini/ prefix, falling back to {fallback_model}: {e}")

                # Fallback to specified model as last resort
                fallback_args = completion_args.copy()
                fallback_args["model"] = fallback_model
                fallback_args["timeout"] = 30  # Shorter timeout for fallback

                try:
                    # Retry with fallback model
                    response = await acompletion(**fallback_args)
                    result = self._process_response(response, fallback_model)

                    # Add fallback indication to result
                    result["fallback_used"] = True
                    result["original_model"] = model_name
                    result["fallback_reason"] = "Google AI Studio error despite gemini/ prefix"

                    # Record usage with fallback info
                    await self._record_usage(result)

                    return result

                except Exception as fallback_error:
                    logger.error(f"Fallback to {fallback_model} also failed: {fallback_error}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Original model failed ({model_name}: {str(e)}) and fallback failed ({fallback_model}: {str(fallback_error)})"
                    )
            else:
                # Non-Google error, raise as-is
                raise HTTPException(
                    status_code=500,
                    detail=f"LiteLLM completion failed: {str(e)}"
                )
    
    async def _stream_completion(self, **completion_args) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute a streaming completion."""
        try:
            # Use async streaming completion with configurable timeout
            completion_args.setdefault("timeout", settings.LLM_REQUEST_TIMEOUT)
            stream = await acompletion(**completion_args)
            
            # Track streaming response
            full_response = ""
            total_tokens = 0
            
            async for chunk in stream:
                # Process chunk
                if hasattr(chunk, 'choices') and chunk.choices:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, 'content') and delta.content:
                        content = delta.content
                        full_response += content
                        
                        yield {
                            "type": "content",
                            "content": content,
                            "model": completion_args["model"],
                            "timestamp": time.time()
                        }
                
                # Check for usage information
                if hasattr(chunk, 'usage') and chunk.usage:
                    total_tokens = chunk.usage.total_tokens
            
            # Final chunk with complete response info
            latency_ms = int((time.time() - self.start_time) * 1000)
            
            # Calculate cost
            from litellm import completion_cost
            cost = completion_cost(
                model=completion_args["model"],
                prompt="",  # Will be calculated from messages
                completion=full_response
            )
            
            final_result = {
                "type": "final",
                "model": completion_args["model"],
                "full_response": full_response,
                "total_tokens": total_tokens,
                "cost_usd": float(cost) if cost else 0.0,
                "latency_ms": latency_ms,
                "timestamp": time.time()
            }
            
            # Record usage
            await self._record_usage(final_result)
            
            yield final_result
        
        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "model": completion_args.get("model", "unknown"),
                "timestamp": time.time()
            }
    
    def _record_llm_metrics(self, model: str, provider: str, result: Dict[str, Any], status: str = "success"):
        """Record Prometheus metrics for an LLM call."""
        from app.metrics import (
            LLM_REQUEST_TOTAL, LLM_REQUEST_DURATION_SECONDS,
            LLM_TOKENS_TOTAL, LLM_COST_USD_TOTAL,
        )
        LLM_REQUEST_TOTAL.labels(provider=provider, model=model, status=status).inc()
        latency_s = result.get("latency_ms", 0) / 1000.0
        if latency_s > 0:
            LLM_REQUEST_DURATION_SECONDS.labels(provider=provider, model=model).observe(latency_s)
        usage = result.get("usage", {})
        if usage.get("prompt_tokens"):
            LLM_TOKENS_TOTAL.labels(provider=provider, model=model, direction="input").inc(usage["prompt_tokens"])
        if usage.get("completion_tokens"):
            LLM_TOKENS_TOTAL.labels(provider=provider, model=model, direction="output").inc(usage["completion_tokens"])
        cost = result.get("cost_usd", 0.0)
        if cost > 0:
            LLM_COST_USD_TOTAL.labels(provider=provider, model=model).inc(cost)

    def _process_response(self, response, model: str) -> Dict[str, Any]:
        """Process a LiteLLM response into a standardized format."""
        latency_ms = int((time.time() - self.start_time) * 1000) if self.start_time else 0
        
        # Extract content
        content = ""
        if hasattr(response, 'choices') and response.choices:
            choice = response.choices[0]
            if hasattr(choice, 'message') and choice.message:
                content = choice.message.content or ""
        
        # Extract usage
        usage = {}
        cost = 0.0
        if hasattr(response, 'usage') and response.usage:
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
            # Extract prompt caching metrics (Anthropic/OpenAI)
            if hasattr(response.usage, 'cache_read_input_tokens') and response.usage.cache_read_input_tokens:
                usage["cache_read_input_tokens"] = response.usage.cache_read_input_tokens
                usage["cache_creation_input_tokens"] = getattr(response.usage, 'cache_creation_input_tokens', 0)
            # Extract reasoning/thinking tokens
            if hasattr(response.usage, 'reasoning_tokens') and response.usage.reasoning_tokens:
                usage["reasoning_tokens"] = response.usage.reasoning_tokens
            # Also check completion_tokens_details for OpenAI reasoning tokens
            if hasattr(response.usage, 'completion_tokens_details'):
                details = response.usage.completion_tokens_details
                if details and hasattr(details, 'reasoning_tokens') and details.reasoning_tokens:
                    usage["reasoning_tokens"] = details.reasoning_tokens
        
        # Calculate cost using LiteLLM
        try:
            from litellm import completion_cost
            cost = completion_cost(completion_response=response)
            cost = float(cost) if cost else 0.0
        except Exception:
            cost = 0.0
        
        return {
            "model": model,
            "content": content,
            "usage": usage,
            "cost_usd": cost,
            "latency_ms": latency_ms,
            "timestamp": time.time(),
            "provider": self._get_provider_from_model(model),
            "response_id": str(uuid.uuid4())
        }
    
    def _get_provider_from_model(self, model: str) -> str:
        """Determine the provider from the model name."""
        model_lower = model.lower()
        
        if any(prefix in model_lower for prefix in ["gpt-", "text-", "davinci", "curie"]):
            return "openai"
        elif any(prefix in model_lower for prefix in ["claude-", "anthropic"]):
            return "anthropic"
        elif any(prefix in model_lower for prefix in ["gemini-", "palm-", "bison"]):
            return "google"
        elif "cohere" in model_lower:
            return "cohere"
        elif "mistral" in model_lower:
            return "mistral"
        else:
            return "unknown"
    
    async def _record_usage(self, result: Dict[str, Any]):
        """Record usage statistics."""
        # Update session usage
        usage = result.get("usage", {})
        self.session_usage["total_tokens"] += usage.get("total_tokens", 0)
        self.session_usage["total_cost"] += result.get("cost_usd", 0.0)
        self.session_usage["requests"] += 1
        self.session_usage["models_used"].add(result.get("model", ""))
        self.session_usage["providers_used"].add(result.get("provider", ""))
        
        # TODO: Record to database if needed
        # This would involve creating a usage tracking model and saving the record
    
    async def _record_error(self, model: str, error: str):
        """Record error for monitoring."""
        from app.metrics import LLM_REQUEST_TOTAL
        provider = self._get_provider_from_model(model)
        LLM_REQUEST_TOTAL.labels(provider=provider, model=model, status="error").inc()
        logger.error(f"LiteLLM Error - Model: {model}, Error: {error}")
    
    def get_session_usage(self) -> Dict[str, Any]:
        """Get usage statistics for this session."""
        return {
            **self.session_usage,
            "models_used": list(self.session_usage["models_used"]),
            "providers_used": list(self.session_usage["providers_used"])
        }
    
    async def get_user_budget_info(self) -> Optional[Dict[str, Any]]:
        """Get budget information for the current user."""
        if not self.budget_manager or not self.user_id:
            return None
        
        try:
            user_id_str = str(self.user_id)
            
            if not self.budget_manager.is_valid_user(user_id_str):
                return None
            
            return {
                "user_id": user_id_str,
                "current_cost": self.budget_manager.get_current_cost(user_id_str),
                "total_budget": self.budget_manager.get_total_budget(user_id_str),
                "model_costs": self.budget_manager.get_model_cost(user_id_str)
            }
        
        except Exception as e:
            logger.warning(f"Budget info error: {e}")
            return None
    
    async def create_user_budget(
        self, 
        total_budget: float, 
        duration: str = "monthly"
    ) -> bool:
        """
        Create a budget for the current user.
        
        Args:
            total_budget: Total budget in USD
            duration: Budget duration ('daily', 'weekly', 'monthly', 'yearly')
            
        Returns:
            True if budget was created successfully
        """
        if not self.budget_manager or not self.user_id:
            return False
        
        try:
            user_id_str = str(self.user_id)
            
            if self.budget_manager.is_valid_user(user_id_str):
                return False  # Budget already exists
            
            self.budget_manager.create_budget(
                total_budget=total_budget,
                user=user_id_str,
                duration=duration
            )
            
            return True
        
        except Exception as e:
            logger.warning(f"Budget creation error: {e}")
            return False
    
    def enable_cache(self, cache_type: str = "local", **cache_kwargs):
        """Enable caching with specific configuration."""
        litellm.enable_cache(type=cache_type, **cache_kwargs)
    
    def disable_cache(self):
        """Disable caching."""
        litellm.disable_cache()
    
    async def get_model_info(self, model: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific model.
        
        Args:
            model: Model name
            
        Returns:
            Dictionary with model information
        """
        try:
            from litellm import get_max_tokens, model_cost
            
            # Get model cost information
            cost_info = model_cost.get(model, {})
            
            # Get max tokens
            max_tokens = get_max_tokens(model)
            
            return {
                "model": model,
                "provider": self._get_provider_from_model(model),
                "max_tokens": max_tokens,
                "input_cost_per_token": cost_info.get("input_cost_per_token", 0),
                "output_cost_per_token": cost_info.get("output_cost_per_token", 0),
                "supports_streaming": True,  # Most models support streaming
                "supports_function_calling": model in [
                    "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-4o",
                    "claude-3-opus-20240229", "claude-3-sonnet-20240229",
                    "gemini-1.5-pro", "gemini-1.5-flash"
                ]
            }
        
        except Exception as e:
            return {
                "model": model,
                "provider": self._get_provider_from_model(model),
                "error": str(e)
            } 