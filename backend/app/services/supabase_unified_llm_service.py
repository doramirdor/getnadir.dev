"""
Supabase-based unified LLM service that integrates complexity analysis, model selection, and LiteLLM capabilities.

This service implements the complete flow:
1. Get user profile with benchmark model and allowed providers/models from Supabase
2. Analyze prompt complexity and select best model
3. Execute request through LiteLLM with cost tracking
4. Log comprehensive usage data to Supabase
5. Handle background clustering and logging
"""
import uuid
import time
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

from fastapi import HTTPException

from app.complexity.gemini_analyzer import GeminiModelRecommender
from app.complexity.analyzer_factory import ComplexityAnalyzerFactory, AnalyzerConfig
from app.complexity.model_registry import PERFORMANCE_TO_API, extract_provider as registry_extract_provider
from app.services.litellm_service import LiteLLMService
from app.services.analytics_service import (
    analytics_service, RequestAnalytics, ModelAnalytics, 
    CostAnalytics, PerformanceAnalytics
)
from app.services.cost_calculation_service import cost_service, CostBreakdown
from app.services.litellm_cost_callback import nadir_cost_callback, track_cost_callback
from app.services.cost_tracking_service import cost_tracking_service
from app.clusters.supabase_clustering import clustering_service
from app.database.supabase_db import supabase_db
from app.auth.supabase_auth import supabase
from app.auth.supabase_auth import UserSession, log_usage_event
from app.settings import settings
import logging
import litellm

logger = logging.getLogger(__name__)


