"""
Service for model recommendations.
"""
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

try:
    from app.complexity.gemini_analyzer import GeminiModelRecommender
except ImportError:
    GeminiModelRecommender = None

try:
    from app.pricing.pricing_manager import get_prices_by_provider, get_model_tier
except ImportError:
    def get_prices_by_provider(*args, **kwargs):
        return {}
    def get_model_tier(*args, **kwargs):
        return "unknown"


async def get_benchmark_recommendation(
    metrics: Dict[str, float],
    user_message: str = "",
    system_message: str = "",
    benchmark_model: str = ""
) -> Dict[str, Any]:
    """
    Get model recommendations based on benchmark weights.
    
    Args:
        metrics: Dictionary of metrics with weights
        user_message: Optional user message for analysis
        system_message: Optional system message for context
        benchmark_model: Optional benchmark model to compare against
        
    Returns:
        Dictionary with model recommendations
    """
    try:
        # Initialize the GeminiModelRecommender
        recommender = GeminiModelRecommender()
        
        # If we have a user message, get a benchmark recommendation
        if user_message:
            try:
                # Use the ranker method since get_benchmark_recommendation might not exist
                result = await recommender.ranker(
                    text=user_message,
                    system_message=system_message,
                    max_models=5,
                    benchmark_model=benchmark_model if benchmark_model else None
                )
                
                # Extract ranked models and enrich with benchmark metrics
                ranked_models = result.get("ranked_models", [])
                
                # Format the models for the response
                matches = []
                for model_info in ranked_models:
                    model_name = model_info.get("model_name", "")
                    provider = model_info.get("provider", "")
                    
                    # Create benchmarks dict from available performance metrics
                    benchmarks = {}
                    # Try to find model in performance data to get benchmarks
                    model_data = next((m for m in recommender.performance_data 
                                      if m.get("model") == model_name), {})
                    
                    if model_data and "performance" in model_data:
                        perf = model_data["performance"]
                        if "mmlu" in perf:
                            benchmarks["MMLU"] = f"{perf['mmlu']}%"
                        if "humaneval" in perf:
                            benchmarks["HumanEval"] = f"{perf['humaneval']}%"
                        if "gpqa" in perf:
                            benchmarks["GPQA"] = f"{perf['gpqa']}%"
                    
                    # Add to matches
                    matches.append({
                        "model": model_name,
                        "provider": provider,
                        "score": model_info.get("confidence", -1),
                        "reasoning": model_info.get("reasoning", ""),
                        "benchmarks": benchmarks,
                        "tier": model_info.get("tier", -1)
                    })
                
                return {
                    "success": True,
                    "matches": matches,
                    "task_analysis": {
                        "complexity": result.get("task_complexity", -1),
                        "complexity_reasoning": result.get("complexity_reasoning", "")
                    },
                    "metric_importance": metrics,
                    "decision_factors": {"weights": metrics}
                }
            except Exception as inner_e:
                logger.error(f"Error in recommendation generation: {str(inner_e)}")
                
        # If we reach here, either there was no user message or there was an error
        # Return a default recommendation with a simple structure
        return {
            "success": False,
            "matches": [],
            "task_analysis": {
                "complexity": 3,
                "complexity_reasoning": "No complexity analysis available"
            },
            "metric_importance": metrics,
            "error": "Unable to generate recommendation" if user_message else "No user message provided"
        }

    except Exception as e:
        import traceback
        logger.error(f"Error in get_benchmark_recommendation: {str(e)}", exc_info=True)
        return {
            "success": False,
            "matches": [],
            "task_analysis": {
                "complexity": 3,
                "complexity_reasoning": "Error occurred during analysis"
            },
            "metric_importance": metrics,
            "error": str(e)
        }


async def compare_models(
    top_model_name: str,
    benchmark_model_name: str,
    user_message: str,
    system_message: str = ""
) -> Dict[str, Any]:
    """
    Compare the top-ranked model with a benchmark model to provide detailed insights.
    
    Args:
        top_model_name: The name of the top-ranked model
        benchmark_model_name: The name of the benchmark model to compare against
        user_message: The user's prompt or query
        system_message: Optional system message to provide context
        
    Returns:
        Dictionary with detailed comparison between the two models
    """
    try:
        # Initialize the GeminiModelRecommender
        recommender = GeminiModelRecommender()
        
        # Use the dedicated compare_models method to get a detailed comparison
        # This method is specifically designed for model comparisons
        result = await recommender.compare_models(
            top_model_name=top_model_name,
            benchmark_model_name=benchmark_model_name,
            text=user_message,
            system_message=system_message
        )
        
        # Explicitly set the success flag
        result["success"] = True
        
        # Return the result directly - it's already in the requested format
        return result
        
    except Exception as e:
        import traceback
        logger.error(f"Error in compare_models: {str(e)}", exc_info=True)
        return {
            "top_model": top_model_name,
            "benchmark_model": benchmark_model_name,
            "comparison_analysis": f"Error generating comparison: {str(e)}",
            "strengths": {
                "top_model": "Unable to determine due to error",
                "benchmark_model": "Unable to determine due to error"
            },
            "task_fit_score": {
                "top_model": 0.8,
                "benchmark_model": 0.7
            },
            "recommendation_confidence": 0.7,
            "error": str(e)
        } 