"""
Preset-based Router Service for LiteLLM with fallback and load balancing.

This service integrates user presets with the enhanced LiteLLM router to provide:
1. Preset-specific model configurations
2. Fallback strategies defined in presets
3. Load balancing policies from preset settings
4. Dynamic router creation based on preset selection
"""

import logging
import time
import uuid
from typing import Dict, Any, List, Optional, Union, AsyncGenerator
from datetime import datetime

from app.auth.supabase_auth import UserSession, supabase
from app.services.enhanced_litellm_router import EnhancedLiteLLMRouter
from app.schemas.completion import CompletionRequest, CompletionResponse

logger = logging.getLogger(__name__)


class PresetRouterService:
    """
    Service for managing preset-based LiteLLM routing with fallbacks and load balancing.
    
    Features:
    - Load preset configurations from database
    - Create specialized routers for each preset
    - Handle @preset/ model references
    - Automatic fallback configuration
    - Load balancing based on preset settings
    """
    
    def __init__(self, user_session: UserSession):
        """Initialize preset router service for a user."""
        self.user_session = user_session
        self.preset_routers = {}  # Cache of preset-specific routers
        self.default_router = None
        
        # Load user presets
        self.user_presets = {}
        self._load_user_presets()
        
        # Initialize default router
        self._initialize_default_router()
    
    def _load_user_presets(self):
        """Load user presets from Supabase."""
        try:
            # Query the presets table
            response = supabase.table("presets").select(
                "id, name, description, system_prompt, selected_models, model_parameters, created_at, updated_at"
            ).eq("user_id", self.user_session.id).execute()
            
            self.user_presets = {}
            for preset in response.data:
                # Extract slug from model_parameters
                model_params = preset.get("model_parameters", {})
                slug = model_params.get("slug", preset.get("name", "").lower().replace(" ", "-"))
                
                self.user_presets[slug] = {
                    "id": preset["id"],
                    "name": preset["name"],
                    "description": preset.get("description", ""),
                    "system_prompt": preset.get("system_prompt", ""),
                    "selected_models": preset.get("selected_models", []),
                    "model_parameters": model_params,
                    "created_at": preset.get("created_at"),
                    "updated_at": preset.get("updated_at")
                }
            
            logger.info(f"📚 Loaded {len(self.user_presets)} presets for user {self.user_session.id}")
            for slug, preset in self.user_presets.items():
                logger.info(f"   - {slug}: {preset['name']} ({len(preset['selected_models'])} models)")
            
        except Exception as e:
            logger.error(f"❌ Failed to load user presets: {e}")
            self.user_presets = {}
    
    def _initialize_default_router(self):
        """Initialize the default router with user's base configuration."""
        try:
            # Create enhanced router with user's default settings
            self.default_router = EnhancedLiteLLMRouter(self.user_session)
            logger.info("✅ Default router initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize default router: {e}")
            self.default_router = None
    
    async def get_router_for_model(self, model: str) -> EnhancedLiteLLMRouter:
        """
        Get the appropriate router for a given model.
        
        Args:
            model: Model name or preset reference (@preset/slug)
            
        Returns:
            EnhancedLiteLLMRouter instance
        """
        try:
            # Check if this is a preset reference
            if model.startswith("@preset/"):
                preset_slug = model.replace("@preset/", "")
                return await self._get_preset_router(preset_slug)
            else:
                # Use default router for direct model references
                return self.default_router or await self._create_fallback_router()
                
        except Exception as e:
            logger.error(f"❌ Failed to get router for model {model}: {e}")
            return await self._create_fallback_router()
    
    async def _get_preset_router(self, preset_slug: str) -> EnhancedLiteLLMRouter:
        """Get or create a router for a specific preset."""
        try:
            # Check cache first
            if preset_slug in self.preset_routers:
                return self.preset_routers[preset_slug]
            
            # Get preset configuration
            if preset_slug not in self.user_presets:
                raise ValueError(f"Preset '{preset_slug}' not found")
            
            preset_config = self.user_presets[preset_slug]
            
            # Create a modified user session with preset-specific configuration
            preset_user_session = self._create_preset_user_session(preset_config)
            
            # Create router for this preset
            preset_router = EnhancedLiteLLMRouter(preset_user_session)
            
            # Cache the router
            self.preset_routers[preset_slug] = preset_router
            
            logger.info(f"🎯 Created preset router for '{preset_slug}'")
            return preset_router
            
        except Exception as e:
            logger.error(f"❌ Failed to create preset router for '{preset_slug}': {e}")
            return self.default_router or await self._create_fallback_router()
    
    def _create_preset_user_session(self, preset_config: Dict[str, Any]) -> UserSession:
        """Create a modified user session with preset-specific API key configuration."""
        # Create a copy of the original user session
        preset_session = UserSession(
            id=self.user_session.id,
            email=self.user_session.email,
            name=self.user_session.name,
            api_key=self.user_session.api_key,
            allowed_providers=self.user_session.allowed_providers,
            allowed_models=self.user_session.allowed_models,
            benchmark_model=self.user_session.benchmark_model,
            budget_limit=self.user_session.budget_limit,
            budget_used=self.user_session.budget_used,
            clusters=self.user_session.clusters,
            api_key_config=self.user_session.api_key_config
        )
        
        # Override with preset-specific configuration
        model_params = preset_config.get("model_parameters", {})
        preset_api_config = {
            "selected_models": preset_config.get("selected_models", []),
            "benchmark_model": model_params.get("benchmarkModel"),
            "load_balancing_policy": model_params.get("loadBalancingPolicy", "round-robin"),
            "use_fallback": model_params.get("useFallback", True),
            "model_parameters": model_params,
            "slug": model_params.get("slug", preset_config.get("name", "").lower()),
            "name": preset_config.get("name", ""),
            "sort_strategy": model_params.get("sort", "smart-routing"),
            "system_prompt": preset_config.get("system_prompt", ""),
            
            # Fallback configuration
            "fallback_models": model_params.get("fallbackModels", []),
            "context_window_fallbacks": model_params.get("contextWindowFallbacks", {}),
            "content_policy_fallbacks": model_params.get("contentPolicyFallbacks", {}),
            
            # Advanced routing settings
            "routing_strategy": model_params.get("routingStrategy", "weighted-pick"),
            "enable_caching": model_params.get("enableCaching", True),
            "cache_ttl": model_params.get("cacheTTL", 300),
            
            # Performance settings
            "timeout": model_params.get("timeout", 60),
            "max_retries": model_params.get("maxRetries", 3),
            "enable_pre_call_check": model_params.get("enablePreCallCheck", True)
        }
        
        preset_session.api_key_config = preset_api_config
        
        return preset_session
    
    async def _create_fallback_router(self) -> EnhancedLiteLLMRouter:
        """Create a basic fallback router."""
        try:
            # Create a basic user session for fallback
            fallback_session = UserSession(
                id=self.user_session.id,
                email=self.user_session.email,
                name=self.user_session.name,
                api_key=self.user_session.api_key,
                allowed_providers=["openai", "anthropic"],
                allowed_models=["gpt-4o-mini", "claude-3-haiku-20240307"],
                benchmark_model="gpt-4o-mini",
                budget_limit=self.user_session.budget_limit,
                budget_used=self.user_session.budget_used,
                clusters=[],
                api_key_config={
                    "selected_models": ["gpt-4o-mini", "claude-3-haiku-20240307"],
                    "load_balancing_policy": "round-robin",
                    "use_fallback": True
                }
            )
            
            return EnhancedLiteLLMRouter(fallback_session)
            
        except Exception as e:
            logger.error(f"❌ Failed to create fallback router: {e}")
            raise
    
    async def completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        **kwargs
    ) -> Union[Dict[str, Any], AsyncGenerator[Dict[str, Any], None]]:
        """
        Generate completion using preset-based routing.
        
        Args:
            messages: Chat messages in OpenAI format
            model: Model name or preset reference (@preset/slug)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream the response
            **kwargs: Additional parameters
            
        Returns:
            Completion response or stream generator
        """
        start_time = time.time()
        request_id = kwargs.get("request_id", f"req_{uuid.uuid4().hex[:8]}")
        
        try:
            # Get the appropriate router
            router = await self.get_router_for_model(model)
            
            # Add preset context if this is a preset request
            enhanced_messages = messages.copy()
            if model.startswith("@preset/"):
                preset_slug = model.replace("@preset/", "")
                if preset_slug in self.user_presets:
                    preset_config = self.user_presets[preset_slug]
                    system_prompt = preset_config.get("system_prompt", "")
                    
                    if system_prompt:
                        # Add system message to the beginning
                        enhanced_messages.insert(0, {
                            "role": "system",
                            "content": system_prompt
                        })
                
                # For preset requests, use the first available model from the preset
                if preset_slug in self.user_presets:
                    preset_models = self.user_presets[preset_slug].get("selected_models", [])
                    if preset_models:
                        actual_model = preset_models[0]  # Use first model as primary
                    else:
                        actual_model = "gpt-4o-mini"  # Fallback
                else:
                    actual_model = "gpt-4o-mini"  # Fallback
            else:
                actual_model = model
            
            # Generate completion using the router
            result = await router.completion(
                messages=enhanced_messages,
                model=actual_model,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
                user_id=str(self.user_session.id),
                request_id=request_id,
                **kwargs
            )
            
            # Add preset metadata to response
            if isinstance(result, dict) and model.startswith("@preset/"):
                preset_slug = model.replace("@preset/", "")
                result["preset_used"] = preset_slug
                result["preset_config"] = self.user_presets.get(preset_slug, {})
                result["original_model_request"] = model
            
            return result
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            logger.error(f"❌ Preset router completion failed: {e}")
            
            return {
                "error": str(e),
                "model": model,
                "request_id": request_id,
                "latency_ms": latency_ms,
                "timestamp": time.time(),
                "service": "preset_router"
            }
    
    async def get_available_presets(self) -> List[Dict[str, Any]]:
        """Get list of available presets for the user."""
        try:
            presets_list = []
            for slug, preset in self.user_presets.items():
                preset_info = {
                    "slug": slug,
                    "name": preset["name"],
                    "description": preset["description"],
                    "model_count": len(preset["selected_models"]),
                    "models": preset["selected_models"],
                    "load_balancing_policy": preset["model_parameters"].get("loadBalancingPolicy", "round-robin"),
                    "has_fallback": preset["model_parameters"].get("useFallback", True),
                    "has_system_prompt": bool(preset["system_prompt"]),
                    "created_at": preset["created_at"],
                    "updated_at": preset["updated_at"]
                }
                presets_list.append(preset_info)
            
            # Sort by name
            presets_list.sort(key=lambda p: p["name"])
            
            return presets_list
            
        except Exception as e:
            logger.error(f"❌ Failed to get available presets: {e}")
            return []
    
    async def get_preset_details(self, preset_slug: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific preset."""
        try:
            if preset_slug not in self.user_presets:
                return None
            
            preset = self.user_presets[preset_slug]
            model_params = preset["model_parameters"]
            
            # Get router health for this preset
            router = await self._get_preset_router(preset_slug)
            health_info = router.get_router_health()
            
            return {
                "slug": preset_slug,
                "name": preset["name"],
                "description": preset["description"],
                "system_prompt": preset["system_prompt"],
                "selected_models": preset["selected_models"],
                "model_parameters": model_params,
                "router_health": health_info,
                "created_at": preset["created_at"],
                "updated_at": preset["updated_at"],
                
                # Extracted configuration for easy access
                "config": {
                    "benchmark_model": model_params.get("benchmarkModel"),
                    "load_balancing_policy": model_params.get("loadBalancingPolicy", "round-robin"),
                    "use_fallback": model_params.get("useFallback", True),
                    "routing_strategy": model_params.get("routingStrategy", "weighted-pick"),
                    "enable_caching": model_params.get("enableCaching", True),
                    "timeout": model_params.get("timeout", 60),
                    "max_retries": model_params.get("maxRetries", 3)
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get preset details for '{preset_slug}': {e}")
            return None
    
    async def test_preset_configuration(self, preset_slug: str) -> Dict[str, Any]:
        """Test a preset configuration with a simple completion."""
        try:
            if preset_slug not in self.user_presets:
                return {
                    "success": False,
                    "error": f"Preset '{preset_slug}' not found"
                }
            
            # Test with a simple message
            test_messages = [
                {"role": "user", "content": "Say 'Hello, this is a test' and nothing else."}
            ]
            
            start_time = time.time()
            
            result = await self.completion(
                messages=test_messages,
                model=f"@preset/{preset_slug}",
                temperature=0.1,
                max_tokens=50,
                stream=False
            )
            
            test_duration = time.time() - start_time
            
            if "error" in result:
                return {
                    "success": False,
                    "error": result["error"],
                    "test_duration_ms": int(test_duration * 1000)
                }
            else:
                return {
                    "success": True,
                    "preset_slug": preset_slug,
                    "model_used": result.get("model"),
                    "response_preview": result.get("content", "")[:100] + "..." if len(result.get("content", "")) > 100 else result.get("content", ""),
                    "latency_ms": result.get("latency_ms", 0),
                    "cost_usd": result.get("cost_usd", 0),
                    "fallback_used": result.get("fallback_used", False),
                    "test_duration_ms": int(test_duration * 1000)
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "preset_slug": preset_slug
            }
    
    def get_service_stats(self) -> Dict[str, Any]:
        """Get service statistics and health information."""
        return {
            "user_id": str(self.user_session.id),
            "total_presets": len(self.user_presets),
            "cached_routers": len(self.preset_routers),
            "default_router_available": self.default_router is not None,
            "preset_slugs": list(self.user_presets.keys()),
            "service_initialized": True
        }
    
    async def refresh_presets(self) -> bool:
        """Refresh preset configurations from database."""
        try:
            # Clear cached routers
            self.preset_routers.clear()
            
            # Reload presets
            self._load_user_presets()
            
            logger.info(f"🔄 Refreshed presets for user {self.user_session.id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to refresh presets: {e}")
            return False