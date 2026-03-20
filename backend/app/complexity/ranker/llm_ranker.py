import asyncio
import json
import math
import re
from typing import Any, Dict, List, Tuple, Optional
from difflib import SequenceMatcher
import logging

from app.complexity.model_registry import PERFORMANCE_TO_API, PROVIDER_MAPPING, map_performance_to_api, map_provider
from app.middleware.provider_health_monitor import health_monitor

logger = logging.getLogger(__name__)


class LLMRanker:
    """Smarter model‑selection helper that *delegates* final ranking to Gemini.

    Workflow
    =========
    1. **Capability filter** – throw away any model missing prompt‑critical features
       (Anthropic tool schema, JSON‑mode, etc.).
    2. **Router prompt build** – embed surviving candidates + benchmark details in a
       structured prompt so that Gemini 2 Pro can reason about trade‑offs.
    3. **Gemini call** – parse strict‑JSON answer into a consistent Python dict.
    4. **Guardrail** – if Gemini violates the benchmark rule, fall back to a
       deterministic filter (≥ quality & cheaper).

    External deps: a Google Generative AI `client` instance capable of
    `client.models.generate_content()`.
    """

    # ------------------------------------------------------------------
    # Public knobs
    # ------------------------------------------------------------------
    WEIGHTS = {
        "quality": 0.55,
        "cost": 0.30,
        "latency": 0.15,
    }
    MAX_MODELS_RETURN = 5
    GEMINI_MODEL = "gemini-2.5-flash-lite-preview-06-17"  # Use flash-lite for better performance

    # Minimal capability catalogue – extend as new models appear
    CAPABILITY_MAP: Dict[str, set] = {
        "anthropic_tool_schema": {
            "claude-3-sonnet", "claude-3-7-sonnet-20250219", "claude-3-opus", 
            "claude-3.5-sonnet", "claude-3.5-haiku", "claude-3-haiku", "claude-opus-4-20250514",
            "claude-sonnet-4-20250514", "claude-haiku-4-20250620", "claude-3-5-sonnet-20241022"
        },
        "extended_thinking": {
            "claude-3-7-sonnet-20250219", "claude-3.5-sonnet", "claude-3-opus",
            "claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"
        },
        "json_mode": {
            "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3-sonnet",
            "claude-3-7-sonnet-20250219", "claude-3.5-sonnet", "claude-3-opus",
            "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-pro", "gemini-2.0-flash", 
            "gemini-2.5-pro-preview-06-05", "gemini-2.5-flash", "claude-opus-4-20250514", 
            "claude-sonnet-4-20250514", "claude-haiku-4-20250620", "claude-3-5-sonnet-20241022",
            "o3", "o3-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"
        },
        "function_calling": {
            "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "gemini-1.5-flash",
            "gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash", "gemini-2.5-pro-preview-06-05", 
            "gemini-2.5-flash", "claude-3-sonnet", "claude-3-7-sonnet-20250219", 
            "claude-3.5-sonnet", "claude-3-opus", "claude-opus-4-20250514", 
            "claude-sonnet-4-20250514", "claude-haiku-4-20250620", "claude-3-5-sonnet-20241022",
            "o3", "o3-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"
        },
        "openai_function_calling": {
            "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-4o-mini", "gpt-4.1", 
            "gpt-4.1-mini", "gpt-4.1-nano", "o3", "o3-mini"
        },
        "gemini_function_calling": {
            "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash",
            "gemini-2.5-pro-preview-06-05", "gemini-2.5-flash"
        },
    }

    # Regex shortcuts for prompt‑feature detection
    RE_ANTHROPIC_TOOL = re.compile(r'"tools"\s*:\s*\[.*?"input_schema"', re.S)
    RE_EXT_THINK = re.compile(r"budget_tokens|extended thinking enabled", re.I)
    RE_JSON_MODE = re.compile(r"strict json|output \(strict json", re.I)
    RE_FUNC_CALL = re.compile(r"function(_| )calling|when you need information, call", re.I)

    def __init__(self, *, client, supported_models: Dict[str, List[str]],
                 performance_data: List[Dict[str, Any]]):
        self.client = client
        self.supported_models = supported_models
        # Handle both old flat format and new nested format
        if isinstance(performance_data, dict) and 'models' in performance_data:
            self.performance_data = performance_data['models']
        else:
            self.performance_data = performance_data
        
        # Round-robin setup for multiple Gemini models to handle quota limits
        # This client is the GeminiModelRecommender which already has round-robin support
        self.has_round_robin = hasattr(client, '_get_next_gemini_model')
        
        # Provider mapping to convert API provider names to our internal names
        self.provider_mapping = PROVIDER_MAPPING
        
        # Model name mapping from performance data to API model names
        self.performance_to_api_mapping = PERFORMANCE_TO_API

    def _map_performance_model_to_api(self, performance_model_name: str) -> str:
        """Map performance data model name to actual API model name."""
        return map_performance_to_api(performance_model_name)

    def _map_api_provider_to_internal(self, api_provider: str) -> str:
        """Map API provider name to our internal provider name."""
        return map_provider(api_provider)

    def _fuzzy_match_model(self, model_name: str, threshold: float = 0.6) -> Tuple[Optional[Dict], float, str]:
        """
        Find the best fuzzy match for a model name in performance data.
        Prioritizes exact matches and prevents incorrect version matching.
        
        Args:
            model_name: The model name to search for
            threshold: Minimum similarity score (0.0-1.0)
            
        Returns:
            Tuple of (performance_data_entry, similarity_score, matched_name)
        """
        best_match = None
        best_score = 0.0
        best_name = ""
        
        # Normalize the input model name
        model_normalized = model_name.lower().replace("-", " ").replace("_", " ")
        
        # First pass: Look for exact matches (case-insensitive)
        for perf_model in self.performance_data:
            perf_name = perf_model.get("model", "")
            api_id = perf_model.get("api_id", "")
            
            # Test against both model name and API ID
            candidates = [perf_name, api_id]
            
            for candidate in candidates:
                if not candidate:
                    continue
                    
                # Check for exact match (case-insensitive)
                if model_name.lower() == candidate.lower():
                    logger.debug(f"Exact match found: '{model_name}' -> '{candidate}'")
                    return perf_model, 1.0, candidate
                
                # Check for exact match with normalized forms
                candidate_normalized = candidate.lower().replace("-", " ").replace("_", " ")
                if model_normalized == candidate_normalized:
                    logger.debug(f"Exact normalized match: '{model_name}' -> '{candidate}'")
                    return perf_model, 1.0, candidate
        
        # Second pass: Fuzzy matching with improved version-aware logic
        for perf_model in self.performance_data:
            perf_name = perf_model.get("model", "")
            api_id = perf_model.get("api_id", "")
            
            # Test against both model name and API ID
            candidates = [perf_name, api_id]
            
            for candidate in candidates:
                if not candidate:
                    continue
                    
                candidate_normalized = candidate.lower().replace("-", " ").replace("_", " ")
                
                # Calculate base similarity using SequenceMatcher
                similarity = SequenceMatcher(None, model_normalized, candidate_normalized).ratio()
                
                # Version-aware matching penalties
                similarity = self._apply_version_aware_penalties(model_name, candidate, similarity)
                
                # Boost score for exact substring matches (but only if no version conflict)
                if not self._has_version_conflict(model_name, candidate):
                    if model_normalized in candidate_normalized or candidate_normalized in model_normalized:
                        similarity += 0.2
                
                # Boost score for similar naming patterns
                if self._models_are_similar(model_name, candidate):
                    similarity += 0.1
                    
                # Cap similarity at 1.0
                similarity = min(similarity, 1.0)
                
                if similarity > best_score and similarity >= threshold:
                    best_match = perf_model
                    best_score = similarity
                    best_name = candidate
        
        if best_match:
            logger.debug(f"Fuzzy match: '{model_name}' -> '{best_name}' (similarity: {best_score:.2f})")
        
        return best_match, best_score, best_name

    def _apply_version_aware_penalties(self, model_name: str, candidate: str, base_similarity: float) -> float:
        """Apply penalties for version mismatches to prevent incorrect matching."""
        model_lower = model_name.lower()
        candidate_lower = candidate.lower()
        
        # Heavy penalty for mismatched version suffixes
        # e.g., gpt-4o-mini vs gpt-4o should have low similarity
        
        # Extract version patterns
        model_version_parts = self._extract_version_parts(model_lower)
        candidate_version_parts = self._extract_version_parts(candidate_lower)
        
        # If both have version parts, they should match closely
        if model_version_parts and candidate_version_parts:
            version_mismatch_penalty = 0.0
            
            # Check for conflicting version suffixes
            model_suffixes = set(model_version_parts.get('suffixes', []))
            candidate_suffixes = set(candidate_version_parts.get('suffixes', []))
            
            # If one has 'mini' and the other doesn't, heavy penalty
            if ('mini' in model_suffixes) != ('mini' in candidate_suffixes):
                version_mismatch_penalty += 0.4
            
            # If one has 'turbo' and the other doesn't, moderate penalty  
            if ('turbo' in model_suffixes) != ('turbo' in candidate_suffixes):
                version_mismatch_penalty += 0.3
                
            # If version numbers differ significantly, penalty
            model_versions = model_version_parts.get('versions', [])
            candidate_versions = candidate_version_parts.get('versions', [])
            
            if model_versions and candidate_versions:
                # Compare major version numbers
                try:
                    model_major = float(model_versions[0]) if model_versions[0].replace('.', '').isdigit() else 0
                    candidate_major = float(candidate_versions[0]) if candidate_versions[0].replace('.', '').isdigit() else 0
                    
                    if abs(model_major - candidate_major) >= 0.5:  # Different major/minor versions
                        version_mismatch_penalty += 0.2
                except (ValueError, IndexError):
                    pass
            
            return max(0.0, base_similarity - version_mismatch_penalty)
        
        return base_similarity
    
    def _extract_version_parts(self, model_name: str) -> dict:
        """Extract version components from model name."""
        import re
        
        # Extract version numbers (e.g., 4, 3.5, 1.5)
        version_matches = re.findall(r'\d+\.?\d*', model_name)
        
        # Extract common suffixes
        suffixes = []
        suffix_patterns = ['mini', 'turbo', 'pro', 'flash', 'sonnet', 'opus', 'haiku', 'nano']
        for suffix in suffix_patterns:
            if suffix in model_name:
                suffixes.append(suffix)
        
        return {
            'versions': version_matches,
            'suffixes': suffixes
        }
    
    def _has_version_conflict(self, model_name: str, candidate: str) -> bool:
        """Check if two model names have conflicting version information."""
        model_parts = self._extract_version_parts(model_name.lower())
        candidate_parts = self._extract_version_parts(candidate.lower())
        
        # Check for suffix conflicts
        model_suffixes = set(model_parts.get('suffixes', []))
        candidate_suffixes = set(candidate_parts.get('suffixes', []))
        
        # Conflicting suffixes (one has mini, other doesn't, etc.)
        conflicting_pairs = [
            ('mini', 'turbo'),
            ('mini', 'pro'), 
            ('nano', 'pro'),
            ('nano', 'turbo')
        ]
        
        for suffix1, suffix2 in conflicting_pairs:
            if (suffix1 in model_suffixes and suffix2 in candidate_suffixes) or \
               (suffix2 in model_suffixes and suffix1 in candidate_suffixes):
                return True
        
        # Check if one has specific suffix and other doesn't (for important suffixes)
        important_suffixes = ['mini', 'nano']
        for suffix in important_suffixes:
            if (suffix in model_suffixes) != (suffix in candidate_suffixes):
                return True
        
        return False

    def _models_are_similar(self, model1: str, model2: str) -> bool:
        """Check if two model names follow similar patterns."""
        # Extract key components (numbers, versions, etc.)
        def extract_components(name):
            components = set()
            # Extract version numbers
            version_matches = re.findall(r'\d+\.?\d*', name.lower())
            components.update(version_matches)
            
            # Extract model family names
            family_names = ["gpt", "claude", "gemini", "opus", "sonnet", "haiku", "flash", "pro", "mini", "turbo"]
            for family in family_names:
                if family in name.lower():
                    components.add(family)
            
            return components
        
        components1 = extract_components(model1)
        components2 = extract_components(model2)
        
        # Check if they share significant components
        intersection = components1.intersection(components2)
        union = components1.union(components2)
        
        if not union:
            return False
            
        # Return True if they share at least 50% of components
        return len(intersection) / len(union) >= 0.5

    def _is_benchmark_model_match(self, benchmark_model: str, litellm_model: str, performance_model: str) -> bool:
        """
        Check if a given model matches the benchmark model.
        Now simplified since benchmark models are stored in "Provider/Model" format.
        
        Args:
            benchmark_model: The benchmark model name from user profile (e.g., "Anthropic/Claude 3.7 Sonnet")
            litellm_model: The LiteLLM model name (e.g., "claude-3-7-sonnet-20250219")
            performance_model: The performance data model name (e.g., "Claude 3.7 Sonnet")
            
        Returns:
            True if the model matches the benchmark
        """
        # Direct match checks
        if benchmark_model.lower() == litellm_model.lower():
            return True
        if benchmark_model.lower() == performance_model.lower():
            return True
        
        # If benchmark_model is in "Provider/Model" format, extract the model part
        if "/" in benchmark_model:
            provider, model_name = benchmark_model.split("/", 1)
            
            # Check if the model part matches the performance model
            if model_name.lower() == performance_model.lower():
                return True
            
            # Check if the model part matches the litellm model
            if model_name.lower() == litellm_model.lower():
                return True
        
        # Reverse check - if benchmark_model is just the model name, check if it matches
        if "/" not in benchmark_model:
            if benchmark_model.lower() == performance_model.lower():
                return True
            if benchmark_model.lower() == litellm_model.lower():
                return True
        
        return False

    # ------------------------------------------------------------------
    # Prompt‑feature → required capability helpers
    # ------------------------------------------------------------------
    def _extract_required_capabilities(self, prompt: str) -> set[str]:
        """
        Extract required capabilities from the prompt.
        Only detects capabilities that are explicitly required.
        """
        req = set()
        
        # Check for anthropic tool schema (more detailed pattern)
        if self.RE_ANTHROPIC_TOOL.search(prompt) and "anthropic" in prompt.lower():
            req.add("anthropic_tool_schema")
        elif re.search(r'"tools"\s*:\s*\[\s*{\s*"type"\s*:', prompt, re.DOTALL) or \
             re.search(r'"type"\s*:\s*"text_editor_\d+"', prompt, re.DOTALL):
            # More specific detection for Anthropic text editor tool
            req.add("anthropic_tool_schema")
            
        # Check for extended thinking (more strict pattern)
        if self.RE_EXT_THINK.search(prompt) and "claude" in prompt.lower():
            req.add("extended_thinking")
            
        # Check for JSON mode (more strict pattern)
        if self.RE_JSON_MODE.search(prompt) and "json" in prompt.lower():
            req.add("json_mode")
            
        # Check for function calling (more detailed patterns)
        if self.RE_FUNC_CALL.search(prompt) and ("function" in prompt.lower() or "tool" in prompt.lower()):
            req.add("function_calling")
        elif re.search(r'"functions"\s*:\s*\[\s*{', prompt, re.DOTALL) or \
             re.search(r'"function_call"\s*:\s*"auto"', prompt, re.DOTALL) or \
             re.search(r'openai\.chat\.completions\.create', prompt, re.DOTALL):
            # OpenAI specific function calling
            req.add("function_calling")
            req.add("openai_function_calling")
        elif re.search(r'genai\.generate_content.*function_calling=', prompt, re.DOTALL) or \
             re.search(r'model\.generate_content.*function_calling=', prompt, re.DOTALL):
            # Gemini specific function calling
            req.add("function_calling")
            req.add("gemini_function_calling")
            
        logger.debug(f"Detected capabilities: {req}")
        return req

    def _model_is_compatible(self, model_name: str, required: set[str]) -> bool:
        """
        Check if a model is compatible with the required capabilities.
        Returns True if the model supports all required capabilities or if there are no requirements.
        """
        # Normalize model name for compatibility checking
        normalized_model = model_name.lower().replace(".", "-").replace(" ", "-")
        
        if not required:
            return True
            
        for cap in required:
            if normalized_model not in self.CAPABILITY_MAP.get(cap, set()):
                logger.debug(f"Model {model_name} (normalized: {normalized_model}) doesn't support capability: {cap}")
                return False
        return True

    # ------------------------------------------------------------------
    # MAIN ranking routine – sends router prompt to Gemini
    # ------------------------------------------------------------------

    async def ranker(self, text: str, max_models: int | None = None, **kwargs) -> Dict[str, Any]:
        """Return a dict with `ranked_models`, `task_complexity`, etc."""
        max_models = max_models or self.MAX_MODELS_RETURN
        sys_msg = kwargs.get("system_message", "")
        benchmark_model = kwargs.get("benchmark_model", "")
        
        # Store benchmark model for fallback use
        if benchmark_model:
            self._current_benchmark_model = benchmark_model
        
        logger.info(f"LLMRanker starting with benchmark_model: {benchmark_model} (will be used as fallback if needed)")
        logger.debug(f"Supported models count: {sum(len(models) for models in self.supported_models.values())}")
        
        # 1. analyse prompt requirements
        full_prompt = f"SYSTEM MESSAGE:\n{sys_msg}\n\nUSER PROMPT:\n{text}" if sys_msg else f"USER PROMPT:\n{text}"
        req_caps = self._extract_required_capabilities(full_prompt)
        logger.debug(f"Required capabilities detected: {req_caps}")
        
        # 2. collect compatible candidates
        candidates = []
        benchmark_meta = None
        
        # Create reverse mapping for benchmark model lookup
        litellm_to_performance_mapping = {v: k for k, v in self.performance_to_api_mapping.items()}
        
        for provider, mlist in self.supported_models.items():
            for m in mlist:
                # Check both direct match and mapped match for the model
                pdata = next((x for x in self.performance_data if x["model"] == m), None)
                if not pdata:
                    # Try looking for the mapped performance data name
                    mapped_perf_name = litellm_to_performance_mapping.get(m)
                    if mapped_perf_name:
                        pdata = next((x for x in self.performance_data if x["model"] == mapped_perf_name), None)
                
                if not pdata:
                    # Try fuzzy matching as a last resort
                    fuzzy_match, similarity, matched_name = self._fuzzy_match_model(m, threshold=0.6)
                    if fuzzy_match:
                        pdata = fuzzy_match
                        logger.debug(f"Using fuzzy match for '{m}': found '{matched_name}' (similarity: {similarity:.2f})")
                    else:
                        logger.warning(f"No performance data found for model '{m}' (tried exact match, mapping, and fuzzy matching)")
                        continue
                    
                if not self._model_is_compatible(m, req_caps):
                    logger.debug(f"Model {m} is not compatible with required capabilities {req_caps}")
                    continue

                # Handle nested data structure
                other_data = pdata.get("other", {})
                perf = other_data.get("performance", pdata.get("performance", {}))
                price = other_data.get("pricing", pdata.get("pricing", {}))
                speed = other_data.get("speed", pdata.get("speed", {}))
                
                # Convert quality_index to numeric value
                quality_index = perf.get("quality_index", 0)
                if isinstance(quality_index, str):
                    try:
                        quality_index = float(quality_index)
                    except (ValueError, TypeError):
                        quality_index = 0
                
                # Calculate total cost, ensuring numeric values
                input_cost = price.get("input_price_usd1m_tokens", 0)
                output_cost = price.get("output_price_usd1m_tokens", 0)
                if isinstance(input_cost, str):
                    try:
                        input_cost = float(input_cost)
                    except (ValueError, TypeError):
                        input_cost = 0
                if isinstance(output_cost, str):
                    try:
                        output_cost = float(output_cost)
                    except (ValueError, TypeError):
                        output_cost = 0
                
                entry = {
                    "model_name": m,
                    "provider": provider,
                    "QualityIndex": quality_index,
                    "TotalUSD/1M": input_cost + output_cost,
                    "MedianFirstChunk s": speed.get("medianfirst_chunk_s", 0),
                    # Additional identifying fields from performance data
                    "api_id": pdata.get("api_id", "unknown"),
                    "context_window": pdata.get("context_window", "unknown"),
                    "function_calling": pdata.get("function_calling", "unknown"),
                    "json_mode": pdata.get("json_mode", "unknown"),
                }
                candidates.append(entry)
                
                # Match benchmark model - check both the LiteLLM name and mapped performance name
                if benchmark_model and not benchmark_meta:
                    # Check if this model matches the benchmark using comprehensive mapping
                    if self._is_benchmark_model_match(benchmark_model, m, pdata["model"]):
                        logger.debug(f"Found benchmark model match: {m} for {benchmark_model} via {pdata['model']}")
                        benchmark_meta = entry
        
        logger.info(f"Found {len(candidates)} compatible candidates")
        
        # If benchmark model not found in candidates, try to find it in performance data
        if benchmark_model and not benchmark_meta:
            logger.debug(f"Benchmark model {benchmark_model} not found in candidates, searching performance data...")
            
            # Define comprehensive mapping for benchmark model names
            benchmark_name_mappings = {
                "claude-3-7-sonnet-20250219": ["Claude 3.7 Sonnet", "Claude-3.7 Sonnet", "Claude-3.7-Sonnet"],
                "claude-sonnet-4-20250514": ["Claude 4 Sonnet", "Claude-4 Sonnet", "Claude-4-Sonnet", "Claude 4 Sonnet Thinking"],
                "gpt-4.1-mini": ["GPT-4.1 mini", "GPT-4.1-mini"],
                "gpt-4.1": ["GPT-4.1"],
                "claude-3-5-sonnet-20241022": ["Claude 3.5 Sonnet (Oct)", "Claude-3.5 Sonnet"],
                "claude-3-5-sonnet-20240620": ["Claude 3.5 Sonnet (June)", "Claude-3.5 Sonnet"],
                "gemini-2.5-pro-preview-06-05": ["Gemini-2.5-Pro", "Gemini-2.5 Pro", "Gemini 2.5 Pro"],
            }
            
            # Try to find the benchmark model by looking for its performance data name
            benchmark_perf_name = litellm_to_performance_mapping.get(benchmark_model)
            benchmark_data = None
            
            if benchmark_perf_name:
                benchmark_data = next((x for x in self.performance_data if x["model"] == benchmark_perf_name), None)
            
            # If not found by direct mapping, try searching by mapped names
            if not benchmark_data:
                possible_names = benchmark_name_mappings.get(benchmark_model, [benchmark_model])
                possible_names.append(benchmark_model)
                
                for model_data in self.performance_data:
                    model_name = model_data.get("model", "")
                    if (model_name in possible_names or 
                        benchmark_model.lower() in model_name.lower() or
                        any(name.lower() in model_name.lower() for name in possible_names)):
                        benchmark_data = model_data
                        logger.debug(f"Found benchmark model by name matching: {model_name}")
                        break
            
            # If not found yet, try reverse mapping from LiteLLM name to performance name
            if not benchmark_data:
                # Try direct search in performance data using model mapping
                benchmark_data = next((x for x in self.performance_data 
                                     if self._map_performance_model_to_api(x["model"]) == benchmark_model), None)
            
            if benchmark_data:
                logger.debug(f"Found benchmark model in performance data: {benchmark_data['model']}")
                # Handle nested data structure
                other_data = benchmark_data.get("other", {})
                perf = other_data.get("performance", benchmark_data.get("performance", {}))
                price = other_data.get("pricing", benchmark_data.get("pricing", {}))
                speed = other_data.get("speed", benchmark_data.get("speed", {}))
                # Convert quality_index to numeric value
                quality_index = perf.get("quality_index", 0)
                if isinstance(quality_index, str):
                    try:
                        quality_index = float(quality_index)
                    except (ValueError, TypeError):
                        quality_index = 0
                
                # Calculate total cost, ensuring numeric values
                input_cost = price.get("input_price_usd1m_tokens", 0)
                output_cost = price.get("output_price_usd1m_tokens", 0)
                if isinstance(input_cost, str):
                    try:
                        input_cost = float(input_cost)
                    except (ValueError, TypeError):
                        input_cost = 0
                if isinstance(output_cost, str):
                    try:
                        output_cost = float(output_cost)
                    except (ValueError, TypeError):
                        output_cost = 0
                
                benchmark_meta = {
                    "model_name": benchmark_model,  # Use the LiteLLM name
                    "provider": self._map_api_provider_to_internal(benchmark_data.get("api_provider", "Unknown")),
                    "QualityIndex": quality_index,
                    "TotalUSD/1M": input_cost + output_cost,
                    "MedianFirstChunk s": speed.get("medianfirst_chunk_s", 0),
                    # Additional identifying fields from performance data
                    "api_id": benchmark_data.get("api_id", "unknown"),
                    "context_window": benchmark_data.get("context_window", "unknown"),
                    "function_calling": benchmark_data.get("function_calling", "unknown"),
                    "json_mode": benchmark_data.get("json_mode", "unknown"),
                }
                logger.debug(f"Benchmark model metadata: QualityIndex={benchmark_meta['QualityIndex']}, Cost={benchmark_meta['TotalUSD/1M']}")
                
                # Add benchmark model to candidates if it's not already there
                # BUT only if its provider is in the allowed providers list
                benchmark_in_candidates = any(c.get("model_name") == benchmark_model for c in candidates)
                benchmark_provider = benchmark_meta.get("provider", "").lower()
                allowed_providers = list(self.supported_models.keys())
                
                if not benchmark_in_candidates:
                    if benchmark_provider in allowed_providers:
                        logger.debug(f"Adding benchmark model {benchmark_model} to candidates for comparison")
                        candidates.append(benchmark_meta)
                    else:
                        logger.debug(f"Benchmark model {benchmark_model} provider '{benchmark_provider}' not in allowed providers {allowed_providers} - skipping")
            else:
                logger.warning(f"Benchmark model {benchmark_model} not found in performance data")

        # If no candidates pass the capability filter but we have required capabilities,
        # ignore the capability requirements and try again
        if not candidates and req_caps:
            logger.info(f"No models passed capability filter. Ignoring capability requirements: {req_caps}")
            candidates = []
            for provider, mlist in self.supported_models.items():
                for m in mlist:
                    pdata = next((x for x in self.performance_data if x["model"] == m), None)
                    if not pdata:
                        continue
                    
                    # Handle nested data structure
                    other_data = pdata.get("other", {})
                    perf = other_data.get("performance", pdata.get("performance", {}))
                    price = other_data.get("pricing", pdata.get("pricing", {}))
                    speed = other_data.get("speed", pdata.get("speed", {}))
                    entry = {
                        "model_name": m,
                        "provider": provider,
                        "QualityIndex": perf.get("quality_index", 0),
                        "TotalUSD/1M": price.get("input_price_usd1m_tokens", 0) + price.get("output_price_usd1m_tokens", 0),
                        "MedianFirstChunk s": speed.get("medianfirst_chunk_s", 0),
                    }
                    candidates.append(entry)
                    if m == benchmark_model:
                        benchmark_meta = entry
                    
                    # Match benchmark model with case-insensitive comparison and variant handling
                    if benchmark_model and (
                        m.lower() == benchmark_model.lower() or
                        m.lower().replace(".", "-").replace(" ", "-") == benchmark_model.lower().replace(".", "-").replace(" ", "-") or
                        m.lower().replace("-", ".").replace(" ", "-") == benchmark_model.lower().replace("-", ".").replace(" ", "-")
                    ):
                        logger.debug(f"Found benchmark model match in fallback: {m} for {benchmark_model}")
                        benchmark_meta = entry
            
            logger.info(f"After ignoring capabilities, found {len(candidates)} candidates")
            
        # Note: Removed automatic default model addition to respect user constraints
        # If user specifies limited models, we should honor that choice
        
        if not candidates:
            return self._fallback("No compatible models found")
        
        # Check if benchmark model was found in candidates
        if benchmark_model and not benchmark_meta:
            logger.warning(f"Benchmark model {benchmark_model} not found in candidates")
            # Try to find the benchmark model in performance data directly
            benchmark_data = next((x for x in self.performance_data if x["model"] == benchmark_model), None)
            if benchmark_data:
                logger.debug(f"Found benchmark model in performance data but not in candidates")
                perf = benchmark_data.get("performance", {})
                price = benchmark_data.get("pricing", {})
                speed = benchmark_data.get("speed", {})
                benchmark_meta = {
                    "model_name": benchmark_model,
                    "provider": self._map_api_provider_to_internal(benchmark_data.get("api_provider", "Unknown")),
                    "QualityIndex": perf.get("quality_index", 0),
                    "TotalUSD/1M": price.get("input_price_usd1m_tokens", 0) + price.get("output_price_usd1m_tokens", 0),
                    "MedianFirstChunk s": speed.get("medianfirst_chunk_s", 0),
                }
            else:
                logger.warning(f"Benchmark model {benchmark_model} not found in performance data")

        # 3. Build router prompt for Gemini ----------------------------------
        cand_json = json.dumps(candidates, indent=2)
        benchmark_section = ""
        if benchmark_meta:
            benchmark_section = (
                f"### BENCHMARK\n"
                f"model: {benchmark_model}\n"
                f"quality: {benchmark_meta['QualityIndex']}\n"
                f"cost_usd_per_million: {benchmark_meta['TotalUSD/1M']}\n"
            )

        router_prompt = f"""
### SYSTEM
You are a cost-optimization expert specializing in LLM selection for maximum efficiency.
Your PRIMARY GOAL: Select the CHEAPEST models that can achieve the required quality level for this specific task.
IGNORE provider bias - a cheap Google model is better than an expensive Anthropic model for simple tasks.

### TASK ANALYSIS
Analyze the user prompt and determine:
1. Task complexity level (1-5)
2. Required model capabilities 
3. Quality threshold needed for good performance

### WEIGHTS (for guidance – you may deviate with justification)
quality {self.WEIGHTS['quality']}  |  cost {self.WEIGHTS['cost']}  |  latency {self.WEIGHTS['latency']}

### CANDIDATE MODELS (JSON list)
{cand_json}

{benchmark_section}

### USER PROMPT
{full_prompt}

### SELECTION CRITERIA (RANKED BY PRIORITY)
1. **COST FIRST**: For simple tasks (complexity 1-2), select the CHEAPEST models available regardless of provider
2. **PROVIDER AGNOSTIC**: Do NOT favor Anthropic over Google or vice versa - evaluate purely on cost and capability
3. **QUALITY THRESHOLD**: Ensure selected models meet minimum quality needed for accurate task completion
4. **TASK-APPROPRIATE**: Don't over-engineer simple tasks with expensive high-end models
5. **DIVERSE PROVIDERS**: Include models from different providers if they offer better cost advantages

### BENCHMARK GUIDANCE
{f'BENCHMARK: "{benchmark_model}" has QualityIndex {benchmark_meta["QualityIndex"]} and costs ${benchmark_meta["TotalUSD/1M"]}/1M tokens. CRITICAL: For complex tasks (complexity 4-5), maintain at least 85% of benchmark quality ({benchmark_meta["QualityIndex"] * 0.85:.1f}+). For simple tasks (1-2), prioritize cost over quality. Cost can be higher than benchmark if quality justifies it for complex tasks.' if benchmark_meta else 'No benchmark provided - select models appropriate for task complexity.'}

### TASK-COMPLEXITY OPTIMIZATION RULES
1. **COMPLEX TASKS (4-5)**: Quality is PARAMOUNT - maintain benchmark quality level even if cost is higher
   - Select models with QualityIndex >= 85% of benchmark
   - Cost can exceed benchmark if quality justifies it
   - Examples: Advanced coding, complex reasoning, technical analysis
2. **SIMPLE TASKS (1-2)**: Cost optimization is PRIMARY - cheapest models that work
   - Prioritize cost over quality when basic capability is sufficient
   - Examples: Basic questions, simple arithmetic, formatting
3. **MEDIUM TASKS (3)**: Balance quality and cost reasonably
4. **CRITICAL**: Never recommend GPT-4.1-nano for complex tasks when benchmark is Claude Sonnet 3.5+
5. If the benchmark model is not available, select models appropriate for task complexity
6. Limit to top {max_models} recommendations

### OUTPUT (STRICT JSON)
{{
  "task_complexity": "<1‑5>",
  "ranked_models": [
    {{"rank":1,"model_name":"<name>","provider":"<prov>","confidence":0‑1,"reasoning":"<specific justification for this task compared to the benchmark if available>}}
    /* up to {max_models} entries */
  ]
}}
Only the JSON object – no prose.
"""

        # 4. Gemini call ------------------------------------------------------
        def _call_gemini():
            if self.has_round_robin:
                # Use round-robin through the GeminiModelRecommender
                max_retries = len(self.client.gemini_models)
                for attempt in range(max_retries):
                    try:
                        # Get next model in round-robin
                        current_model_name = self.client._get_next_gemini_model()
                        self.client._update_model(current_model_name)
                        logger.debug(f"Calling Gemini model via round-robin: {current_model_name}")
                        
                        # Use the GenerativeModel instance directly
                        resp = self.client.model.generate_content(
                            contents=[router_prompt],
                            generation_config={"temperature": 0.0, "max_output_tokens": 1024},
                        )
                        return resp.text
                    except Exception as e:
                        error_msg = str(e)
                        if "429" in error_msg or "quota" in error_msg.lower():
                            logger.warning(f"LLMRanker: Quota exceeded for model {current_model_name}, trying next model in round-robin (attempt {attempt + 1}/{max_retries})")
                            if attempt == max_retries - 1:
                                return f"ERROR: All Gemini models exhausted due to quota limits: {str(e)}"
                            continue
                        else:
                            # Non-quota error, return immediately
                            return f"ERROR: {str(e)}"
                return f"ERROR: All Gemini models exhausted due to quota limits"
            else:
                # Fallback to original method
                try:
                    logger.debug(f"Calling Gemini model: {self.GEMINI_MODEL}")
                    # Use the GenerativeModel instance directly
                    resp = self.client.generate_content(
                        contents=[router_prompt],
                        generation_config={"temperature": 0.0, "max_output_tokens": 1024},
                    )
                    return resp.text
                except Exception as e:
                    logger.error(f"Error in Gemini call: {str(e)}")
                    return f"ERROR: {str(e)}"

        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, _call_gemini)
        logger.debug(f"Gemini raw response length: {len(raw)}")
        
        if raw.startswith("ERROR:"):
            logger.warning("Gemini call failed, falling back to direct ranking")
            return self._direct_ranking(candidates, max_models, benchmark_model, benchmark_meta)
            
        match = re.search(r"{.*}", raw, re.S)
        if not match:
            logger.warning(f"Failed to extract JSON from Gemini response. Raw response: {raw[:200]}...")
            logger.warning("Falling back to direct ranking")
            return self._direct_ranking(candidates, max_models, benchmark_model, benchmark_meta)
            
        try:
            data = json.loads(match.group(0))
            logger.debug(f"Successfully parsed JSON response with {len(data.get('ranked_models', []))} ranked models")
        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode error: {e}, Raw JSON: {match.group(0)[:200]}...")
            logger.warning(f"Full raw response for debugging: {raw}")
            logger.warning("Falling back to direct ranking due to JSON parsing error")
            return self._direct_ranking(candidates, max_models, benchmark_model, benchmark_meta)

        # Check if we have ranked models in the response
        if not data.get("ranked_models"):
            logger.warning("No ranked models in Gemini response, falling back to direct ranking")
            return self._direct_ranking(candidates, max_models, benchmark_model, benchmark_meta)

        # 5. minimal sanity – ensure benchmark rule stood
        # For complex tasks (complexity 4-5), recommended models should have quality >= benchmark
        # For simple tasks (complexity 1-2), cost optimization is more important
        task_complexity = int(data.get("task_complexity", 3))
        
        if benchmark_meta and task_complexity >= 4:
            # For high complexity tasks, ensure quality is maintained
            benchmark_quality = float(benchmark_meta.get("QualityIndex", 0))
            quality_threshold = benchmark_quality * 0.85  # Allow 15% quality degradation max
            
            violations = []
            for m in data.get("ranked_models", []):
                if m["model_name"] != benchmark_model:
                    # Find the candidate data for this model
                    candidate_data = next((c for c in candidates if c["model_name"] == m["model_name"]), None)
                    if candidate_data:
                        candidate_quality = float(candidate_data.get("QualityIndex", 0))
                        if candidate_quality < quality_threshold:
                            violations.append(f"Model {m['model_name']} quality {candidate_quality} < threshold {quality_threshold}")
            
            if violations:
                logger.warning(f"Quality violations for complex task (complexity {task_complexity}): {violations}")
                logger.info("Falling back to direct ranking to ensure quality standards")
                return self._direct_ranking(candidates, max_models, benchmark_model, benchmark_meta)
        
        # For simple tasks or when benchmark quality is maintained, accept the recommendations
        logger.debug(f"Benchmark rule satisfied for task complexity {task_complexity}")

        # 6. happy path
        # Apply model name mapping to the results and populate additional identifying fields
        mapped_models = []
        for model in data.get("ranked_models", []):
            mapped_model = model.copy()
            original_model_name = model["model_name"]
            mapped_model["model_name"] = self._map_performance_model_to_api(original_model_name)
            
            # Find the candidate data to populate additional fields
            candidate_data = next((c for c in candidates if c.get("model_name") == original_model_name), None)
            if candidate_data:
                # Add additional identifying information from performance data
                mapped_model["performance_name"] = original_model_name  # Original model name from performance data
                mapped_model["quality_index"] = candidate_data.get("QualityIndex", 0)
                mapped_model["cost_per_1m_tokens"] = candidate_data.get("TotalUSD/1M", 0)
                mapped_model["api_id"] = candidate_data.get("api_id", "unknown")  # Unique API identifier
                mapped_model["context_window"] = candidate_data.get("context_window", "unknown")
                mapped_model["function_calling"] = candidate_data.get("function_calling", "unknown")
                mapped_model["json_mode"] = candidate_data.get("json_mode", "unknown")
            else:
                # If no candidate data found, try to find it in performance data
                perf_data = next((x for x in self.performance_data if x["model"] == original_model_name), None)
                if perf_data:
                    # Handle nested data structure
                    other_data = perf_data.get("other", {})
                    perf = other_data.get("performance", perf_data.get("performance", {}))
                    price = other_data.get("pricing", perf_data.get("pricing", {}))
                    
                    # Convert quality_index to numeric value
                    quality_index = perf.get("quality_index", 0)
                    if isinstance(quality_index, str):
                        try:
                            quality_index = float(quality_index)
                        except (ValueError, TypeError):
                            quality_index = 0
                    
                    # Calculate total cost
                    input_cost = price.get("input_price_usd1m_tokens", 0)
                    output_cost = price.get("output_price_usd1m_tokens", 0)
                    if isinstance(input_cost, str):
                        try:
                            input_cost = float(input_cost)
                        except (ValueError, TypeError):
                            input_cost = 0
                    if isinstance(output_cost, str):
                        try:
                            output_cost = float(output_cost)
                        except (ValueError, TypeError):
                            output_cost = 0
                    
                    mapped_model["performance_name"] = original_model_name
                    mapped_model["quality_index"] = quality_index
                    mapped_model["cost_per_1m_tokens"] = input_cost + output_cost
                    mapped_model["api_id"] = perf_data.get("api_id", "unknown")
                    mapped_model["context_window"] = perf_data.get("context_window", "unknown")
                    mapped_model["function_calling"] = perf_data.get("function_calling", "unknown")
                    mapped_model["json_mode"] = perf_data.get("json_mode", "unknown")
                else:
                    # Set default values if no data found
                    mapped_model["performance_name"] = original_model_name
                    mapped_model["quality_index"] = 0
                    mapped_model["cost_per_1m_tokens"] = 0
                    mapped_model["api_id"] = "unknown"
                    mapped_model["context_window"] = "unknown"
                    mapped_model["function_calling"] = "unknown"
                    mapped_model["json_mode"] = "unknown"
            
            mapped_models.append(mapped_model)
        
        return {
            "task_complexity": int(data.get("task_complexity", 3)),
            "ranked_models": mapped_models,
            "required_capabilities": list(req_caps),
            "benchmark": benchmark_model or None,
        }

    # ------------------------------------------------------------------
    # Deterministic fallback if Gemini violates benchmark guardrail
    # ------------------------------------------------------------------
    def _deterministic_with_benchmark(self, cands, bench, k):
        # Convert QualityIndex to float for proper comparison
        bench_quality = float(bench["QualityIndex"]) if bench["QualityIndex"] else 0
        bench_cost = float(bench["TotalUSD/1M"]) if bench["TotalUSD/1M"] else 0
        
        good = []
        for c in cands:
            try:
                c_quality = float(c["QualityIndex"]) if c["QualityIndex"] else 0
                c_cost = float(c["TotalUSD/1M"]) if c["TotalUSD/1M"] else 0
                if c_quality >= bench_quality and c_cost < bench_cost:
                    good.append(c)
            except (ValueError, TypeError):
                # Skip candidates with invalid quality/cost data
                continue
        ranked = sorted(good, key=lambda x: (-float(x["QualityIndex"]) if x["QualityIndex"] else 0, float(x["TotalUSD/1M"]) if x["TotalUSD/1M"] else 0))[:k] or [bench]
        return {
            "task_complexity": 3,
            "ranked_models": [
                {"rank": i+1, 
                 "model_name": self._map_performance_model_to_api(r["model_name"]), 
                 "provider": r["provider"], 
                 "confidence": 0.5,
                 "reasoning": "fallback deterministic rule"} for i, r in enumerate(ranked)
            ],
            "benchmark": bench["model_name"],
            "required_capabilities": [],
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _fallback(self, reason: str):
        """Provide a fallback error response when ranking fails."""
        logger.warning(f"LLMRanker fallback triggered: {reason}")
        
        # Check if we have a benchmark model to use as fallback
        benchmark_model = getattr(self, '_current_benchmark_model', None)
        if benchmark_model:
            # Try to find the benchmark in our supported models
            for provider, models in self.supported_models.items():
                if benchmark_model in models:
                    logger.info(f"BENCHMARK FALLBACK: Using benchmark model {benchmark_model} due to LLM ranker error")
                    return {
                        "task_complexity": 3,
                        "ranked_models": [
                            {
                                "rank": 1,
                                "model_name": benchmark_model,
                                "provider": provider,
                                "confidence": 0.8,
                                "reasoning": f"BENCHMARK FALLBACK: LLMRanker failed ({reason}). Using your configured benchmark model '{benchmark_model}' for consistent performance.",
                                "fallback_type": "benchmark_error"
                            }
                        ],
                        "benchmark": benchmark_model,
                        "required_capabilities": []
                    }
        
        logger.warning(f"No benchmark model available for fallback, returning error")
        return {"error": reason, "ranked_models": []}
        
    def _direct_ranking(self, candidates, max_models=5, benchmark_model=None, benchmark_meta=None):
        """
        Perform direct ranking of models without using Gemini.
        Used as a fallback when Gemini fails but we have candidates.
        
        Args:
            candidates: List of model candidates with their metrics
            max_models: Maximum number of models to return
            benchmark_model: Name of the benchmark model if any
            benchmark_meta: Metadata for the benchmark model if available
            
        Returns:
            Dictionary with ranked models and task info
        """
        logger.info(f"Performing direct ranking for {len(candidates)} candidates")
        
        # If we have the benchmark model, make sure it's included in candidates
        # BUT only if its provider is in the allowed providers list
        if benchmark_model and benchmark_meta and benchmark_meta not in candidates:
            benchmark_provider = benchmark_meta.get("provider", "").lower()
            allowed_providers = list(self.supported_models.keys())
            
            if benchmark_provider in allowed_providers:
                candidates.append(benchmark_meta)
                logger.debug(f"Added benchmark model {benchmark_model} to candidates")
            else:
                logger.debug(f"Benchmark model {benchmark_model} provider '{benchmark_provider}' not in allowed providers {allowed_providers} - not adding to direct ranking")
        
        # If we have a benchmark, prioritize models with similar or better quality
        benchmark_quality = 0  # Default value in case benchmark_meta is None
        if benchmark_meta:
            benchmark_quality = benchmark_meta.get("QualityIndex", 0)
            # Ensure benchmark_quality is numeric
            if isinstance(benchmark_quality, str):
                try:
                    benchmark_quality = float(benchmark_quality)
                except (ValueError, TypeError):
                    benchmark_quality = 0
            logger.debug(f"Benchmark quality: {benchmark_quality}")
            
            # For complex tasks, be more strict about quality - only allow 15% degradation from benchmark
            # For simpler tasks, allow more flexibility for cost optimization
            quality_degradation_factor = 0.85  # Allow max 15% quality degradation
            quality_threshold = max(0, benchmark_quality * quality_degradation_factor)
            
            suitable_candidates = []
            for c in candidates:
                quality = c.get("QualityIndex", 0)
                cost = c.get("TotalUSD/1M", 0)
                
                # Filter out models with missing or invalid performance data
                # Skip models where quality_index was "N/A" or missing (converted to 0)
                # and cost is also 0, indicating completely missing performance data
                if quality == 0 and cost == 0:
                    logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - missing performance data (quality: {c.get('QualityIndex', 'N/A')}, cost: {cost})")
                    continue

                # Ensure quality is numeric and valid
                if isinstance(quality, str):
                    if quality.upper() == "N/A":
                        logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - quality index is N/A")
                        continue
                    try:
                        quality = float(quality)
                    except (ValueError, TypeError):
                        logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - invalid quality index: {quality}")
                        continue
                elif quality is None:
                    logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - quality index is None")
                    continue

                # Only include models with meaningful quality scores
                if quality > 0 and quality >= quality_threshold:
                    suitable_candidates.append(c)

            if suitable_candidates:
                logger.debug(f"Found {len(suitable_candidates)} candidates with quality >= {quality_threshold} (85% of benchmark {benchmark_quality})")
                candidates = suitable_candidates
            else:
                logger.warning(f"No candidates meet quality threshold {quality_threshold}, using all candidates")
                logger.warning(f"Recommendations may not maintain benchmark quality level")
                
            # Sort prioritizing benchmark-quality models first, then by cost
            # Factor in provider health score to down-weight unhealthy providers
            def sort_key(x):
                quality = x.get("QualityIndex", 0)
                if isinstance(quality, str):
                    try:
                        quality = float(quality)
                    except (ValueError, TypeError):
                        quality = 0
                elif quality is None:
                    quality = 0

                # Ensure cost is also numeric
                cost = x.get("TotalUSD/1M", 0)
                if isinstance(cost, str):
                    try:
                        cost = float(cost)
                    except (ValueError, TypeError):
                        cost = 0
                elif cost is None:
                    cost = 0

                # Multiply quality by provider health score (0.0–1.0)
                provider_name = x.get("provider", "unknown")
                h_score = health_monitor.get_health_score(provider_name)
                effective_quality = quality * h_score

                return (
                    -(effective_quality >= benchmark_quality),  # Prioritize benchmark+ quality
                    abs(effective_quality - benchmark_quality),  # Prefer similar quality
                    cost  # Then by cost
                )
            ranked = sorted(candidates, key=sort_key)[:max_models]
        else:
            # No benchmark - filter out invalid models first, then sort by quality and cost
            valid_candidates = []
            for c in candidates:
                quality = c.get("QualityIndex", 0)
                cost = c.get("TotalUSD/1M", 0)
                
                # Filter out models with missing or invalid performance data
                if quality == 0 and cost == 0:
                    logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - missing performance data (quality: {c.get('QualityIndex', 'N/A')}, cost: {cost})")
                    continue

                # Ensure quality is numeric and valid
                if isinstance(quality, str):
                    if quality.upper() == "N/A":
                        logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - quality index is N/A")
                        continue
                    try:
                        quality = float(quality)
                    except (ValueError, TypeError):
                        logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - invalid quality index: {quality}")
                        continue
                elif quality is None:
                    logger.debug(f"Excluding model {c.get('model_name', 'unknown')} - quality index is None")
                    continue

                # Only include models with meaningful quality scores
                if quality > 0:
                    valid_candidates.append(c)

            if valid_candidates:
                logger.debug(f"Using {len(valid_candidates)} models with valid performance data")
                candidates = valid_candidates
            else:
                logger.warning("No models with valid performance data found, using all candidates as fallback")
            
            # Sort by quality (health-adjusted) first, then by cost
            def sort_key(x):
                quality = x.get("QualityIndex", 0)
                if isinstance(quality, str):
                    try:
                        quality = float(quality)
                    except (ValueError, TypeError):
                        quality = 0
                elif quality is None:
                    quality = 0
                # Multiply quality by provider health score
                provider_name = x.get("provider", "unknown")
                h_score = health_monitor.get_health_score(provider_name)
                effective_quality = quality * h_score
                return (-effective_quality, x.get("TotalUSD/1M", 0))
            ranked = sorted(candidates, key=sort_key)[:max_models]
        
        # Determine approximate confidence levels based on ranking position
        base_confidence = 0.85
        step = 0.03
        
        # Model-specific reasoning templates
        model_reasoning = {
            "gpt-4": "High-quality general purpose model with strong reasoning capabilities",
            "gpt-4-turbo": "Fast, high-quality model with strong reasoning and recent knowledge",
            "gpt-4.1-preview": "Advanced reasoning capabilities with high accuracy for complex tasks",
            "gpt-3.5-turbo": "Cost-effective model with good performance for simpler tasks",
            "claude-3-opus": "Premium model with exceptional reasoning and instruction following",
            "claude-3-sonnet": "Balanced performance and cost with strong reasoning abilities",
            "claude-3-haiku": "Fast, cost-effective model for straightforward tasks",
            "claude-3.5-sonnet": "Enhanced reasoning and knowledge with good efficiency",
            "claude-3.7-sonnet": "Latest version with improved accuracy and reasoning",
            "gemini-1.5-pro": "Strong multimodal capabilities with excellent reasoning",
            "gemini-1.5-flash": "Efficient model with good performance-to-cost ratio",
            "llama-3-70b": "Open model with strong performance across various tasks",
            "llama-3-8b": "Efficient open model for simpler tasks with good reasoning"
        }
        
        # Special benchmark model reasoning
        benchmark_model_reasoning = {
            "only_model": "This is the only model available that meets the required capabilities.",
            "best_model": "This model offers the best combination of quality and cost among available options.",
            "benchmark": "This is your selected benchmark model. It provides a good baseline for this task."
        }
        
        result = []
        for i, model in enumerate(ranked):
            model_name = model.get("model_name", "unknown")
            
            # Decrease confidence slightly for each position down in the ranking
            confidence = max(0.5, base_confidence - (i * step))
            
            # Special handling for benchmark model
            is_benchmark = benchmark_model and (
                model_name.lower() == benchmark_model.lower() or
                model_name.lower().replace(".", "-").replace(" ", "-") == benchmark_model.lower().replace(".", "-").replace(" ", "-")
            )
            
            # Get model-specific reasoning or use a generic one
            if is_benchmark:
                if len(candidates) == 1:
                    reasoning = benchmark_model_reasoning["only_model"]
                elif i == 0 and len(candidates) > 1:
                    reasoning = benchmark_model_reasoning["best_model"]
                else:
                    reasoning = benchmark_model_reasoning["benchmark"]
            elif model_name.lower() in [m.lower() for m in model_reasoning.keys()]:
                # Case-insensitive match for model reasoning
                matching_key = next(k for k in model_reasoning.keys() if k.lower() == model_name.lower())
                reasoning = model_reasoning[matching_key]
            else:
                # Generic reasoning based on QualityIndex and cost
                quality = model.get("QualityIndex", 0)
                cost = model.get("TotalUSD/1M", 0)
                
                if quality > 80:
                    reasoning = "Premium high-quality model suitable for complex tasks"
                elif quality > 60:
                    reasoning = "Good balance of quality and efficiency for most tasks"
                else:
                    reasoning = "Cost-effective model suitable for straightforward tasks"
                    
                # Add cost context
                if cost < 5:
                    reasoning += " at very low cost"
                elif cost < 15:
                    reasoning += " at reasonable cost"
                else:
                    reasoning += " but at premium price point"
                
                # If benchmark comparison available, add that context
                if benchmark_meta and not is_benchmark:
                    benchmark_quality = benchmark_meta.get("QualityIndex", 0)
                    if isinstance(benchmark_quality, str):
                        try:
                            benchmark_quality = float(benchmark_quality)
                        except (ValueError, TypeError):
                            benchmark_quality = 0
                    
                    benchmark_cost = benchmark_meta.get("TotalUSD/1M", 0)
                    
                    # Ensure quality is numeric for comparison
                    numeric_quality = quality
                    if isinstance(quality, str):
                        try:
                            numeric_quality = float(quality)
                        except (ValueError, TypeError):
                            numeric_quality = 0
                    
                    if numeric_quality > benchmark_quality:
                        reasoning += "; higher quality than benchmark"
                    elif numeric_quality < benchmark_quality:
                        reasoning += "; lower quality than benchmark"
                        
                    if cost < benchmark_cost:
                        reasoning += " and more cost-effective"
                    elif cost > benchmark_cost:
                        reasoning += " but more expensive"
            
            entry = {
                "rank": i + 1,
                "model_name": self._map_performance_model_to_api(model_name),
                "provider": model.get("provider", "unknown"),
                "confidence": round(confidence, 4),
                "reasoning": reasoning,
                # Additional identifying information
                "performance_name": model_name,  # Original model name from performance data
                "quality_index": model.get("QualityIndex", 0),
                "cost_per_1m_tokens": model.get("TotalUSD/1M", 0),
                "api_id": model.get("api_id", "unknown"),  # Unique API identifier
                "context_window": model.get("context_window", "unknown"),
                "function_calling": model.get("function_calling", "unknown"),
                "json_mode": model.get("json_mode", "unknown")
            }
            result.append(entry)
            
        return {
            "task_complexity": 3,  # Default to medium complexity
            "ranked_models": result,
            "required_capabilities": []
        }
