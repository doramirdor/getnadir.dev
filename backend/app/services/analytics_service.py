"""
Enhanced Analytics Service for comprehensive user insights and data aggregation.

This service captures detailed analytics data for:
- Model recommendations and selections
- Cost analysis and optimization insights  
- Performance metrics and latency tracking
- Funnel analysis and user journey tracking
- Tag-based analytics for campaigns/features
- Complexity analysis and task categorization
- Error tracking and debugging insights
"""

import uuid
import time
import asyncio
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timezone
from dataclasses import dataclass
from app.auth.supabase_auth import log_usage_event
from app.settings import settings
import logging

logger = logging.getLogger(__name__)


@dataclass
class ModelAnalytics:
    """Model recommendation and selection analytics."""
    recommended_model: Optional[str] = None
    selected_model: Optional[str] = None
    selection_reason: Optional[str] = None
    benchmark_model: Optional[str] = None
    alternatives: Optional[List[Dict[str, Any]]] = None
    complexity_score: Optional[float] = None
    complexity_reasoning: Optional[str] = None
    task_type: Optional[str] = None
    analyzer_type: Optional[str] = None
    analyzer_latency_ms: Optional[int] = None


@dataclass 
class CostAnalytics:
    """Detailed cost breakdown and analysis."""
    total_cost_usd: float
    cost_per_token: float
    input_cost_usd: float
    output_cost_usd: float
    routing_fee_usd: Optional[float] = None  # Nadir routing fee
    routing_strategy: Optional[str] = None  # smart-routing, load-balancing, fallback
    uses_own_keys: Optional[bool] = None  # Whether user uses own API keys
    cost_savings_usd: Optional[float] = None  # vs benchmark model
    cost_efficiency_score: Optional[float] = None  # cost per quality unit


@dataclass
class PerformanceAnalytics:
    """Performance and technical metrics."""
    latency_ms: int
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    request_size_bytes: Optional[int] = None
    response_size_bytes: Optional[int] = None
    analyzer_latency_ms: Optional[int] = None
    

@dataclass  
class RequestAnalytics:
    """Complete request analytics data."""
    # Identifiers
    request_id: str
    user_id: str
    api_key_id: Optional[str] = None
    api_key_preview: Optional[str] = None
    session_id: Optional[str] = None
    
    # Funnel and tracking
    funnel_tag: Optional[str] = None
    tracking_tags: Optional[List[str]] = None
    
    # Request context
    endpoint: str = "/v1/chat/completions"
    route: str = "/v1/chat/completions"  
    nadir_mode: str = "standard"
    
    # Content
    prompt: Optional[str] = None
    system_message: Optional[str] = None
    response: Optional[str] = None
    
    # Request parameters
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    has_tools: bool = False
    tool_calls: Optional[List[Dict[str, Any]]] = None
    stream: bool = False
    
    # Analytics components
    model_analytics: Optional[ModelAnalytics] = None
    cost_analytics: Optional[CostAnalytics] = None
    performance_analytics: Optional[PerformanceAnalytics] = None
    
    # Status
    success: bool = True
    error: Optional[str] = None
    error_type: Optional[str] = None
    
    # Technical
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    
    # ML and clustering
    cluster_id: Optional[str] = None
    embedding: Optional[bytes] = None
    
    # Additional metadata
    additional_metadata: Optional[Dict[str, Any]] = None


