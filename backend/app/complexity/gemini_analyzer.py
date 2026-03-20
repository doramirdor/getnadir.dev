"""
Gemini-based model recommender.
"""
import json
import re
import os
import hashlib
import logging
from typing import Any, Dict, Optional, List, Tuple
import asyncio
from difflib import SequenceMatcher
import google.generativeai as genai

from app.complexity.base_analyzer import BaseAnalyzer
from app.complexity.ranker.llm_ranker import LLMRanker
from app.services.tool_conversion_service import ToolConversionService
from app.services.embedding_cache import gemini_analyzer_cache
from app.complexity.model_registry import PERFORMANCE_TO_API, PROVIDER_MAPPING, map_performance_to_api, map_provider
from app.settings import settings

logger = logging.getLogger(__name__)


class GeminiModelRecommender(BaseAnalyzer):
    """Model recommender using Google's Gemini models with round-robin load balancing."""
    
    def __init__(self, api_key: Optional[str] = None, allowed_providers: Optional[List[str]] = None, allowed_models: Optional[List[str]] = None):
        """
        Initialize the Gemini model recommender.
        
        Args:
            api_key: Optional API key for Gemini API
            allowed_providers: Optional list of allowed providers to filter by
            allowed_models: Optional list of allowed models to filter by
        """
        super().__init__(model_name="models/gemini-2.5-flash", api_key=api_key or settings.GOOGLE_API_KEY)
        
        # Store allowed providers and models
        self.allowed_providers = allowed_providers
        self.allowed_models = allowed_models
        
        # Round-robin configuration for handling quota limits
        self.gemini_models = [
            'models/gemini-2.5-flash',
            'models/gemini-2.0-flash',
            'models/gemini-2.5-pro'
        ]
        self.current_model_index = 0
        self._round_robin_lock = asyncio.Lock()

        # Configure Gemini client
        try:
            genai.configure(api_key=self.api_key)
            # Start with first model in round-robin
            self.model = genai.GenerativeModel(self.gemini_models[0])
            logger.info(f"Initialized Gemini client with round-robin models: {self.gemini_models}")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")
            raise e
        
        # Load model performance data
        self.performance_data = self._load_model_performance_data()
        
        # Initialize supported models dictionary filtered by allowed providers/models
        self.supported_models = self._get_supported_models_from_performance_data()
        
        # Initialize LLM Ranker
        self.llm_ranker = LLMRanker(
            client=self,  # Pass the GeminiModelRecommender instance for round-robin support
            supported_models=self.supported_models,
            performance_data=self.performance_data
        )
        
        # Initialize Tool Conversion Service
        self.tool_conversion_service = ToolConversionService()
    
    def _get_next_gemini_model(self) -> str:
        """Get the next Gemini model in round-robin fashion (not thread-safe, use _get_next_gemini_model_safe for async)."""
        model_name = self.gemini_models[self.current_model_index]
        self.current_model_index = (self.current_model_index + 1) % len(self.gemini_models)
        logger.debug(f"Using Gemini model: {model_name} (index {self.current_model_index})")
        return model_name

    async def _get_next_gemini_model_safe(self) -> str:
        """Get the next Gemini model in round-robin fashion (thread-safe)."""
        async with self._round_robin_lock:
            return self._get_next_gemini_model()
    
    def _update_model(self, model_name: str):
        """Update the current Gemini model."""
        try:
            self.model = genai.GenerativeModel(model_name)
            logger.info(f"Updated to Gemini model: {model_name}")
        except Exception as e:
            logger.error(f"Failed to update to model {model_name}: {e}")
            raise e
    
    def map_performance_model_to_api(self, performance_model_name: str) -> str:
        """Map performance data model name to actual API model name."""
        return map_performance_to_api(performance_model_name)
   
    def _load_model_performance_data(self) -> List[Dict]:
        """Load model performance data from JSON file."""
        try:
            file_path = os.path.join(os.path.dirname(__file__), "..", "reference_data", "model_performance_clean.json")
            with open(file_path, "r") as f:
                data = json.load(f)
                # Extract the models array from the data
                return data.get("models", [])
        except Exception as e:
            logger.error(f"Error loading model performance data: {str(e)}")
            return []
    
    def _get_supported_models_from_performance_data(self) -> Dict[str, List[str]]:
        """Extract supported models from the performance data, filtered by allowed providers/models."""
        
        supported_models = {
            "openai": [],
            "anthropic": [],
            "google": [],
            "gemini": []
        }
        
        # Map performance data API providers to our internal provider names
        provider_mapping = PROVIDER_MAPPING

        logger.debug(f"Provider mapping: {provider_mapping}")
        
        # Model name mappings for normalization
        model_name_mappings = {
            "gpt-4": ["gpt-4", "gpt4", "gpt-4-turbo", "gpt-4-preview"],
            "gpt-3.5-turbo": ["gpt-3.5-turbo", "gpt-35-turbo", "gpt35-turbo"],
            "claude-3-opus": ["claude-3-opus", "claude3-opus", "claude-opus"],
            "claude-3-sonnet": ["claude-3-sonnet", "claude3-sonnet", "claude-sonnet"],
            "gemini-1.5-pro": ["gemini-1.5-pro", "gemini15-pro", "gemini-pro"],
            "gemini-1.5-flash": ["gemini-1.5-flash", "gemini15-flash", "gemini-flash"]
        }
        
        # Store mapping as class attribute for use in other methods
        self.performance_to_api_mapping = PERFORMANCE_TO_API
        
        # Create reverse mapping for better matching
        self.api_to_performance_mapping = {}
        for perf_name, api_name in self.performance_to_api_mapping.items():
            if api_name not in self.api_to_performance_mapping:
                self.api_to_performance_mapping[api_name] = []
            self.api_to_performance_mapping[api_name].append(perf_name)
        
        def _is_valid_partial_match(performance_model_name: str, allowed_model: str) -> bool:
            """
            More intelligent partial matching that avoids false positives.
            
            This method implements more restrictive partial matching rules:
            - Avoids matching o3-mini with o3
            - Avoids matching GPT-4.1 mini with gpt-4.1
            - Avoids matching GPT-4 with gpt-4.1
            """
            perf_lower = performance_model_name.lower()
            allowed_lower = allowed_model.lower()
            
            # Rule 1: Don't match if one is a subset of the other but they're clearly different models
            # e.g., don't match "o3" with "o3-mini" or "gpt-4.1" with "gpt-4.1-mini"
            if (allowed_lower in perf_lower and perf_lower != allowed_lower):
                # Check if it's a different variant (mini, nano, etc.)
                remaining = perf_lower.replace(allowed_lower, '').strip()
                if remaining.startswith('-') or remaining.startswith(' '):
                    remaining = remaining[1:].strip()
                if remaining in ['mini', 'nano', 'micro', 'small', 'large', 'turbo', 'preview', '(high)', '(low)']:
                    return False
            
            # Rule 2: Don't match if allowed is a subset of performance but they're different models
            if (perf_lower in allowed_lower and perf_lower != allowed_lower):
                # Check if it's a different variant
                remaining = allowed_lower.replace(perf_lower, '').strip()
                if remaining.startswith('-') or remaining.startswith(' '):
                    remaining = remaining[1:].strip()
                if remaining in ['mini', 'nano', 'micro', 'small', 'large', 'turbo', 'preview']:
                    return False
            
            # Rule 3: Handle version-specific partial matches carefully
            # Only allow if they're clearly the same model family
            if '-' in perf_lower and '-' in allowed_lower:
                perf_parts = perf_lower.split('-')
                allowed_parts = allowed_lower.split('-')
                
                # For models like gpt-4.1 vs gpt-4.1-mini, don't match
                if len(perf_parts) >= 2 and len(allowed_parts) >= 2:
                    if perf_parts[0] == allowed_parts[0] and perf_parts[1] == allowed_parts[1]:
                        # Same base model, check if one has additional qualifiers
                        if len(perf_parts) > len(allowed_parts) or len(allowed_parts) > len(perf_parts):
                            return False
            
            # Rule 4: Only allow very specific legacy partial matches
            # This is for backward compatibility with existing valid partial matches
            legacy_valid_partials = {
                'claude-3-5-sonnet': ['claude-3.5-sonnet', 'claude-3-5-sonnet-20241022'],
                'gemini-1.5-pro': ['gemini-1.5-pro-001', 'gemini-1.5-pro-002'],
                'gemini-2.5-pro': ['gemini-2.5-pro-preview'],
            }
            
            for legacy_allowed, legacy_performances in legacy_valid_partials.items():
                if allowed_lower == legacy_allowed:
                    for legacy_perf in legacy_performances:
                        if legacy_perf in perf_lower:
                            return True
                elif perf_lower == legacy_allowed:
                    for legacy_perf in legacy_performances:
                        if legacy_perf in allowed_lower:
                            return True
            
            # Default: no partial match
            return False
        
        # Convert allowed providers to lowercase for case-insensitive comparison
        allowed_providers_lower = [p.lower() for p in self.allowed_providers] if self.allowed_providers else None
        
        logger.debug(f"Performance data contains {len(self.performance_data)} models")
        logger.debug(f"Allowed providers: {self.allowed_providers}")
        logger.debug(f"Allowed providers (lowercase): {allowed_providers_lower}")
        logger.debug(f"Allowed models: {self.allowed_models}")
        
        # Debug: Show first 5 models in performance data
        logger.debug(f"First 5 models in performance data:")
        for i, model in enumerate(self.performance_data[:5]):
            api_provider = model.get("api_provider", "Unknown")
            model_name = model.get("model", "Unknown")
            api_id = model.get("api_id", "Unknown")
            logger.debug(f"  {i+1}. Model: '{model_name}', API Provider: '{api_provider}', API ID: '{api_id}'")
        
        # If no providers or models are specified, include all models
        if not self.allowed_providers and not self.allowed_models:
            logger.debug("No filtering applied - including all models")
            for model_data in self.performance_data:
                # Get provider and model name
                api_provider = model_data.get("api_provider", "Unknown")
                model_name = model_data.get("model", "")
                
                if not model_name:
                    continue
                
                # Map to our internal provider name
                provider_key = provider_mapping.get(api_provider, "openai")  # Default to openai if unknown
                
                # Add to the appropriate provider
                if provider_key not in supported_models:
                    supported_models[provider_key] = []
                    
                if model_name not in supported_models[provider_key]:
                    supported_models[provider_key].append(model_name)
                    
            return supported_models
        
        model_count = 0
        processed_count = 0
        skipped_count = 0
        
        logger.debug(f"Starting to process {len(self.performance_data)} models...")
        
        for model_data in self.performance_data:
            processed_count += 1
            # Get provider and model name from the correct fields
            api_provider = model_data.get("api_provider")
            model_name = model_data.get("model")  # Use "model" instead of "model_name"
            route = model_data.get("other", {}).get("route") if isinstance(model_data.get("other"), dict) else None
            api_id = model_data.get("api_id", "")
            
            # Debug every 20th model to avoid spam
            if processed_count <= 10 or processed_count % 20 == 0:
                logger.debug(f"Processing model #{processed_count}: '{model_name}' from provider '{api_provider}' (api_id: '{api_id}')")
            
            if not api_provider or not model_name:
                if processed_count <= 10:
                    logger.debug(f"Skipping model #{processed_count} - missing provider or name: provider='{api_provider}', name='{model_name}'")
                skipped_count += 1
                continue
            
            # Map to our internal provider name
            provider_key = None
            if route in supported_models:
                provider_key = route
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} mapped via route: '{route}' -> '{provider_key}'")
            elif api_provider in provider_mapping:
                provider_key = provider_mapping[api_provider]
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} mapped via provider_mapping: '{api_provider}' -> '{provider_key}'")
                
            # If no match found yet, try a case-insensitive match with the provider mapping
            if not provider_key:
                for mapped_provider, internal_key in provider_mapping.items():
                    if api_provider.lower() == mapped_provider.lower():
                        provider_key = internal_key
                        if processed_count <= 10:
                            logger.debug(f"Model #{processed_count} mapped via case-insensitive: '{api_provider}' -> '{provider_key}'")
                        break
            
            if not provider_key:
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} - NO PROVIDER MAPPING FOUND for '{api_provider}'")
            
            # Skip if provider not in allowed providers (case-insensitive comparison)
            provider_allowed = True
            if allowed_providers_lower and (not provider_key or provider_key.lower() not in allowed_providers_lower):
                provider_allowed = False
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} SKIPPED - provider '{provider_key}' not in allowed providers {allowed_providers_lower}")
                continue
            
            if processed_count <= 10:
                logger.debug(f"Model #{processed_count} PASSED provider check - '{provider_key}' is allowed")
            
            # Check if model name matches any of the allowed models (using improved mappings)
            model_matches = False
            normalized_model_name = model_name.lower()
            api_id = model_data.get("api_id", "").lower()
            
            if processed_count <= 10:
                logger.debug(f"Model #{processed_count} checking model name match...")
                logger.debug(f"Model name: '{model_name}' (normalized: '{normalized_model_name}')")
                logger.debug(f"API ID: '{api_id}'")
                logger.debug(f"Allowed models: {self.allowed_models}")
            
            if self.allowed_models:
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} - checking against {len(self.allowed_models)} allowed models")
                for allowed_model in self.allowed_models:
                    match_type = ""
                    
                    # Handle Provider/Model format - extract just the model name for comparison
                    if "/" in allowed_model:
                        provider_part, model_part = allowed_model.split("/", 1)
                        # Check if the model part matches the performance data model name
                        if model_part.lower() == normalized_model_name:
                            model_matches = True
                            match_type = f"Provider/Model format match: {allowed_model} -> {model_name}"
                            break
                    
                    # Check direct match (for backward compatibility)
                    if allowed_model.lower() == normalized_model_name:
                        model_matches = True
                        match_type = f"Direct match: {allowed_model} -> {model_name}"
                        break
                    
                    # Check API ID match - this is crucial for LiteLLM model names
                    if allowed_model.lower() == api_id or allowed_model.lower() in api_id:
                        model_matches = True
                        match_type = f"API ID match: {allowed_model} -> {model_name} (api_id: {api_id})"
                        logger.debug(match_type)
                        break
                    
                    # Check if performance model maps to allowed model
                    mapped_performance_model = self.map_performance_model_to_api(model_name)
                    if mapped_performance_model.lower() == allowed_model.lower():
                        model_matches = True
                        match_type = f"Performance mapping match: {model_name} -> {mapped_performance_model} == {allowed_model}"
                        break
                    
                    # Check reverse mapping - if allowed model maps to performance model
                    if allowed_model.lower() in self.api_to_performance_mapping:
                        performance_variants = self.api_to_performance_mapping[allowed_model.lower()]
                        if normalized_model_name in [p.lower() for p in performance_variants]:
                            model_matches = True
                            match_type = f"Reverse mapping match: {allowed_model} -> {performance_variants} contains {model_name}"
                            break
                    
                    # Check mapped variations from the legacy mapping
                    if allowed_model in model_name_mappings:
                        if normalized_model_name in [m.lower() for m in model_name_mappings[allowed_model]]:
                            model_matches = True
                            match_type = f"Legacy mapping match: {allowed_model} -> {model_name_mappings[allowed_model]} contains {model_name}"
                            break
                    
                    # More intelligent partial matching - only for specific cases
                    # This is more restrictive than the previous version
                    if _is_valid_partial_match(model_name, allowed_model):
                        model_matches = True
                        match_type = f"Partial match: {model_name} matches allowed model {allowed_model}"
                        logger.debug(match_type)
                        break
                
                if processed_count <= 10:
                    if model_matches:
                        logger.debug(f"Model #{processed_count} MODEL MATCH FOUND: {match_type}")
                    else:
                        logger.debug(f"Model #{processed_count} NO MODEL MATCH - skipping")
            else:
                model_matches = True  # If no models specified, allow all
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} - No model filtering, allowing all models")
            
            if not model_matches:
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} REJECTED - model name doesn't match any allowed models")
                continue
            
            # If we reach here, both provider and model are allowed
            if provider_key and provider_key in supported_models:
                if model_name not in supported_models[provider_key]:
                    supported_models[provider_key].append(model_name)
                    model_count += 1
                    if processed_count <= 10:
                        logger.debug(f"Model #{processed_count} ADDED to '{provider_key}': '{model_name}' (total count: {model_count})")
                else:
                    if processed_count <= 10:
                        logger.debug(f"Model #{processed_count} DUPLICATE - '{model_name}' already in '{provider_key}'")
            else:
                if processed_count <= 10:
                    logger.debug(f"Model #{processed_count} ERROR - provider_key '{provider_key}' not in supported_models dict")
        
        logger.debug(f"PROCESSING COMPLETE:")
        logger.debug(f"Processed {processed_count} models")
        logger.debug(f"Skipped {skipped_count} models (missing data)")
        logger.debug(f"Found {model_count} models matching the filters")

        # Show final results
        logger.debug(f"FINAL SUPPORTED MODELS:")
        for provider, models in supported_models.items():
            if models:
                logger.debug(f"{provider}: {len(models)} models - {models[:3]}{'...' if len(models) > 3 else ''}")
            else:
                logger.debug(f"{provider}: 0 models")
        
        # Special handling for benchmark model - ensure it's included if available
        benchmark_model = kwargs.get("benchmark_model") if hasattr(self, '_current_kwargs') else None
        if not benchmark_model and hasattr(self, '_current_benchmark_model'):
            benchmark_model = self._current_benchmark_model
            
        if benchmark_model and self.allowed_models and benchmark_model in self.allowed_models:
            # Find the benchmark model in performance data
            benchmark_data = None
            for model_data in self.performance_data:
                model_name = model_data.get("model", "")
                # Try direct match first
                if model_name == benchmark_model:
                    benchmark_data = model_data
                    break
                # Try mapping match
                mapped_name = self.performance_to_api_mapping.get(model_name, model_name)
                if mapped_name == benchmark_model:
                    benchmark_data = model_data
                    break
            
            if benchmark_data:
                api_provider = benchmark_data.get("api_provider")
                provider_key = provider_mapping.get(api_provider)
                
                # Check if provider is allowed
                if not allowed_providers_lower or (provider_key and provider_key.lower() in allowed_providers_lower):
                    # Ensure benchmark model is included - add the original model name from performance data
                    original_model_name = benchmark_data.get("model", "")
                    if provider_key and provider_key in supported_models:
                        if original_model_name not in supported_models[provider_key]:
                            supported_models[provider_key].append(original_model_name)
                            logger.debug(f"Added benchmark model {original_model_name} (maps to {benchmark_model}) to {provider_key} provider")
                    elif provider_key:
                        supported_models[provider_key] = [original_model_name]
                        logger.debug(f"Created new provider {provider_key} for benchmark model {original_model_name} (maps to {benchmark_model})")
                else:
                    logger.warning(f"Benchmark model {benchmark_model} requires provider {provider_key} which is not in allowed providers {self.allowed_providers}")
            else:
                logger.warning(f"Benchmark model {benchmark_model} not found in performance data")
        
        # If an empty list for allowed_models was provided, it means "no filtering" not "no models"
        if self.allowed_models is not None and len(self.allowed_models) == 0:
            logger.debug("Empty allowed_models list provided, including all models")
            return self._get_supported_models_from_performance_data()
        
        # Remove empty providers
        supported_models = {k: v for k, v in supported_models.items() if v}
        
        # If no models found, provide helpful debugging info
        if not any(supported_models.values()):
            logger.warning("No supported models found after filtering. Here are some available providers in the data:")
            provider_counts = {}
            for model in self.performance_data[:20]:  # Look at first 20 models
                provider = model.get("api_provider", "unknown")
                provider_counts[provider] = provider_counts.get(provider, 0) + 1

            for provider, count in provider_counts.items():
                logger.warning(f"  {provider}: {count} models")

            logger.warning("Using default models instead")
            
            # Fallback to some default models if no models were found
            # Use actual model names from performance data
            default_models = {
                "openai": ["GPT-4.1", "GPT-4o (May '24)", "GPT-4 Turbo"],
                "anthropic": ["Claude 3.5 Sonnet (Oct)", "Claude 3 Opus", "Claude 3 Sonnet"],
                "google": ["Gemini 2.5 Pro", "Gemini 2.0 Flash", "Gemini 1.5 Pro"]
            }
            
            # Filter default models by allowed providers if specified
            if allowed_providers_lower:
                default_models = {k: v for k, v in default_models.items() if k.lower() in allowed_providers_lower}
            
            # Return default models
            return default_models
            
        return supported_models
    
    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        """
        Recommend the best model for a given prompt using the specialized router prompt.
        
        Args:
            text: The prompt to analyze
            **kwargs: Additional parameters including:
                - system_message: Optional system message to prepend to the prompt
                - candidate_models: List of candidate models to choose from
        
        Returns:
            Dictionary with model recommendation and task analysis
        """
        text = self._validate_prompt(text)

        # Extract candidate models if provided
        candidate_models = kwargs.get('candidate_models', None)

        # Temporarily override allowed_models with candidate_models if provided
        original_allowed_models = self.allowed_models
        original_supported_models = None
        if candidate_models:
            self.allowed_models = candidate_models
            logger.info(f"Gemini analyzer using candidate models: {candidate_models}")
            # Rebuild supported_models to match the new candidate models
            original_supported_models = self.supported_models
            self.supported_models = self._get_supported_models_from_performance_data()
        
        try:
            return await self._analyze_internal(text, **kwargs)
        finally:
            # Restore original models
            self.allowed_models = original_allowed_models
            if original_supported_models is not None:
                self.supported_models = original_supported_models
    
    async def _analyze_internal(self, text: str, **kwargs) -> Dict[str, Any]:
        """Internal analysis method."""
        try:
            # Extract system message from kwargs
            system_message = kwargs.get("system_message", "")
            
            # Prepare model array for the prompt
            models_array = []
            for provider_name, models in self.supported_models.items():
                for model_name in models:
                    # Map performance data model name to actual API model name
                    api_model_name = self.map_performance_model_to_api(model_name)
                    
                    # Find model performance data
                    model_data = next((m for m in self.performance_data if m.get("model") == model_name), {})
                    
                    # Extract performance and other data with safe access
                    # Performance and pricing data is nested in the "other" section
                    other = model_data.get("other", {})
                    performance = other.get("performance", {})
                    pricing = other.get("pricing", {})
                    speed = model_data.get("speed", {})
                    
                    # Add relevant model data for the recommendation prompt
                    model_entry = {
                        "model_name": api_model_name,  # Use mapped API model name
                        "performance_name": model_name,   # Keep original for reference
                        "API Provider": provider_name.capitalize(),
                        "QualityIndex": performance.get("quality_index", 0),
                        "MMLU": performance.get("mmlu", 0),
                        "HumanEval": performance.get("humaneval", 0),
                        "GPQA": performance.get("gpqa", 0),
                        "MATH-500": performance.get("math_500", 0),
                        "MedianTokens/s": other.get("median_tokenss", 0),
                        "MedianFirstChunk s": speed.get("medianfirst_chunk_s", 0),
                        "TotalUSD/1M": pricing.get("input_price_usd1m_tokens", 0) + pricing.get("output_price_usd1m_tokens", 0),
                        "OutputUSD/1M": pricing.get("output_price_usd1m_tokens", 0),
                        "InputUSD/1M": pricing.get("input_price_usd1m_tokens", 0),
                        "ContextWindow": model_data.get("context_window", 8192),
                        "FunctionCalling": model_data.get("function_calling", False),
                        "JSONMode": model_data.get("json_mode", False),
                        "License": model_data.get("license", "Commercial"),
                        "OpenAI Compatible": model_data.get("openai_compatible", False)
                    }
                    models_array.append(model_entry)
            
            # Combine system message and user prompt for fuller analysis
            full_prompt_text = ""
            if system_message:
                full_prompt_text += f"SYSTEM MESSAGE:\n{system_message}\n\n"
            full_prompt_text += f"USER PROMPT:\n{text}"
            
            # Detect prompt features for enhanced analysis
            prompt_features = self._detect_prompt_features(text, system_message)
            
            # Extract benchmark information if available
            benchmark_model = kwargs.get("benchmark_model")
            benchmark_info = ""
            benchmark_quality = 0
            benchmark_cost = 0
            
            if benchmark_model:
                # Find benchmark model data
                benchmark_data = next((m for m in self.performance_data if m.get("model") == benchmark_model), None)
                if not benchmark_data:
                    # Try mapped name lookup
                    mapped_name = next((k for k, v in self.performance_to_api_mapping.items() if v == benchmark_model), None)
                    if mapped_name:
                        benchmark_data = next((m for m in self.performance_data if m.get("model") == mapped_name), None)
                
                if benchmark_data:
                    benchmark_other = benchmark_data.get("other", {})
                    benchmark_perf = benchmark_other.get("performance", {})
                    benchmark_pricing = benchmark_other.get("pricing", {})
                    benchmark_quality = benchmark_perf.get("quality_index", 0)
                    benchmark_cost = benchmark_pricing.get("input_price_usd1m_tokens", 0) + benchmark_pricing.get("output_price_usd1m_tokens", 0)
                    
                    # Enhanced benchmark comparison
                    benchmark_comparison_data = self._enhance_benchmark_comparison(benchmark_model, models_array, prompt_features)
                    
                    benchmark_info = f"""
### BENCHMARK MODEL REFERENCE
Benchmark Model: {benchmark_model}
Quality Index: {benchmark_quality}
Cost per 1M tokens: ${benchmark_cost}
Task-Specific Performance: {benchmark_comparison_data.get('task_specific_scores', {})}

Your task is to recommend a model that provides SIMILAR OR BETTER accuracy than the benchmark for this specific task type, while optimizing for cost and latency. The benchmark represents the user's quality expectations.

### DETECTED PROMPT FEATURES
{json.dumps(prompt_features, indent=2)}
Consider these features when evaluating model suitability.
"""

            # Build the enhanced router prompt with multi-dimensional complexity analysis
            router_prompt = f"""
### SYSTEM
You are an expert LLM router with deep understanding of prompt complexity and model capabilities.
Your mission: Analyze the prompt's multi-dimensional complexity and recommend the optimal model that meets or exceeds the user's quality expectations while optimizing cost and performance.

### DATA – Candidate Models
(Exact JSON objects follow.)

{json.dumps(models_array, indent=2)}
{benchmark_info}

### TASK – Full Prompt Analysis
{full_prompt_text}

### ENHANCED COMPLEXITY ANALYSIS
Analyze the prompt across these dimensions:
1. **Cognitive Complexity** (1-5): Reasoning depth, logical steps, abstract thinking required
2. **Semantic Complexity** (1-5): Language sophistication, ambiguity, context understanding needed
3. **Domain Complexity** (1-5): Specialized knowledge, technical expertise, domain-specific reasoning
4. **Task Type**: Classification (creative, analytical, coding, conversational, multimodal, etc.)
5. **Context Requirements**: Length of context needed, memory requirements
6. **Output Format**: Structured data, creative content, technical accuracy requirements

### SELECTION GUIDELINES
1. **Quality Threshold** (CRITICAL)
   {'• Ensure selected model can match or exceed benchmark quality for this task type' if benchmark_model else '• Select models capable of handling the task complexity'}
   • Consider task-specific model strengths (coding, reasoning, creativity)
   • Factor in domain expertise requirements

2. **Quality-Cost Optimization** (enhanced with benchmark baseline)
   {f'• BASELINE: Benchmark quality_index = {benchmark_quality}, cost = ${benchmark_cost}/1M' if benchmark_model else ''}
   {f'• OPTIMIZATION STRATEGY: Find models with quality ≥ {max(benchmark_quality - 5, 70)} AND cost ≤ ${benchmark_cost * 1.2 if benchmark_cost > 0 else 20}/1M' if benchmark_model else ''}
   {f'• PREFERRED: Models that exceed benchmark quality ({benchmark_quality}) at lower cost' if benchmark_model else ''}
   {f'• ACCEPTABLE: Models with similar quality (±5 points) if significantly cheaper (>30% cost reduction)' if benchmark_model else ''}
   
3. **Complexity-Aware Scoring**
   For high complexity tasks (complexity ≥ 4): Prioritize quality over cost, minimum quality_index ≥ {max(benchmark_quality, 75) if benchmark_model else 75}
   For medium complexity (complexity 2-3): Balance quality, cost, and speed, minimum quality_index ≥ {max(benchmark_quality - 10, 60) if benchmark_model else 60}
   For low complexity (complexity ≤ 2): Optimize for cost while maintaining quality_index ≥ {max(benchmark_quality - 15, 50) if benchmark_model else 50}

4. **Task-Specific Optimization** (based on detected features)
   • Code generation: Prioritize HumanEval scores and function calling capability
   • Mathematical reasoning: Weight MATH-500 and GPQA scores heavily  
   • General reasoning: Focus on MMLU and QualityIndex
   • Creative tasks: Consider model training and instruction following
   • Analysis tasks: Prioritize models with strong comprehension and reasoning
   • Tool usage: Ensure function calling and JSON mode capabilities
   • Multimodal: Require models with image/audio processing abilities
   • Factual accuracy: Prioritize models with strong knowledge bases and recent training

### OUTPUT (STRICT JSON ONLY)
{{
  "recommended_model": "<model_name>",
  "recommended_provider": "<provider_name>",
  "confidence": <0.0-1.0>,
  "task_complexity": <1-5>,
  "complexity_analysis": {{
    "cognitive_complexity": <1-5>,
    "semantic_complexity": <1-5>,
    "domain_complexity": <1-5>,
    "task_type": "<primary_task_category>",
    "key_requirements": ["<requirement1>", "<requirement2>"]
  }},
  "complexity_reasoning": "<detailed explanation of complexity analysis>",
  "reasoning": "<explanation of why this model is optimal for the task compared to{'benchmark' if benchmark_model else 'alternatives'}>",
  "benchmark_comparison": {'"<how this compares to benchmark model>"' if benchmark_model else 'null'}
}}

Strict JSON format required.
"""

            # Check cache (0.95 threshold ensures only near-identical prompts hit)
            cached_result = await gemini_analyzer_cache.get(
                prompt=router_prompt,
                model="gemini-2.5-flash-lite-preview-06-17",
                temperature=0.0,
                max_tokens=800,
            )
            if cached_result:
                logger.info("Gemini analyzer cache HIT for prompt: '%s...'", text[:50])
            else:
                logger.info("Gemini analyzer cache MISS — making fresh API call for: '%s...'", text[:50])
            
            if cached_result:
                response_text = cached_result["response"]
            else:
                # Convert asyncio to sync as google-genai doesn't have native async support
                def generate_content():
                    max_retries = len(self.gemini_models)
                    for attempt in range(max_retries):
                        try:
                            # Get next model in round-robin
                            current_model_name = self._get_next_gemini_model()
                            self._update_model(current_model_name)
                            
                            response = self.model.generate_content(
                                contents=router_prompt,
                                generation_config=genai.GenerationConfig(
                                    temperature=0.0,
                                    max_output_tokens=800
                                )
                            )
                            return response.text
                        except Exception as e:
                            error_msg = str(e)
                            if "429" in error_msg or "quota" in error_msg.lower():
                                logger.warning(f"Quota exceeded for model {current_model_name}, trying next model in round-robin (attempt {attempt + 1}/{max_retries})")
                                if attempt == max_retries - 1:
                                    raise e
                                continue
                            else:
                                # Non-quota error, re-raise immediately
                                raise e
                    raise Exception("All Gemini models exhausted due to quota limits")
                
                # Run in an executor to avoid blocking the async loop
                loop = asyncio.get_event_loop()
                response_text = await loop.run_in_executor(None, generate_content)
                
                logger.info(f"Gemini API response received ({len(response_text)} chars)")

                # Cache the result for near-identical future prompts
                await gemini_analyzer_cache.put(
                    prompt=router_prompt,
                    model="gemini-2.5-flash-lite-preview-06-17",
                    response=response_text,
                    temperature=0.0,
                    max_tokens=800,
                )
            
            # Extract JSON from response
            json_match = re.search(r'{.*}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                try:
                    result = json.loads(json_str)
                    logger.info(f"Successfully parsed Gemini JSON response")
                except json.JSONDecodeError as e:
                    logger.error(f"Gemini JSON parse error: {e}")
                    logger.error(f"Problematic JSON: {json_str[:500]}...")
                    raise e
                
                # Validate the recommendation against supported models
                self._validate_recommendation(result)
                
                # Transform the result into our standard recommendation format
                recommended_model = result.get("recommended_model")
                recommended_provider = result.get("recommended_provider")
                confidence = result.get("confidence", -1)
                task_complexity = result.get("task_complexity", -1)
                complexity_analysis = result.get("complexity_analysis", {})
                complexity_reasoning = result.get("complexity_reasoning", "Task complexity not provided")
                reasoning = result.get("reasoning", "Reasoning not provided")
                benchmark_comparison = result.get("benchmark_comparison", None)
                
                # Try to convert task_complexity to int (1-5 scale)
                try:
                    task_complexity = int(task_complexity)
                    # Ensure it's in the 1-5 range
                    if task_complexity == -1:
                        # If -1 is encountered, use default medium complexity (3)
                        task_complexity = 3
                    else:
                        task_complexity = max(1, min(5, task_complexity))
                except (ValueError, TypeError):
                    # Default to medium complexity
                    task_complexity = 3
                
                # Double-check that task_complexity is an integer before using it in calculations
                if not isinstance(task_complexity, int):
                    logger.warning(f"task_complexity is not an integer: {task_complexity} ({type(task_complexity)}), defaulting to 3")
                    task_complexity = 3
                
                # Get tier and cost information
                tier = self._get_tier_from_model_name(recommended_model)
                cost = self._get_cost_from_model_name(recommended_model)
                
                # Create the enhanced response format with detailed complexity analysis
                recommendation = {
                    "recommended_model": recommended_model,
                    "recommended_provider": recommended_provider,
                    "confidence": float(confidence),
                    "task_complexity": task_complexity,
                    "complexity_score": (task_complexity - 1) / 4.0,  # Convert 1-5 scale to 0-1 scale
                    "complexity_analysis": complexity_analysis,
                    "complexity_reasoning": complexity_reasoning,
                    "reasoning": reasoning,
                    "benchmark_comparison": benchmark_comparison,
                    "detected_features": prompt_features,
                    "enhanced_benchmark_data": benchmark_comparison_data if benchmark_model else None,
                    "ranked_models": [
                        {
                            "model_name": recommended_model,
                            "provider": recommended_provider,
                            "confidence": float(confidence),
                            "reasoning": reasoning,
                            "tier": tier,
                            "strong_win_rate": float(confidence) + 0.1,
                            "cost_per_million_tokens": cost
                        }
                    ],
                    "routing_decision": {
                        "use_strong_model": task_complexity >= 3,
                        "threshold": self._calculate_adaptive_threshold(task_complexity, benchmark_quality, complexity_analysis),
                        "strong_win_rate": float(confidence) + 0.1,
                        "feature_based_routing": self._get_feature_based_routing_hints(prompt_features)
                    }
                }
                
                return recommendation
            
            raise ValueError("Could not extract JSON from Gemini response")
        
        except Exception as e:
            # Log the exception and return default recommendation
            logger.error(f"Error using Gemini for model recommendation: {str(e)}")
            
            # Get a default model
            default_rec = self._get_default_recommendation()
            recommended_model = default_rec.get("recommended_model")
            recommended_provider = default_rec.get("recommended_provider")
            
            # Create a default recommendation with routing information
            return {
                "recommended_model": recommended_model,
                "recommended_provider": recommended_provider,
                "confidence": 0.5,
                "task_complexity": 3,
                "complexity_score": 0.5,  # Convert task_complexity=3 to 0-1 scale: (3-1)/4=0.5
                "complexity_analysis": {
                    "cognitive_complexity": 3,
                    "semantic_complexity": 3,
                    "domain_complexity": 3,
                    "task_type": "general",
                    "key_requirements": ["general_reasoning"]
                },
                "complexity_reasoning": "Default complexity assessment due to error",
                "reasoning": "Default recommendation due to error in analysis",
                "benchmark_comparison": None,
                "detected_features": {
                    "has_code": False,
                    "has_math": False,
                    "has_reasoning": False,
                    "has_creative_writing": False,
                    "has_analysis": False,
                    "has_tools": False,
                    "has_multimodal": False,
                    "requires_factual_accuracy": False,
                    "requires_structured_output": False,
                    "language_complexity": "medium"
                },
                "enhanced_benchmark_data": None,
                "ranked_models": [
                    {
                        "model_name": recommended_model,
                        "provider": recommended_provider,
                        "confidence": 0.5,
                        "reasoning": "Default recommendation due to error in analysis",
                        "tier": self._get_tier_from_model_name(recommended_model),
                        "strong_win_rate": 0.6,
                        "cost_per_million_tokens": self._get_cost_from_model_name(recommended_model)
                    }
                ],
                "routing_decision": {
                    "use_strong_model": True,
                    "threshold": 0.65,
                    "strong_win_rate": 0.6,
                    "feature_based_routing": {
                        "preferred_capabilities": [],
                        "avoid_models": [],
                        "priority_metrics": [],
                        "cost_sensitivity": "medium"
                    }
                }
            }
    
    def _validate_recommendation(self, result: Dict[str, Any]) -> None:
        """Validate the recommendation against supported models."""
        recommended_model = result.get("recommended_model")
        recommended_provider = result.get("recommended_provider", "").lower()
        
        # First, try to map the performance data model name to API model name
        api_model_name = self.map_performance_model_to_api(recommended_model)
        
        # Convert provider name if needed
        if recommended_provider.lower() in ["openai", "anthropic", "google"]:
            normalized_provider = recommended_provider.lower()
        else:
            # Try to find provider by the model (check both original and mapped names)
            normalized_provider = None
            for provider, models in self.supported_models.items():
                if recommended_model in models or api_model_name in models:
                    normalized_provider = provider
                    break
        
        # Check if the model is valid (try both original and mapped names)
        valid_model = False
        final_model_name = recommended_model
        
        if normalized_provider and normalized_provider in self.supported_models:
            # Check original name first
            if recommended_model in self.supported_models[normalized_provider]:
                valid_model = True
                final_model_name = recommended_model
            # Then check mapped name
            elif api_model_name in self.supported_models[normalized_provider]:
                valid_model = True
                final_model_name = api_model_name
            # Also check if any allowed model maps back to this performance model
            else:
                for allowed_model in self.allowed_models or []:
                    if self.map_performance_model_to_api(recommended_model) == allowed_model:
                        valid_model = True
                        final_model_name = allowed_model
                        break
        
        if valid_model:
            # Update with the correct model name and provider
            result["recommended_model"] = final_model_name
            result["recommended_provider"] = normalized_provider
        else:
            # NO FALLBACK - Fail if recommendation is invalid (as requested by user)
            logger.error(f"❌ Invalid model recommendation: {recommended_model}. No fallback mechanisms allowed.")
            raise RuntimeError(f"Gemini analyzer returned invalid model recommendation: {recommended_model}. This model is not available in the current configuration.")
        
        # Ensure confidence is a float between 0 and 1
        confidence = result.get("confidence")
        if confidence is None or not isinstance(confidence, (int, float)):
            try:
                confidence = float(confidence)
            except (ValueError, TypeError):
                confidence = 0.5
        
        # Clamp confidence to 0-1 range
        confidence = max(0.0, min(1.0, float(confidence)))
        result["confidence"] = confidence
    
    def _get_default_recommendation(self) -> Dict[str, Any]:
        """Get default recommendation based on the first available model."""
        # Just use the first available model as default
        if self.supported_models:
            first_provider = next(iter(self.supported_models))
            first_model = self.supported_models[first_provider][0]
            return {
                "recommended_model": first_model,
                "recommended_provider": first_provider,
                "confidence": 0.5,
                "task_complexity": 3,
                "complexity_reasoning": "Default complexity assessment",
                "reasoning": f"Default recommendation due to error in analysis: {first_model}"
            }
        
        # If no models are available, raise an error since we can't provide a recommendation
        raise ValueError("No models available for recommendation. Please check your configuration and ensure at least one model provider is enabled.")
        return {}
    
    def _get_tier_from_model_name(self, model_name: str) -> int:
        """Get tier based on model name and quality index."""
        from app.pricing.pricing_manager import get_model_tier
        
        # Try to find model in performance data first to get quality_index
        model_data = next((m for m in self.performance_data if m.get("model") == model_name), None)
        if model_data and model_data.get("other", {}).get("performance", {}).get("quality_index"):
            try:
                quality_index = float(model_data["other"]["performance"]["quality_index"])
                # Determine tier based on quality index
                if quality_index >= 80:
                    return 1  # Tier 1 - Premium models
                elif quality_index >= 60:
                    return 2  # Tier 2 - Standard models
                else:
                    return 3  # Tier 3 - Basic models
            except (ValueError, TypeError):
                # Fall back to name-based tier if quality_index isn't usable
                pass
        
        # Fall back to name-based tier determination
        return get_model_tier(model_name)
        
    def _get_cost_from_model_name(self, model_name: str) -> float:
        """Get estimated cost from model name."""
        # Try to get cost from performance data
        model_data = next((m for m in self.performance_data if m.get("model") == model_name), None)
        if model_data and model_data.get("other", {}).get("pricing", {}).get("input_price_usd1m_tokens"):
            try:
                return float(model_data["other"]["pricing"]["input_price_usd1m_tokens"]) + float(model_data["other"]["pricing"]["output_price_usd1m_tokens"])
            except (ValueError, TypeError):
                # Fall back to tier-based estimation if actual cost isn't available
                return -1
                
    def _calculate_adaptive_threshold(self, task_complexity: int, benchmark_quality: float, complexity_analysis: dict) -> float:
        """Calculate adaptive threshold based on task complexity and benchmark quality."""
        base_threshold = 0.65
        
        # Adjust threshold based on task complexity
        if task_complexity >= 4:
            # High complexity tasks need higher confidence
            threshold = base_threshold + 0.1
        elif task_complexity <= 2:
            # Low complexity tasks can accept lower confidence
            threshold = base_threshold - 0.1
        else:
            threshold = base_threshold
            
        # Adjust based on benchmark quality if available
        if benchmark_quality > 0:
            if benchmark_quality >= 80:
                # High quality benchmark requires higher threshold
                threshold += 0.05
            elif benchmark_quality <= 50:
                # Lower quality benchmark allows lower threshold
                threshold -= 0.05
                
        # Consider specific complexity dimensions
        if complexity_analysis:
            cognitive = complexity_analysis.get("cognitive_complexity", 3)
            domain = complexity_analysis.get("domain_complexity", 3)
            
            # High cognitive or domain complexity needs higher confidence
            if cognitive >= 4 or domain >= 4:
                threshold += 0.05
            elif cognitive <= 2 and domain <= 2:
                threshold -= 0.05
                
        # Ensure threshold stays within reasonable bounds
        return max(0.5, min(0.85, threshold))


    async def ranker(self, text: str, max_models: int = 5, **kwargs) -> Dict[str, Any]:
        """
        Rank multiple models for a given prompt using the LLMRanker.
        
        Args:
            text: The prompt to analyze
            max_models: Maximum number of models to rank and return
            **kwargs: Additional parameters including:
                - system_message: Optional system message to prepend to the prompt
                - benchmark_model: Optional benchmark model to use as reference
        
        Returns:
            Dictionary with ranked models and task analysis
        """
        try:
            logger.debug(f"=== STARTING RANKER ===")
            logger.debug(f"Text length: {len(text)}, max_models: {max_models}")
            logger.debug(f"Kwargs: {kwargs}")
            logger.debug(f"Current allowed_providers: {self.allowed_providers}")
            logger.debug(f"Current allowed_models: {self.allowed_models}")
            logger.debug(f"Current supported_models keys: {list(self.supported_models.keys())}")

            # Show current supported models summary
            for provider, models in self.supported_models.items():
                if models:
                    logger.debug(f"{provider}: {len(models)} models")
                else:
                    logger.debug(f"{provider}: 0 models")
            
            # Store benchmark model for access during filtering
            benchmark_model = kwargs.get("benchmark_model")
            if benchmark_model:
                self._current_benchmark_model = benchmark_model
                logger.debug(f"Storing benchmark model for filtering: {benchmark_model}")
                
                # Rebuild supported models to ensure benchmark is included
                original_supported_models = self.supported_models
                self.supported_models = self._get_supported_models_from_performance_data()
                # Also update the LLMRanker's supported models
                self.llm_ranker.supported_models = self.supported_models
                should_restore_supported_models = True
            else:
                should_restore_supported_models = False
            
            # Check if the prompt contains tool usage or function calling
            system_message = kwargs.get("system_message", "")
            full_prompt = f"SYSTEM MESSAGE:\n{system_message}\n\nUSER PROMPT:\n{text}" if system_message else f"USER PROMPT:\n{text}"
            
            # Detect tool format
            tool_format = self.tool_conversion_service.detect_tool_format(full_prompt)
            
            if tool_format:
                logger.debug(f"Detected tool format: {tool_format}")
                
                # Get compatible models for this tool format
                compatible_model_prefixes = self.tool_conversion_service.get_compatible_models(tool_format)
                
                # Filter allowed models based on tool format compatibility if no specific models are requested
                if not self.allowed_models:
                    # Create filtered supported_models copy
                    filtered_models = {}
                    for provider, models in self.supported_models.items():
                        # Keep only models that match the compatible prefixes
                        matching_models = []
                        for model in models:
                            if any(model.startswith(prefix) for prefix in compatible_model_prefixes):
                                matching_models.append(model)
                        
                        if matching_models:
                            filtered_models[provider] = matching_models
                    
                    # Update LLMRanker with filtered models for this request only
                    original_supported_models = self.llm_ranker.supported_models
                    self.llm_ranker.supported_models = filtered_models
                    logger.debug(f"Filtered models for {tool_format}: {filtered_models}")
                    
                    # Make sure to restore original models later
                    should_restore_models = True
                else:
                    # If user explicitly specified models, don't filter
                    should_restore_models = False
            else:
                should_restore_models = False
            
            # Delegate to the LLMRanker
            result = await self.llm_ranker.ranker(
                text=text,
                max_models=max_models,
                **kwargs
            )
            
            # Restore original models if we rebuilt them for benchmark
            if should_restore_supported_models:
                self.supported_models = original_supported_models
                self.llm_ranker.supported_models = original_supported_models
            
            # Restore original models if we filtered them
            if tool_format and should_restore_models:
                self.llm_ranker.supported_models = original_supported_models
            
            # Check for errors
            if "error" in result:
                logger.error(f"Error in LLMRanker: {result['error']}")
                return self._get_default_ranker_response(max_models)
            
            # Print the result for debugging
            logger.debug(f"LLMRanker result: {result}")
            
            # Create the standard response format for compatibility
            ranked_models = result.get("ranked_models", [])
            task_complexity = result.get("task_complexity", 3)
            
            if not ranked_models:
                logger.warning("No ranked models returned from LLMRanker")
                return self._get_default_ranker_response(max_models)
            
            # Ensure each model has required fields
            for model in ranked_models:
                # Add missing fields for compatibility
                if "tier" not in model:
                    model["tier"] = self._get_tier_from_model_name(model.get("model_name", ""))
                if "cost_per_million_tokens" not in model:
                    model["cost_per_million_tokens"] = self._get_cost_from_model_name(model.get("model_name", ""))
                if "strong_win_rate" not in model:
                    model["strong_win_rate"] = model.get("confidence", 0.5) + 0.1
            
            # If we detected tool format, include it in the response
            tool_info = {}
            if tool_format:
                tool_info = {
                    "detected_tool_format": tool_format,
                    "compatible_providers": [p for p, models in self.supported_models.items() 
                                          if any(m.startswith(prefix) for prefix in compatible_model_prefixes 
                                                for m in models)]
                }
            
            recommendation = {
                "task_complexity": task_complexity,
                "complexity_reasoning": f"Task complexity level: {task_complexity}/5",
                "ranked_models": ranked_models,
                "routing_decision": {
                    "use_strong_model": task_complexity >= 3,
                    "threshold": 0.65,
                    "strong_win_rate": ranked_models[0].get("strong_win_rate", 0.6) if ranked_models else 0.6
                },
                "required_capabilities": result.get("required_capabilities", []),
                **tool_info
            }
            
            return recommendation
            
        except Exception as e:
            # Log the exception and return default recommendation
            logger.error(f"Error using LLMRanker: {str(e)}")
            return self._get_default_ranker_response(max_models)
    
    def _get_default_ranker_response(self, max_models: int = 5) -> Dict[str, Any]:
        """Generate a default response when the ranker fails."""
        default_rec = self._get_default_recommendation()
        return {
            "task_complexity": 3,
            "complexity_reasoning": "Default complexity assessment due to error",
            "ranked_models": [
                {
                    "model_name": default_rec.get("recommended_model"),
                    "provider": default_rec.get("recommended_provider"),
                    "confidence": 0.5,
                    "reasoning": "Default recommendation due to error in analysis",
                    "tier": 2,
                    "strong_win_rate": 0.6,
                    "cost_per_million_tokens": 5.0
                }
            ],
            "routing_decision": {
                "use_strong_model": True,
                "threshold": 0.65,
                "strong_win_rate": 0.6
            }
        }

    async def get_all_model_scores(self, text: str, sample_size: int = 8, **kwargs) -> Dict[str, Any]:
        """
        Get scores for a SAMPLE of available models for a given prompt.
        This is specifically designed for training two-tower models with reduced complexity.
        
        Args:
            text: The prompt to analyze
            sample_size: Number of models to sample (default: 8 for reduced complexity)
            **kwargs: Additional parameters
        
        Returns:
            Dictionary with scores for sampled models
        """
        try:
            logger.debug(f"Getting scores for {sample_size} sampled models for prompt: {text[:50]}...")
            
            # Get ranking for sample size (reduced from 20 to configurable sample_size)
            result = await self.ranker(text, max_models=sample_size, **kwargs)
            
            # Convert to score format
            model_scores = {}
            ranked_models = result.get("ranked_models", [])
            
            # Assign scores based on ranking (higher rank = higher score)
            for i, model_info in enumerate(ranked_models):
                model_name = model_info.get("model_name", "")
                # Score calculation: top model gets 1.0, others get decreasing scores
                score = max(0.1, 1.0 - (i * 0.1))  # 1.0, 0.9, 0.8, 0.7, ...
                confidence = model_info.get("confidence", 0.8)
                # Blend rank-based score with confidence
                final_score = (score * 0.7) + (confidence * 0.3)
                model_scores[model_name] = round(final_score, 3)
            
            return {
                "prompt": text,
                "model_scores": model_scores,
                "task_complexity": result.get("task_complexity", 3),
                "top_model": ranked_models[0].get("model_name") if ranked_models else "",
                "total_models_scored": len(model_scores),
                "sample_size": sample_size
            }
            
        except Exception as e:
            logger.error(f"Error getting model scores: {e}")
            return {
                "prompt": text,
                "model_scores": {"gpt-4o-mini": 1.0},  # Fallback
                "task_complexity": 3,
                "top_model": "gpt-4o-mini",
                "total_models_scored": 1,
                "sample_size": 1
            }

    async def batch_model_scorer(self, prompts: List[str], batch_size: int = 50, **kwargs) -> List[Dict[str, Any]]:
        """
        Get model scores for multiple prompts, optimized for two-tower training.
        
        Args:
            prompts: List of prompts to score
            batch_size: Prompts per batch (smaller for scoring since we need more detail)
            **kwargs: Additional parameters
        
        Returns:
            List of scoring results with model_scores for each prompt
        """
        try:
            logger.info(f"Batch scoring {len(prompts)} prompts for two-tower training...")
            
            # Build batch scoring prompt
            batch_prompt = self._build_batch_scoring_prompt(prompts, **kwargs)
            
            # Call Gemini with round-robin
            max_retries = len(self.gemini_models)
            response = None
            for attempt in range(max_retries):
                try:
                    # Get next model in round-robin
                    current_model_name = self._get_next_gemini_model()
                    self._update_model(current_model_name)
                    
                    response = self.model.generate_content(batch_prompt)
                    break
                except Exception as e:
                    error_msg = str(e)
                    if "429" in error_msg or "quota" in error_msg.lower():
                        logger.warning(f"Quota exceeded for model {current_model_name} in batch scoring, trying next model (attempt {attempt + 1}/{max_retries})")
                        if attempt == max_retries - 1:
                            raise e
                        continue
                    else:
                        # Non-quota error, re-raise immediately
                        raise e
            
            if response is None:
                raise Exception("All Gemini models exhausted due to quota limits in batch scoring")
            
            # Parse results
            results = self._parse_batch_scoring_response(response.text, prompts)
            
            logger.info(f"Batch scoring completed: {len(results)} results")
            return results
            
        except Exception as e:
            logger.error(f"Error in batch scoring: {e}")
            logger.info("Falling back to individual scoring...")
            results = []
            for prompt in prompts:
                result = await self.get_all_model_scores(prompt, **kwargs)
                results.append(result)
            return results

    def _build_batch_scoring_prompt(self, prompts: List[str], **kwargs) -> str:
        """Build prompt for batch scoring all models for multiple prompts."""
        
        # Get available models
        all_models = []
        for provider, models in self.supported_models.items():
            all_models.extend(models)
        
        prompt_list = "\n".join([f"{i+1}. {prompt}" for i, prompt in enumerate(prompts)])
        model_list = "\n".join([f"- {model}" for model in all_models[:20]])  # Limit for context
        
        batch_prompt = f"""You are an expert AI model evaluator. For each user prompt, score how well EACH model would perform the task.

AVAILABLE MODELS:
{model_list}

USER PROMPTS:
{prompt_list}

For each prompt, return a JSON object with:
{{
  "prompt_number": <number>,
  "task_complexity": <1-5>,
  "model_scores": {{
    "model_name_1": <score_0.0_to_1.0>,
    "model_name_2": <score_0.0_to_1.0>,
    ...
  }},
  "top_model": "<best_model_name>"
}}

Scoring criteria:
- 1.0 = Perfect fit (optimal capability, cost, speed)
- 0.8-0.9 = Excellent fit
- 0.6-0.7 = Good fit  
- 0.4-0.5 = Acceptable fit
- 0.1-0.3 = Poor fit

Consider:
- Task complexity vs model capability
- Cost efficiency for task difficulty
- Speed requirements

Return JSON array with one object per prompt."""

        return batch_prompt

    def _parse_batch_scoring_response(self, response_text: str, prompts: List[str]) -> List[Dict[str, Any]]:
        """Parse batch scoring response."""
        try:
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                raise ValueError("No JSON array found")
            
            batch_results = json.loads(json_match.group())
            formatted_results = []
            
            for i, prompt in enumerate(prompts):
                prompt_result = next((r for r in batch_results if r.get("prompt_number") == i + 1), None)
                
                if prompt_result:
                    formatted_results.append({
                        "prompt": prompt,
                        "model_scores": prompt_result.get("model_scores", {}),
                        "task_complexity": prompt_result.get("task_complexity", 3),
                        "top_model": prompt_result.get("top_model", ""),
                        "total_models_scored": len(prompt_result.get("model_scores", {}))
                    })
                else:
                    # Fallback
                    formatted_results.append({
                        "prompt": prompt,
                        "model_scores": {"gpt-4o-mini": 1.0},
                        "task_complexity": 3,
                        "top_model": "gpt-4o-mini",
                        "total_models_scored": 1
                    })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Error parsing batch scoring: {e}")
            return [{
                "prompt": prompt,
                "model_scores": {"gpt-4o-mini": 1.0},
                "task_complexity": 3,
                "top_model": "gpt-4o-mini", 
                "total_models_scored": 1
            } for prompt in prompts]

    async def batch_ranker(self, prompts: List[str], max_models: int = 1, **kwargs) -> List[Dict[str, Any]]:
        """
        Rank models for multiple prompts at once using a single Gemini call.
        
        Args:
            prompts: List of prompts to analyze
            max_models: Maximum number of models to rank per prompt
            **kwargs: Additional parameters (benchmark_model, etc.)
        
        Returns:
            List of ranking results, one per prompt
        """
        try:
            logger.info(f"Batch ranking {len(prompts)} prompts with single Gemini call...")
            
            # Build batch prompt for Gemini
            batch_prompt = self._build_batch_ranking_prompt(prompts, max_models, **kwargs)
            
            # Use caching for batch requests too
            cache_key = f"batch_rank_{len(prompts)}_{max_models}_{hash(str(prompts))}"
            cached_result = gemini_analyzer_cache.get(cache_key)
            if cached_result:
                logger.info(f"Cache hit for batch ranking")
                return cached_result
            
            # Call Gemini with round-robin
            max_retries = len(self.gemini_models)
            response = None
            for attempt in range(max_retries):
                try:
                    # Get next model in round-robin
                    current_model_name = self._get_next_gemini_model()
                    self._update_model(current_model_name)
                    
                    response = self.model.generate_content(batch_prompt)
                    break
                except Exception as e:
                    error_msg = str(e)
                    if "429" in error_msg or "quota" in error_msg.lower():
                        logger.warning(f"Quota exceeded for model {current_model_name} in batch ranking, trying next model (attempt {attempt + 1}/{max_retries})")
                        if attempt == max_retries - 1:
                            raise e
                        continue
                    else:
                        # Non-quota error, re-raise immediately
                        raise e
            
            if response is None:
                raise Exception("All Gemini models exhausted due to quota limits in batch ranking")
            
            # Parse batch response
            results = self._parse_batch_ranking_response(response.text, prompts, max_models)
            
            # Cache the results
            gemini_analyzer_cache.set(cache_key, results)
            
            logger.info(f"Batch ranking completed: {len(results)} results")
            return results
            
        except Exception as e:
            logger.error(f"Error in batch ranking: {e}")
            # Fallback to individual ranking
            logger.info("Falling back to individual ranking...")
            results = []
            for prompt in prompts:
                try:
                    result = await self.ranker(prompt, max_models, **kwargs)
                    results.append(result)
                except Exception as individual_error:
                    logger.error(f"Error ranking individual prompt: {individual_error}")
                    results.append(self._get_default_ranker_response(max_models))
            return results

    def _build_batch_ranking_prompt(self, prompts: List[str], max_models: int, **kwargs) -> str:
        """Build a prompt for batch ranking multiple user prompts."""
        
        # Get available models summary
        total_models = sum(len(models) for models in self.supported_models.values())
        model_summary = []
        for provider, models in self.supported_models.items():
            if models:
                model_summary.append(f"- {provider}: {len(models)} models")
        
        prompt_list = "\n".join([f"{i+1}. {prompt}" for i, prompt in enumerate(prompts)])
        
        batch_prompt = f"""You are an expert AI model selector. Analyze each user prompt and recommend the best model.

AVAILABLE MODELS: {total_models} models across providers:
{chr(10).join(model_summary)}

USER PROMPTS TO ANALYZE:
{prompt_list}

For each prompt, return a JSON object with this exact format:
{{
  "prompt_number": <number>,
  "task_complexity": <1-5 scale>,
  "recommended_model": "<exact_model_name>",
  "provider": "<provider_name>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}}

Return a JSON array with one object per prompt. Choose models based on:
- Task complexity (1=simple, 5=complex)
- Cost efficiency (prefer cheaper models for simple tasks)
- Model capabilities (ensure the model can handle the task)

Respond with ONLY the JSON array, no other text."""

        return batch_prompt

    def _parse_batch_ranking_response(self, response_text: str, prompts: List[str], max_models: int) -> List[Dict[str, Any]]:
        """Parse Gemini's batch ranking response into individual results."""
        try:
            # Extract JSON from response
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                raise ValueError("No JSON array found in response")
            
            batch_results = json.loads(json_match.group())
            
            # Convert to standard format
            formatted_results = []
            for i, prompt in enumerate(prompts):
                # Find result for this prompt
                prompt_result = next((r for r in batch_results if r.get("prompt_number") == i + 1), None)
                
                if prompt_result:
                    # Convert to standard ranker format
                    formatted_result = {
                        "task_complexity": prompt_result.get("task_complexity", 3),
                        "complexity_reasoning": prompt_result.get("reasoning", "Batch analysis"),
                        "ranked_models": [{
                            "rank": 1,
                            "model_name": prompt_result.get("recommended_model", "gpt-4o-mini"),
                            "provider": prompt_result.get("provider", "openai"),
                            "confidence": prompt_result.get("confidence", 0.8),
                            "reasoning": prompt_result.get("reasoning", "Batch recommendation"),
                            "performance_name": prompt_result.get("recommended_model", "gpt-4o-mini"),
                            "quality_index": 80.0,
                            "cost_per_1m_tokens": 0.5,
                            "api_id": prompt_result.get("recommended_model", "gpt-4o-mini"),
                            "context_window": "128k",
                            "function_calling": "Yes",
                            "json_mode": "Yes"
                        }],
                        "required_capabilities": [],
                        "routing_decision": {
                            "use_strong_model": prompt_result.get("task_complexity", 3) >= 3,
                            "threshold": 0.65,
                            "strong_win_rate": prompt_result.get("confidence", 0.8)
                        }
                    }
                else:
                    # Fallback for missing results
                    formatted_result = self._get_default_ranker_response(max_models)
                
                formatted_results.append(formatted_result)
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Error parsing batch response: {e}")
            # Fallback to default responses
            return [self._get_default_ranker_response(max_models) for _ in prompts]

    async def compare_models(self, top_model_name: str, benchmark_model_name: str, text: str, system_message: str = "") -> Dict[str, Any]:
        """
        Compare two specific models for a given prompt to provide detailed insights.
        
        Args:
            top_model_name: The name of the top-ranked model
            benchmark_model_name: The name of the benchmark model to compare against
            text: The user's prompt or query
            system_message: Optional system message to provide context
            
        Returns:
            Dictionary with detailed comparison between the two models
        """
        try:
            # Find model data for both models using exact match first, then fuzzy match
            top_model_data = next((m for m in self.performance_data if m.get("model") == top_model_name), None)
            if top_model_data is None:
                # Try fuzzy matching
                fuzzy_match, score, matched_name = self.llm_ranker._fuzzy_match_model(top_model_name, threshold=0.6)
                if fuzzy_match:
                    top_model_data = fuzzy_match
                    logger.debug(f"Fuzzy matched top model '{top_model_name}' -> '{matched_name}' (similarity: {score:.2f})")
                else:
                    logger.warning(f"No performance data found for top model: {top_model_name}")
                    top_model_data = {"model": top_model_name, "performance": {}, "pricing": {}, "api_provider": "Unknown"}
            
            benchmark_model_data = next((m for m in self.performance_data if m.get("model") == benchmark_model_name), None)
            if benchmark_model_data is None:
                # Try fuzzy matching
                fuzzy_match, score, matched_name = self.llm_ranker._fuzzy_match_model(benchmark_model_name, threshold=0.6)
                if fuzzy_match:
                    benchmark_model_data = fuzzy_match
                    logger.debug(f"Fuzzy matched benchmark model '{benchmark_model_name}' -> '{matched_name}' (similarity: {score:.2f})")
                else:
                    logger.warning(f"No performance data found for benchmark model: {benchmark_model_name}")
                    benchmark_model_data = {"model": benchmark_model_name, "performance": {}, "pricing": {}, "api_provider": "Unknown"}
            
            # Extract performance metrics for both models
            # Performance data is nested in other.performance in the JSON structure
            top_performance = top_model_data.get("other", {}).get("performance", {})
            benchmark_performance = benchmark_model_data.get("other", {}).get("performance", {})
            
            # Extract pricing information
            # Pricing data is nested in other.pricing in the JSON structure
            top_pricing = top_model_data.get("other", {}).get("pricing", {})
            benchmark_pricing = benchmark_model_data.get("other", {}).get("pricing", {})
            
            # Calculate total costs
            top_total_cost = top_pricing.get("input_price_usd1m_tokens", 0) + top_pricing.get("output_price_usd1m_tokens", 0)
            benchmark_total_cost = benchmark_pricing.get("input_price_usd1m_tokens", 0) + benchmark_pricing.get("output_price_usd1m_tokens", 0)
            
            # Determine providers
            top_provider = top_model_data.get("api_provider", "Unknown")
            benchmark_provider = benchmark_model_data.get("api_provider", "Unknown")

            # Combine system message and user prompt for fuller analysis
            full_prompt_text = ""
            if system_message:
                full_prompt_text += f"SYSTEM MESSAGE:\n{system_message}\n\n"
            full_prompt_text += f"USER PROMPT:\n{text}"
            
            # Build the comparison prompt with requested exact JSON format
            comparison_prompt = f"""
### TASK
Compare two language models for their suitability in handling the provided prompt. Analyze their strengths, weaknesses, and overall fit for the task.

### MODEL INFORMATION
MODEL 1 (TOP RANKED): {top_model_name}
Provider: {top_provider}
Quality Index: {top_performance.get("quality_index", "N/A")}
Cost per 1M tokens: ${top_total_cost}

MODEL 2 (BENCHMARK): {benchmark_model_name}
Provider: {benchmark_provider}
Quality Index: {benchmark_performance.get("quality_index", "N/A")}
Cost per 1M tokens: ${benchmark_total_cost}

### PROMPT TO ANALYZE
{full_prompt_text}

### RESPONSE FORMAT
Return a comprehensive analysis in the exact JSON format specified below:
{{
  "top_model": "{top_model_name}",
  "benchmark_model": "{benchmark_model_name}",
  "comparison_analysis": "Your detailed analysis of how the models compare for this specific task, including key differentiating factors in capabilities, quality, speed, and cost considerations. Provide at least 100 words of detailed analysis.",
  "strengths": {{
    "top_model": "List the specific strengths of {top_model_name} for this task",
    "benchmark_model": "List the specific strengths of {benchmark_model_name} for this task"
  }},
  "task_fit_score": {{
    "top_model": 0.XX,
    "benchmark_model": 0.XX
  }},
  "recommendation_confidence": 0.XX
}}

Task fit scores should be between 0 and 1, where higher values indicate better suitability.
Recommendation confidence should be between 0 and 1, indicating your confidence in this comparison.
Do not use conditional logic statements in your response. All analysis must be dynamic based on model capabilities and task requirements.
"""

            # Check cache first for similar comparison
            cached_result = await gemini_analyzer_cache.get(
                prompt=comparison_prompt,
                model="gemini-2.5-flash-lite-preview-06-17",
                temperature=0.0,
                max_tokens=800
            )
            
            if cached_result:
                logger.info(f"Using cached comparison result (similarity: {cached_result.get('similarity', 'unknown')})")
                response_text = cached_result["response"]
            else:
                # Convert asyncio to sync as google-genai doesn't have native async support
                def generate_content():
                    max_retries = len(self.gemini_models)
                    for attempt in range(max_retries):
                        try:
                            # Get next model in round-robin
                            current_model_name = self._get_next_gemini_model()
                            self._update_model(current_model_name)
                            
                            response = self.model.generate_content(
                                contents=comparison_prompt,
                                generation_config=genai.GenerationConfig(
                                    temperature=0.0,
                                    max_output_tokens=800
                                )
                            )
                            return response.text
                        except Exception as e:
                            error_msg = str(e)
                            if "429" in error_msg or "quota" in error_msg.lower():
                                logger.warning(f"Quota exceeded for model {current_model_name} in comparison, trying next model (attempt {attempt + 1}/{max_retries})")
                                if attempt == max_retries - 1:
                                    raise e
                                continue
                            else:
                                # Non-quota error, re-raise immediately
                                raise e
                    raise Exception("All Gemini models exhausted due to quota limits in comparison")
                
                # Run in an executor to avoid blocking the async loop
                loop = asyncio.get_event_loop()
                response_text = await loop.run_in_executor(None, generate_content)
                
                # Cache the result for similar future requests
                await gemini_analyzer_cache.put(
                    prompt=comparison_prompt,
                    model="gemini-2.5-flash-lite-preview-06-17",
                    response=response_text,
                    temperature=0.0,
                    max_tokens=800
                )
            
            # Extract JSON from response
            json_match = re.search(r'{.*}', response_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group(0))
                
                # Add additional model information that might be useful
                result["model_info"] = {
                    "top_model": {
                        "provider": top_provider,
                        "quality_index": top_performance.get("quality_index", 0),
                        "cost_per_million_tokens": top_total_cost,
                        "context_window": top_model_data.get("context_window", 0),
                        "mmlu_score": top_performance.get("mmlu", 0),
                        "humaneval_score": top_performance.get("humaneval", 0)
                    },
                    "benchmark_model": {
                        "provider": benchmark_provider,
                        "quality_index": benchmark_performance.get("quality_index", 0),
                        "cost_per_million_tokens": benchmark_total_cost,
                        "context_window": benchmark_model_data.get("context_window", 0),
                        "mmlu_score": benchmark_performance.get("mmlu", 0),
                        "humaneval_score": benchmark_performance.get("humaneval", 0)
                    }
                }
                
                return result
                
            raise ValueError("Could not extract JSON from Gemini response")
            
        except Exception as e:
            logger.error(f"Error in model comparison: {str(e)}")
            return {
                "top_model": top_model_name,
                "benchmark_model": benchmark_model_name,
                "comparison_analysis": f"Error generating comparison: {str(e)}",
                "strengths": {
                    "top_model": "Unable to determine",
                    "benchmark_model": "Unable to determine" 
                },
                "task_fit_score": {
                    "top_model": 0.8,
                    "benchmark_model": 0.7
                },
                "recommendation_confidence": 0.7,
                "error": str(e)
            }
            
    def _get_feature_based_routing_hints(self, prompt_features: dict) -> dict:
        """Generate routing hints based on detected prompt features."""
        hints = {
            "preferred_capabilities": [],
            "avoid_models": [],
            "priority_metrics": [],
            "cost_sensitivity": "medium"
        }
        
        # Feature-based capability requirements
        if prompt_features["has_code"]:
            hints["preferred_capabilities"].extend(["function_calling", "code_generation"])
            hints["priority_metrics"].append("humaneval")
            
        if prompt_features["has_math"]:
            hints["priority_metrics"].extend(["math_500", "gpqa"])
            hints["cost_sensitivity"] = "low"  # Math tasks often require better models
            
        if prompt_features["has_reasoning"]:
            hints["priority_metrics"].extend(["mmlu", "gpqa"])
            hints["cost_sensitivity"] = "low"
            
        if prompt_features["has_tools"]:
            hints["preferred_capabilities"].append("function_calling")
            
        if prompt_features["requires_structured_output"]:
            hints["preferred_capabilities"].append("json_mode")
            
        if prompt_features["has_multimodal"]:
            hints["preferred_capabilities"].append("multimodal")
            hints["avoid_models"].extend(["gpt-3.5-turbo", "claude-3-haiku"])  # Basic models
            
        if prompt_features["requires_factual_accuracy"]:
            hints["priority_metrics"].append("mmlu")
            hints["cost_sensitivity"] = "medium"
            
        if prompt_features["has_creative_writing"]:
            hints["cost_sensitivity"] = "high"  # Creative tasks can often use cheaper models
            
        # Language complexity adjustments
        if prompt_features["language_complexity"] == "high":
            hints["cost_sensitivity"] = "low"
            hints["priority_metrics"].append("quality_index")
        elif prompt_features["language_complexity"] == "low":
            hints["cost_sensitivity"] = "high"
            
        return hints
    
    def _detect_prompt_features(self, prompt: str, system_message: str = "") -> dict:
        """Detect key features in the prompt for enhanced analysis."""
        full_text = f"{system_message} {prompt}".lower()
        
        features = {
            "has_code": False,
            "has_math": False, 
            "has_reasoning": False,
            "has_creative_writing": False,
            "has_analysis": False,
            "has_tools": False,
            "has_multimodal": False,
            "requires_factual_accuracy": False,
            "requires_structured_output": False,
            "language_complexity": "medium"
        }
        
        # Code detection
        code_indicators = ["function", "def ", "class ", "import ", "from ", "return ", "print(", "console.log", "sql", "query", "algorithm", "code", "programming", "javascript", "python", "java", "c++"]
        features["has_code"] = any(indicator in full_text for indicator in code_indicators)
        
        # Math detection
        math_indicators = ["calculate", "formula", "equation", "math", "statistics", "probability", "derivative", "integral", "matrix", "vector", "solve", "algebra", "geometry"]
        features["has_math"] = any(indicator in full_text for indicator in math_indicators)
        
        # Reasoning detection
        reasoning_indicators = ["analyze", "compare", "evaluate", "reasoning", "logic", "because", "therefore", "conclusion", "argument", "evidence", "explain why", "step by step"]
        features["has_reasoning"] = any(indicator in full_text for indicator in reasoning_indicators)
        
        # Creative writing detection
        creative_indicators = ["story", "poem", "creative", "imagine", "write a", "narrative", "character", "plot", "dialogue", "fiction"]
        features["has_creative_writing"] = any(indicator in full_text for indicator in creative_indicators)
        
        # Analysis detection
        analysis_indicators = ["analyze", "review", "critique", "assess", "examine", "evaluate", "summarize", "insights", "trends", "patterns"]
        features["has_analysis"] = any(indicator in full_text for indicator in analysis_indicators)
        
        # Tool usage detection
        tool_indicators = ["function", "api", "call", "tool", "plugin", "integration", "webhook", "endpoint"]
        features["has_tools"] = any(indicator in full_text for indicator in tool_indicators)
        
        # Multimodal detection
        multimodal_indicators = ["image", "picture", "photo", "video", "audio", "visual", "chart", "graph", "diagram"]
        features["has_multimodal"] = any(indicator in full_text for indicator in multimodal_indicators)
        
        # Factual accuracy detection
        factual_indicators = ["fact", "true", "accurate", "correct", "verified", "source", "reference", "citation", "data", "statistics"]
        features["requires_factual_accuracy"] = any(indicator in full_text for indicator in factual_indicators)
        
        # Structured output detection
        structured_indicators = ["json", "xml", "csv", "table", "format", "structure", "schema", "template"]
        features["requires_structured_output"] = any(indicator in full_text for indicator in structured_indicators)
        
        # Language complexity assessment
        complex_words = ["sophisticated", "comprehensive", "elaborate", "intricate", "nuanced", "multifaceted"]
        simple_words = ["simple", "basic", "easy", "quick", "straightforward"]
        
        if any(word in full_text for word in complex_words):
            features["language_complexity"] = "high"
        elif any(word in full_text for word in simple_words):
            features["language_complexity"] = "low"
        
        return features
    
    def _enhance_benchmark_comparison(self, benchmark_model: str, models_array: list, prompt_features: dict) -> dict:
        """Enhance benchmark comparison with task-specific insights."""
        comparison_data = {
            "task_specific_scores": {},
            "capability_match": {},
            "optimization_opportunities": []
        }
        
        # Find benchmark model data
        benchmark_data = next((m for m in models_array if m["model_name"] == benchmark_model), None)
        if not benchmark_data:
            return comparison_data
        
        # Task-specific scoring based on prompt features
        if prompt_features["has_code"]:
            comparison_data["task_specific_scores"]["coding"] = benchmark_data.get("HumanEval", 0)
            
        if prompt_features["has_math"]:
            comparison_data["task_specific_scores"]["math"] = benchmark_data.get("MATH-500", 0)
            comparison_data["task_specific_scores"]["reasoning"] = benchmark_data.get("GPQA", 0)
            
        if prompt_features["has_reasoning"]:
            comparison_data["task_specific_scores"]["general_reasoning"] = benchmark_data.get("MMLU", 0)
            
        # Capability matching
        if prompt_features["has_tools"]:
            comparison_data["capability_match"]["function_calling"] = benchmark_data.get("FunctionCalling", False)
            
        if prompt_features["requires_structured_output"]:
            comparison_data["capability_match"]["json_mode"] = benchmark_data.get("JSONMode", False)
            
        # Optimization opportunities
        benchmark_cost = benchmark_data.get("TotalUSD/1M", 0)
        benchmark_quality = benchmark_data.get("QualityIndex", 0)
        
        for model in models_array:
            if model["model_name"] != benchmark_model:
                model_cost = model.get("TotalUSD/1M", 0)
                model_quality = model.get("QualityIndex", 0)
                
                # Look for better cost-quality ratios
                if model_quality >= benchmark_quality * 0.95 and model_cost < benchmark_cost * 0.8:
                    comparison_data["optimization_opportunities"].append({
                        "model": model["model_name"],
                        "type": "cost_optimization",
                        "savings": round((benchmark_cost - model_cost) / benchmark_cost * 100, 1),
                        "quality_impact": round((model_quality - benchmark_quality) / benchmark_quality * 100, 1)
                    })
        
        return comparison_data