"""
LiteLLM Custom Callback for Accurate Cost Tracking with Nadir Routing Fees.

This callback captures actual LLM costs from LiteLLM responses and combines them
with Nadir's routing fees for accurate billing.
"""
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass

from litellm.integrations.custom_logger import CustomLogger
from app.services.cost_calculation_service import cost_service
from app.auth.supabase_auth import supabase

logger = logging.getLogger(__name__)


@dataclass
class CostTrackingData:
    """Data structure for cost tracking information."""
    request_id: str
    user_id: str
    model_name: str
    provider: str
    routing_strategy: str = "smart-routing"
    uses_own_keys: bool = False
    metadata: Optional[Dict[str, Any]] = None


class NadirCostCallback(CustomLogger):
    """
    Custom LiteLLM callback for accurate cost tracking.
    
    This callback:
    1. Captures actual LLM costs from LiteLLM response
    2. Calculates Nadir routing fees
    3. Stores detailed cost breakdown in cost_usage table
    """
    
    def __init__(self):
        """Initialize the cost callback."""
        super().__init__()
        self.pending_requests: Dict[str, CostTrackingData] = {}
    
    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        """Sync success callback - should be called for sync completions."""
        logger.info(f"🔔 SYNC SUCCESS CALLBACK TRIGGERED!")
    
    def log_failure_event(self, kwargs, response_obj, start_time, end_time):
        """Sync failure callback."""
        logger.info(f"🔔 SYNC FAILURE CALLBACK TRIGGERED!")
    
    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        """Async failure callback."""
        logger.info(f"🔔 ASYNC FAILURE CALLBACK TRIGGERED!")
        
    def set_request_context(
        self,
        request_id: str,
        user_id: str,
        routing_strategy: str = "smart-routing",
        uses_own_keys: bool = False,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Set context for the current request before making LiteLLM call.
        
        Args:
            request_id: Unique request identifier
            user_id: User making the request
            routing_strategy: Routing strategy used (smart-routing, load-balancing, fallback)
            uses_own_keys: Whether user provided their own API keys
            metadata: Additional metadata to store
        """
        # Store context for this request - we'll match it in the callback
        self.pending_requests[request_id] = CostTrackingData(
            request_id=request_id,
            user_id=user_id,
            model_name="",  # Will be filled from LiteLLM response
            provider="",    # Will be filled from LiteLLM response
            routing_strategy=routing_strategy,
            uses_own_keys=uses_own_keys,
            metadata=metadata or {}
        )
    
    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        """
        Log successful LiteLLM API call with accurate cost tracking.
        
        This method is called by LiteLLM after a successful API call.
        According to LiteLLM docs, this should be the correct signature.
        """
        try:
            logger.info(f"🔔 LITELLM CALLBACK TRIGGERED! Pending requests: {len(self.pending_requests)}")
            logger.info(f"📋 Available kwargs keys: {list(kwargs.keys())}")
            logger.info(f"🔍 Log event type: {kwargs.get('log_event_type', 'not_set')}")
            logger.debug(f"Pending request IDs: {list(self.pending_requests.keys())}")
            
            # Extract actual cost from LiteLLM response as per documentation
            actual_llm_cost = kwargs.get("response_cost", 0.0)
            logger.info(f"💰 Response cost from LiteLLM: ${actual_llm_cost}")
            
            # Extract model and usage information
            model_name = kwargs.get("model", "unknown")
            
            # Get usage tokens from response
            usage = getattr(response_obj, 'usage', None) if response_obj else None
            prompt_tokens = getattr(usage, 'prompt_tokens', 0) if usage else 0
            completion_tokens = getattr(usage, 'completion_tokens', 0) if usage else 0
            total_tokens = prompt_tokens + completion_tokens
            
            # Find matching request context
            request_context = None
            request_id = None
            
            # Try to match by exact model name first, then by any pending request
            for rid, context in list(self.pending_requests.items()):
                # Check if model matches or if context doesn't have a model yet
                if (context.model_name == model_name or 
                    not context.model_name or 
                    model_name in context.metadata.get("litellm_model_mapped", "")):
                    request_context = context
                    request_id = rid
                    context.model_name = model_name
                    context.provider = self._extract_provider(model_name)
                    # Remove from pending requests to avoid duplicate matching
                    break
            
            # If still no match, try to find by timing (most recent request)
            if not request_context and self.pending_requests:
                # Use the most recently added request (likely the current one)
                request_id = list(self.pending_requests.keys())[-1]
                request_context = self.pending_requests[request_id]
                request_context.model_name = model_name
                request_context.provider = self._extract_provider(model_name)
            
            if not request_context:
                logger.warning(f"No request context found for model {model_name}, creating default")
                request_id = f"litellm_{datetime.utcnow().timestamp()}"
                request_context = CostTrackingData(
                    request_id=request_id,
                    user_id="unknown", 
                    model_name=model_name,
                    provider=self._extract_provider(model_name),
                    routing_strategy="smart-routing",
                    uses_own_keys=False,
                    metadata={}
                )
            
            # Zero completion insurance: if no completion tokens, cost is $0
            if completion_tokens == 0:
                actual_llm_cost = 0.0
                routing_fee = 0.0
                total_cost = 0.0
                logger.info(f"Zero completion detected for request {request_context.request_id} — cost set to $0")
            else:
                # Calculate routing fee using our cost service
                routing_fee = cost_service._calculate_routing_fee(
                    request_context.routing_strategy,
                    request_context.uses_own_keys
                )
                total_cost = actual_llm_cost + routing_fee
            
            # Calculate per-token costs
            cost_per_token = total_cost / total_tokens if total_tokens > 0 else 0
            cost_per_input_token = actual_llm_cost * 0.3 / prompt_tokens if prompt_tokens > 0 else 0  # Rough estimate
            cost_per_output_token = actual_llm_cost * 0.7 / completion_tokens if completion_tokens > 0 else 0  # Rough estimate
            
            # Store in cost_usage table
            await self._store_cost_usage(
                request_id=request_context.request_id,
                user_id=request_context.user_id,
                model_name=model_name,
                provider=request_context.provider,
                llm_cost_usd=actual_llm_cost,
                routing_fee_usd=routing_fee,
                total_cost_usd=total_cost,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                routing_strategy=request_context.routing_strategy,
                uses_own_keys=request_context.uses_own_keys,
                cost_per_token=cost_per_token,
                cost_per_input_token=cost_per_input_token,
                cost_per_output_token=cost_per_output_token,
                metadata={
                    **request_context.metadata,
                    "litellm_response_cost": actual_llm_cost,
                    "start_time": start_time.isoformat() if start_time else None,
                    "end_time": end_time.isoformat() if end_time else None,
                    "duration_ms": (end_time - start_time).total_seconds() * 1000 if start_time and end_time else None
                }
            )
            
            # Clean up request context
            if request_id in self.pending_requests:
                del self.pending_requests[request_id]
                
            logger.info(f"Cost tracked: Request {request_context.request_id}, LLM: ${actual_llm_cost:.6f}, Routing: ${routing_fee:.6f}, Total: ${total_cost:.6f}")
            
        except Exception as e:
            logger.error(f"Error in cost tracking callback: {str(e)}")
    
    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        """
        Log failed LiteLLM API call.
        
        Args:
            kwargs: LiteLLM call parameters
            response_obj: LiteLLM response object (may be None)
            start_time: Call start time
            end_time: Call completion time
        """
        try:
            model_name = kwargs.get("model", "unknown")
            
            # Find and clean up matching request context
            request_id = None
            for rid, context in list(self.pending_requests.items()):
                if not context.model_name or context.model_name == model_name:
                    request_id = rid
                    del self.pending_requests[rid]
                    break
            
            logger.warning(f"LiteLLM call failed for model {model_name}, request {request_id}")
            
        except Exception as e:
            logger.error(f"Error in failure tracking callback: {str(e)}")
    
    def _extract_provider(self, model: str) -> str:
        """Extract provider from model name."""
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
    
    async def _store_cost_usage(
        self,
        request_id: str,
        user_id: str,
        model_name: str,
        provider: str,
        llm_cost_usd: float,
        routing_fee_usd: float,
        total_cost_usd: float,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        routing_strategy: str,
        uses_own_keys: bool,
        cost_per_token: float,
        cost_per_input_token: float,
        cost_per_output_token: float,
        metadata: Dict[str, Any]
    ):
        """Store cost usage data in Supabase."""
        try:
            # Use the global supabase client
            
            # Prepare cost usage record with proper type conversion
            def safe_float(value):
                """Convert any numeric type to Python float for JSON serialization."""
                try:
                    return float(value) if value is not None else 0.0
                except (TypeError, ValueError):
                    return 0.0
            
            def safe_int(value):
                """Convert any numeric type to Python int for JSON serialization."""
                try:
                    return int(value) if value is not None else 0
                except (TypeError, ValueError):
                    return 0
            
            # Ensure all metadata values are JSON serializable
            clean_metadata = {}
            for key, value in metadata.items():
                if isinstance(value, (int, float, str, bool, list, dict, type(None))):
                    clean_metadata[key] = value
                else:
                    # Convert non-serializable types to string
                    clean_metadata[key] = str(value)
            
            cost_record = {
                "request_id": str(request_id),
                "user_id": str(user_id),
                "model_name": str(model_name),
                "provider": str(provider),
                "llm_cost_usd": safe_float(llm_cost_usd),
                "input_cost_usd": safe_float(llm_cost_usd * 0.3),  # Rough split - could be more accurate
                "output_cost_usd": safe_float(llm_cost_usd * 0.7),
                "routing_fee_usd": safe_float(routing_fee_usd),
                "total_cost_usd": safe_float(total_cost_usd),
                "prompt_tokens": safe_int(prompt_tokens),
                "completion_tokens": safe_int(completion_tokens),
                "total_tokens": safe_int(total_tokens),
                "routing_strategy": str(routing_strategy),
                "uses_own_keys": bool(uses_own_keys),
                "cost_per_token": safe_float(cost_per_token),
                "cost_per_input_token": safe_float(cost_per_input_token),
                "cost_per_output_token": safe_float(cost_per_output_token),
                "metadata": clean_metadata
            }
            
            # Insert into cost_usage table
            logger.info(f"💰 Attempting to store cost record for request {request_id}: ${total_cost_usd:.6f}")
            logger.debug(f"Cost record data: {cost_record}")
            
            result = supabase.table("cost_usage").insert(cost_record).execute()
            
            if result.data:
                logger.info(f"✅ Cost usage stored successfully for request {request_id}: ${total_cost_usd:.6f}")
            else:
                logger.error(f"❌ Failed to store cost usage for request {request_id}")
                logger.error(f"Insert result: {result}")
                
        except Exception as e:
            logger.error(f"❌ Error storing cost usage: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")


# Global instance
nadir_cost_callback = NadirCostCallback()

# Implement callback function exactly as per LiteLLM documentation
def track_cost_callback(
    kwargs,                 # kwargs to completion
    completion_response,    # response from completion
    start_time, end_time    # start/end time
):
    """
    LiteLLM success callback function following the official documentation pattern.
    This should be called automatically by LiteLLM after successful completions.
    """
    try:
        logger.info(f"🔔 LITELLM SUCCESS CALLBACK TRIGGERED!")
        logger.info(f"📋 Available kwargs keys: {list(kwargs.keys())}")
        
        # Extract cost exactly as shown in LiteLLM docs
        response_cost = kwargs.get("response_cost", 0.0)  # litellm calculates response cost for you
        model = kwargs.get("model", "unknown")
        
        logger.info(f"💰 LiteLLM tracked cost: ${response_cost} for model: {model}")
        
        if response_cost > 0:
            logger.info(f"✅ Cost detected! Will implement cost_usage insertion here")
            
            # Extract additional data for cost_usage table insertion
            prompt_tokens = 0
            completion_tokens = 0
            
            # Try to get usage from kwargs or completion_response
            if hasattr(completion_response, 'usage'):
                usage = completion_response.usage
                prompt_tokens = getattr(usage, 'prompt_tokens', 0)
                completion_tokens = getattr(usage, 'completion_tokens', 0)
            
            # Get model and provider info
            provider = _extract_provider_from_model(model)
            
            logger.info(f"📊 Usage: {prompt_tokens} prompt + {completion_tokens} completion = {prompt_tokens + completion_tokens} total tokens")
            logger.info(f"🏢 Provider: {provider}")
            
            # Insert into cost_usage table with proper data structure (synchronous)
            _sync_insert_cost_usage_record(
                request_id=f"litellm_{datetime.utcnow().timestamp()}",
                user_id="ad4046d6-9994-4042-9c6e-2e378c3e64f3",  # Use test user ID for now
                model_name=model,
                provider=provider,
                llm_cost_usd=response_cost,
                routing_fee_usd=0.002,  # Standard routing fee for smart routing
                total_cost_usd=response_cost + 0.002,  # Include routing fee in total
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                metadata={
                    "litellm_callback": True,
                    "callback_timestamp": datetime.utcnow().isoformat(),
                    "model_used": model,
                    "provider_detected": provider,
                    "uses_byok": _detect_byok_from_context(),
                    "routing_strategy": "smart-routing"
                }
            )

            # Process fund deduction for accurate cost tracking
            try:
                from app.services.funds_validation_service import funds_service
                from decimal import Decimal

                # Create cost breakdown for fund deduction
                from app.services.funds_validation_service import CostBreakdown
                _is_byok = _detect_byok_from_context()
                cost_breakdown = CostBreakdown(
                    base_llm_cost_usd=Decimal(str(response_cost)),
                    routing_fee_usd=Decimal('0.002'),
                    total_cost_usd=Decimal(str(response_cost)) + Decimal('0.002'),
                    uses_byok=_is_byok,
                    routing_strategy="smart-routing",
                    estimated_tokens=prompt_tokens + completion_tokens
                )
                
                # Note: Fund deduction should ideally be handled in the main request flow
                # This is a backup to ensure accurate cost tracking from LiteLLM callbacks
                logger.info(f"💰 LiteLLM callback tracked: ${cost_breakdown.total_cost_usd:.6f} for model {model}")
                
            except Exception as fund_error:
                logger.error(f"Error processing fund deduction in callback: {fund_error}")
                # Don't fail the callback if fund processing fails
            
        else:
            logger.warning(f"⚠️ No response_cost found in kwargs for model {model}")
            
    except Exception as e:
        logger.error(f"❌ Error in track_cost_callback: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")

def _extract_provider_from_model(model_name: str) -> str:
    """Extract provider from model name."""
    model_lower = model_name.lower()
    if 'gpt' in model_lower or 'openai' in model_lower:
        return 'openai'
    elif 'claude' in model_lower or 'anthropic' in model_lower:
        return 'anthropic'
    elif 'gemini' in model_lower or 'google' in model_lower:
        return 'google'
    elif 'bedrock' in model_lower or 'amazon' in model_lower:
        return 'amazon'
    else:
        return 'unknown'


def _detect_byok_from_context() -> bool:
    """Detect BYOK status from the most recent pending request context."""
    try:
        if nadir_cost_callback.pending_requests:
            latest = list(nadir_cost_callback.pending_requests.values())[-1]
            return latest.uses_own_keys
    except Exception as e:
        logger.debug("BYOK detection failed, defaulting to False: %s", e)
    return False

def _sync_insert_cost_usage_record(
    request_id: str,
    user_id: str,
    model_name: str,
    provider: str,
    llm_cost_usd: float,
    routing_fee_usd: float,
    total_cost_usd: float,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    metadata: Dict[str, Any]
):
    """Insert cost usage record into Supabase cost_usage table (synchronous version for callback)."""
    try:
        # Prepare cost usage record with proper type conversion
        def safe_float(value):
            """Convert any numeric type to Python float for JSON serialization."""
            try:
                return float(value) if value is not None else 0.0
            except (TypeError, ValueError):
                return 0.0
        
        def safe_int(value):
            """Convert any numeric type to Python int for JSON serialization."""
            try:
                return int(value) if value is not None else 0
            except (TypeError, ValueError):
                return 0
        
        # Ensure all metadata values are JSON serializable
        clean_metadata = {}
        for key, value in metadata.items():
            if isinstance(value, (int, float, str, bool, list, dict, type(None))):
                clean_metadata[key] = value
            else:
                # Convert non-serializable types to string
                clean_metadata[key] = str(value)
        
        cost_record = {
            "request_id": str(request_id),
            "user_id": str(user_id),
            "model_name": str(model_name),
            "provider": str(provider),
            "llm_cost_usd": safe_float(llm_cost_usd),
            "input_cost_usd": safe_float(llm_cost_usd * 0.3),  # Rough split - could be more accurate
            "output_cost_usd": safe_float(llm_cost_usd * 0.7),
            "routing_fee_usd": safe_float(routing_fee_usd),
            "total_cost_usd": safe_float(total_cost_usd),
            "prompt_tokens": safe_int(prompt_tokens),
            "completion_tokens": safe_int(completion_tokens),
            "total_tokens": safe_int(total_tokens),
            "routing_strategy": "smart-routing",  # Default value
            "uses_own_keys": False,  # Default value
            "cost_per_token": safe_float(total_cost_usd / total_tokens) if total_tokens > 0 else 0.0,
            "cost_per_input_token": safe_float((llm_cost_usd * 0.3) / prompt_tokens) if prompt_tokens > 0 else 0.0,
            "cost_per_output_token": safe_float((llm_cost_usd * 0.7) / completion_tokens) if completion_tokens > 0 else 0.0,
            "metadata": clean_metadata
        }
        
        # Insert into cost_usage table
        logger.info(f"💰 Attempting to store cost record from function callback: {request_id} = ${total_cost_usd:.6f}")
        logger.debug(f"Cost record data: {cost_record}")
        
        result = supabase.table("cost_usage").insert(cost_record).execute()
        
        if result.data:
            logger.info(f"✅ Cost usage stored successfully from function callback: {request_id} = ${total_cost_usd:.6f}")
        else:
            logger.error(f"❌ Failed to store cost usage from function callback: {request_id}")
            logger.error(f"Insert result: {result}")
            
    except Exception as e:
        logger.error(f"❌ Error storing cost usage from function callback: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")