class AnalyticsService:
    """Enhanced analytics service for comprehensive logging and insights."""
    
    def __init__(self):
        self.logger = logger
        
    async def log_request_analytics(self, analytics: RequestAnalytics) -> None:
        """
        Log comprehensive request analytics to Supabase.
        
        This method captures all the analytics data in a structured format
        that enables easy aggregation and insights generation.
        """
        try:
            # Build comprehensive metadata with all analytics data
            metadata = self._build_analytics_metadata(analytics)
            
            # Extract core fields for the main table columns
            model_analytics = analytics.model_analytics or ModelAnalytics()
            cost_analytics = analytics.cost_analytics or CostAnalytics(
                total_cost_usd=0, cost_per_token=0, input_cost_usd=0, output_cost_usd=0
            )
            perf_analytics = analytics.performance_analytics or PerformanceAnalytics(
                latency_ms=0, total_tokens=0, prompt_tokens=0, completion_tokens=0
            )
            
            # Log to usage_events table with enhanced metadata
            self.logger.debug(f"Analytics service calling log_usage_event for request {analytics.request_id}")
            await log_usage_event(
                user_id=analytics.user_id,
                request_id=analytics.request_id,
                model_name=model_analytics.selected_model or "unknown",
                provider=self._extract_provider(model_analytics.selected_model or ""),
                tokens_in=perf_analytics.prompt_tokens,
                tokens_out=perf_analytics.completion_tokens,
                cost=cost_analytics.total_cost_usd,
                route=analytics.route,
                prompt=analytics.prompt,
                response=analytics.response,
                latency_ms=perf_analytics.latency_ms,
                cluster_id=analytics.cluster_id,
                embedding=analytics.embedding,
                metadata=metadata,
                error=analytics.error
            )
            
            self.logger.info(f"Logged comprehensive analytics for request {analytics.request_id}")
            
        except Exception as e:
            self.logger.error(f"Failed to log request analytics: {str(e)}")
    
    def _build_analytics_metadata(self, analytics: RequestAnalytics) -> Dict[str, Any]:
        """Build comprehensive metadata dictionary with all analytics data."""
        metadata = {
            # Request identification and tracking
            "analytics_version": "1.0",
            "logged_at": datetime.now(timezone.utc).isoformat(),
            
            # API key and session tracking
            "api_key_id": analytics.api_key_id,
            "api_key_preview": analytics.api_key_preview, 
            "session_id": analytics.session_id,
            
            # Funnel and campaign tracking
            "funnel_tag": analytics.funnel_tag,
            "tracking_tags": analytics.tracking_tags or [],
            
            # Request context
            "endpoint": analytics.endpoint,
            "nadir_mode": analytics.nadir_mode,
            
            # Request parameters
            "temperature": analytics.temperature,
            "max_tokens": analytics.max_tokens,
            "has_tools": analytics.has_tools,
            "tool_calls": analytics.tool_calls or [],
            "stream": analytics.stream,
            
            # Content metrics
            "prompt_length": len(analytics.prompt) if analytics.prompt else 0,
            "response_length": len(analytics.response) if analytics.response else 0,
            "system_message_length": len(analytics.system_message) if analytics.system_message else 0,
            "has_system_message": bool(analytics.system_message),
            
            # Status and errors
            "success": analytics.success,
            "error_type": analytics.error_type,
            
            # Technical details
            "ip_address": analytics.ip_address,
            "user_agent": analytics.user_agent,
        }
        
        # Add model analytics
        if analytics.model_analytics:
            metadata.update({
                "recommended_model": analytics.model_analytics.recommended_model,
                "selected_model": analytics.model_analytics.selected_model,
                "model_selection_reason": analytics.model_analytics.selection_reason,
                "benchmark_model": analytics.model_analytics.benchmark_model,
                "alternative_models": analytics.model_analytics.alternatives or [],
                "complexity_score": analytics.model_analytics.complexity_score,
                "complexity_reasoning": analytics.model_analytics.complexity_reasoning,
                "task_type": analytics.model_analytics.task_type,
                "analyzer_type": analytics.model_analytics.analyzer_type,
                "analyzer_latency_ms": analytics.model_analytics.analyzer_latency_ms,
                
                # Model comparison insights
                "model_changed": (
                    analytics.model_analytics.recommended_model != analytics.model_analytics.selected_model
                    if analytics.model_analytics.recommended_model and analytics.model_analytics.selected_model
                    else False
                ),
                "using_benchmark": (
                    analytics.model_analytics.selected_model == analytics.model_analytics.benchmark_model
                    if analytics.model_analytics.benchmark_model
                    else False
                )
            })

            # Enrich with classifier-specific fields when analyzer_type is binary
            if analytics.model_analytics.analyzer_type == "binary":
                additional = analytics.additional_metadata or {}
                metadata.update({
                    "classifier_tier": additional.get("classifier_tier") or analytics.model_analytics.task_type,
                    "classifier_confidence": analytics.model_analytics.complexity_score,
                    "classifier_version": additional.get("classifier_version", "2.0"),
                    "model_was_overridden": metadata.get("model_changed", False),
                })
        
        # Add cost analytics
        if analytics.cost_analytics:
            metadata.update({
                "cost_breakdown": {
                    "total_cost_usd": analytics.cost_analytics.total_cost_usd,
                    "input_cost_usd": analytics.cost_analytics.input_cost_usd,
                    "output_cost_usd": analytics.cost_analytics.output_cost_usd,
                    "cost_per_token": analytics.cost_analytics.cost_per_token,
                    "cost_savings_usd": analytics.cost_analytics.cost_savings_usd,
                    "cost_efficiency_score": analytics.cost_analytics.cost_efficiency_score
                }
            })
        
        # Add performance analytics
        if analytics.performance_analytics:
            metadata.update({
                "performance_metrics": {
                    "latency_ms": analytics.performance_analytics.latency_ms,
                    "total_tokens": analytics.performance_analytics.total_tokens,
                    "prompt_tokens": analytics.performance_analytics.prompt_tokens,
                    "completion_tokens": analytics.performance_analytics.completion_tokens,
                    "request_size_bytes": analytics.performance_analytics.request_size_bytes,
                    "response_size_bytes": analytics.performance_analytics.response_size_bytes,
                    "tokens_per_second": (
                        analytics.performance_analytics.total_tokens / (analytics.performance_analytics.latency_ms / 1000)
                        if analytics.performance_analytics.latency_ms > 0
                        else 0
                    )
                }
            })
        
        # Add any additional metadata
        if analytics.additional_metadata:
            metadata.update(analytics.additional_metadata)
        
        return metadata
    
    def _extract_provider(self, model: str) -> str:
        """Extract provider name from model string."""
        if not model:
            return "unknown"
            
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


