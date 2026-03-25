"""
Module for loading and accessing pricing information.
"""
import json
import os
from typing import Dict, Any

# Pricing data cache
_PRICING_DATA = None

def load_pricing() -> Dict[str, Any]:
    """
    Load pricing information from original_pricing.json file.
    
    Returns:
        Dictionary containing pricing information
    """
    global _PRICING_DATA
    
    if _PRICING_DATA is None:
        pricing_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'reference_data', 'original_pricing.json')
        
        with open(pricing_file, 'r') as f:
            pricing_json = json.load(f)
            
            # Extract and normalize pricing from the original pricing data
            # The structure is {"data": [{"id": "model_id", "pricing": {...}}]}
            _PRICING_DATA = {}
            
            for item in pricing_json.get("data", []):
                model_id = item.get("id", "")
                if not model_id:
                    continue
                    
                # Extract provider and model name from model_id (e.g., "openai/gpt-4")
                if "/" in model_id:
                    provider, model = model_id.split("/", 1)
                else:
                    provider, model = "unknown", model_id
                
                pricing_info = item.get("pricing", {})
                
                # Create provider entry if it doesn't exist
                if provider not in _PRICING_DATA:
                    _PRICING_DATA[provider] = {}
                
                # Calculate price per million tokens for input and output
                input_price = float(pricing_info.get("prompt", 0)) * 1000000
                output_price = float(pricing_info.get("completion", 0)) * 1000000
                
                # Store pricing per million tokens
                _PRICING_DATA[provider][model] = {
                    "input": input_price,
                    "output": output_price
                }
    
    return _PRICING_DATA

def get_pricing() -> Dict[str, Any]:
    """
    Get pricing information.
    
    Returns:
        Dictionary containing pricing information
    """
    return load_pricing()

def calculate_cost(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Calculate the cost of a model call.
    
    Args:
        provider: Provider name (openai, anthropic, etc.)
        model: Model name
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
    
    Returns:
        Cost in USD
    """
    pricing = load_pricing()
    provider_pricing = pricing.get(provider.lower(), {})
    model_pricing = provider_pricing.get(model, {"input": 0.0, "output": 0.0})
    
    # Get input and output prices, defaulting to 0.0 if None
    input_price = model_pricing.get("input", 0.0) or 0.0
    output_price = model_pricing.get("output", 0.0) or 0.0
    
    # Convert million tokens to thousand tokens (pricing is per million)
    input_cost = (input_tokens / 1000) * (input_price / 1000)
    output_cost = (output_tokens / 1000) * (output_price / 1000)
    
    return input_cost + output_cost 