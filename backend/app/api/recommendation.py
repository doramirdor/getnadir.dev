"""
API routes for model recommendations.
"""
from typing import Dict, Any, List
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.pricing.pricing_manager import get_model_tier
from app.auth.supabase_auth import get_current_user, UserSession, check_rate_limit


router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/recommend", response_class=HTMLResponse)
async def recommendation_ui(request: Request):
    """UI for model recommendations."""
    return templates.TemplateResponse("recommendation.html", {"request": request})


@router.get("/custom_recommend", response_class=HTMLResponse)
async def custom_recommendation_ui(request: Request):
    """UI for custom model recommendations."""
    return templates.TemplateResponse("custom_recommendation.html", {"request": request})


@router.post("/v1/custom_recommendation", dependencies=[Depends(check_rate_limit)])
async def custom_recommendation(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
) -> Dict[str, Any]:
    """Custom model recommendation endpoint. Requires authentication."""
    try:
        data = await request.json()
        
        # Extract request parameters with defaults
        prompt = data.get("prompt", "")
        system_message = data.get("system_message", "")
        providers = data.get("providers", [])
        selected_models = data.get("models", [])
        benchmark_model = data.get("benchmark_model", "")  # Parameter for benchmark model
        max_models = data.get("max_models", 5)  # How many models to rank
        
        # Log incoming request for debugging (truncate long texts for readability)
        truncated_prompt = prompt[:50] + "..." if len(prompt) > 50 else prompt
        truncated_system = system_message[:50] + "..." if len(system_message) > 50 else system_message
        print(f"Custom recommendation request: prompt={truncated_prompt}, system={truncated_system}")
        print(f"Selected models: {selected_models}")
        print(f"Selected providers: {providers}")
        print(f"Benchmark model: {benchmark_model}")
        
        # Initialize the GeminiModelRecommender
        from app.complexity.gemini_analyzer import GeminiModelRecommender
        
        # Create the recommender with allowed models (only user-selected ones)
        recommender = GeminiModelRecommender(
            allowed_providers=providers,
            allowed_models=selected_models
        )
        
        # Use the Gemini analyzer's ranker method to get ranked recommendations
        result = await recommender.ranker(
            text=prompt, 
            system_message=system_message,
            max_models=max_models,
            benchmark_model=benchmark_model if benchmark_model else None
        )
        
        # Print the result for debugging
        print(f"GeminiModelRecommender ranker result: {result}")
        
        # Extract the results from the ranker
        ranked_models = result.get("ranked_models", [])
        task_complexity = result.get("task_complexity", 3)
        complexity_reasoning = result.get("complexity_reasoning", f"Based on your prompt: {prompt[:100]}...")
        routing_decision = result.get("routing_decision", {
            "use_strong_model": True,
            "threshold": 0.65,
            "strong_win_rate": 0.75
        })
        
        # Handle direct ranking results which may have a different format
        for model in ranked_models:
            if "model_name" not in model and "model" in model:
                model["model_name"] = model["model"]
                
            # Ensure all models have the required fields
            if "tier" not in model:
                # Get tier from model name
                model["tier"] = get_model_tier(model.get("model_name", ""))
                
            if "cost_per_million_tokens" not in model:
                # Estimate cost based on tier
                tier = model.get("tier", 2)
                model["cost_per_million_tokens"] = 15.0 if tier == 1 else (5.0 if tier == 2 else 1.0)
                
            if "strong_win_rate" not in model:
                model["strong_win_rate"] = model.get("confidence", 0.5) + 0.1
        
        # Filter the ranked models to only include the selected models
        # (in case the analyzer added any models outside the selection)
        filtered_ranked_models = []
        for model in ranked_models:
            model_name = model.get("model_name", "")
            if model_name in selected_models or not selected_models:  # Include all if no models were specifically selected
                filtered_ranked_models.append(model)
        
        # If no models were found after filtering, use a simpler approach
        if not filtered_ranked_models and selected_models:
            # Fall back to the original simple ranking logic
            from app.pricing.pricing_manager import get_model_tier, get_model_quality_score
            
            print("No models found in ranker results, using fallback ranking")
            
            # Create recommendations for the selected models only
            for model in selected_models:
                # Get tier and quality score
                tier = get_model_tier(model)
                quality_score = get_model_quality_score(model)
                
                # Find the provider for this model
                if "claude" in model.lower() or "anthropic" in model.lower():
                    provider = "anthropic"
                elif "gpt" in model.lower() or "openai" in model.lower():
                    provider = "openai"
                elif "gemini" in model.lower() or "google" in model.lower():
                    provider = "google"
                else:
                    # Default to the first provider if we can't determine
                    provider = providers[0] if providers else "Unknown"
                
                # Simple reasoning and cost estimate
                reasoning = f"Fallback recommendation for {model}"
                cost = 10.0  # Default cost estimate
                
                # Add to ranked models list
                filtered_ranked_models.append({
                    "model_name": model,
                    "provider": provider,
                    "confidence": quality_score,
                    "reasoning": reasoning,
                    "tier": tier,
                    "cost_per_million_tokens": cost,
                    "strong_win_rate": quality_score - 0.1
                })
            
            # Sort by quality score (descending)
            filtered_ranked_models.sort(key=lambda x: x.get("confidence", 0), reverse=True)
        
        # If there are still no models, return a useful error
        if not filtered_ranked_models:
            return {
                "success": False,
                "error": "No models could be recommended for this prompt. Try selecting more models or modifying your prompt."
            }
        
        # Enhance the top model description
        if filtered_ranked_models:
            top_model = filtered_ranked_models[0]
            
            # If not already starting with "Best match", prefix with it
            if not top_model.get("reasoning", "").startswith("Best match"):
                top_model["reasoning"] = f"Best match for your task: {top_model.get('reasoning', '')}"
        
        # Generate benchmark comparison if a benchmark model is specified
        benchmark_comparison = None
        if benchmark_model and filtered_ranked_models:
            # Only compare if benchmark model is different from top model
            top_model_name = filtered_ranked_models[0].get("model_name", "")
            if benchmark_model != top_model_name:
                try:
                    # Call the compare_models function
                    from app.services.recommendation_service import compare_models
                    benchmark_comparison = await compare_models(
                        top_model_name=top_model_name,
                        benchmark_model_name=benchmark_model,
                        user_message=prompt,
                        system_message=system_message
                    )
                except Exception as comp_error:
                    print(f"Error in benchmark comparison: {str(comp_error)}")
                    benchmark_comparison = {
                        "error": f"Failed to generate comparison: {str(comp_error)}"
                    }
            else:
                # Provide more detailed information when benchmark is the top model
                if len(filtered_ranked_models) <= 1:
                    benchmark_comparison = {
                        "note": "The benchmark model is the only model that meets the required capabilities and quality standards."
                    }
                else:
                    # Check if the top model's reasoning mentions it being the benchmark
                    top_model_reasoning = filtered_ranked_models[0].get("reasoning", "")
                    if "only model available" in top_model_reasoning or "best combination" in top_model_reasoning:
                        benchmark_comparison = {
                            "note": f"{top_model_reasoning} No better alternatives were found for your task."
                        }
                    else:
                        benchmark_comparison = {
                            "note": "Benchmark model is the same as top recommended model. It outperformed all other candidates."
                        }
        
        # Create the response structure expected by the frontend
        formatted_response = {
            "success": True,
            "recommendation": {
                "ranked_models": filtered_ranked_models,
                "task_complexity": task_complexity,
                "complexity_reasoning": complexity_reasoning,
                "routing_decision": routing_decision
            }
        }
        
        # Add benchmark comparison if available
        if benchmark_comparison:
            formatted_response["benchmark_comparison"] = benchmark_comparison
        
        return formatted_response
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in custom recommendation: {str(e)}\n{error_details}")
        return {
            "success": False,
            "error": f"Error generating recommendation: {str(e)}"
        }


