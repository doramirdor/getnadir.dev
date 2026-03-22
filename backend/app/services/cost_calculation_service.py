"""
Enhanced cost calculation service for Nadir with routing fees and user integration support.

This service implements the cost structure:
- LLM model costs (based on actual model pricing)
- $0.002 routing fee for smart routing
- $0 additional cost for load balancing 
- $0 additional cost for fallback usage
- $0 routing fee if user uses their own API keys (user integration)
"""
import logging
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CostBreakdown:
    """Detailed cost breakdown for a request."""
    llm_cost: float  # Cost of the actual LLM call
    routing_fee: float  # Cost of Nadir routing service
    total_cost: float  # Total cost charged to user
    routing_strategy: str  # Strategy used (smart-routing, load-balancing, fallback)
    uses_own_keys: bool  # Whether user uses their own API keys
    cost_details: Dict[str, Any]  # Additional cost details


class CostCalculationService:
    """Enhanced cost calculation service with routing fees and user integration support."""
    
    # Routing fees
    SMART_ROUTING_FEE = 0.002  # $0.002 per request for smart routing
    LOAD_BALANCING_FEE = 0.0   # $0 per request for load balancing
    FALLBACK_FEE = 0.0         # $0 per request for fallback
    
    # Updated model pricing (cost per 1K tokens)
    MODEL_PRICING = {
        # OpenAI Models
        "gpt-4": {"input": 0.03, "output": 0.06},
        "gpt-4-turbo": {"input": 0.01, "output": 0.03},
        "gpt-4-turbo-preview": {"input": 0.01, "output": 0.03},
        "gpt-4o": {"input": 0.005, "output": 0.015},
        "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
        "gpt-3.5-turbo": {"input": 0.001, "output": 0.002},
        "gpt-4.1": {"input": 0.005, "output": 0.01},
        "gpt-4.1-mini": {"input": 0.001, "output": 0.002},
        "gpt-4.1-nano": {"input": 0.0005, "output": 0.001},
        "o3": {"input": 0.06, "output": 0.24},
        "o3-mini": {"input": 0.006, "output": 0.024},
        
        # Anthropic Claude Models
        "claude-3-opus": {"input": 0.015, "output": 0.075},
        "claude-3-sonnet": {"input": 0.003, "output": 0.015},
        "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
        "claude-3.5-sonnet": {"input": 0.003, "output": 0.015},
        "claude-3.5-haiku": {"input": 0.001, "output": 0.005},
        "claude-3-7-sonnet": {"input": 0.003, "output": 0.015},
        "claude-sonnet-4": {"input": 0.006, "output": 0.03},
        "claude-opus-4": {"input": 0.018, "output": 0.09},
        "claude-haiku-4": {"input": 0.001, "output": 0.005},
        
        # Google Gemini Models
        "gemini-pro": {"input": 0.0005, "output": 0.0015},
        "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
        "gemini-1.5-flash": {"input": 0.000075, "output": 0.0003},
        "gemini-2.0-pro": {"input": 0.00125, "output": 0.005},
        "gemini-2.0-flash": {"input": 0.000075, "output": 0.0003},
        "gemini-2.5-pro": {"input": 0.00125, "output": 0.005},
        "gemini-2.5-flash": {"input": 0.000075, "output": 0.0003},
        
        # Default pricing for unknown models
        "default": {"input": 0.001, "output": 0.002}
    }
    
    def __init__(self):
        """Initialize the cost calculation service."""
        pass
    
    def calculate_comprehensive_cost(
        self,
        model: str,
        tokens_in: int,
        tokens_out: int,
        routing_strategy: str = "smart-routing",
        uses_own_keys: bool = False,
        user_session: Optional[Any] = None
    ) -> CostBreakdown:
        """
        Calculate comprehensive cost including LLM costs and routing fees.
        
        Args:
            model: Model name used for the request
            tokens_in: Number of input tokens
            tokens_out: Number of output tokens
            routing_strategy: Routing strategy used (smart-routing, load-balancing, fallback)
            uses_own_keys: Whether user uses their own API keys for the provider
            user_session: User session data (for future extensions)
            
        Returns:
            CostBreakdown with detailed cost information
        """
        try:
            # Calculate base LLM cost
            llm_cost = self._calculate_llm_cost(model, tokens_in, tokens_out)
            
            # Calculate routing fee based on strategy and user integration
            routing_fee = self._calculate_routing_fee(routing_strategy, uses_own_keys)
            
            # Total cost with ceiling
            total_cost = llm_cost + routing_fee
            if total_cost > self.MAX_COST_PER_REQUEST:
                logger.warning(
                    f"Cost ${total_cost:.4f} exceeds ${self.MAX_COST_PER_REQUEST} ceiling for model={model}, "
                    f"tokens_in={tokens_in}, tokens_out={tokens_out} — capping"
                )
                total_cost = self.MAX_COST_PER_REQUEST

            return CostBreakdown(
                llm_cost=llm_cost,
                routing_fee=routing_fee,
                total_cost=total_cost,
                routing_strategy=routing_strategy,
                uses_own_keys=uses_own_keys,
                cost_details={
                    "model": model,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "total_tokens": tokens_in + tokens_out,
                    "cost_per_token": total_cost / (tokens_in + tokens_out) if (tokens_in + tokens_out) > 0 else 0,
                    "llm_cost_breakdown": self._get_llm_cost_breakdown(model, tokens_in, tokens_out),
                    "routing_fee_reason": self._get_routing_fee_reason(routing_strategy, uses_own_keys)
                }
            )
            
        except Exception as e:
            logger.error(f"Error calculating comprehensive cost: {str(e)}")
            # Return safe fallback
            return CostBreakdown(
                llm_cost=0.0,
                routing_fee=0.0,
                total_cost=0.0,
                routing_strategy=routing_strategy,
                uses_own_keys=uses_own_keys,
                cost_details={"error": str(e)}
            )
    
    # Safety limits
    MAX_TOKENS_PER_FIELD = 1_000_000
    MAX_COST_PER_REQUEST = 10.0  # $10 ceiling

    def _calculate_llm_cost(self, model: str, tokens_in: int, tokens_out: int) -> float:
        """Calculate the cost of the LLM call itself.

        Uses LiteLLM's built-in pricing database (always up-to-date) as the
        primary source, falling back to the hardcoded MODEL_PRICING table only
        when LiteLLM doesn't know the model.
        """
        # Clamp token counts to prevent abuse
        tokens_in = min(max(tokens_in, 0), self.MAX_TOKENS_PER_FIELD)
        tokens_out = min(max(tokens_out, 0), self.MAX_TOKENS_PER_FIELD)

        # Primary: use LiteLLM's pricing database (covers 1000+ models, auto-updated)
        try:
            import litellm
            litellm_pricing = litellm.model_cost.get(model, {})
            if litellm_pricing:
                input_cpt = litellm_pricing.get("input_cost_per_token", 0)
                output_cpt = litellm_pricing.get("output_cost_per_token", 0)
                if input_cpt > 0 or output_cpt > 0:
                    total = (tokens_in * input_cpt) + (tokens_out * output_cpt)
                    return round(total, 6)
        except Exception as e:
            logger.debug("LiteLLM pricing lookup failed for %s: %s", model, e)

        # Fallback: hardcoded MODEL_PRICING table (per 1K tokens)
        model_key = self._find_model_key(model)
        pricing = self.MODEL_PRICING.get(model_key, self.MODEL_PRICING["default"])

        input_cost = pricing["input"]
        output_cost = pricing["output"]

        total_llm_cost = (tokens_in / 1000 * input_cost) + (tokens_out / 1000 * output_cost)
        return round(total_llm_cost, 6)
    
    def _calculate_routing_fee(self, routing_strategy: str, uses_own_keys: bool) -> float:
        """Calculate the routing fee based on strategy and user integration."""
        if uses_own_keys:
            # No routing fee if user uses their own API keys
            return 0.0
        
        # Apply routing fees based on strategy
        if routing_strategy == "smart-routing":
            return self.SMART_ROUTING_FEE
        elif routing_strategy == "load-balancing":
            return self.LOAD_BALANCING_FEE
        elif routing_strategy == "fallback":
            return self.FALLBACK_FEE
        else:
            # Default to smart routing fee for unknown strategies
            return self.SMART_ROUTING_FEE
    
    def _find_model_key(self, model: str) -> str:
        """Find the best matching model key in pricing data."""
        model_lower = model.lower()
        
        # Direct match
        if model_lower in self.MODEL_PRICING:
            return model_lower
        
        # Partial match - find models that contain the search term
        for key in self.MODEL_PRICING.keys():
            if key in model_lower or any(part in model_lower for part in key.split("-")):
                return key
        
        # No match found, use default
        return "default"
    
    def _get_llm_cost_breakdown(self, model: str, tokens_in: int, tokens_out: int) -> Dict[str, Any]:
        """Get detailed breakdown of LLM costs."""
        model_key = self._find_model_key(model)
        pricing = self.MODEL_PRICING.get(model_key, self.MODEL_PRICING["default"])
        
        input_cost = (tokens_in / 1000) * pricing["input"]
        output_cost = (tokens_out / 1000) * pricing["output"]
        
        return {
            "model_key_used": model_key,
            "input_cost_usd": round(input_cost, 6),
            "output_cost_usd": round(output_cost, 6),
            "input_price_per_1k": pricing["input"],
            "output_price_per_1k": pricing["output"],
            "tokens_in": tokens_in,
            "tokens_out": tokens_out
        }
    
    def _get_routing_fee_reason(self, routing_strategy: str, uses_own_keys: bool) -> str:
        """Get explanation for routing fee calculation."""
        if uses_own_keys:
            return "No routing fee - user uses own API keys"
        
        if routing_strategy == "smart-routing":
            return f"Smart routing fee: ${self.SMART_ROUTING_FEE:.3f}"
        elif routing_strategy == "load-balancing":
            return f"Load balancing fee: ${self.LOAD_BALANCING_FEE:.3f}"
        elif routing_strategy == "fallback":
            return f"Fallback routing fee: ${self.FALLBACK_FEE:.3f}"
        else:
            return f"Default routing fee: ${self.SMART_ROUTING_FEE:.3f}"
    
    def check_user_integration(self, user_session: Any, provider: str) -> bool:
        """
        Check if user has their own API keys for the given provider.
        
        Args:
            user_session: User session object
            provider: Provider name (openai, anthropic, google, etc.)
            
        Returns:
            True if user uses their own API keys for this provider
        """
        try:
            # Check if user has provider API keys configured
            if hasattr(user_session, 'raw_data') and user_session.raw_data:
                provider_api_keys = user_session.raw_data.get("provider_api_keys", {})
                if isinstance(provider_api_keys, dict):
                    provider_keys = provider_api_keys.get("provider_keys", {})
                    # Check if this provider has user's own API key
                    return provider.lower() in provider_keys
            
            return False
            
        except Exception as e:
            logger.warning(f"Error checking user integration for provider {provider}: {str(e)}")
            return False
    
    def estimate_cost(
        self,
        model: str,
        estimated_tokens_in: int,
        estimated_tokens_out: int,
        routing_strategy: str = "smart-routing",
        uses_own_keys: bool = False
    ) -> CostBreakdown:
        """
        Estimate cost before making the actual request.
        
        Args:
            model: Model to be used
            estimated_tokens_in: Estimated input tokens
            estimated_tokens_out: Estimated output tokens
            routing_strategy: Routing strategy to be used
            uses_own_keys: Whether user uses own API keys
            
        Returns:
            CostBreakdown with estimated costs
        """
        return self.calculate_comprehensive_cost(
            model=model,
            tokens_in=estimated_tokens_in,
            tokens_out=estimated_tokens_out,
            routing_strategy=routing_strategy,
            uses_own_keys=uses_own_keys
        )


# Global instance
cost_service = CostCalculationService()