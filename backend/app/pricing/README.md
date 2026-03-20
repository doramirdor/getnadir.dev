# Pricing Module

This module handles loading and calculating pricing information for various AI model providers.

## Pricing Configuration

The pricing information is stored in `pricing.json` with the following structure:

```json
{
  "provider": {
    "model": {
      "input": cost_per_million_input_tokens,
      "output": cost_per_million_output_tokens
    }
  }
}
```

For example:

```json
{
  "openai": {
    "gpt-4": {
      "input": 30000.0,
      "output": 60000.0
    }
  }
}
```

This means OpenAI's GPT-4 costs $30,000 per million input tokens and $60,000 per million output tokens.

## Supported Providers and Models

The pricing module now supports a wide range of providers and models:

- OpenAI (GPT-3.5, GPT-4, GPT-4.1, O3, O4-mini, etc.)
- Anthropic (Claude series including Claude-3 models)
- Google (Gemini series)
- Cohere (Command, Command-R series)
- Meta-Llama (Llama-3, Llama-3.1 series)
- Mistral AI (Pixtral-12B)
- Qwen (Qwen2.5-coder)
- Other specialized models

All pricing is normalized to cost per 1,000,000 tokens for both input and output.

## Usage

```python
from app.pricing import get_pricing
from app.pricing.loader import calculate_cost

# Get the entire pricing dictionary
pricing = get_pricing()

# Calculate cost for a specific model
cost = calculate_cost(
    provider="openai",
    model="gpt-4",
    input_tokens=1000,  # 1K tokens
    output_tokens=500   # 500 tokens
)
print(f"Cost for this request: ${cost:.6f}")
```

## Updating Pricing

To update the pricing information, edit the `pricing.json` file in this directory. The changes will be automatically picked up when the application is restarted. 