@router.post("/v1/recommendation/benchmark", dependencies=[Depends(check_rate_limit)])
async def recommendation_benchmark(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
) -> Dict[str, Any]:
    """Benchmark-based model recommendation endpoint. Requires authentication."""
    try:
        data = await request.json()
        
        # Extract metrics with weights
        metrics = data.get("metrics", {})
        user_message = data.get("prompt", "")
        system_message = data.get("system_message", "")
        benchmark_model = data.get("benchmark_model", "")
        
        # Call recommendation service
        from app.services.recommendation_service import get_benchmark_recommendation
        result = await get_benchmark_recommendation(
            metrics=metrics,
            user_message=user_message,
            system_message=system_message,
            benchmark_model=benchmark_model
        )
        
        # If result is empty or not a dict, return a default response
        if not result or not isinstance(result, dict):
            return {
                "success": False,
                "error": "Failed to generate recommendation",
                "matches": [],
                "task_analysis": {
                    "complexity": 3,
                    "complexity_reasoning": "Unable to analyze complexity"
                },
                "metric_importance": metrics
            }
        
        return result
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in benchmark recommendation: {str(e)}\n{error_details}")
        
        # Return a valid response structure even in case of error
        return {
            "success": False,
            "error": str(e),
            "matches": [],
            "task_analysis": {
                "complexity": 3,
                "complexity_reasoning": "Error in analysis"
            },
            "metric_importance": metrics or {}
        }


