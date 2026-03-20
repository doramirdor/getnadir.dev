"""
Cost Tracking Service for querying and managing cost usage data.

This service provides methods to query the cost_usage table and generate
cost analytics and reports.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass

from app.auth.supabase_auth import supabase

logger = logging.getLogger(__name__)


@dataclass
class CostSummary:
    """Summary of cost usage for a user or time period."""
    total_cost_usd: float
    llm_cost_usd: float
    routing_fee_usd: float
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    request_count: int
    avg_cost_per_request: float
    avg_cost_per_token: float
    top_models: List[Dict[str, Any]]
    cost_by_provider: Dict[str, float]
    cost_by_routing_strategy: Dict[str, float]


@dataclass
class DetailedCostRecord:
    """Detailed cost record from cost_usage table."""
    id: str
    request_id: str
    user_id: str
    model_name: str
    provider: str
    llm_cost_usd: float
    routing_fee_usd: float
    total_cost_usd: float
    prompt_tokens: int
    completion_tokens: int
    routing_strategy: str
    uses_own_keys: bool
    created_at: datetime
    metadata: Dict[str, Any]


class CostTrackingService:
    """Service for tracking and querying cost usage data."""
    
    def __init__(self):
        """Initialize the cost tracking service."""
        self.supabase = supabase
    
    async def get_user_cost_summary(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> CostSummary:
        """
        Get cost summary for a specific user.
        
        Args:
            user_id: User ID to get costs for
            start_date: Start date for the summary (optional)
            end_date: End date for the summary (optional)
            
        Returns:
            CostSummary with aggregated cost data
        """
        try:
            # Build query
            query = self.supabase.table("cost_usage").select("*").eq("user_id", user_id)
            
            if start_date:
                query = query.gte("created_at", start_date.isoformat())
            
            if end_date:
                query = query.lte("created_at", end_date.isoformat())
                
            # Execute query
            result = query.execute()
            
            if not result.data:
                return CostSummary(
                    total_cost_usd=0.0,
                    llm_cost_usd=0.0,
                    routing_fee_usd=0.0,
                    total_tokens=0,
                    prompt_tokens=0,
                    completion_tokens=0,
                    request_count=0,
                    avg_cost_per_request=0.0,
                    avg_cost_per_token=0.0,
                    top_models=[],
                    cost_by_provider={},
                    cost_by_routing_strategy={}
                )
            
            # Calculate aggregations
            records = result.data
            total_cost = sum(float(r["total_cost_usd"]) for r in records)
            llm_cost = sum(float(r["llm_cost_usd"]) for r in records)
            routing_fee = sum(float(r["routing_fee_usd"]) for r in records)
            total_tokens = sum(r["total_tokens"] for r in records)
            prompt_tokens = sum(r["prompt_tokens"] for r in records)
            completion_tokens = sum(r["completion_tokens"] for r in records)
            request_count = len(records)
            
            # Calculate averages
            avg_cost_per_request = total_cost / request_count if request_count > 0 else 0
            avg_cost_per_token = total_cost / total_tokens if total_tokens > 0 else 0
            
            # Calculate top models
            model_costs = {}
            for record in records:
                model = record["model_name"]
                model_costs[model] = model_costs.get(model, 0) + float(record["total_cost_usd"])
            
            top_models = [
                {"model": model, "cost_usd": cost, "usage_count": sum(1 for r in records if r["model_name"] == model)}
                for model, cost in sorted(model_costs.items(), key=lambda x: x[1], reverse=True)[:5]
            ]
            
            # Calculate cost by provider
            provider_costs = {}
            for record in records:
                provider = record["provider"]
                provider_costs[provider] = provider_costs.get(provider, 0) + float(record["total_cost_usd"])
            
            # Calculate cost by routing strategy
            strategy_costs = {}
            for record in records:
                strategy = record["routing_strategy"]
                strategy_costs[strategy] = strategy_costs.get(strategy, 0) + float(record["total_cost_usd"])
            
            return CostSummary(
                total_cost_usd=total_cost,
                llm_cost_usd=llm_cost,
                routing_fee_usd=routing_fee,
                total_tokens=total_tokens,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                request_count=request_count,
                avg_cost_per_request=avg_cost_per_request,
                avg_cost_per_token=avg_cost_per_token,
                top_models=top_models,
                cost_by_provider=provider_costs,
                cost_by_routing_strategy=strategy_costs
            )
            
        except Exception as e:
            logger.error(f"Error getting user cost summary: {str(e)}")
            raise
    
    async def get_detailed_cost_records(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[DetailedCostRecord]:
        """
        Get detailed cost records for a user.
        
        Args:
            user_id: User ID to get records for
            limit: Maximum number of records to return
            offset: Number of records to skip
            start_date: Start date filter (optional)
            end_date: End date filter (optional)
            
        Returns:
            List of DetailedCostRecord objects
        """
        try:
            query = (
                self.supabase.table("cost_usage")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .offset(offset)
            )
            
            if start_date:
                query = query.gte("created_at", start_date.isoformat())
            
            if end_date:
                query = query.lte("created_at", end_date.isoformat())
            
            result = query.execute()
            
            if not result.data:
                return []
            
            # Convert to DetailedCostRecord objects
            records = []
            for r in result.data:
                records.append(DetailedCostRecord(
                    id=r["id"],
                    request_id=r["request_id"],
                    user_id=r["user_id"],
                    model_name=r["model_name"],
                    provider=r["provider"],
                    llm_cost_usd=float(r["llm_cost_usd"]),
                    routing_fee_usd=float(r["routing_fee_usd"]),
                    total_cost_usd=float(r["total_cost_usd"]),
                    prompt_tokens=r["prompt_tokens"],
                    completion_tokens=r["completion_tokens"],
                    routing_strategy=r["routing_strategy"],
                    uses_own_keys=r["uses_own_keys"],
                    created_at=datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")),
                    metadata=r.get("metadata", {})
                ))
            
            return records
            
        except Exception as e:
            logger.error(f"Error getting detailed cost records: {str(e)}")
            raise
    
    async def get_cost_by_model(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get cost breakdown by model for a user.
        
        Args:
            user_id: User ID to get costs for
            start_date: Start date filter (optional)
            end_date: End date filter (optional)
            
        Returns:
            Dictionary with model costs and usage statistics
        """
        try:
            query = self.supabase.table("cost_usage").select("*").eq("user_id", user_id)
            
            if start_date:
                query = query.gte("created_at", start_date.isoformat())
            
            if end_date:
                query = query.lte("created_at", end_date.isoformat())
            
            result = query.execute()
            
            if not result.data:
                return {}
            
            # Group by model
            model_stats = {}
            for record in result.data:
                model = record["model_name"]
                if model not in model_stats:
                    model_stats[model] = {
                        "total_cost_usd": 0.0,
                        "llm_cost_usd": 0.0,
                        "routing_fee_usd": 0.0,
                        "request_count": 0,
                        "total_tokens": 0,
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "provider": record["provider"],
                        "avg_cost_per_request": 0.0,
                        "avg_cost_per_token": 0.0
                    }
                
                stats = model_stats[model]
                stats["total_cost_usd"] += float(record["total_cost_usd"])
                stats["llm_cost_usd"] += float(record["llm_cost_usd"])
                stats["routing_fee_usd"] += float(record["routing_fee_usd"])
                stats["request_count"] += 1
                stats["total_tokens"] += record["total_tokens"]
                stats["prompt_tokens"] += record["prompt_tokens"]
                stats["completion_tokens"] += record["completion_tokens"]
            
            # Calculate averages
            for model, stats in model_stats.items():
                stats["avg_cost_per_request"] = stats["total_cost_usd"] / stats["request_count"]
                stats["avg_cost_per_token"] = stats["total_cost_usd"] / stats["total_tokens"] if stats["total_tokens"] > 0 else 0
            
            return model_stats
            
        except Exception as e:
            logger.error(f"Error getting cost by model: {str(e)}")
            raise
    
    async def get_daily_cost_trend(
        self,
        user_id: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get daily cost trend for a user.
        
        Args:
            user_id: User ID to get trend for
            days: Number of days to include in trend
            
        Returns:
            List of daily cost summaries
        """
        try:
            start_date = datetime.utcnow() - timedelta(days=days)
            
            query = (
                self.supabase.table("cost_usage")
                .select("*")
                .eq("user_id", user_id)
                .gte("created_at", start_date.isoformat())
                .order("created_at", desc=False)
            )
            
            result = query.execute()
            
            if not result.data:
                return []
            
            # Group by date
            daily_costs = {}
            for record in result.data:
                date_str = record["created_at"][:10]  # Get YYYY-MM-DD part
                if date_str not in daily_costs:
                    daily_costs[date_str] = {
                        "date": date_str,
                        "total_cost_usd": 0.0,
                        "llm_cost_usd": 0.0,
                        "routing_fee_usd": 0.0,
                        "request_count": 0,
                        "total_tokens": 0
                    }
                
                daily_costs[date_str]["total_cost_usd"] += float(record["total_cost_usd"])
                daily_costs[date_str]["llm_cost_usd"] += float(record["llm_cost_usd"])
                daily_costs[date_str]["routing_fee_usd"] += float(record["routing_fee_usd"])
                daily_costs[date_str]["request_count"] += 1
                daily_costs[date_str]["total_tokens"] += record["total_tokens"]
            
            return list(daily_costs.values())
            
        except Exception as e:
            logger.error(f"Error getting daily cost trend: {str(e)}")
            raise
    
    async def update_user_budget_used(self, user_id: str, additional_cost: float):
        """
        Atomically update user's budget_used with the additional cost.

        Uses a PostgreSQL RPC function to perform an atomic
        ``budget_used = budget_used + amount`` update, preventing the
        read-modify-write race condition that occurs under concurrent requests.

        Args:
            user_id: User ID to update
            additional_cost: Additional cost to add to budget_used
        """
        try:
            result = self.supabase.rpc(
                "increment_budget_used",
                {"p_user_id": user_id, "p_amount": additional_cost},
            ).execute()

            new_budget_used = result.data
            if new_budget_used is not None:
                logger.info(
                    f"Updated budget for user {user_id}: +${additional_cost:.6f} -> ${float(new_budget_used):.6f}"
                )
            else:
                logger.warning(f"User {user_id} not found for budget update")

        except Exception as e:
            logger.error(f"Error updating user budget: {str(e)}")


# Global instance
cost_tracking_service = CostTrackingService()