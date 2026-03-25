"""
Pricing manager for model cost estimates.
"""
from typing import Dict, List, Any


# Performance data for models (can be extended with real benchmarks)
MODEL_PERFORMANCE = {
    # Premium models (Tier 1)
    "gpt-4": {"mmlu": 86.4, "gsm8k": 92.0, "humaneval": 67.0},
    "gpt-4o": {"mmlu": 88.0, "gsm8k": 94.5, "humaneval": 73.5},
    "gpt-4-turbo": {"mmlu": 87.2, "gsm8k": 93.0, "humaneval": 70.0},
    "claude-3-opus": {"mmlu": 88.0, "gsm8k": 91.2, "humaneval": 71.1},
    "claude-3.7-sonnet": {"mmlu": 87.5, "gsm8k": 89.9, "humaneval": 69.0},
    "gemini-1.5-pro": {"mmlu": 87.1, "gsm8k": 86.8, "humaneval": 74.0},
    
    # Standard models (Tier 2)
    "gpt-3.5-turbo": {"mmlu": 70.0, "gsm8k": 78.2, "humaneval": 48.1},
    "claude-3-sonnet": {"mmlu": 78.9, "gsm8k": 81.5, "humaneval": 67.1},
    "claude-3-haiku": {"mmlu": 73.4, "gsm8k": 74.3, "humaneval": 51.0},
    "gemini-1.5-flash": {"mmlu": 74.5, "gsm8k": 75.2, "humaneval": 59.0},
    
    # Basic models (Tier 3)
    "llama-3-8b": {"mmlu": 65.2, "gsm8k": 61.7, "humaneval": 42.3},
    "mistral-small": {"mmlu": 63.9, "gsm8k": 59.0, "humaneval": 35.8}
}


def get_model_tier(model_name: str) -> int:
    """
    Get the model tier (1-3) based on model capabilities.
    
    Args:
        model_name: Name of the model
        
    Returns:
        int: Tier level (1: premium, 2: standard, 3: basic)
    """
    model_lower = model_name.lower()
    
    # Tier 1 (premium) models
    tier1_patterns = [
        "gpt-4", "gpt4", "gpt-4-1106", "gpt-4-turbo", "gpt-4o", 
        "claude-3-opus", "claude-3.7", "claude-3-7",
        "gemini-1.5-pro", "gemini-ultra", "palm-2",
        "llama-3-70"
    ]
    
    # Tier 2 (standard) models
    tier2_patterns = [
        "gpt-3.5", "gpt35",
        "claude-3-sonnet", "claude-3-haiku", "claude-3.5-sonnet", "claude-instant",
        "gemini-1.5-flash", "gemini-1.0-pro", "gemini-pro",
        "llama-3-8", "mistral-medium"
    ]
    
    # Check if model name contains any Tier 1 pattern
    if any(pattern in model_lower for pattern in tier1_patterns):
        return 1
    
    # Check if model name contains any Tier 2 pattern
    if any(pattern in model_lower for pattern in tier2_patterns):
        return 2
    
    # Default to Tier 3 (basic models)
    return 3


def get_model_quality_score(model_name: str) -> float:
    """
    Get the quality score for a model based on performance metrics.
    
    Args:
        model_name: Name of the model
        
    Returns:
        float: Quality score between 0 and 1
    """
    model_lower = model_name.lower()
    
    # Try to find an exact match in our performance data
    for known_model, metrics in MODEL_PERFORMANCE.items():
        if known_model.lower() in model_lower:
            # Calculate a weighted score from benchmarks
            if metrics:
                mmlu_weight = 0.4
                gsm8k_weight = 0.3
                humaneval_weight = 0.3
                
                mmlu_score = metrics.get("mmlu", 0) / 100
                gsm8k_score = metrics.get("gsm8k", 0) / 100
                humaneval_score = metrics.get("humaneval", 0) / 100
                
                weighted_score = (
                    mmlu_score * mmlu_weight +
                    gsm8k_score * gsm8k_weight +
                    humaneval_score * humaneval_weight
                )
                
                # Return the weighted score
                return min(0.99, weighted_score)
    
    # If no exact match, estimate based on tier
    tier = get_model_tier(model_name)
    
    # Default quality scores by tier if no performance data available
    if tier == 1:
        return 0.90  # Premium models
    elif tier == 2:
        return 0.75  # Standard models
    else:
        return 0.60  # Basic models


def get_prices_by_provider(provider: str, model_names: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Get pricing information for models from a specific provider.
    
    Args:
        provider: The provider name (e.g., "openai", "anthropic")
        model_names: List of model names to get pricing for
        
    Returns:
        Dictionary mapping model names to their pricing information
    """
    # Default pricing by provider - simplified
    default_pricing = {
        "openai": {
            "gpt-4": {"input_price_usd1m_tokens": 30.0, "output_price_usd1m_tokens": 60.0},
            "gpt-4-turbo": {"input_price_usd1m_tokens": 10.0, "output_price_usd1m_tokens": 30.0},
            "gpt-4o": {"input_price_usd1m_tokens": 5.0, "output_price_usd1m_tokens": 15.0},
            "gpt-3.5-turbo": {"input_price_usd1m_tokens": 0.5, "output_price_usd1m_tokens": 1.5}
        },
        "anthropic": {
            "claude-3-opus": {"input_price_usd1m_tokens": 15.0, "output_price_usd1m_tokens": 75.0},
            "claude-3-sonnet": {"input_price_usd1m_tokens": 3.0, "output_price_usd1m_tokens": 15.0},
            "claude-3-haiku": {"input_price_usd1m_tokens": 0.25, "output_price_usd1m_tokens": 1.25}
        },
        "google": {
            "gemini-1.5-pro": {"input_price_usd1m_tokens": 3.5, "output_price_usd1m_tokens": 10.5},
            "gemini-1.5-flash": {"input_price_usd1m_tokens": 0.35, "output_price_usd1m_tokens": 1.05},
            "gemini-1.0-pro": {"input_price_usd1m_tokens": 0.25, "output_price_usd1m_tokens": 0.75}
        }
    }
    
    # Get default pricing for this provider
    provider_pricing = default_pricing.get(provider.lower(), {})
    
    # Create result dictionary for specified models
    result = {}
    for model_name in model_names:
        # Get pricing for this model, or use defaults
        model_pricing = provider_pricing.get(model_name, {
            "input_price_usd1m_tokens": -1,  # Default input price
            "output_price_usd1m_tokens": -1  # Default output price
        })
        
        # Add blended price (total of input and output)
        input_price = model_pricing.get("input_price_usd1m_tokens")
        output_price = model_pricing.get("output_price_usd1m_tokens")
        
        # Handle None values by using defaults
        if input_price is None:
            input_price = -1 # Default input price
        if output_price is None:
            output_price = -1  # Default output price
            
        # Calculate blended price
        model_pricing["blended_usd1m_tokens"] = input_price + output_price
        
        result[model_name] = model_pricing
    
    return result 