@router.post("/v1/public/recommendation", dependencies=[Depends(check_rate_limit)])
async def public_recommendation(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
) -> Dict[str, Any]:
    """Public recommendation endpoint. Now requires authentication to prevent abuse."""
    try:
        data = await request.json()
        
        # Extract request parameters with defaults
        prompt = data.get("prompt", "")
        system_message = data.get("system_message", "")
        
        # Default to all major providers if none specified
        providers = data.get("providers", ["openai", "anthropic", "google"])
        
        # Default set of models if none specified - one from each provider
        default_models = ["gpt-4", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet", "gemini-1.5-pro", "gemini-1.5-flash"]
        selected_models = data.get("models", default_models)
        
        # Extract benchmark model if provided
        benchmark_model = data.get("benchmark_model", "")
        max_models = data.get("max_models", 3)  # Default to top 3 for public API
        
        # Log incoming request for debugging (truncate long texts for readability)
        truncated_prompt = prompt[:50] + "..." if len(prompt) > 50 else prompt
        print(f"Public recommendation request: prompt={truncated_prompt}")
        if benchmark_model:
            print(f"Benchmark model: {benchmark_model}")
        
        # Initialize the GeminiModelRecommender
        from app.complexity.gemini_analyzer import GeminiModelRecommender
        
        # Create the recommender with allowed models
        recommender = GeminiModelRecommender(
            allowed_providers=providers,
            allowed_models=selected_models
        )
        
        # Use the Gemini analyzer's ranker method to get ranked recommendations
        result = await recommender.ranker(
            text=prompt,
            system_message=system_message,
            max_models=max_models,
            benchmark_model=benchmark_model if benchmark_model else None
        )
        
        # Extract the results
        ranked_models = result.get("ranked_models", [])
        task_complexity = result.get("task_complexity", 3)
        complexity_reasoning = result.get("complexity_reasoning", f"Based on your prompt: {prompt[:100]}...")
        
        # If there are no models, return a useful error
        if not ranked_models:
            return {
                "success": False,
                "error": "No models could be recommended for this prompt. Try modifying your prompt or selecting different models."
            }
        
        # Format the response for public API (simpler structure)
        recommendations = []
        for model in ranked_models[:max_models]:  # Limit to max_models (default 3)
            recommendations.append({
                "model": model.get("model_name", ""),
                "provider": model.get("provider", ""),
                "confidence": model.get("confidence", 0.5),
                "reasoning": model.get("reasoning", ""),
                "tier": model.get("tier", 2),
                "cost_estimate": model.get("cost_per_million_tokens", 0)
            })
        
        # Generate benchmark comparison if requested
        benchmark_comparison = None
        if benchmark_model and ranked_models:
            top_model_name = ranked_models[0].get("model_name", "")
            if benchmark_model != top_model_name:
                try:
                    # Call the compare_models function
                    from app.services.recommendation_service import compare_models
                    benchmark_comparison = await compare_models(
                        top_model_name=top_model_name,
                        benchmark_model_name=benchmark_model,
                        user_message=prompt,
                        system_message=system_message
                    )
                except Exception as comp_error:
                    print(f"Error in benchmark comparison: {str(comp_error)}")
                    benchmark_comparison = None
            else:
                # Provide more detailed information when benchmark is the top model
                if len(ranked_models) <= 1:
                    benchmark_comparison = {
                        "note": "The benchmark model is the only model that meets the required capabilities and quality standards."
                    }
                else:
                    # Check if the top model's reasoning mentions it being the benchmark
                    top_model_reasoning = ranked_models[0].get("reasoning", "")
                    if "only model available" in top_model_reasoning or "best combination" in top_model_reasoning:
                        benchmark_comparison = {
                            "note": f"{top_model_reasoning} No better alternatives were found for your task."
                        }
                    else:
                        benchmark_comparison = {
                            "note": "Benchmark model is the same as top recommended model. It outperformed all other candidates."
                        }
        
        response = {
            "success": True,
            "task_complexity": task_complexity,
            "complexity_reasoning": complexity_reasoning,
            "recommendations": recommendations
        }
        
        # Add benchmark comparison if available
        if benchmark_comparison:
            response["benchmark_comparison"] = benchmark_comparison
        
        return response
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in public recommendation: {str(e)}\n{error_details}")
        return {
            "success": False,
            "error": f"Error generating recommendation: {str(e)}"
        }


@router.post("/v1/recommendation/compare", dependencies=[Depends(check_rate_limit)])
async def compare_recommendation(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
) -> Dict[str, Any]:
    """Compare a top-ranked model with a benchmark model. Requires authentication."""
    try:
        data = await request.json()
        
        # Extract request parameters
        top_model = data.get("top_model", "")
        benchmark_model = data.get("benchmark_model", "")
        prompt = data.get("prompt", "")
        system_message = data.get("system_message", "")
        
        # Validate required parameters
        if not top_model or not benchmark_model or not prompt:
            return {
                "success": False,
                "error": "Missing required parameters: top_model, benchmark_model, and prompt are required"
            }
        
        # Log the comparison request
        print(f"Model comparison request: {top_model} vs {benchmark_model}")
        
        # Call the compare_models function
        from app.services.recommendation_service import compare_models
        result = await compare_models(
            top_model_name=top_model,
            benchmark_model_name=benchmark_model,
            user_message=prompt,
            system_message=system_message
        )
        
        # Add success flag to the result if it doesn't exist
        if "success" not in result:
            result["success"] = True
        
        # Ensure the result contains all required fields for UI rendering
        if "top_model" not in result or "benchmark_model" not in result:
            result["top_model"] = top_model
            result["benchmark_model"] = benchmark_model
            result["comparison_analysis"] = "Failed to generate detailed comparison."
            result["success"] = False
            result["error"] = "Missing model information in result"
        
        return result
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in model comparison: {str(e)}\n{error_details}")
        return {
            "success": False,
            "error": f"Error generating comparison: {str(e)}"
        }

@router.post("/v1/tool_recommendation", dependencies=[Depends(check_rate_limit)])
async def tool_recommendation(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
) -> Dict[str, Any]:
    """Recommendation endpoint that detects and handles tool/function formats. Requires authentication."""
    try:
        data = await request.json()
        
        # Extract request parameters with defaults
        prompt = data.get("prompt", "")
        system_message = data.get("system_message", "")
        user_prompt = data.get("user_prompt", "")
        tool_definitions = data.get("tool_definitions", "")
        convert_format = data.get("convert_format", False)  # Whether to convert the format
        target_format = data.get("target_format", None)  # Target format if conversion is needed
        target_model = data.get("target_model", None)  # Specific model to convert for
        max_models = data.get("max_models", 5)  # How many models to rank
        
        # Get selected providers and models
        providers = data.get("providers", [])
        models = data.get("models", [])
        
        # If prompt is empty but we have user_prompt, build the full prompt
        if not prompt and user_prompt:
            prompt = user_prompt
            if tool_definitions:
                prompt += "\n\n" + tool_definitions
        
        # Log the incoming request
        truncated_prompt = prompt[:50] + "..." if len(prompt) > 50 else prompt
        print(f"Tool recommendation request: prompt={truncated_prompt}")
        print(f"Convert format: {convert_format}, Target format: {target_format}")
        if providers:
            print(f"Selected providers: {providers}")
        if models:
            print(f"Selected models: {models}")
        
        # Import the services we need
        from app.complexity.gemini_analyzer import GeminiModelRecommender
        from app.services.tool_conversion_service import ToolConversionService
        
        # Initialize the services
        recommender = GeminiModelRecommender(
            allowed_providers=providers if providers else None,
            allowed_models=models if models else None
        )
        tool_service = ToolConversionService()
        
        # Combine system message and prompt for analysis
        full_prompt = f"{system_message}\n\n{prompt}" if system_message else prompt
        
        # Detect tool format in the prompt
        detected_format = tool_service.detect_tool_format(full_prompt)
        
        # Get model recommendations based on the detected format
        result = await recommender.ranker(
            text=prompt,
            system_message=system_message,
            max_models=max_models
        )
        
        # Extract the recommended models
        ranked_models = result.get("ranked_models", [])
        task_complexity = result.get("task_complexity", 3)
        complexity_reasoning = result.get("complexity_reasoning", "")
        
        # Determine if format conversion is needed
        converted_prompt = None
        if convert_format and detected_format and target_format and target_format != detected_format:
            converted_prompt = tool_service.convert_prompt(
                prompt=full_prompt,
                target_format=target_format,
                source_format=detected_format
            )
        elif convert_format and detected_format and target_model:
            # Determine the appropriate format for the target model
            target_format = None
            if any(target_model.startswith(prefix) for prefix in tool_service.PROVIDERS["anthropic"]):
                target_format = "anthropic_tool"
            elif any(target_model.startswith(prefix) for prefix in tool_service.PROVIDERS["openai"]):
                target_format = "openai_function"
            elif any(target_model.startswith(prefix) for prefix in tool_service.PROVIDERS["google"]):
                target_format = "gemini_function"
                
            if target_format and target_format != detected_format:
                converted_prompt = tool_service.convert_prompt(
                    prompt=full_prompt,
                    target_format=target_format,
                    source_format=detected_format
                )
        
        # Build the response
        response = {
            "success": True,
            "detected_format": detected_format,
            "recommendation": {
                "ranked_models": ranked_models,
                "task_complexity": task_complexity,
                "complexity_reasoning": complexity_reasoning
            }
        }
        
        # Add conversion results if available
        if converted_prompt:
            response["converted_prompt"] = {
                "original_format": detected_format,
                "target_format": target_format,
                "prompt": converted_prompt
            }
            
        return response
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in tool recommendation: {str(e)}\n{error_details}")
        return {
            "success": False,
            "error": f"Error generating tool recommendation: {str(e)}"
        }


@router.get("/tool_recommend", response_class=HTMLResponse)
async def tool_recommendation_ui(request: Request):
    """UI for tool & function recommendation."""
    return templates.TemplateResponse("tool_recommendation.html", {"request": request}) 