class AnalyticsQueryHelper:
    """Helper class for common analytics queries and aggregations."""
    
    def __init__(self, supabase_client):
        self.supabase = supabase_client
    
    async def get_user_analytics(
        self, 
        user_id: str, 
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get comprehensive analytics for a specific user."""
        try:
            query = self.supabase.table("usage_events").select("*").eq("user_id", user_id)
            
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
                
            response = query.execute()
            events = response.data or []
            
            # Aggregate analytics
            return self._aggregate_analytics(events, "user", user_id)
            
        except Exception as e:
            logger.error(f"Error getting user analytics: {str(e)}")
            return {}
    
    async def get_api_key_analytics(
        self, 
        api_key_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get analytics aggregated by API key."""
        try:
            query = self.supabase.table("usage_events").select("*")
            
            # Filter by API key in metadata
            query = query.contains("metadata", {"api_key_id": api_key_id})
            
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
                
            response = query.execute()
            events = response.data or []
            
            return self._aggregate_analytics(events, "api_key", api_key_id)
            
        except Exception as e:
            logger.error(f"Error getting API key analytics: {str(e)}")
            return {}
    
    async def get_funnel_analytics(
        self,
        funnel_tag: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get analytics for a specific funnel/campaign tag."""
        try:
            query = self.supabase.table("usage_events").select("*")
            query = query.contains("metadata", {"funnel_tag": funnel_tag})
            
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
                
            response = query.execute()
            events = response.data or []
            
            return self._aggregate_analytics(events, "funnel", funnel_tag)
            
        except Exception as e:
            logger.error(f"Error getting funnel analytics: {str(e)}")
            return {}
    
    def _aggregate_analytics(self, events: List[Dict], group_type: str, group_id: str) -> Dict[str, Any]:
        """Aggregate analytics data from events."""
        if not events:
            return {
                "group_type": group_type,
                "group_id": group_id,
                "total_requests": 0,
                "total_cost": 0,
                "summary": {}
            }
        
        # Basic aggregations
        total_requests = len(events)
        total_cost = sum(event.get("cost", 0) for event in events)
        total_tokens = sum(event.get("tokens_in", 0) + event.get("tokens_out", 0) for event in events)
        avg_latency = sum(event.get("latency_ms", 0) for event in events) / total_requests if total_requests > 0 else 0
        
        # Model usage breakdown
        model_usage = {}
        provider_usage = {}
        complexity_scores = []
        success_count = 0
        
        for event in events:
            # Model tracking
            model = event.get("model_name", "unknown")
            model_usage[model] = model_usage.get(model, 0) + 1
            
            # Provider tracking
            provider = event.get("provider", "unknown")
            provider_usage[provider] = provider_usage.get(provider, 0) + 1
            
            # Complexity analysis
            metadata = event.get("metadata", {})
            if metadata.get("complexity_score"):
                complexity_scores.append(metadata["complexity_score"])
            
            # Success rate
            if metadata.get("success", True) and not event.get("error"):
                success_count += 1
        
        # Calculate insights
        success_rate = (success_count / total_requests) * 100 if total_requests > 0 else 0
        avg_complexity = sum(complexity_scores) / len(complexity_scores) if complexity_scores else 0
        avg_cost_per_request = total_cost / total_requests if total_requests > 0 else 0
        
        return {
            "group_type": group_type,
            "group_id": group_id,
            "period": {
                "start": min(event.get("created_at", "") for event in events) if events else None,
                "end": max(event.get("created_at", "") for event in events) if events else None
            },
            "summary": {
                "total_requests": total_requests,
                "total_cost_usd": round(total_cost, 4),
                "avg_cost_per_request": round(avg_cost_per_request, 4),
                "total_tokens": total_tokens,
                "avg_latency_ms": round(avg_latency, 2),
                "success_rate_percent": round(success_rate, 2),
                "avg_complexity_score": round(avg_complexity, 2) if avg_complexity > 0 else None
            },
            "breakdowns": {
                "models": dict(sorted(model_usage.items(), key=lambda x: x[1], reverse=True)),
                "providers": dict(sorted(provider_usage.items(), key=lambda x: x[1], reverse=True)),
            },
            "insights": self._generate_insights(events, model_usage, provider_usage, avg_complexity)
        }
    
    def _generate_insights(
        self, 
        events: List[Dict], 
        model_usage: Dict[str, int], 
        provider_usage: Dict[str, int],
        avg_complexity: float
    ) -> List[str]:
        """Generate actionable insights from the analytics data."""
        insights = []
        
        if not events:
            return insights
        
        # Model optimization insights
        if len(model_usage) > 1:
            most_used_model = max(model_usage, key=model_usage.get)
            insights.append(f"Most used model: {most_used_model} ({model_usage[most_used_model]} requests)")
        
        # Cost optimization insights
        costs_per_model = {}
        for event in events:
            model = event.get("model_name", "unknown")
            cost = event.get("cost", 0)
            if model not in costs_per_model:
                costs_per_model[model] = []
            costs_per_model[model].append(cost)
        
        if len(costs_per_model) > 1:
            avg_costs = {model: sum(costs)/len(costs) for model, costs in costs_per_model.items()}
            cheapest_model = min(avg_costs, key=avg_costs.get)
            most_expensive_model = max(avg_costs, key=avg_costs.get)
            
            if avg_costs[most_expensive_model] > avg_costs[cheapest_model] * 2:
                insights.append(f"Cost optimization opportunity: {cheapest_model} is significantly cheaper than {most_expensive_model}")
        
        # Complexity insights
        if avg_complexity > 0:
            if avg_complexity < 2:
                insights.append("Tasks are generally simple - consider using faster, cheaper models")
            elif avg_complexity > 4:
                insights.append("Tasks are generally complex - current model selection is appropriate")
        
        # Performance insights
        high_latency_requests = [e for e in events if e.get("latency_ms", 0) > 5000]
        if len(high_latency_requests) > len(events) * 0.1:  # More than 10% high latency
            insights.append("Consider optimizing for latency - many requests are taking over 5 seconds")
        
        return insights


# Create global analytics service instance
analytics_service = AnalyticsService()