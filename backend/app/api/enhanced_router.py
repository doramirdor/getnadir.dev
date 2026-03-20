"""
Enhanced Router API endpoints for preset-based fallback and load balancing.

This module provides API endpoints for:
1. Testing preset configurations with fallbacks
2. Load balancing across multiple deployments
3. Advanced routing strategies
4. Router health and performance monitoring
"""

import logging
import time
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, UserSession
from app.services.preset_router_service import PresetRouterService

logger = logging.getLogger(__name__)
router = APIRouter()


class RouterTestRequest(BaseModel):
    """Request for testing router configurations."""
    messages: List[Dict[str, str]] = Field(..., description="Chat messages")
    model: str = Field(..., description="Model or preset to test (@preset/slug)")
    temperature: Optional[float] = Field(0.7, description="Sampling temperature")
    max_tokens: Optional[int] = Field(100, description="Maximum tokens")
    test_fallback: Optional[bool] = Field(False, description="Force fallback testing")


class RouterHealthResponse(BaseModel):
    """Response for router health check."""
    status: str
    user_id: str
    total_presets: int
    cached_routers: int
    default_router_available: bool
    preset_details: List[Dict[str, Any]]


class LoadBalancingTestRequest(BaseModel):
    """Request for testing load balancing."""
    preset_slug: str = Field(..., description="Preset slug to test")
    num_requests: int = Field(5, ge=1, le=20, description="Number of parallel requests")
    messages: List[Dict[str, str]] = Field(..., description="Test messages")


