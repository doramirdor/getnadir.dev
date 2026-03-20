"""
Enhanced LiteLLM Router with preset-based fallback and load balancing.

This service extends the basic LiteLLM service to provide:
1. User preset-based fallback configurations
2. Load balancing across multiple deployments
3. Context window fallbacks
4. Content policy fallbacks
5. Advanced routing strategies (latency-based, cost-based, etc.)
"""

import asyncio
import logging
import time
import uuid
from decimal import Decimal
from typing import Dict, Any, List, Optional, Union, AsyncGenerator, Tuple
from datetime import datetime

import litellm
from litellm import Router, completion, acompletion
from litellm.router import ModelInfo, Deployment

from app.settings import settings
from app.auth.supabase_auth import UserSession
from app.services.litellm_cost_callback import track_cost_callback

logger = logging.getLogger(__name__)


class EnhancedLiteLLMRouter:
    """
    Enhanced LiteLLM Router with preset-based configuration, fallbacks, and load balancing.
    
    Features:
    - User preset-based model configurations
    - Context window fallbacks
    - Content policy fallbacks
    - Load balancing with multiple strategies
    - Real-time routing strategy selection
    - Cost-based routing
    - Latency-based routing
    - Automatic retry with exponential backoff
    """
    
    def __init__(self, user_session: UserSession):
        """
        Initialize the enhanced router for a specific user.
        
        Args:
            user_session: User session containing API key config and presets
        """
        self.user_session = user_session
        self.router = None
        self.model_list = []
        self.fallback_config = {}
        self.routing_strategy = "weighted-pick"  # Default strategy
        
        # Performance tracking
        self.request_count = 0
        self.total_latency = 0.0
        self.model_performance = {}
        
        # Initialize router configuration
        self._initialize_router()
    
    def _initialize_router(self):
        """Initialize the LiteLLM router with user-specific configuration."""
        try:
            # Get user's API key configuration and presets
            api_key_config = getattr(self.user_session, 'api_key_config', {})
            
            # Build model list from user's allowed models and presets
            self._build_model_list(api_key_config)
            
            # Configure fallbacks based on user preferences
            self._configure_fallbacks(api_key_config)
            
            # Determine routing strategy from user preferences
            self._set_routing_strategy(api_key_config)
            
            # Create the LiteLLM router
            self._create_router()
            
            # Register callback for cost tracking
            self._register_callback()
            
            logger.info(f"✅ Enhanced LiteLLM Router initialized for user {self.user_session.id}")
            logger.info(f"   Models configured: {len(self.model_list)}")
            logger.info(f"   Routing strategy: {self.routing_strategy}")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize enhanced router: {e}")
            # Fallback to basic configuration
            self._create_fallback_router()
    
    def _build_model_list(self, api_key_config: Dict[str, Any]):
        """Build model list for LiteLLM Router based on user configuration."""
        self.model_list = []
        
        # Get selected models from user configuration
        selected_models = api_key_config.get("selected_models", [])
        load_balancing_policy = api_key_config.get("load_balancing_policy", "round-robin")
        
        # Default models if none specified
        if not selected_models:
            selected_models = [
                "gpt-4o-mini",
                "claude-3-haiku-20240307", 
                "gemini-1.5-flash"
            ]
        
        # Create deployments for each model with load balancing
        for model_name in selected_models:
            # Primary deployment
            primary_deployment = self._create_model_deployment(
                model_name, 
                deployment_name=f"{model_name}-primary",
                priority=1
            )
            if primary_deployment:
                self.model_list.append(primary_deployment)
            
            # Secondary deployments for load balancing (if configured)
            if load_balancing_policy in ["round-robin", "weighted-pick", "latency-based"]:
                secondary_deployment = self._create_model_deployment(
                    model_name,
                    deployment_name=f"{model_name}-secondary", 
                    priority=2,
                    is_secondary=True
                )
                if secondary_deployment:
                    self.model_list.append(secondary_deployment)
        
        logger.info(f"📋 Built model list with {len(self.model_list)} deployments")
        for deployment in self.model_list:
            logger.info(f"   - {deployment['model_name']}: {deployment['litellm_params']['model']}")
    
    def _create_model_deployment(
        self, 
        model_name: str, 
        deployment_name: str,
        priority: int = 1,
        is_secondary: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Create a deployment configuration for a specific model."""
        try:
            # Determine the actual LiteLLM model string and API configuration
            litellm_model, api_config = self._get_model_config(model_name, is_secondary)
            
            if not litellm_model:
                return None
            
            deployment = {
                "model_name": model_name,  # Model alias for load balancing
                "litellm_params": {
                    "model": litellm_model,
                    **api_config
                }
            }
            
            # Add deployment-specific metadata
            deployment["deployment_name"] = deployment_name
            deployment["priority"] = priority
            deployment["is_secondary"] = is_secondary
            
            return deployment
            
        except Exception as e:
            logger.warning(f"⚠️  Failed to create deployment for {model_name}: {e}")
            return None
    
    def _get_model_config(self, model_name: str, is_secondary: bool = False) -> Tuple[str, Dict[str, Any]]:
        """Get LiteLLM model configuration and API settings."""
        api_config = {}
        
        # Map model names to LiteLLM format and configure API keys
        if model_name.startswith("gpt-") or "gpt" in model_name.lower():
            litellm_model = model_name
            if settings.OPENAI_API_KEY:
                api_config["api_key"] = settings.OPENAI_API_KEY
            
            # For secondary deployments, could use different base URLs or regions
            if is_secondary:
                # Could configure different OpenAI endpoints for load balancing
                pass
                
        elif model_name.startswith("claude-") or "claude" in model_name.lower():
            litellm_model = model_name  # LiteLLM handles Claude models directly
            if settings.ANTHROPIC_API_KEY:
                api_config["api_key"] = settings.ANTHROPIC_API_KEY
                
        elif model_name.startswith("gemini-") or "gemini" in model_name.lower():
            # Use gemini/ prefix to force Google AI Studio
            litellm_model = f"gemini/{model_name}" if not model_name.startswith("gemini/") else model_name
            if settings.GOOGLE_API_KEY:
                api_config["api_key"] = settings.GOOGLE_API_KEY
                
        else:
            # Handle other providers
            litellm_model = model_name
            
        return litellm_model, api_config
    
    def _configure_fallbacks(self, api_key_config: Dict[str, Any]):
        """Configure fallback strategies based on user preferences."""
        use_fallback = api_key_config.get("use_fallback", True)
        
        if not use_fallback:
            self.fallback_config = {}
            return
        
        # Get unique model names for fallback configuration
        model_names = list(set([deployment["model_name"] for deployment in self.model_list]))
        
        # Context window fallbacks - smaller models can fallback to larger ones
        context_fallbacks = {}
        for model_name in model_names:
            fallback_models = self._get_context_window_fallbacks(model_name, model_names)
            if fallback_models:
                context_fallbacks[model_name] = fallback_models
        
        # Content policy fallbacks - stricter models can fallback to more permissive ones
        content_policy_fallbacks = {}
        for model_name in model_names:
            fallback_models = self._get_content_policy_fallbacks(model_name, model_names)
            if fallback_models:
                content_policy_fallbacks[model_name] = fallback_models
        
        # General fallbacks based on user preference
        general_fallbacks = {}
        for model_name in model_names:
            other_models = [m for m in model_names if m != model_name]
            if other_models:
                # Prioritize similar providers/capabilities
                sorted_fallbacks = self._sort_fallback_models(model_name, other_models)
                general_fallbacks[model_name] = sorted_fallbacks[:2]  # Limit to top 2 fallbacks
        
        self.fallback_config = {
            "context_window_fallbacks": context_fallbacks,
            "content_policy_fallbacks": content_policy_fallbacks,
            "fallbacks": general_fallbacks
        }
        
        logger.info(f"🔄 Configured fallbacks:")
        logger.info(f"   Context window fallbacks: {len(context_fallbacks)} models")
        logger.info(f"   Content policy fallbacks: {len(content_policy_fallbacks)} models")
        logger.info(f"   General fallbacks: {len(general_fallbacks)} models")
    
    def _get_context_window_fallbacks(self, model_name: str, available_models: List[str]) -> List[str]:
        """Get fallback models for context window limitations."""
        # Define rough context window sizes (tokens)
        context_windows = {
            "gpt-4o-mini": 128000,
            "gpt-4o": 128000,
            "gpt-4-turbo": 128000,
            "gpt-4": 8192,
            "gpt-3.5-turbo": 16385,
            "claude-3-haiku-20240307": 200000,
            "claude-3-sonnet-20240229": 200000,
            "claude-3-opus-20240229": 200000,
            "gemini-1.5-flash": 1048576,
            "gemini-1.5-pro": 2097152,
            "gemini-1.0-pro": 32768
        }
        
        model_window = context_windows.get(model_name, 8192)
        
        # Find models with larger context windows
        fallbacks = []
        for other_model in available_models:
            if other_model == model_name:
                continue
            other_window = context_windows.get(other_model, 8192)
            if other_window > model_window:
                fallbacks.append(other_model)
        
        # Sort by context window size (ascending)
        fallbacks.sort(key=lambda m: context_windows.get(m, 8192))
        
        return fallbacks[:2]  # Return top 2 fallbacks
    
    def _get_content_policy_fallbacks(self, model_name: str, available_models: List[str]) -> List[str]:
        """Get fallback models for content policy restrictions."""
        # Define content policy strictness (lower = more permissive)
        policy_strictness = {
            "gpt-4o-mini": 3,
            "gpt-4o": 3,
            "gpt-4": 3,
            "gpt-3.5-turbo": 3,
            "claude-3-haiku-20240307": 2,
            "claude-3-sonnet-20240229": 2,
            "claude-3-opus-20240229": 1,  # Most permissive
            "gemini-1.5-flash": 4,  # More strict
            "gemini-1.5-pro": 4,
            "gemini-1.0-pro": 4
        }
        
        model_strictness = policy_strictness.get(model_name, 3)
        
        # Find less strict models
        fallbacks = []
        for other_model in available_models:
            if other_model == model_name:
                continue
            other_strictness = policy_strictness.get(other_model, 3)
            if other_strictness < model_strictness:
                fallbacks.append(other_model)
        
        # Sort by strictness (ascending - less strict first)
        fallbacks.sort(key=lambda m: policy_strictness.get(m, 3))
        
        return fallbacks[:2]
    
    def _sort_fallback_models(self, model_name: str, other_models: List[str]) -> List[str]:
        """Sort fallback models by preference/capability similarity."""
        # Define provider preferences and capabilities
        provider_map = {
            "gpt-4o-mini": "openai",
            "gpt-4o": "openai", 
            "gpt-4": "openai",
            "gpt-3.5-turbo": "openai",
            "claude-3-haiku-20240307": "anthropic",
            "claude-3-sonnet-20240229": "anthropic",
            "claude-3-opus-20240229": "anthropic",
            "gemini-1.5-flash": "google",
            "gemini-1.5-pro": "google",
            "gemini-1.0-pro": "google"
        }
        
        model_provider = provider_map.get(model_name, "unknown")
        
        # Score other models based on similarity and capability
        scored_models = []
        for other_model in other_models:
            other_provider = provider_map.get(other_model, "unknown")
            
            score = 0
            # Same provider gets bonus
            if other_provider == model_provider:
                score += 10
            
            # Capability-based scoring (rough)
            if "gpt-4" in model_name and "gpt-4" in other_model:
                score += 5
            elif "claude-3" in model_name and "claude-3" in other_model:
                score += 5
            elif "gemini" in model_name and "gemini" in other_model:
                score += 5
            
            # Cost considerations (cheaper models as fallbacks)
            if "mini" in other_model or "haiku" in other_model or "flash" in other_model:
                score += 3
                
            scored_models.append((other_model, score))
        
        # Sort by score (descending)
        scored_models.sort(key=lambda x: x[1], reverse=True)
        
        return [model for model, score in scored_models]
    
    def _set_routing_strategy(self, api_key_config: Dict[str, Any]):
        """Set the routing strategy based on user preferences."""
        strategy = api_key_config.get("load_balancing_policy", "round-robin")
        
        # Map user-friendly names to LiteLLM routing strategies
        strategy_mapping = {
            "round-robin": "weighted-pick",
            "random": "weighted-pick", 
            "least-busy": "least-busy",
            "latency-based": "latency-based-routing",
            "cost-based": "lowest-cost-routing",
            "weighted": "weighted-pick"
        }
        
        self.routing_strategy = strategy_mapping.get(strategy, "weighted-pick")
        
        logger.info(f"🎯 Routing strategy set to: {self.routing_strategy}")
    
    def _create_router(self):
        """Create the LiteLLM Router with configured models and fallbacks."""
        try:
            if not self.model_list:
                raise ValueError("No models configured for router")
            
            # Configure router arguments
            router_args = {
                "model_list": self.model_list,
                "routing_strategy": self.routing_strategy,
                "enable_pre_call_check": True,  # Enable rate limits
                "num_retries": 3,
                "timeout": 60,
                "fallbacks": self.fallback_config.get("fallbacks", {}),
                "context_window_fallbacks": self.fallback_config.get("context_window_fallbacks", {}),
                "content_policy_fallbacks": self.fallback_config.get("content_policy_fallbacks", {})
            }
            
            # Add routing strategy specific arguments
            if self.routing_strategy == "latency-based-routing":
                router_args["routing_strategy_args"] = {
                    "ttl": 300,  # 5 minute time window
                    "lowest_latency_buffer": 0.3  # 30% buffer
                }
            elif self.routing_strategy == "lowest-cost-routing":
                router_args["routing_strategy_args"] = {
                    "cost_threshold": 0.01  # $0.01 cost difference threshold
                }
            
            self.router = Router(**router_args)
            
            logger.info(f"🚀 LiteLLM Router created successfully")
            logger.info(f"   Total deployments: {len(self.model_list)}")
            logger.info(f"   Fallback configurations: {len(self.fallback_config)}")
            
        except Exception as e:
            logger.error(f"❌ Failed to create LiteLLM Router: {e}")
            raise
    
    def _create_fallback_router(self):
        """Create a basic fallback router if initialization fails."""
        logger.warning("⚠️  Creating fallback router with basic configuration")
        
        basic_model_list = [
            {
                "model_name": "gpt-4o-mini",
                "litellm_params": {
                    "model": "gpt-4o-mini",
                    "api_key": settings.OPENAI_API_KEY
                }
            }
        ]
        
        if settings.ANTHROPIC_API_KEY:
            basic_model_list.append({
                "model_name": "claude-3-haiku",
                "litellm_params": {
                    "model": "claude-3-haiku-20240307", 
                    "api_key": settings.ANTHROPIC_API_KEY
                }
            })
        
        self.router = Router(
            model_list=basic_model_list,
            routing_strategy="weighted-pick",
            fallbacks={"gpt-4o-mini": ["claude-3-haiku"]} if settings.ANTHROPIC_API_KEY else {}
        )
        
        logger.info("🆘 Fallback router created")
    
    def _register_callback(self):
        """Register cost callback with the router."""
        try:
            # Set the callback for cost tracking
            if self.router:
                # Register our custom callback
                self.router.success_callback = [track_cost_callback]
                logger.info("📊 Cost callback registered with router")
        except Exception as e:
            logger.warning(f"⚠️  Failed to register callback: {e}")
    
    async def completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        user_id: Optional[str] = None,
        request_id: Optional[str] = None,
        **kwargs
    ) -> Union[Dict[str, Any], AsyncGenerator[Dict[str, Any], None]]:
        """
        Generate completion using the enhanced router with fallbacks.
        
        Args:
            messages: Chat messages in OpenAI format
            model: Model name (will be resolved through router)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream the response
            user_id: User ID for tracking
            request_id: Request ID for tracking
            **kwargs: Additional parameters
            
        Returns:
            Completion response or stream generator
        """
        start_time = time.time()
        self.request_count += 1
        
        if not request_id:
            request_id = f"req_{uuid.uuid4().hex[:8]}"
        
        try:
            # Prepare completion arguments
            completion_args = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "stream": stream,
                "user": user_id or str(self.user_session.id),
                "request_id": request_id,
                **kwargs
            }
            
            if max_tokens:
                completion_args["max_tokens"] = max_tokens
            
            logger.info(f"🚀 Starting completion with enhanced router")
            logger.info(f"   Model: {model}, Stream: {stream}, User: {user_id}")
            
            # Use router completion
            if stream:
                response = await self.router.acompletion(**completion_args)
                return self._process_stream_response(response, start_time, request_id)
            else:
                response = await self.router.acompletion(**completion_args)
                return self._process_response(response, start_time, request_id, model)
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            
            logger.error(f"❌ Enhanced router completion failed after {latency_ms}ms: {e}")
            
            # Try to extract more specific error information
            error_details = self._extract_error_details(e)
            
            # Update performance metrics
            self._update_performance_metrics(model, latency_ms, False)
            
            # Return error in standardized format
            return {
                "error": str(e),
                "error_details": error_details,
                "model": model,
                "request_id": request_id,
                "latency_ms": latency_ms,
                "timestamp": time.time(),
                "fallback_attempted": True,
                "router_strategy": self.routing_strategy
            }
    
    def _process_response(
        self, 
        response: Any, 
        start_time: float, 
        request_id: str,
        requested_model: str
    ) -> Dict[str, Any]:
        """Process the router response into standardized format."""
        latency_ms = int((time.time() - start_time) * 1000)
        
        try:
            # Extract response content
            content = ""
            if hasattr(response, 'choices') and response.choices:
                choice = response.choices[0]
                if hasattr(choice, 'message') and choice.message:
                    content = choice.message.content or ""
            
            # Extract usage information
            usage = {}
            if hasattr(response, 'usage') and response.usage:
                usage = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                }
            
            # Extract model information (may be different from requested due to routing)
            actual_model = getattr(response, 'model', requested_model)
            
            # Calculate cost using LiteLLM
            cost = 0.0
            try:
                from litellm import completion_cost
                cost = completion_cost(completion_response=response)
                cost = float(cost) if cost else 0.0
            except Exception:
                cost = 0.0
            
            # Update performance metrics
            self._update_performance_metrics(actual_model, latency_ms, True)
            
            # Check if fallback was used
            fallback_used = actual_model != requested_model
            
            result = {
                "content": content,
                "model": actual_model,
                "requested_model": requested_model,
                "usage": usage,
                "cost_usd": cost,
                "latency_ms": latency_ms,
                "request_id": request_id,
                "timestamp": time.time(),
                "fallback_used": fallback_used,
                "router_strategy": self.routing_strategy,
                "deployment_info": self._get_deployment_info(actual_model),
                "performance_stats": self._get_performance_stats()
            }
            
            logger.info(f"✅ Completion successful: {actual_model} ({latency_ms}ms)")
            if fallback_used:
                logger.info(f"🔄 Fallback used: {requested_model} → {actual_model}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Failed to process response: {e}")
            return {
                "error": f"Response processing failed: {str(e)}",
                "model": requested_model,
                "request_id": request_id,
                "latency_ms": latency_ms,
                "timestamp": time.time()
            }
    
    async def _process_stream_response(
        self, 
        stream: AsyncGenerator,
        start_time: float,
        request_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process streaming response from router."""
        try:
            full_content = ""
            model_used = None
            usage_info = {}
            
            async for chunk in stream:
                try:
                    # Process chunk content
                    if hasattr(chunk, 'choices') and chunk.choices:
                        delta = chunk.choices[0].delta
                        if hasattr(delta, 'content') and delta.content:
                            content = delta.content
                            full_content += content
                            
                            yield {
                                "type": "content",
                                "content": content,
                                "request_id": request_id,
                                "timestamp": time.time()
                            }
                    
                    # Extract model information
                    if hasattr(chunk, 'model') and chunk.model:
                        model_used = chunk.model
                    
                    # Extract usage information
                    if hasattr(chunk, 'usage') and chunk.usage:
                        usage_info = {
                            "prompt_tokens": chunk.usage.prompt_tokens,
                            "completion_tokens": chunk.usage.completion_tokens,
                            "total_tokens": chunk.usage.total_tokens
                        }
                
                except Exception as chunk_error:
                    logger.warning(f"⚠️  Error processing chunk: {chunk_error}")
                    continue
            
            # Final summary chunk
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Calculate cost
            cost = 0.0
            try:
                if model_used and usage_info.get("total_tokens"):
                    from litellm import completion_cost
                    # Create a mock response for cost calculation
                    mock_response = type('MockResponse', (), {
                        'model': model_used,
                        'usage': type('Usage', (), usage_info)()
                    })()
                    cost = completion_cost(completion_response=mock_response)
                    cost = float(cost) if cost else 0.0
            except Exception:
                pass
            
            yield {
                "type": "final",
                "full_content": full_content,
                "model": model_used,
                "usage": usage_info,
                "cost_usd": cost,
                "latency_ms": latency_ms,
                "request_id": request_id,
                "timestamp": time.time(),
                "router_strategy": self.routing_strategy
            }
            
        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "request_id": request_id,
                "timestamp": time.time()
            }
    
    def _extract_error_details(self, error: Exception) -> Dict[str, Any]:
        """Extract detailed error information."""
        error_details = {
            "error_type": type(error).__name__,
            "error_message": str(error)
        }
        
        # Check for specific LiteLLM errors
        if "rate limit" in str(error).lower():
            error_details["error_category"] = "rate_limit"
        elif "authentication" in str(error).lower():
            error_details["error_category"] = "authentication"
        elif "context" in str(error).lower() or "token" in str(error).lower():
            error_details["error_category"] = "context_length"
        elif "content" in str(error).lower() or "policy" in str(error).lower():
            error_details["error_category"] = "content_policy"
        else:
            error_details["error_category"] = "unknown"
        
        return error_details
    
    def _update_performance_metrics(self, model: str, latency_ms: int, success: bool):
        """Update performance metrics for model routing optimization."""
        if model not in self.model_performance:
            self.model_performance[model] = {
                "requests": 0,
                "successes": 0,
                "failures": 0,
                "total_latency": 0,
                "avg_latency": 0
            }
        
        metrics = self.model_performance[model]
        metrics["requests"] += 1
        
        if success:
            metrics["successes"] += 1
            metrics["total_latency"] += latency_ms
            metrics["avg_latency"] = metrics["total_latency"] / metrics["successes"]
        else:
            metrics["failures"] += 1
    
    def _get_deployment_info(self, model: str) -> Dict[str, Any]:
        """Get deployment information for the used model."""
        for deployment in self.model_list:
            if deployment["model_name"] == model:
                return {
                    "deployment_name": deployment.get("deployment_name"),
                    "is_secondary": deployment.get("is_secondary", False),
                    "priority": deployment.get("priority", 1)
                }
        return {}
    
    def _get_performance_stats(self) -> Dict[str, Any]:
        """Get current performance statistics."""
        return {
            "total_requests": self.request_count,
            "avg_latency": self.total_latency / self.request_count if self.request_count > 0 else 0,
            "model_performance": self.model_performance.copy()
        }
    
    def get_router_health(self) -> Dict[str, Any]:
        """Get health status of the router and its models."""
        health_info = {
            "router_initialized": self.router is not None,
            "total_models": len(self.model_list),
            "routing_strategy": self.routing_strategy,
            "fallback_configured": bool(self.fallback_config),
            "performance_stats": self._get_performance_stats()
        }
        
        # Check individual model health (if router supports it)
        if hasattr(self.router, 'healthy_deployments'):
            health_info["healthy_deployments"] = len(self.router.healthy_deployments)
            health_info["total_deployments"] = len(self.router.model_list)
        
        return health_info
    
    def update_routing_strategy(self, new_strategy: str) -> bool:
        """Update the routing strategy dynamically."""
        try:
            valid_strategies = [
                "weighted-pick", "latency-based-routing", 
                "lowest-cost-routing", "least-busy"
            ]
            
            if new_strategy not in valid_strategies:
                return False
            
            self.routing_strategy = new_strategy
            
            # Recreate router with new strategy
            self._create_router()
            self._register_callback()
            
            logger.info(f"🔄 Routing strategy updated to: {new_strategy}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to update routing strategy: {e}")
            return False
    
    async def get_model_recommendations(self, prompt: str, **kwargs) -> List[str]:
        """Get model recommendations based on prompt and current configuration."""
        try:
            # Simple recommendation based on prompt characteristics
            prompt_length = len(prompt)
            has_code = any(keyword in prompt.lower() for keyword in ['code', 'function', 'class', 'import', 'def', 'return'])
            has_math = any(keyword in prompt.lower() for keyword in ['calculate', 'equation', 'formula', 'math', 'solve'])
            is_creative = any(keyword in prompt.lower() for keyword in ['story', 'poem', 'creative', 'imagine', 'write'])
            
            available_models = [deployment["model_name"] for deployment in self.model_list]
            recommendations = []
            
            if has_code and "claude-3-sonnet-20240229" in available_models:
                recommendations.append("claude-3-sonnet-20240229")
            elif has_math and "gpt-4o" in available_models:
                recommendations.append("gpt-4o") 
            elif is_creative and "claude-3-opus-20240229" in available_models:
                recommendations.append("claude-3-opus-20240229")
            elif prompt_length > 10000 and "gemini-1.5-pro" in available_models:
                recommendations.append("gemini-1.5-pro")
            else:
                # Default to fastest/cheapest models
                if "gpt-4o-mini" in available_models:
                    recommendations.append("gpt-4o-mini")
                if "claude-3-haiku-20240307" in available_models:
                    recommendations.append("claude-3-haiku-20240307")
            
            # Add remaining models as alternatives
            for model in available_models:
                if model not in recommendations:
                    recommendations.append(model)
            
            return recommendations[:3]  # Return top 3
            
        except Exception as e:
            logger.error(f"❌ Failed to get recommendations: {e}")
            return [deployment["model_name"] for deployment in self.model_list[:3]]