class SupabaseUnifiedLLMService:
    """
    Supabase-based unified service for LLM operations with complexity analysis and cost management.
    
    This service orchestrates the complete flow from prompt analysis to response delivery,
    integrating user preferences, model selection, cost estimation, and background processing.
    """
    
    def __init__(self, user_session: UserSession):
        """
        Initialize the unified LLM service.
        
        Args:
            user_session: User session from Supabase authentication
        """
        self.user_session = user_session
        self.litellm_service = None
        
        # Initialize complexity analyzer
        self.complexity_analyzer = None
        self._init_complexity_analyzer()
        
        # Initialize clustering service (already global instance)
        self.clustering_service = clustering_service
        
        # Set up LiteLLM callback for accurate cost tracking
        self._setup_litellm_callback()
    
    def _init_complexity_analyzer(self):
        """Initialize the complexity analyzer based on settings."""
        try:
            # Try to use the configured analyzer type, default to Gemini
            analyzer_type = getattr(settings, 'COMPLEXITY_ANALYZER_TYPE', 'gemini')
            
            # Prepare kwargs for the analyzer
            kwargs = {}
            if hasattr(settings, 'BERT_MODEL_PATH') and settings.BERT_MODEL_PATH:
                kwargs['bert_model_path'] = settings.BERT_MODEL_PATH
            if hasattr(settings, 'MF_MODEL_PATH') and settings.MF_MODEL_PATH:
                kwargs['mf_model_path'] = settings.MF_MODEL_PATH
            if hasattr(settings, 'ANALYZER_DEVICE') and settings.ANALYZER_DEVICE:
                kwargs['device'] = settings.ANALYZER_DEVICE
            if hasattr(settings, 'ENSEMBLE_ANALYZERS') and settings.ENSEMBLE_ANALYZERS:
                kwargs['ensemble_analyzers'] = settings.ENSEMBLE_ANALYZERS.split(',')
            if hasattr(settings, 'ENSEMBLE_WEIGHTS') and settings.ENSEMBLE_WEIGHTS:
                kwargs['ensemble_weights'] = [float(w) for w in settings.ENSEMBLE_WEIGHTS.split(',') if w]
            
            self.complexity_analyzer = ComplexityAnalyzerFactory.create_analyzer(
                analyzer_type=analyzer_type,
                allowed_providers=self.user_session.allowed_providers,
                allowed_models=self.user_session.allowed_models,
                **kwargs
            )
            logger.debug(f"Initialized complexity analyzer: {analyzer_type}")
            
        except Exception as e:
            logger.error(f"Failed to initialize complexity analyzer: {e}")
            # Fallback to Gemini analyzer
            if settings.GOOGLE_API_KEY:
                try:
                    self.complexity_analyzer = GeminiModelRecommender(
                        allowed_providers=self.user_session.allowed_providers,
                        allowed_models=self.user_session.allowed_models
                    )
                    logger.debug("Fallback to Gemini analyzer")
                except Exception as fallback_error:
                    logger.error(f"Gemini fallback also failed: {fallback_error}")
                    self.complexity_analyzer = None
            else:
                logger.warning("No complexity analyzer available - no Google API key")
                self.complexity_analyzer = None
    
    def _setup_litellm_callback(self):
        """Set up LiteLLM callback for accurate cost tracking using the correct function-based approach."""
        try:
            # Use the correct function-based callback approach as per LiteLLM documentation
            litellm.success_callback = [track_cost_callback]
            
            logger.info("✅ LiteLLM callback configured following official documentation:")
            logger.info(f"  - success_callback: {litellm.success_callback}")
            
        except Exception as e:
            logger.error(f"Failed to setup LiteLLM callback: {str(e)}")
    
    async def process_prompt(
        self,
        prompt: str,
        system_message: Optional[str] = None,
        model: Optional[str] = None,
        providers: Optional[List[str]] = None,
        models: Optional[List[str]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        stream: bool = False,
        save_full_prompt: bool = True,
        save_response: bool = True,
        skip_model_selection: bool = False,
        fallback_models: Optional[List[str]] = None,
        # Enhanced analytics parameters
        funnel_tag: Optional[str] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        nadir_mode: str = "standard",
        # Passthrough parameters (prompt caching, extra LLM params)
        messages: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Process a prompt through the complete LLM pipeline following the main flow:
        
        1. User sends prompt
        2. System pulls all user information (providers, models, benchmark, budget, clusters)
        3. Preprocess prompt (placeholder for future features like compression)
        4. Complexity analysis + model selection (recommendation system approach)
        5. Send to LLM provider
        6. Return response to user
        7. Background logging and clustering (non-blocking)
        
        Args:
            prompt: User prompt
            system_message: Optional system message
            model: Specific model to use (overrides selection)
            providers: Allowed providers override
            models: Allowed models override
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            tools: Tool definitions for function calling
            stream: Whether to stream the response
            save_full_prompt: Whether to save the full prompt in logs
            save_response: Whether to save the response in logs
            
        Returns:
            Complete response with metadata
        """
        start_time = time.time()
        request_id = str(uuid.uuid4())
        
        try:
            # STEP 1: User information is already loaded in self.user_session
            # Contains: providers, models, benchmark, budget, clusters
            logger.debug(f"Processing prompt for user {self.user_session.id} with {len(self.user_session.allowed_providers or [])} providers and {len(self.user_session.allowed_models or [])} models")
            
            # STEP 2: Validate user budget before processing
            await self._validate_user_budget()
            
            # STEP 3: Preprocess prompt (placeholder for future features)
            processed_prompt = await self._preprocess_prompt(prompt, system_message)
            
            # STEP 4: Complexity analysis and model selection (recommendation system)
            if not model:
                if skip_model_selection:
                    # Model selection already done by caller (e.g., completion endpoint)
                    selected_model = "auto"  # Will trigger fallback
                    reasoning = "Model selection skipped - already done by caller"
                    complexity_analysis = {
                        "model_selection_type": "skipped",
                        "strategy": "pre-selected",
                        "analyzer_used": "completion-endpoint",
                        "complexity_score": 0.5,
                        "reasoning": "Model selection performed by completion endpoint",
                        "raw_response": "Skipped model selection"
                    }
                else:
                    selected_model, reasoning, complexity_analysis = await self._select_best_model(
                        prompt=processed_prompt,
                        system_message=system_message,
                        tools=tools,
                        providers_override=providers,
                        models_override=models
                    )
            else:
                selected_model = model
                reasoning = f"User specified model: {model}" if not skip_model_selection else f"Pre-selected model: {model}"
                complexity_analysis = {
                    "model_selection_type": "user_specified" if not skip_model_selection else "pre_selected",
                    "reasoning": reasoning,
                    "user_specified_model": model
                }
            
            if not selected_model:
                raise HTTPException(
                    status_code=400,
                    detail="No suitable model found for this request"
                )
            
            # STEP 5: Send to LLM provider
            if not self.litellm_service:
                self.litellm_service = LiteLLMService()

            # Use caller-provided messages (preserves cache_control etc.) or build from prompt
            if messages is not None:
                llm_messages = messages
            else:
                llm_messages = []
                if system_message:
                    llm_messages.append({"role": "system", "content": system_message})
                llm_messages.append({"role": "user", "content": processed_prompt})

            # Ensure model name is properly mapped for LiteLLM
            litellm_model = self._map_to_litellm_model(selected_model)
            logger.info(f"🎯 Selected: {litellm_model} | User: {self.user_session.id}")

            # Auto-apply middle-out context truncation when messages may exceed context window
            if len(llm_messages) > 3:
                from app.services.context_truncation import truncate_middle_out
                original_count = len(llm_messages)
                llm_messages = truncate_middle_out(llm_messages, litellm_model)
                if len(llm_messages) < original_count:
                    logger.info(
                        "Auto context truncation: %d -> %d messages for %s",
                        original_count, len(llm_messages), litellm_model,
                    )

            # Map fallback models to LiteLLM format if provided
            mapped_fallback_models = None
            if fallback_models:
                mapped_fallback_models = [self._map_to_litellm_model(model) for model in fallback_models]
                logger.debug(f"🔄 Fallback models mapping: {fallback_models} -> {mapped_fallback_models}")

            # Determine routing strategy and user API key usage for cost tracking
            routing_strategy = "smart-routing"  # Default to smart routing
            provider = self._extract_provider(selected_model)
            uses_own_keys = cost_service.check_user_integration(self.user_session, provider)
            
            # Set request context for LiteLLM callback cost tracking
            nadir_cost_callback.set_request_context(
                request_id=request_id,
                user_id=str(self.user_session.id),
                routing_strategy=routing_strategy,
                uses_own_keys=uses_own_keys,
                metadata={
                    "original_model_requested": selected_model,
                    "litellm_model_mapped": litellm_model,
                    "fallback_models": mapped_fallback_models,
                    "complexity_analysis": complexity_analysis,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "has_tools": bool(tools),
                    "stream": stream
                }
            )
            
            # Build extra LLM kwargs from caller (top_p, frequency_penalty, etc.)
            llm_extra_kwargs: Dict[str, Any] = {}
            for _k in ("top_p", "frequency_penalty", "presence_penalty", "response_format"):
                if _k in kwargs:
                    llm_extra_kwargs[_k] = kwargs[_k]

            # Map reasoning config to provider-specific params
            reasoning_cfg = kwargs.get("reasoning")
            if reasoning_cfg:
                provider_lower = self._extract_provider(selected_model).lower()
                effort = reasoning_cfg.get("effort")
                budget = reasoning_cfg.get("max_tokens")

                if provider_lower == "openai":
                    # o-series models: reasoning_effort
                    if effort:
                        llm_extra_kwargs["reasoning_effort"] = effort
                elif provider_lower == "anthropic":
                    # Claude thinking: thinking param
                    thinking_budget = budget or {"low": 4_000, "medium": 16_000, "high": 64_000}.get(effort, 16_000)
                    llm_extra_kwargs["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
                elif provider_lower == "google":
                    # Gemini 2.5: thinking_config
                    thinking_budget = budget or {"low": 4_000, "medium": 16_000, "high": 64_000}.get(effort, 16_000)
                    llm_extra_kwargs["thinking_config"] = {"thinking_budget": thinking_budget}

            response_data = await asyncio.wait_for(
                self.litellm_service.completion(
                    model=litellm_model,
                    messages=llm_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    tools=tools,
                    stream=stream,
                    fallback_models=mapped_fallback_models,
                    **llm_extra_kwargs
                ),
                timeout=getattr(settings, "LLM_REQUEST_TIMEOUT", 120),
            )
            
            # STEP 6: Extract response details for user
            response_text = ""
            # LiteLLMService returns content directly, not in OpenAI format
            if response_data.get("content"):
                response_text = response_data["content"]
            # Fallback to OpenAI format if needed
            elif response_data.get("choices") and len(response_data["choices"]) > 0:
                choice = response_data["choices"][0]
                if choice.get("message", {}).get("content"):
                    response_text = choice["message"]["content"]
            
            # Zero completion insurance: detect empty/zero-token completions
            is_zero_completion = (
                not response_text or response_text.strip() == ""
                or response_data.get("usage", {}).get("completion_tokens", 0) == 0
            )

            # Calculate costs and metrics using enhanced cost service
            usage = response_data.get("usage", {})
            tokens_in = usage.get("prompt_tokens", 0)
            tokens_out = usage.get("completion_tokens", 0)
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Determine routing strategy and user integration status
            routing_strategy = self._get_routing_strategy()
            provider = self._extract_provider(selected_model)
            uses_own_keys = cost_service.check_user_integration(self.user_session, provider)
            
            # Calculate comprehensive cost breakdown
            cost_breakdown = cost_service.calculate_comprehensive_cost(
                model=selected_model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                routing_strategy=routing_strategy,
                uses_own_keys=uses_own_keys,
                user_session=self.user_session
            )
            
            # Zero completion insurance: override cost to $0
            if is_zero_completion:
                cost_breakdown = CostBreakdown(
                    llm_cost=0.0,
                    routing_fee=0.0,
                    total_cost=0.0,
                    routing_strategy=routing_strategy,
                    uses_own_keys=uses_own_keys,
                    cost_details={"zero_completion_insurance": True, "original_model": selected_model}
                )

            # Use total cost for backward compatibility
            cost = cost_breakdown.total_cost
            
            # STEP 7: Background processing (non-blocking)
            # Start background tasks without waiting for completion

            # Add task to update user budget with actual cost from LiteLLM callback
            # This will happen after the callback processes the accurate cost
            self._safe_background_task(
                self._update_user_budget_from_callback(request_id, str(self.user_session.id))
            )

            self._safe_background_task(
                self._background_processing(
                    request_id=request_id,
                    prompt=prompt,
                    response_text=response_text,
                    selected_model=selected_model,
                    cost=cost_breakdown.total_cost,  # Use total cost from breakdown
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    latency_ms=latency_ms,
                    complexity_analysis=complexity_analysis,
                    system_message=system_message,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    tools=tools,
                    stream=stream,
                    save_full_prompt=save_full_prompt,
                    save_response=save_response,
                    # Pass analytics parameters
                    funnel_tag=funnel_tag,
                    session_id=session_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    nadir_mode=nadir_mode,
                    # Pass cost breakdown for background processing
                    cost_breakdown=cost_breakdown
                )
            )
            
            # STEP 8: Return response to user immediately with complexity analysis
            response_obj = {
                "request_id": request_id,
                "response": response_text,
                "complexity_analysis": complexity_analysis,
                "model_used": selected_model,
                "provider": self._extract_provider(selected_model),
                "usage": usage,
                "cost": {
                    "total_cost_usd": cost_breakdown.total_cost,
                    "llm_cost_usd": cost_breakdown.llm_cost,
                    "routing_fee_usd": cost_breakdown.routing_fee,
                    "routing_strategy": cost_breakdown.routing_strategy,
                    "uses_own_keys": cost_breakdown.uses_own_keys,
                    "prompt_tokens": tokens_in,
                    "completion_tokens": tokens_out,
                    "cost_per_token": cost_breakdown.total_cost / (tokens_in + tokens_out) if (tokens_in + tokens_out) > 0 else 0,
                    "cost_breakdown": cost_breakdown.cost_details
                },
                "latency_ms": latency_ms,
                "model_selection_reasoning": reasoning,
                "timestamp": datetime.utcnow().isoformat(),
                "raw_response": response_data
            }
            
            # Flag zero completion in response
            if is_zero_completion:
                response_obj["zero_completion"] = True

            # Add fallback information if available
            if response_data.get("fallback_used"):
                response_obj["fallback_info"] = {
                    "fallback_used": True,
                    "original_model": response_data.get("original_model"),
                    "fallback_reason": response_data.get("fallback_reason"),
                    "actual_model_used": "gpt-4o-mini"
                }
                # Update model_used to show actual model
                response_obj["model_used"] = "gpt-4o-mini"
                
            return response_obj

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing prompt for request {request_id}: {str(e)}", exc_info=True)

            # Log error event in background
            self._safe_background_task(
                self._log_error_event(
                    request_id=request_id,
                    error=str(e),
                    model=model or "unknown",
                    prompt=prompt
                )
            )

            raise HTTPException(
                status_code=500,
                detail=f"Internal server error processing request {request_id}"
            )
    
    async def _validate_user_budget(self) -> None:
        """Validate user budget before processing request."""
        try:
            if self.user_session.budget_limit and self.user_session.budget_limit > 0:
                if self.user_session.budget_used >= self.user_session.budget_limit:
                    raise HTTPException(
                        status_code=402,
                        detail=f"Budget limit exceeded. Used: ${self.user_session.budget_used:.4f}, Limit: ${self.user_session.budget_limit:.4f}"
                    )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Budget validation error: {e}")
    
    # Track background task failures for monitoring
    _bg_task_failures: int = 0
    _bg_task_successes: int = 0
    _bg_failure_alert_threshold: float = 0.10  # Alert when >10% of tasks fail
    _bg_failure_alert_min_tasks: int = 20      # Minimum tasks before alerting
    _bg_last_alert_at: int = 0                 # Monotonic count at last alert

    def _safe_background_task(self, coro):
        """Create a background task with error handling to prevent unhandled exceptions."""
        task = asyncio.create_task(coro)
        task.add_done_callback(self._background_task_done)
        return task

    @classmethod
    def _background_task_done(cls, task: asyncio.Task):
        """Callback for background tasks to log any exceptions and alert on high failure rate."""
        try:
            exc = task.exception()
            if exc:
                cls._bg_task_failures += 1
                logger.error(
                    "Background task failed [total_failures=%d]: %s: %s",
                    cls._bg_task_failures,
                    type(exc).__name__,
                    exc,
                    exc_info=exc,
                )
                # Check failure rate and alert if threshold exceeded
                cls._check_failure_rate_alert()
            else:
                cls._bg_task_successes += 1
        except asyncio.CancelledError:
            pass

    @classmethod
    def _check_failure_rate_alert(cls):
        """Emit a CRITICAL log when background task failure rate exceeds threshold."""
        total = cls._bg_task_successes + cls._bg_task_failures
        if total < cls._bg_failure_alert_min_tasks:
            return
        failure_rate = cls._bg_task_failures / total
        if failure_rate > cls._bg_failure_alert_threshold and total > cls._bg_last_alert_at:
            cls._bg_last_alert_at = total
            logger.critical(
                "ALERT: Background task failure rate %.1f%% exceeds %.0f%% threshold "
                "(%d failures / %d total). Analytics logging and billing updates "
                "may be failing silently.",
                failure_rate * 100,
                cls._bg_failure_alert_threshold * 100,
                cls._bg_task_failures,
                total,
            )

    @classmethod
    def get_background_task_stats(cls) -> dict:
        """Return background task success/failure counts for health monitoring."""
        total = cls._bg_task_successes + cls._bg_task_failures
        failure_rate = cls._bg_task_failures / total if total > 0 else 0.0
        return {
            "bg_task_successes": cls._bg_task_successes,
            "bg_task_failures": cls._bg_task_failures,
            "bg_task_total": total,
            "bg_task_failure_rate": round(failure_rate, 4),
            "bg_task_healthy": failure_rate <= cls._bg_failure_alert_threshold,
        }

    async def _preprocess_prompt(self, prompt: str, system_message: Optional[str] = None) -> str:
        """
        Preprocess prompt for optimization.
        
        Placeholder for future features like:
        - Prompt compression
        - Context optimization
        - Token reduction
        - Prompt engineering improvements
        """
        # TODO: Implement prompt preprocessing features
        # For now, just return the original prompt
        return prompt
    
    async def _select_best_model(
        self,
        prompt: str,
        system_message: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        providers_override: Optional[List[str]] = None,
        models_override: Optional[List[str]] = None
    ) -> Tuple[Optional[str], str, Dict[str, Any]]:
        """
        Select the best model using recommendation system approach.
        
        This works like a recommendation system that returns the top-ranked model
        based on complexity analysis and user preferences.
        
        Returns:
            Tuple of (selected_model, reasoning, complexity_analysis)
        """
        try:
            # Get user's allowed providers and models
            allowed_providers = providers_override or self.user_session.allowed_providers
            allowed_models = models_override or self.user_session.allowed_models
            
            # Use the complexity analyzer (which includes model recommendation)
            if self.complexity_analyzer:
                try:
                    analysis_result = await self.complexity_analyzer.analyze(
                        text=prompt,
                        system_message=system_message
                    )
                    
                    # Return the analyzer's recommendation
                    if analysis_result and analysis_result.get("recommended_model"):
                        complexity_analysis = {
                            "model_selection_type": "analyzer_recommendation",
                            "selected_model": analysis_result.get("recommended_model"),
                            "task_type": analysis_result.get("task_type", "unknown"),
                            "complexity_score": analysis_result.get("complexity_score", 0.5),
                            "benchmark_model": self.user_session.benchmark_model,
                            "reasoning": analysis_result.get("reasoning", "Selected by analyzer"),
                            "allowed_providers": allowed_providers,
                            "allowed_models": allowed_models,
                            "analyzer_type": settings.COMPLEXITY_ANALYZER_TYPE,
                            "analysis_metadata": analysis_result.get("metadata", {}),
                            "full_analysis": analysis_result,
                            "errors": [],  # Empty errors array when analyzer succeeds
                            # Promote classifier output to the top level so downstream
                            # analytics/metadata builders can log it without having to
                            # reach into `full_analysis`. These are always-safe reads
                            # because analysis_result is a dict.
                            "tier_name": analysis_result.get("tier_name")
                                or analysis_result.get("complexity_name"),
                            "tier": analysis_result.get("tier")
                                or analysis_result.get("complexity_tier"),
                            "tier_probabilities": analysis_result.get("tier_probabilities"),
                            "confidence": analysis_result.get("confidence"),
                            "classifier_version": analysis_result.get("analyzer_version")
                                or analysis_result.get("classifier_version"),
                            "decision_rule": analysis_result.get("decision_rule"),
                            "cost_lambda": analysis_result.get("cost_lambda"),
                            "analyzer_latency_ms": analysis_result.get("analyzer_latency_ms"),
                        }
                        
                        return (
                            analysis_result["recommended_model"],
                            analysis_result.get("reasoning", "Selected by complexity analyzer"),
                            complexity_analysis
                        )
                        
                except Exception as e:
                    primary_analyzer_error = {
                        "analyzer": settings.COMPLEXITY_ANALYZER_TYPE,
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    logger.warning(f"Primary complexity analyzer ({settings.COMPLEXITY_ANALYZER_TYPE}) failed: {e}")
                    
                    # Try two-tower model as fallback when primary analyzer fails
                    logger.info("🏗️ Attempting two-tower fallback after primary analyzer failure")
                    try:
                        from app.complexity.two_tower_analyzer import TwoTowerModelRecommender
                        two_tower_analyzer = TwoTowerModelRecommender(
                            allowed_providers=self.user_session.allowed_providers,
                            allowed_models=self.user_session.allowed_models
                        )
                        
                        two_tower_result = await two_tower_analyzer.analyze(
                            text=prompt,
                            system_message=system_message
                        )
                        
                        if two_tower_result and two_tower_result.get("recommended_model"):
                            logger.info(f"✅ Two-tower fallback successful: {two_tower_result['recommended_model']}")
                            
                            complexity_analysis = {
                                "model_selection_type": "two_tower_fallback",
                                "selected_model": two_tower_result.get("recommended_model"),
                                "task_type": two_tower_result.get("task_type", "unknown"),
                                "complexity_score": two_tower_result.get("complexity_score", 0.5),
                                "benchmark_model": self.user_session.benchmark_model,
                                "reasoning": f"Two-tower fallback: {two_tower_result.get('reasoning', 'Selected by two-tower model')}",
                                "allowed_providers": allowed_providers,
                                "allowed_models": allowed_models,
                                "analyzer_type": "two_tower_fallback",
                                "primary_analyzer_failed": settings.COMPLEXITY_ANALYZER_TYPE,
                                "analysis_metadata": two_tower_result.get("metadata", {}),
                                "full_analysis": two_tower_result,
                                "errors": [primary_analyzer_error]  # Track primary analyzer failure
                            }
                            
                            return (
                                two_tower_result["recommended_model"],
                                f"Two-tower fallback (primary {settings.COMPLEXITY_ANALYZER_TYPE} failed): {two_tower_result.get('reasoning', 'Selected by two-tower model')}",
                                complexity_analysis
                            )
                        else:
                            logger.error("❌ Two-tower fallback returned no model recommendation")
                            
                    except Exception as two_tower_error:
                        two_tower_analyzer_error = {
                            "analyzer": "two_tower_fallback",
                            "error": str(two_tower_error),
                            "error_type": type(two_tower_error).__name__,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        logger.error(f"Two-tower fallback also failed: {two_tower_error}")
                        
                        # Store both errors for final fallback
                        analyzer_errors = [primary_analyzer_error, two_tower_analyzer_error]
                        
                        # Continue to existing fallback logic but with error tracking
                        logger.info("🔄 Using benchmark/simple fallback with error tracking")
            
            # Fallback to benchmark model if available  
            if self.user_session.benchmark_model:
                if not allowed_models or self.user_session.benchmark_model in allowed_models:
                    # Include errors if analyzers failed
                    errors_list = []
                    if 'analyzer_errors' in locals():
                        errors_list = analyzer_errors
                    elif 'primary_analyzer_error' in locals():
                        errors_list = [primary_analyzer_error]
                        
                    complexity_analysis = {
                        "model_selection_type": "benchmark_fallback",
                        "reasoning": "Using user's benchmark model as fallback after analyzer failures" if errors_list else "Using user's benchmark model as fallback",
                        "selected_model": self.user_session.benchmark_model,
                        "benchmark_model": self.user_session.benchmark_model,
                        "allowed_providers": allowed_providers,
                        "allowed_models": allowed_models,
                        "fallback_reason": "Analyzers failed" if errors_list else "Analyzer not available or failed",
                        "errors": errors_list  # Include all analyzer errors
                    }
                    return self.user_session.benchmark_model, "Using user's benchmark model as fallback", complexity_analysis
            
            # Simple fallback selection
            fallback_model = self._simple_fallback_selection(allowed_models, tools)
            
            # Include errors if analyzers failed
            errors_list = []
            if 'analyzer_errors' in locals():
                errors_list = analyzer_errors
            elif 'primary_analyzer_error' in locals():
                errors_list = [primary_analyzer_error]
                
            complexity_analysis = {
                "model_selection_type": "simple_fallback",
                "reasoning": "Using simple fallback selection after analyzer failures" if errors_list else "Using simple fallback selection",
                "selected_model": fallback_model,
                "allowed_providers": allowed_providers,
                "allowed_models": allowed_models,
                "fallback_reason": "All analyzers failed" if errors_list else "No analyzer or benchmark available",
                "errors": errors_list  # Include all analyzer errors
            }
            return fallback_model, "Using simple fallback selection", complexity_analysis
            
        except Exception as e:
            logger.error(f"Benchmark-aware model selection failed: {str(e)}")
            
            # Fallback to simple selection
            try:
                fallback_model = self._simple_fallback_selection(allowed_models, tools)
                complexity_analysis = {
                    "model_selection_type": "error_fallback",
                    "reasoning": f"Fallback due to error: {str(e)}",
                    "selected_model": fallback_model,
                    "error": str(e),
                    "fallback_reason": "benchmark_selector_failed"
                }
                return fallback_model, f"Fallback selection due to error: {str(e)}", complexity_analysis
            except Exception:
                return None, f"Complete model selection failure: {str(e)}", {"error": str(e)}
    
    
    def _map_to_litellm_model(self, model_name: str) -> str:
        """
        Map performance data model names to LiteLLM-compatible model names.

        Uses the centralized model registry for mappings.

        Args:
            model_name: Model name from performance data or elsewhere

        Returns:
            LiteLLM-compatible model name
        """
        if not model_name:
            return "gpt-4o-mini"  # Safe default

        # Check direct mapping from centralized registry
        if model_name in PERFORMANCE_TO_API:
            return PERFORMANCE_TO_API[model_name]

        # If already in LiteLLM format (contains dashes, lowercase), return as-is
        if "-" in model_name and model_name.islower():
            return model_name

        # Case-insensitive fallback
        for perf_name, api_name in PERFORMANCE_TO_API.items():
            if model_name.lower() == perf_name.lower():
                return api_name

        # If no mapping found, return the original (might already be correct)
        logger.warning(f"No API mapping found for model: {model_name}, using as-is")
        return model_name

    def _simple_fallback_selection(self, allowed_models: List[str], tools: Optional[List[Dict[str, Any]]] = None) -> str:
        """Simple fallback when all else fails."""
        if self.user_session.benchmark_model:
            if not allowed_models or self.user_session.benchmark_model in allowed_models:
                logger.info(f"🔄 Using benchmark model as fallback: {self.user_session.benchmark_model}")
                return self.user_session.benchmark_model
        
        if allowed_models:
            fallback_model = allowed_models[0]
            logger.info(f"🔄 Using first allowed model as fallback: {fallback_model} (from {len(allowed_models)} allowed models)")
            return fallback_model
        
        # Last resort defaults
        if tools:
            logger.warning("🔄 Using last resort fallback with tools: gpt-4o")
            return "gpt-4o"  # Good for function calling
        else:
            logger.warning("🔄 Using last resort fallback: gpt-4o-mini")
            return "gpt-4o-mini"  # Cost-effective default
    
    async def _background_processing(
        self,
        request_id: str,
        prompt: str,
        response_text: str,
        selected_model: str,
        cost: float,
        tokens_in: int,
        tokens_out: int,
        latency_ms: int,
        complexity_analysis: Dict[str, Any],
        system_message: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        stream: bool = False,
        save_full_prompt: bool = True,
        save_response: bool = True,
        # Enhanced analytics parameters
        funnel_tag: Optional[str] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        nadir_mode: str = "standard",
        cost_breakdown: Optional[Any] = None
    ) -> None:
        """
        Background processing: logging and clustering (non-blocking).
        
        This runs in the background and doesn't interrupt the main flow.
        """
        try:
            # Step 1: Classify prompt into cluster
            cluster_id = await self.clustering_service.classify_prompt(
                prompt=prompt,
                user_id=self.user_session.id
            )
            
            # Step 2: Log comprehensive analytics using enhanced analytics service
            await self._log_comprehensive_analytics(
                request_id=request_id,
                prompt=prompt if save_full_prompt else None,
                response_text=response_text if save_response else None,
                selected_model=selected_model,
                cost=cost,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                cluster_id=cluster_id,
                complexity_analysis=complexity_analysis,
                system_message=system_message,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=tools,
                stream=stream,
                # Pass analytics parameters
                funnel_tag=funnel_tag,
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                nadir_mode=nadir_mode,
                # Pass cost breakdown for enhanced analytics
                cost_breakdown=cost_breakdown
            )
            
            # Step 3: Add prompt to cluster for learning and save individual record
            if cluster_id:
                try:
                    await self.clustering_service.add_prompt_to_cluster(
                        prompt=prompt,
                        cluster_id=cluster_id,
                        user_id=self.user_session.id,
                        request_id=request_id
                    )
                except Exception as e:
                    logger.warning(f"Failed to add prompt to cluster: {e}")

            # Step 4: Collect training sample for Smart Export / Distillation
            if cluster_id and response_text:
                try:
                    from app.services.training_data_service import TrainingDataService
                    td_service = TrainingDataService()
                    await td_service.collect_sample(
                        user_id=self.user_session.id,
                        cluster_id=cluster_id,
                        prompt=prompt,
                        response=response_text,
                        model_used=selected_model,
                        system_message=system_message,
                        provider_used=complexity_analysis.get("provider") if complexity_analysis else None,
                        tokens_in=tokens_in,
                        tokens_out=tokens_out,
                    )
                except Exception as e:
                    logger.debug(f"Training sample collection skipped: {e}")

        except Exception as e:
            logger.error(f"Background processing failed: {str(e)}")
    
    async def _log_error_event(
        self,
        request_id: str,
        error: str,
        model: str,
        prompt: str
    ) -> None:
        """Log error event in background."""
        try:
            await self._log_usage_event(
                request_id=request_id,
                model_name=model,
                provider="unknown",
                tokens_in=0,
                tokens_out=0,
                cost=0.0,
                route="/v1/chat/completions",
                error=error,
                metadata={"error_type": type(Exception).__name__}
            )
        except Exception as e:
            logger.error(f"Failed to log error event: {str(e)}")

    async def _log_comprehensive_analytics(
        self,
        request_id: str,
        selected_model: str,
        cost: float,
        tokens_in: int,
        tokens_out: int,
        latency_ms: int,
        complexity_analysis: Dict[str, Any],
        prompt: Optional[str] = None,
        response_text: Optional[str] = None,
        cluster_id: Optional[str] = None,
        system_message: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        stream: bool = False,
        funnel_tag: Optional[str] = None,
        tracking_tags: Optional[List[str]] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        nadir_mode: str = "standard",
        cost_breakdown: Optional[CostBreakdown] = None
    ) -> None:
        """
        Log comprehensive analytics using the enhanced analytics service.
        
        This method captures all the analytics data for insights including:
        - Model recommendations and selections
        - Cost analysis and breakdown  
        - Performance metrics
        - Complexity analysis
        - Funnel and tag tracking
        - User journey data
        """
        try:
            # Extract complexity analysis data
            recommended_model = None
            complexity_score = None
            complexity_reasoning = None
            task_type = None
            analyzer_type = settings.COMPLEXITY_ANALYZER_TYPE
            selection_reason = complexity_analysis.get("reasoning", "")
            
            if complexity_analysis:
                # Try to extract recommended model from analysis
                if "selected_model" in complexity_analysis:
                    recommended_model = complexity_analysis["selected_model"]
                elif "recommended_model" in complexity_analysis:
                    recommended_model = complexity_analysis["recommended_model"]
                
                complexity_score = complexity_analysis.get("complexity_score")
                complexity_reasoning = complexity_analysis.get("complexity_reasoning", "")
                task_type = complexity_analysis.get("task_type", "")
            
            # Get API key information from user session
            api_key_id = getattr(self.user_session, 'api_key_id', None)
            api_key_preview = getattr(self.user_session, 'api_key_preview', None)
            
            # If not available, try to get from api_key_config
            if hasattr(self.user_session, 'api_key_config') and self.user_session.api_key_config:
                api_key_id = self.user_session.api_key_config.get('id')
                api_key_preview = self.user_session.api_key_config.get('key_preview')
            
            # Build model analytics
            model_analytics = ModelAnalytics(
                recommended_model=recommended_model,
                selected_model=selected_model,
                selection_reason=selection_reason,
                benchmark_model=getattr(self.user_session, 'benchmark_model', None),
                alternatives=complexity_analysis.get("ranked_models", []),
                complexity_score=complexity_score,
                complexity_reasoning=complexity_reasoning,
                task_type=task_type,
                analyzer_type=analyzer_type,
                analyzer_latency_ms=complexity_analysis.get("analyzer_latency_ms")
            )
            
            # Build cost analytics with detailed breakdown
            if cost_breakdown:
                # Use the detailed cost breakdown provided
                llm_breakdown = cost_breakdown.cost_details.get("llm_cost_breakdown", {})
                cost_analytics = CostAnalytics(
                    total_cost_usd=cost_breakdown.total_cost,
                    cost_per_token=cost_breakdown.cost_details.get("cost_per_token", 0),
                    input_cost_usd=llm_breakdown.get("input_cost_usd", 0),
                    output_cost_usd=llm_breakdown.get("output_cost_usd", 0),
                    routing_fee_usd=cost_breakdown.routing_fee,
                    routing_strategy=cost_breakdown.routing_strategy,
                    uses_own_keys=cost_breakdown.uses_own_keys
                )
            else:
                # Fallback to basic cost calculation
                cost_per_token = cost / (tokens_in + tokens_out) if (tokens_in + tokens_out) > 0 else 0
                # Estimate based on typical ratios (input usually cheaper than output)
                input_cost = cost * 0.3  # Rough estimate
                output_cost = cost * 0.7  # Rough estimate
                
                cost_analytics = CostAnalytics(
                    total_cost_usd=cost,
                    cost_per_token=cost_per_token,
                    input_cost_usd=input_cost,
                    output_cost_usd=output_cost
                )
            
            # Build performance analytics
            performance_analytics = PerformanceAnalytics(
                latency_ms=latency_ms,
                total_tokens=tokens_in + tokens_out,
                prompt_tokens=tokens_in,
                completion_tokens=tokens_out,
                request_size_bytes=len(prompt.encode('utf-8')) if prompt else 0,
                response_size_bytes=len(response_text.encode('utf-8')) if response_text else 0
            )
            
            # Build comprehensive request analytics
            request_analytics = RequestAnalytics(
                request_id=request_id,
                user_id=self.user_session.id,
                api_key_id=api_key_id,
                api_key_preview=api_key_preview,
                session_id=session_id,
                funnel_tag=funnel_tag,
                tracking_tags=tracking_tags,
                endpoint="/v1/chat/completions",
                route="/v1/chat/completions", 
                nadir_mode=nadir_mode,
                prompt=prompt,
                system_message=system_message,
                response=response_text,
                temperature=temperature,
                max_tokens=max_tokens,
                has_tools=bool(tools),
                tool_calls=tools,
                stream=stream,
                model_analytics=model_analytics,
                cost_analytics=cost_analytics,
                performance_analytics=performance_analytics,
                success=True,  # Since we're in the success path
                ip_address=ip_address,
                user_agent=user_agent,
                cluster_id=cluster_id,
                additional_metadata=self._build_classifier_metadata(
                    analyzer_type, complexity_analysis
                )
            )
            
            # Log using the enhanced analytics service
            await analytics_service.log_request_analytics(request_analytics)
            
        except Exception as e:
            logger.error(f"Failed to log comprehensive analytics: {str(e)}")
            
            # Fallback to basic logging
            try:
                await self._log_usage_event(
                    request_id=request_id,
                    model_name=selected_model,
                    provider=self._extract_provider(selected_model),
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    cost=cost,
                    route="/v1/chat/completions",
                    prompt=prompt,
                    response=response_text,
                    latency_ms=latency_ms,
                    cluster_id=cluster_id,
                    metadata={
                        "system_message": system_message,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "has_tools": bool(tools),
                        "complexity_analyzer": settings.COMPLEXITY_ANALYZER_TYPE,
                        "analyzer_type": settings.COMPLEXITY_ANALYZER_TYPE,
                        "classifier_tier": complexity_analysis.get("tier_name") or complexity_analysis.get("complexity_name"),
                        "confidence": complexity_analysis.get("confidence"),
                        "classifier_version": complexity_analysis.get("classifier_version"),
                        "stream": stream,
                        "complexity_analysis": complexity_analysis,
                        "analytics_error": str(e)
                    }
                )
            except Exception as fallback_error:
                logger.error(f"Both comprehensive and fallback logging failed: {fallback_error}")

    @staticmethod
    def _build_classifier_metadata(
        analyzer_type: str, complexity_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build additional_metadata ensuring classifier fields are present for the learning service.

        Captures both the `analyzer_type` (which factory key was used —
        e.g. ``wide_deep_asym`` / ``binary`` / ``trained``) and the analyzer's
        own versioned identifier (``classifier_version`` / ``analyzer_version``
        — e.g. ``wide_deep_asym_v3``). For classifier-style analyzers we also
        persist the tier probabilities and the decision rule / λ so Supabase
        rows can be filtered or re-scored offline.
        """
        metrics = complexity_analysis.get("extracted_metrics", {})
        full = complexity_analysis.get("full_analysis", {}) or {}

        meta: Dict[str, Any] = {
            "complexity_analyzer": analyzer_type,
            "full_complexity_analysis": complexity_analysis,
        }
        meta["analyzer_type"] = analyzer_type
        meta["classifier_tier"] = (
            metrics.get("reasoning_depth")
            or complexity_analysis.get("tier_name")
            or complexity_analysis.get("complexity_name")
            or full.get("tier_name")
            or full.get("complexity_name")
        )
        meta["confidence"] = (
            metrics.get("confidence")
            or complexity_analysis.get("confidence")
            or full.get("confidence")
        )
        meta["classifier_version"] = (
            metrics.get("classifier_version")
            or complexity_analysis.get("classifier_version")
            or full.get("analyzer_version")
            or full.get("classifier_version")
        )
        # Tier probabilities + decision-rule config (when the analyzer emits them).
        tier_probs = complexity_analysis.get("tier_probabilities") or full.get("tier_probabilities")
        if tier_probs is not None:
            meta["tier_probabilities"] = tier_probs
        decision_rule = complexity_analysis.get("decision_rule") or full.get("decision_rule")
        if decision_rule is not None:
            meta["decision_rule"] = decision_rule
        cost_lambda = complexity_analysis.get("cost_lambda") or full.get("cost_lambda")
        if cost_lambda is not None:
            meta["cost_lambda"] = cost_lambda
        analyzer_latency_ms = (
            complexity_analysis.get("analyzer_latency_ms") or full.get("analyzer_latency_ms")
        )
        if analyzer_latency_ms is not None:
            meta["analyzer_latency_ms"] = analyzer_latency_ms
        return meta

    def _get_routing_strategy(self) -> str:
        """Get the routing strategy from user session."""
        try:
            # Check API key configuration first
            if hasattr(self.user_session, 'api_key_config') and self.user_session.api_key_config:
                sort_strategy = self.user_session.api_key_config.get("sort_strategy")
                if sort_strategy:
                    return sort_strategy
                
                # Check model parameters
                model_params = self.user_session.api_key_config.get("model_parameters", {})
                if model_params.get("sort"):
                    return model_params["sort"]
            
            # Default to smart routing
            return "smart-routing"
            
        except Exception as e:
            logger.warning(f"Error getting routing strategy: {e}")
            return "smart-routing"
    
    def _extract_provider(self, model: str) -> str:
        """Extract provider name from model string."""
        model_lower = model.lower()
        
        if "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        elif "gemini" in model_lower or "google" in model_lower:
            return "google"
        elif "llama" in model_lower:
            return "meta"
        else:
            return "unknown"
    
    async def _log_usage_event(
        self,
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
        """Log usage event to Supabase."""
        try:
            await log_usage_event(
                user_id=self.user_session.id,
                request_id=request_id,
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
            logger.error(f"Failed to log usage event: {str(e)}")
    
    async def estimate_cost(
        self,
        prompt: str,
        system_message: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Estimate the cost of a request without executing it."""
        try:
            # Select model if not specified
            if not model:
                selected_model, reasoning, _ = await self._select_best_model(
                    prompt=prompt,
                    system_message=system_message
                )
            else:
                selected_model = model
                reasoning = f"User specified model: {model}"
            
            if not selected_model:
                return {"error": "No suitable model found"}
            
            # Estimate token count (rough approximation)
            full_prompt = f"{system_message}\n{prompt}" if system_message else prompt
            estimated_tokens_in = len(full_prompt.split()) * 1.3  # Rough token estimation
            estimated_tokens_out = max_tokens or 150  # Default estimate
            
            # Get routing strategy and user integration status
            routing_strategy = self._get_routing_strategy()
            provider = self._extract_provider(selected_model)
            uses_own_keys = cost_service.check_user_integration(self.user_session, provider)
            
            # Calculate comprehensive cost estimate
            cost_breakdown = cost_service.estimate_cost(
                model=selected_model,
                estimated_tokens_in=int(estimated_tokens_in),
                estimated_tokens_out=int(estimated_tokens_out),
                routing_strategy=routing_strategy,
                uses_own_keys=uses_own_keys
            )
            
            return {
                "model": selected_model,
                "estimated_tokens_in": int(estimated_tokens_in),
                "estimated_tokens_out": int(estimated_tokens_out),
                "estimated_cost_usd": cost_breakdown.total_cost,
                "llm_cost_usd": cost_breakdown.llm_cost,
                "routing_fee_usd": cost_breakdown.routing_fee,
                "routing_strategy": cost_breakdown.routing_strategy,
                "uses_own_keys": cost_breakdown.uses_own_keys,
                "cost_breakdown": cost_breakdown.cost_details,
                "model_selection_reasoning": reasoning
            }
            
        except Exception as e:
            logger.error(f"Error estimating cost: {str(e)}")
            return {"error": str(e)}
    
    async def _update_user_budget_from_callback(self, request_id: str, user_id: str):
        """
        Update user budget using actual cost from LiteLLM callback.
        
        This method waits for the callback to process the cost and then updates
        the user's budget_used field with the accurate total cost.
        
        Args:
            request_id: The request ID to find the cost for
            user_id: The user ID to update budget for
        """
        try:
            # Wait a moment for the LiteLLM callback to process and store the cost
            await asyncio.sleep(1)
            
            # Retry logic to get the cost record from callback
            max_retries = 5
            retry_delay = 0.5
            cost_record = None
            
            for attempt in range(max_retries):
                try:
                    # Get the most recent cost record for this request
                    result = supabase.table("cost_usage").select("*").eq("request_id", request_id).order("created_at", desc=True).limit(1).execute()
                    
                    if result.data:
                        cost_record = result.data[0]
                        break
                    else:
                        logger.debug(f"Cost record not found for request {request_id}, attempt {attempt + 1}/{max_retries}")
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 1.5  # Exponential backoff
                
                except Exception as e:
                    logger.warning(f"Error fetching cost record for request {request_id}, attempt {attempt + 1}: {str(e)}")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 1.5
            
            if not cost_record:
                logger.warning(f"Could not find cost record for request {request_id} after {max_retries} attempts — using estimated cost as fallback")
                # Use estimated cost from the original request metadata to prevent financial leakage
                try:
                    ctx = nadir_cost_callback.get_request_context(request_id)
                    if ctx and ctx.get("metadata", {}).get("complexity_analysis", {}).get("estimated_cost"):
                        estimated = float(ctx["metadata"]["complexity_analysis"]["estimated_cost"])
                        await cost_tracking_service.update_user_budget_used(user_id, estimated)
                        logger.info(f"Applied estimated cost ${estimated:.6f} for request {request_id}")
                except Exception as fallback_err:
                    logger.error(f"Estimated cost fallback also failed for {request_id}: {fallback_err}")
                return
            
            # Update user budget with the accurate total cost
            total_cost = float(cost_record["total_cost_usd"])
            await cost_tracking_service.update_user_budget_used(user_id, total_cost)
            
            logger.info(f"Updated user {user_id} budget with ${total_cost:.6f} from request {request_id}")
            
        except Exception as e:
            logger.error(f"Error updating user budget from callback: {str(e)}")