@router.get("/v1/router/health")
async def get_router_health(
    current_user: UserSession = Depends(validate_api_key)
) -> RouterHealthResponse:
    """Get health status of the enhanced router system."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Get service stats
        stats = preset_service.get_service_stats()
        
        # Get preset details
        available_presets = await preset_service.get_available_presets()
        
        return RouterHealthResponse(
            status="healthy",
            user_id=str(current_user.id),
            total_presets=stats["total_presets"],
            cached_routers=stats["cached_routers"],
            default_router_available=stats["default_router_available"],
            preset_details=available_presets
        )
        
    except Exception as e:
        logger.error(f"❌ Router health check failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Router health check failed: {str(e)}"
        )


@router.post("/v1/router/test")
async def test_router_configuration(
    request: RouterTestRequest,
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """Test a router configuration with fallback capabilities."""
    try:
        preset_service = PresetRouterService(current_user)
        
        start_time = time.time()
        
        # Test the configuration
        result = await preset_service.completion(
            messages=request.messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=False
        )
        
        test_duration = time.time() - start_time
        
        # Add test metadata
        test_result = {
            "test_success": "error" not in result,
            "test_duration_ms": int(test_duration * 1000),
            "request": {
                "model": request.model,
                "temperature": request.temperature,
                "max_tokens": request.max_tokens,
                "message_count": len(request.messages)
            },
            "result": result
        }
        
        # If this was a preset test, add preset information
        if request.model.startswith("@preset/"):
            preset_slug = request.model.replace("@preset/", "")
            preset_details = await preset_service.get_preset_details(preset_slug)
            test_result["preset_details"] = preset_details
        
        return test_result
        
    except Exception as e:
        logger.error(f"❌ Router test failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Router test failed: {str(e)}"
        )


@router.post("/v1/router/load-balance-test")
async def test_load_balancing(
    request: LoadBalancingTestRequest,
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """Test load balancing across multiple deployments."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Get preset details
        preset_details = await preset_service.get_preset_details(request.preset_slug)
        if not preset_details:
            raise HTTPException(
                status_code=404,
                detail=f"Preset '{request.preset_slug}' not found"
            )
        
        # Run multiple parallel requests
        import asyncio
        
        async def single_request(req_id: int):
            start_time = time.time()
            try:
                result = await preset_service.completion(
                    messages=request.messages,
                    model=f"@preset/{request.preset_slug}",
                    temperature=0.7,
                    max_tokens=50,
                    stream=False,
                    request_id=f"lb_test_{req_id}"
                )
                
                return {
                    "request_id": req_id,
                    "success": "error" not in result,
                    "model_used": result.get("model", "unknown"),
                    "latency_ms": result.get("latency_ms", 0),
                    "cost_usd": result.get("cost_usd", 0),
                    "fallback_used": result.get("fallback_used", False),
                    "deployment_info": result.get("deployment_info", {}),
                    "error": result.get("error") if "error" in result else None
                }
                
            except Exception as e:
                return {
                    "request_id": req_id,
                    "success": False,
                    "error": str(e),
                    "latency_ms": int((time.time() - start_time) * 1000)
                }
        
        # Execute requests in parallel
        start_time = time.time()
        tasks = [single_request(i) for i in range(request.num_requests)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_duration = time.time() - start_time
        
        # Process results
        successful_requests = [r for r in results if isinstance(r, dict) and r.get("success", False)]
        failed_requests = [r for r in results if isinstance(r, dict) and not r.get("success", False)]
        
        # Analyze model distribution
        model_usage = {}
        for result in successful_requests:
            model = result.get("model_used", "unknown")
            model_usage[model] = model_usage.get(model, 0) + 1
        
        # Calculate statistics
        latencies = [r.get("latency_ms", 0) for r in successful_requests if r.get("latency_ms")]
        costs = [r.get("cost_usd", 0) for r in successful_requests if r.get("cost_usd")]
        
        return {
            "test_summary": {
                "preset_slug": request.preset_slug,
                "total_requests": request.num_requests,
                "successful_requests": len(successful_requests),
                "failed_requests": len(failed_requests),
                "success_rate": len(successful_requests) / request.num_requests * 100,
                "total_duration_ms": int(total_duration * 1000),
                "avg_request_duration_ms": int(total_duration * 1000 / request.num_requests)
            },
            "load_balancing_analysis": {
                "model_distribution": model_usage,
                "load_balancing_effective": len(model_usage) > 1,
                "primary_model": max(model_usage.items(), key=lambda x: x[1])[0] if model_usage else None
            },
            "performance_stats": {
                "avg_latency_ms": sum(latencies) / len(latencies) if latencies else 0,
                "min_latency_ms": min(latencies) if latencies else 0,
                "max_latency_ms": max(latencies) if latencies else 0,
                "total_cost_usd": sum(costs),
                "avg_cost_per_request_usd": sum(costs) / len(costs) if costs else 0
            },
            "preset_configuration": {
                "selected_models": preset_details["selected_models"],
                "load_balancing_policy": preset_details["config"]["load_balancing_policy"],
                "routing_strategy": preset_details["config"]["routing_strategy"],
                "fallback_enabled": preset_details["config"]["use_fallback"]
            },
            "detailed_results": results
        }
        
    except Exception as e:
        logger.error(f"❌ Load balancing test failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Load balancing test failed: {str(e)}"
        )


@router.get("/v1/router/presets")
async def list_available_presets(
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """List all available presets with their configurations."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Get available presets
        presets = await preset_service.get_available_presets()
        
        # Get service stats
        stats = preset_service.get_service_stats()
        
        return {
            "total_presets": len(presets),
            "presets": presets,
            "service_stats": stats
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to list presets: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list presets: {str(e)}"
        )


@router.get("/v1/router/presets/{preset_slug}")
async def get_preset_details(
    preset_slug: str,
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """Get detailed information about a specific preset."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Get preset details
        details = await preset_service.get_preset_details(preset_slug)
        
        if not details:
            raise HTTPException(
                status_code=404,
                detail=f"Preset '{preset_slug}' not found"
            )
        
        return details
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to get preset details: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get preset details: {str(e)}"
        )


@router.post("/v1/router/presets/{preset_slug}/test")
async def test_preset_configuration(
    preset_slug: str,
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """Test a specific preset configuration."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Test the preset
        result = await preset_service.test_preset_configuration(preset_slug)
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Failed to test preset '{preset_slug}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to test preset: {str(e)}"
        )


@router.post("/v1/router/refresh")
async def refresh_router_configuration(
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """Refresh router configurations from database."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Refresh presets
        success = await preset_service.refresh_presets()
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to refresh configurations"
            )
        
        # Get updated stats
        stats = preset_service.get_service_stats()
        
        return {
            "success": True,
            "message": "Router configurations refreshed successfully",
            "updated_stats": stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to refresh router configuration: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh configuration: {str(e)}"
        )


@router.post("/v1/router/fallback-demo")
async def demonstrate_fallback_system(
    current_user: UserSession = Depends(validate_api_key)
) -> Dict[str, Any]:
    """Demonstrate the fallback system with various failure scenarios."""
    try:
        preset_service = PresetRouterService(current_user)
        
        # Test scenarios
        scenarios = [
            {
                "name": "Normal Request",
                "model": "gpt-4o-mini", 
                "messages": [{"role": "user", "content": "Say hello"}],
                "expected": "success"
            },
            {
                "name": "Preset Request",
                "model": "@preset/test-api",  # Assuming this preset exists
                "messages": [{"role": "user", "content": "Test preset routing"}],
                "expected": "success_with_preset"
            },
            {
                "name": "Long Context Request", 
                "model": "gpt-4",
                "messages": [{"role": "user", "content": "A" * 10000}],  # Very long prompt
                "expected": "context_window_fallback"
            }
        ]
        
        results = []
        
        for scenario in scenarios:
            start_time = time.time()
            try:
                result = await preset_service.completion(
                    messages=scenario["messages"],
                    model=scenario["model"],
                    temperature=0.1,
                    max_tokens=50,
                    stream=False
                )
                
                scenario_result = {
                    "scenario": scenario["name"],
                    "expected": scenario["expected"],
                    "success": "error" not in result,
                    "model_requested": scenario["model"],
                    "model_used": result.get("model", "unknown"),
                    "fallback_used": result.get("fallback_used", False),
                    "latency_ms": result.get("latency_ms", 0),
                    "cost_usd": result.get("cost_usd", 0),
                    "duration_ms": int((time.time() - start_time) * 1000),
                    "error": result.get("error") if "error" in result else None
                }
                
                results.append(scenario_result)
                
            except Exception as e:
                results.append({
                    "scenario": scenario["name"],
                    "expected": scenario["expected"],
                    "success": False,
                    "error": str(e),
                    "duration_ms": int((time.time() - start_time) * 1000)
                })
        
        # Summary statistics
        successful_scenarios = [r for r in results if r["success"]]
        fallback_scenarios = [r for r in results if r.get("fallback_used", False)]
        
        return {
            "demonstration_summary": {
                "total_scenarios": len(scenarios),
                "successful_scenarios": len(successful_scenarios),
                "fallback_scenarios": len(fallback_scenarios),
                "fallback_effectiveness": len(fallback_scenarios) / len(scenarios) * 100 if scenarios else 0
            },
            "scenario_results": results,
            "fallback_analysis": {
                "fallback_triggered": len(fallback_scenarios) > 0,
                "fallback_success_rate": len([r for r in fallback_scenarios if r["success"]]) / len(fallback_scenarios) * 100 if fallback_scenarios else 0,
                "common_fallback_triggers": ["context_window", "model_availability", "rate_limits"]
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Fallback demonstration failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Fallback demonstration failed: {str(e)}"
        )