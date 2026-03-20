"""
Supabase database service for Horizen.

This module provides a complete database service using Supabase,
handling all data operations for the intelligent LLM routing platform.
"""
import json
import base64
from typing import Dict, Any, List, Optional, Union, Tuple
from datetime import datetime, timedelta
import logging

from supabase import Client
from app.auth.supabase_auth import supabase
from app.settings import settings

logger = logging.getLogger(__name__)


class SupabaseDB:
    """Supabase database service for all data operations."""
    
    def __init__(self):
        self.client: Client = supabase
    
    # ==================== CLUSTERS ====================
    
    async def create_cluster(
        self,
        cluster_id: str,
        name: str,
        description: str,
        user_id: Optional[str] = None,
        centroid: Optional[bytes] = None,
        examples: Optional[List[Dict[str, Any]]] = None,
        classification_criteria: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Create a new cluster."""
        try:
            data = {
                "id": cluster_id,
                "name": name,
                "description": description,
                "user_id": user_id,
                "examples": examples or [],
                "classification_criteria": classification_criteria or [],
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            
            # Encode binary centroid as base64 if provided
            if centroid:
                data["centroid"] = base64.b64encode(centroid).decode('utf-8')
            
            response = self.client.table("clusters").insert(data).execute()
            
            if response.data and len(response.data) > 0:
                logger.info(f"Created cluster: {cluster_id}")
                return response.data[0]
            else:
                raise Exception(f"Failed to create cluster: {response}")
                
        except Exception as e:
            logger.error(f"Error creating cluster {cluster_id}: {str(e)}")
            raise
    
    async def get_cluster(self, cluster_id: str) -> Optional[Dict[str, Any]]:
        """Get a cluster by ID."""
        try:
            response = self.client.table("clusters").select("*").eq("id", cluster_id).execute()
            
            if response.data and len(response.data) > 0:
                cluster = response.data[0]
                # Decode centroid from base64 if present
                if cluster.get("centroid"):
                    cluster["centroid"] = base64.b64decode(cluster["centroid"])
                return cluster
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting cluster {cluster_id}: {str(e)}")
            return None
    
    async def get_clusters_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all clusters for a user."""
        try:
            response = self.client.table("clusters").select("*").eq("user_id", user_id).execute()
            
            clusters = response.data or []
            # Decode centroids from base64
            for cluster in clusters:
                if cluster.get("centroid"):
                    cluster["centroid"] = base64.b64decode(cluster["centroid"])
            
            return clusters
            
        except Exception as e:
            logger.error(f"Error getting clusters for user {user_id}: {str(e)}")
            return []
    
    async def get_all_clusters(self) -> List[Dict[str, Any]]:
        """Get all clusters (for system-wide operations)."""
        try:
            response = self.client.table("clusters").select("*").execute()
            
            clusters = response.data or []
            # Decode centroids from base64
            for cluster in clusters:
                if cluster.get("centroid"):
                    cluster["centroid"] = base64.b64decode(cluster["centroid"])
            
            return clusters
            
        except Exception as e:
            logger.error(f"Error getting all clusters: {str(e)}")
            return []
    
    async def update_cluster(
        self,
        cluster_id: str,
        **updates
    ) -> Optional[Dict[str, Any]]:
        """Update a cluster."""
        try:
            # Encode centroid as base64 if being updated
            if "centroid" in updates and updates["centroid"]:
                updates["centroid"] = base64.b64encode(updates["centroid"]).decode('utf-8')
            
            updates["updated_at"] = datetime.utcnow().isoformat()
            
            response = self.client.table("clusters").update(updates).eq("id", cluster_id).execute()
            
            if response.data and len(response.data) > 0:
                cluster = response.data[0]
                # Decode centroid from base64 if present
                if cluster.get("centroid"):
                    cluster["centroid"] = base64.b64decode(cluster["centroid"])
                return cluster
            
            return None
            
        except Exception as e:
            logger.error(f"Error updating cluster {cluster_id}: {str(e)}")
            return None
    
    async def delete_cluster(self, cluster_id: str) -> bool:
        """Delete a cluster."""
        try:
            response = self.client.table("clusters").delete().eq("id", cluster_id).execute()
            logger.info(f"Deleted cluster: {cluster_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting cluster {cluster_id}: {str(e)}")
            return False
    
    # ==================== EXPERT MODELS ====================
    
    async def create_expert_model(
        self,
        user_id: str,
        cluster_id: str,
        endpoint_url: str,
        model_name: str,
        sample_count: int,
        metrics: Optional[Dict[str, Any]] = None,
        is_active: bool = True
    ) -> Dict[str, Any]:
        """Create a new expert model."""
        try:
            data = {
                "user_id": user_id,
                "cluster_id": cluster_id,
                "endpoint_url": endpoint_url,
                "model_name": model_name,
                "sample_count": sample_count,
                "is_active": is_active,
                "metrics": metrics or {},
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            
            response = self.client.table("expert_models").insert(data).execute()
            
            if response.data and len(response.data) > 0:
                logger.info(f"Created expert model: {model_name} for cluster {cluster_id}")
                return response.data[0]
            else:
                raise Exception(f"Failed to create expert model: {response}")
                
        except Exception as e:
            logger.error(f"Error creating expert model {model_name}: {str(e)}")
            raise
    
    async def get_expert_models_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all expert models for a user."""
        try:
            response = self.client.table("expert_models").select("*").eq("user_id", user_id).execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting expert models for user {user_id}: {str(e)}")
            return []
    
    async def get_expert_models_by_cluster(self, cluster_id: str) -> List[Dict[str, Any]]:
        """Get all expert models for a cluster."""
        try:
            response = self.client.table("expert_models").select("*").eq("cluster_id", cluster_id).eq("is_active", True).execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting expert models for cluster {cluster_id}: {str(e)}")
            return []
    
    async def update_expert_model(
        self,
        model_id: str,
        **updates
    ) -> Optional[Dict[str, Any]]:
        """Update an expert model."""
        try:
            updates["updated_at"] = datetime.utcnow().isoformat()
            
            response = self.client.table("expert_models").update(updates).eq("id", model_id).execute()
            
            if response.data and len(response.data) > 0:
                return response.data[0]
            
            return None
            
        except Exception as e:
            logger.error(f"Error updating expert model {model_id}: {str(e)}")
            return None
    
    # ==================== USAGE EVENTS & LOGGING ====================
    
    async def log_usage_event(
        self,
        request_id: str,
        user_id: str,
        model_name: str,
        provider: str,
        tokens_in: int,
        tokens_out: int,
        cost: float,
        route: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        latency_ms: Optional[int] = None,
        cluster_id: Optional[str] = None,
        embedding: Optional[bytes] = None,
        metadata: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None
    ) -> Dict[str, Any]:
        """Log a usage event with comprehensive details."""
        try:
            # Helper functions for safe type conversion
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
            if metadata:
                for key, value in metadata.items():
                    if isinstance(value, (int, float, str, bool, list, dict, type(None))):
                        clean_metadata[key] = value
                    else:
                        # Convert non-serializable types to string
                        clean_metadata[key] = str(value)
            
            data = {
                "request_id": str(request_id),
                "user_id": str(user_id),
                "model_name": str(model_name),
                "provider": str(provider),
                "tokens_in": safe_int(tokens_in),
                "tokens_out": safe_int(tokens_out),
                "cost": safe_float(cost),
                "route": str(route),
                "prompt": str(prompt) if prompt is not None else None,
                "response": str(response) if response is not None else None,
                "latency_ms": safe_int(latency_ms) if latency_ms is not None else None,
                "cluster_id": str(cluster_id) if cluster_id is not None else None,
                "metadata": clean_metadata,
                "error": str(error) if error is not None else None,
                "created_at": datetime.utcnow().isoformat()
            }
            
            # Encode embedding as base64 if provided
            if embedding:
                data["embedding"] = base64.b64encode(embedding).decode('utf-8')
            
            try:
                response = self.client.table("usage_events").insert(data).execute()
                
                if response.data and len(response.data) > 0:
                    logger.info(f"✅ Logged usage event to Supabase: {request_id}")
                    return response.data[0]
                else:
                    raise Exception(f"Failed to log usage event: {response}")
                    
            except Exception as table_error:
                # If usage_events table doesn't exist, log to console and continue
                logger.warning(f"⚠️ usage_events table not found, logging to console: {table_error}")
                logger.info(f"📊 USAGE EVENT: {request_id} | User: {user_id} | Model: {model_name} | Cost: ${safe_float(cost):.6f} | Tokens: {safe_int(tokens_in)}/{safe_int(tokens_out)}")
                
                # Return a mock response to keep the system working
                return {
                    "id": request_id,
                    "request_id": request_id,
                    "user_id": user_id,
                    "model_name": model_name,
                    "cost": safe_float(cost),
                    "status": "logged_to_console",
                    "created_at": datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Error logging usage event {request_id}: {str(e)}")
            # Don't raise - allow the system to continue working even if logging fails
            return {
                "id": request_id,
                "request_id": request_id,
                "error": str(e),
                "status": "failed",
                "created_at": datetime.utcnow().isoformat()
            }
    
    async def get_usage_event(self, request_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific usage event by request ID and user ID."""
        try:
            response = self.client.table("usage_events").select("*").eq("request_id", request_id).eq("user_id", user_id).execute()
            
            if response.data and len(response.data) > 0:
                event = response.data[0]
                # Decode embedding from base64 if present
                if event.get("embedding"):
                    event["embedding"] = base64.b64decode(event["embedding"])
                return event
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting usage event {request_id}: {str(e)}")
            return None
    
    async def get_user_usage_events(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 50,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get paginated usage events for a user with total count."""
        try:
            # Get total count first
            count_query = self.client.table("usage_events").select("*", count="exact").eq("user_id", user_id)
            if start_date:
                count_query = count_query.gte("created_at", start_date)
            if end_date:
                count_query = count_query.lte("created_at", end_date)
            
            count_response = count_query.execute()
            total_count = count_response.count or 0
            
            # Get paginated data
            offset = (page - 1) * page_size
            query = self.client.table("usage_events").select("*").eq("user_id", user_id)
            
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
            
            response = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
            
            events = response.data or []
            # Decode embeddings from base64
            for event in events:
                if event.get("embedding"):
                    event["embedding"] = base64.b64decode(event["embedding"])
            
            return events, total_count
            
        except Exception as e:
            logger.error(f"Error getting usage events for user {user_id}: {str(e)}")
            return [], 0

    async def get_usage_events_by_user(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get usage events for a user with pagination and date filtering."""
        try:
            query = self.client.table("usage_events").select("*").eq("user_id", user_id)
            
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
            
            response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
            
            events = response.data or []
            # Decode embeddings from base64
            for event in events:
                if event.get("embedding"):
                    event["embedding"] = base64.b64decode(event["embedding"])
            
            return events
            
        except Exception as e:
            logger.error(f"Error getting usage events for user {user_id}: {str(e)}")
            return []
    
    async def get_usage_stats(
        self,
        user_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get usage statistics for a user."""
        try:
            query = self.client.table("usage_events").select("cost, tokens_in, tokens_out, model_name, provider").eq("user_id", user_id)
            
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
            
            response = query.execute()
            events = response.data or []
            
            if not events:
                return {
                    "total_requests": 0,
                    "total_cost": 0.0,
                    "total_tokens_in": 0,
                    "total_tokens_out": 0,
                    "models_used": {},
                    "providers_used": {}
                }
            
            total_cost = sum(event["cost"] for event in events)
            total_tokens_in = sum(event["tokens_in"] for event in events)
            total_tokens_out = sum(event["tokens_out"] for event in events)
            
            models_used = {}
            providers_used = {}
            
            for event in events:
                model = event["model_name"]
                provider = event["provider"]
                
                models_used[model] = models_used.get(model, 0) + 1
                providers_used[provider] = providers_used.get(provider, 0) + 1
            
            return {
                "total_requests": len(events),
                "total_cost": total_cost,
                "total_tokens_in": total_tokens_in,
                "total_tokens_out": total_tokens_out,
                "models_used": models_used,
                "providers_used": providers_used
            }
            
        except Exception as e:
            logger.error(f"Error getting usage stats for user {user_id}: {str(e)}")
            return {}
    
    async def get_user_clusters(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all clusters associated with a user."""
        try:
            response = self.client.table("user_clusters").select("*, clusters(*)").eq("user_id", user_id).execute()
            
            clusters = []
            for item in response.data or []:
                if item.get("clusters"):
                    clusters.append(item["clusters"])
            
            return clusters
            
        except Exception as e:
            logger.error(f"Error getting user clusters for {user_id}: {str(e)}")
            return []
    
    async def get_all_clusters(self) -> List[Dict[str, Any]]:
        """Get all available clusters."""
        try:
            response = self.client.table("clusters").select("*").execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting all clusters: {str(e)}")
            return []

    async def get_usage_event(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific usage event by request ID."""
        try:
            response = self.client.table("usage_events").select("*").eq("request_id", request_id).execute()
            
            if response.data and len(response.data) > 0:
                event = response.data[0]
                # Decode embedding from base64 if present
                if event.get("embedding"):
                    event["embedding"] = base64.b64decode(event["embedding"])
                return event
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting usage event {request_id}: {str(e)}")
            return None
    
    # ==================== AVAILABLE MODELS ====================
    
    async def upsert_model(
        self,
        model_id: str,
        provider: str,
        model_name: Optional[str] = None,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        input_modalities: Optional[List[str]] = None,
        output_modalities: Optional[List[str]] = None,
        supports_streaming: bool = False,
        supports_function_calling: bool = False,
        context_length: Optional[int] = None,
        max_output_tokens: Optional[int] = None,
        training_data_cutoff: Optional[str] = None,
        pricing_input_per_1m_tokens: Optional[float] = None,
        pricing_output_per_1m_tokens: Optional[float] = None,
        lifecycle_status: Optional[str] = None,
        customization_supported: Optional[List[str]] = None,
        model_metadata: Optional[Dict[str, Any]] = None,
        is_available: bool = True
    ) -> Dict[str, Any]:
        """Upsert (insert or update) a model in the available_models table."""
        try:
            data = {
                "model_id": model_id,
                "provider": provider,
                "model_name": model_name,
                "display_name": display_name,
                "description": description,
                "input_modalities": input_modalities or [],
                "output_modalities": output_modalities or [],
                "supports_streaming": supports_streaming,
                "supports_function_calling": supports_function_calling,
                "context_length": context_length,
                "max_output_tokens": max_output_tokens,
                "training_data_cutoff": training_data_cutoff,
                "pricing_input_per_1m_tokens": pricing_input_per_1m_tokens,
                "pricing_output_per_1m_tokens": pricing_output_per_1m_tokens,
                "lifecycle_status": lifecycle_status,
                "customization_supported": customization_supported or [],
                "model_metadata": model_metadata or {},
                "is_available": is_available,
                "last_updated": datetime.utcnow().isoformat()
            }
            
            # Try to update first, then insert if not exists
            response = self.client.table("available_models").upsert(
                data,
                on_conflict="provider,model_id"
            ).execute()
            
            return response.data[0] if response.data else data
            
        except Exception as e:
            logger.error(f"Error upserting model {provider}/{model_id}: {str(e)}")
            return {}
    
    async def get_models_by_provider(
        self,
        provider: str,
        is_available: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """Get all models for a specific provider."""
        try:
            query = self.client.table("available_models").select("*").eq("provider", provider)
            
            if is_available is not None:
                query = query.eq("is_available", is_available)
            
            response = query.order("model_id").execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting models for provider {provider}: {str(e)}")
            return []
    
    async def get_all_available_models(
        self,
        is_available: Optional[bool] = True
    ) -> List[Dict[str, Any]]:
        """Get all available models from all providers."""
        try:
            query = self.client.table("available_models").select("*")
            
            if is_available is not None:
                query = query.eq("is_available", is_available)
            
            response = query.order("provider", "model_id").execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting all available models: {str(e)}")
            return []
    
    async def get_model_by_id(
        self,
        provider: str,
        model_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific model by provider and model_id."""
        try:
            response = self.client.table("available_models").select("*").eq(
                "provider", provider
            ).eq("model_id", model_id).execute()
            
            return response.data[0] if response.data else None
            
        except Exception as e:
            logger.error(f"Error getting model {provider}/{model_id}: {str(e)}")
            return None
    
    async def mark_models_unavailable(
        self,
        provider: str,
        excluded_model_ids: Optional[List[str]] = None
    ) -> int:
        """Mark models as unavailable, optionally excluding specific model IDs."""
        try:
            query = self.client.table("available_models").update({
                "is_available": False,
                "last_updated": datetime.utcnow().isoformat()
            }).eq("provider", provider)
            
            # If excluded_model_ids is provided, don't mark those as unavailable
            if excluded_model_ids:
                query = query.not_.in_("model_id", excluded_model_ids)
            
            response = query.execute()
            return len(response.data) if response.data else 0
            
        except Exception as e:
            logger.error(f"Error marking models unavailable for provider {provider}: {str(e)}")
            return 0
    
    async def cleanup_stale_models(
        self,
        older_than_days: int = 7
    ) -> int:
        """Remove models that haven't been updated in the specified number of days."""
        try:
            cutoff_date = (datetime.utcnow() - timedelta(days=older_than_days)).isoformat()
            
            response = self.client.table("available_models").delete().lt(
                "last_updated", cutoff_date
            ).eq("is_available", False).execute()
            
            return len(response.data) if response.data else 0
            
        except Exception as e:
            logger.error(f"Error cleaning up stale models: {str(e)}")
            return 0
    
    async def get_provider_stats(self) -> Dict[str, Any]:
        """Get statistics about available models by provider."""
        try:
            response = self.client.table("available_models").select(
                "provider, is_available"
            ).execute()
            
            stats = {}
            for row in response.data or []:
                provider = row["provider"]
                is_available = row["is_available"]
                
                if provider not in stats:
                    stats[provider] = {"total": 0, "available": 0, "unavailable": 0}
                
                stats[provider]["total"] += 1
                if is_available:
                    stats[provider]["available"] += 1
                else:
                    stats[provider]["unavailable"] += 1
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting provider stats: {str(e)}")
            return {}
    
    async def search_models(
        self,
        search_term: str,
        provider: Optional[str] = None,
        is_available: Optional[bool] = True
    ) -> List[Dict[str, Any]]:
        """Search for models by name or description."""
        try:
            query = self.client.table("available_models").select("*")
            
            if provider:
                query = query.eq("provider", provider)
            
            if is_available is not None:
                query = query.eq("is_available", is_available)
            
            # Search in model_id, model_name, display_name, and description
            query = query.or_(
                f"model_id.ilike.%{search_term}%,"
                f"model_name.ilike.%{search_term}%,"
                f"display_name.ilike.%{search_term}%,"
                f"description.ilike.%{search_term}%"
            )
            
            response = query.order("provider", "model_id").execute()
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error searching models for '{search_term}': {str(e)}")
            return []

    # ==================== UTILITY METHODS ====================
    
    async def health_check(self) -> bool:
        """Check if Supabase connection is healthy (retries on transient failures)."""
        retries = 2
        for attempt in range(retries + 1):
            try:
                self.client.table("profiles").select("id").limit(1).execute()
                return True
            except Exception as e:
                if attempt < retries:
                    import asyncio
                    await asyncio.sleep(0.3 * (attempt + 1))
                    continue
                logger.error(f"Supabase health check failed after {retries + 1} attempts: {str(e)}")
                return False
        return False
    
    async def get_table_count(self, table_name: str) -> int:
        """Get the count of records in a table."""
        try:
            response = self.client.table(table_name).select("id", count="exact").execute()
            return response.count if hasattr(response, 'count') else 0
        except Exception as e:
            logger.error(f"Error getting count for table {table_name}: {str(e)}")
            return 0
    
    # ==================== ENHANCED ROUTING METHODS ====================
    
    async def log_fallback_event(
        self,
        user_id: str,
        event_type: str,
        successful_model: Optional[str] = None,
        successful_provider: Optional[str] = None,
        attempt_number: Optional[int] = None,
        failed_attempts: Optional[List[Dict[str, Any]]] = None,
        final_error: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Log a fallback event."""
        try:
            data = {
                "user_id": user_id,
                "event_type": event_type,
                "successful_model": successful_model,
                "successful_provider": successful_provider,
                "attempt_number": attempt_number,
                "failed_attempts": failed_attempts or [],
                "final_error": final_error,
                "request_id": request_id
            }
            
            response = self.client.table("fallback_events").insert(data).execute()
            return response.data[0] if response.data else {}
            
        except Exception as e:
            logger.error(f"Error logging fallback event: {str(e)}")
            return {}
    
    async def create_load_balancing_policy(
        self,
        user_id: str,
        policy: Any  # LoadBalancingPolicy object
    ) -> Dict[str, Any]:
        """Create a load balancing policy."""
        try:
            data = {
                "user_id": user_id,
                "name": policy.name,
                "strategy": policy.strategy.value,
                "models": [
                    {
                        "model_id": m.model_id,
                        "provider": m.provider,
                        "weight": m.weight,
                        "cost_per_1m_tokens": m.cost_per_1m_tokens,
                        "avg_response_time_ms": m.avg_response_time_ms,
                        "success_rate": m.success_rate,
                        "enabled": m.enabled
                    }
                    for m in policy.models
                ],
                "enabled": policy.enabled,
                "test_duration_days": policy.test_duration_days,
                "test_start_date": policy.test_start_date,
                "test_end_date": policy.test_end_date,
                "control_group_weight": policy.control_group_weight,
                "max_response_time_ms": policy.max_response_time_ms,
                "min_success_rate": policy.min_success_rate,
                "max_cost_per_1m_tokens": policy.max_cost_per_1m_tokens
            }
            
            response = self.client.table("load_balancing_policies").insert(data).execute()
            return response.data[0] if response.data else {}
            
        except Exception as e:
            logger.error(f"Error creating load balancing policy: {str(e)}")
            return {}
    
    async def get_load_balancing_policies(
        self,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Get all load balancing policies for a user."""
        try:
            response = self.client.table("load_balancing_policies").select("*").eq(
                "user_id", user_id
            ).order("created_at", desc=True).execute()
            
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting load balancing policies: {str(e)}")
            return []
    
    async def delete_load_balancing_policy(
        self,
        user_id: str,
        policy_name: str
    ) -> bool:
        """Delete a load balancing policy."""
        try:
            response = self.client.table("load_balancing_policies").delete().eq(
                "user_id", user_id
            ).eq("name", policy_name).execute()
            
            return len(response.data) > 0 if response.data else False
            
        except Exception as e:
            logger.error(f"Error deleting load balancing policy: {str(e)}")
            return False
    
    async def log_load_balancing_decision(
        self,
        user_id: str,
        policy_name: str,
        selected_model: str,
        selected_provider: str,
        model_weight: float,
        response_success: bool,
        response_time_ms: Optional[int] = None,
        cost: Optional[float] = None,
        tokens_used: Optional[int] = None,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Log a load balancing decision."""
        try:
            data = {
                "user_id": user_id,
                "policy_name": policy_name,
                "selected_model": selected_model,
                "selected_provider": selected_provider,
                "model_weight": model_weight,
                "response_success": response_success,
                "response_time_ms": response_time_ms,
                "cost": cost,
                "tokens_used": tokens_used,
                "request_id": request_id
            }
            
            response = self.client.table("load_balancing_decisions").insert(data).execute()
            return response.data[0] if response.data else {}
            
        except Exception as e:
            logger.error(f"Error logging load balancing decision: {str(e)}")
            return {}
    
    async def get_ab_test_results(
        self,
        user_id: str,
        test_name: str
    ) -> List[Dict[str, Any]]:
        """Get A/B test results."""
        try:
            response = self.client.table("load_balancing_decisions").select("*").eq(
                "user_id", user_id
            ).eq("policy_name", test_name).execute()
            
            return response.data or []
            
        except Exception as e:
            logger.error(f"Error getting A/B test results: {str(e)}")
            return []
    
    async def get_model_usage_stats(
        self,
        user_id: str,
        model_id: str,
        provider: str
    ) -> Dict[str, Any]:
        """Get usage statistics for a specific model."""
        try:
            response = self.client.table("enhanced_usage_logs").select(
                "cost, tokens_in, tokens_out, response_time_ms, status"
            ).eq("user_id", user_id).eq("model_name", model_id).eq("provider", provider).execute()
            
            if not response.data:
                return {}
            
            total_requests = len(response.data)
            total_cost = sum(float(row.get("cost", 0)) for row in response.data)
            total_tokens = sum(int(row.get("tokens_in", 0)) + int(row.get("tokens_out", 0)) for row in response.data)
            successful_requests = sum(1 for row in response.data if row.get("status") == "completed")
            
            avg_response_time = 0
            if successful_requests > 0:
                response_times = [
                    int(row.get("response_time_ms", 0)) for row in response.data 
                    if row.get("status") == "completed" and row.get("response_time_ms")
                ]
                avg_response_time = sum(response_times) / len(response_times) if response_times else 0
            
            return {
                "total_requests": total_requests,
                "successful_requests": successful_requests,
                "success_rate": successful_requests / total_requests if total_requests > 0 else 0,
                "total_cost": total_cost,
                "total_tokens": total_tokens,
                "avg_response_time_ms": avg_response_time,
                "avg_cost_per_request": total_cost / total_requests if total_requests > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error getting model usage stats: {str(e)}")
            return {}
    
    async def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user profile data from Supabase."""
        try:
            response = self.client.table("profiles").select("*").eq("user_id", user_id).execute()
            if response.data:
                return response.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting user profile: {str(e)}")
            return None

    async def get_available_models(self) -> List[Dict[str, Any]]:
        """Get available models from Supabase or return default list."""
        try:
            # Try to get models from available_models table if it exists
            response = self.client.table("available_models").select("*").eq("is_available", True).execute()
            if response.data:
                return response.data
        except Exception as e:
            logger.debug(f"Available models table not accessible: {e}")
        
        # Return a default list of common models if table doesn't exist
        default_models = [
            {
                "model_id": "gpt-4o",
                "model_name": "GPT-4 Omni",
                "provider": "openai",
                "display_name": "GPT-4 Omni",
                "description": "Latest GPT-4 model with vision capabilities"
            },
            {
                "model_id": "gpt-4o-mini", 
                "model_name": "GPT-4 Omni Mini",
                "provider": "openai",
                "display_name": "GPT-4 Omni Mini",
                "description": "Smaller, faster GPT-4 model"
            },
            {
                "model_id": "claude-3-5-sonnet-20241022",
                "model_name": "Claude 3.5 Sonnet",
                "provider": "anthropic", 
                "display_name": "Claude 3.5 Sonnet",
                "description": "Latest Claude model with advanced reasoning"
            },
            {
                "model_id": "claude-3-haiku-20240307",
                "model_name": "Claude 3 Haiku",
                "provider": "anthropic",
                "display_name": "Claude 3 Haiku", 
                "description": "Fast and cost-effective Claude model"
            },
            {
                "model_id": "gemini-1.5-pro",
                "model_name": "Gemini 1.5 Pro",
                "provider": "google",
                "display_name": "Gemini 1.5 Pro",
                "description": "Google's most capable AI model"
            },
            {
                "model_id": "gemini-1.5-flash",
                "model_name": "Gemini 1.5 Flash", 
                "provider": "google",
                "display_name": "Gemini 1.5 Flash",
                "description": "Fast and efficient Gemini model"
            }
        ]
        return default_models

    async def update_user_budget(
        self,
        user_id: str,
        cost: float
    ) -> bool:
        """Update user's budget usage."""
        try:
            # Get current budget
            user_profile = await self.get_user_profile(user_id)
            if not user_profile:
                return False
            
            current_budget_used = float(user_profile.get("cost_this_month", 0))
            new_budget_used = current_budget_used + cost
            
            # Update budget in profiles table
            response = self.client.table("profiles").update({
                "cost_this_month": new_budget_used,
                "updated_at": "NOW()"
            }).eq("user_id", user_id).execute()
            
            return len(response.data) > 0 if response.data else False
            
        except Exception as e:
            logger.error(f"Error updating user budget: {str(e)}")
            return False
    
    async def get_usage_analytics(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Get usage analytics for a date range."""
        try:
            response = self.client.table("enhanced_usage_logs").select("*").eq(
                "user_id", user_id
            ).gte("created_at", start_date.isoformat()).lte("created_at", end_date.isoformat()).execute()
            
            if not response.data:
                return {}
            
            # Calculate analytics
            data = response.data
            total_requests = len(data)
            successful_requests = sum(1 for row in data if row.get("status") == "completed")
            total_cost = sum(float(row.get("cost", 0)) for row in data)
            total_tokens = sum(int(row.get("tokens_in", 0)) + int(row.get("tokens_out", 0)) for row in data)
            
            # Group by route type
            route_stats = {}
            for row in data:
                route = row.get("route", "unknown")
                if route not in route_stats:
                    route_stats[route] = {"count": 0, "cost": 0, "tokens": 0}
                route_stats[route]["count"] += 1
                route_stats[route]["cost"] += float(row.get("cost", 0))
                route_stats[route]["tokens"] += int(row.get("tokens_in", 0)) + int(row.get("tokens_out", 0))
            
            return {
                "total_requests": total_requests,
                "successful_requests": successful_requests,
                "success_rate": successful_requests / total_requests if total_requests > 0 else 0,
                "total_cost": total_cost,
                "total_tokens": total_tokens,
                "route_breakdown": route_stats
            }
            
        except Exception as e:
            logger.error(f"Error getting usage analytics: {str(e)}")
            return {}
    
    async def get_fallback_analytics(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Get fallback analytics for a date range."""
        try:
            response = self.client.table("fallback_events").select("*").eq(
                "user_id", user_id
            ).gte("created_at", start_date.isoformat()).lte("created_at", end_date.isoformat()).execute()
            
            if not response.data:
                return {}
            
            data = response.data
            total_events = len(data)
            successful_fallbacks = sum(1 for row in data if row.get("event_type") == "fallback_success")
            failed_fallbacks = sum(1 for row in data if row.get("event_type") == "fallback_failure")
            
            return {
                "total_fallback_events": total_events,
                "successful_fallbacks": successful_fallbacks,
                "failed_fallbacks": failed_fallbacks,
                "fallback_success_rate": successful_fallbacks / total_events if total_events > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error getting fallback analytics: {str(e)}")
            return {}
    
    async def get_load_balancing_analytics(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Get load balancing analytics for a date range."""
        try:
            response = self.client.table("load_balancing_decisions").select("*").eq(
                "user_id", user_id
            ).gte("created_at", start_date.isoformat()).lte("created_at", end_date.isoformat()).execute()
            
            if not response.data:
                return {}
            
            data = response.data
            total_decisions = len(data)
            successful_decisions = sum(1 for row in data if row.get("response_success"))
            
            # Group by policy
            policy_stats = {}
            for row in data:
                policy = row.get("policy_name", "unknown")
                if policy not in policy_stats:
                    policy_stats[policy] = {"count": 0, "cost": 0, "success_count": 0}
                policy_stats[policy]["count"] += 1
                policy_stats[policy]["cost"] += float(row.get("cost", 0))
                if row.get("response_success"):
                    policy_stats[policy]["success_count"] += 1
            
            return {
                "total_load_balanced_requests": total_decisions,
                "successful_requests": successful_decisions,
                "success_rate": successful_decisions / total_decisions if total_decisions > 0 else 0,
                "policy_breakdown": policy_stats
            }
            
        except Exception as e:
            logger.error(f"Error getting load balancing analytics: {str(e)}")
            return {}


# Global instance
supabase_db = SupabaseDB()