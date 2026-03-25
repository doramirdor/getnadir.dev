"""
Gemma-3-270m based model recommender using llama-cpp-python for fast GGUF inference.
Originally Phi-2 based, now using Google's Gemma-3-270m for improved performance.
Extends GeminiModelRecommender to reuse all the analysis logic, just changing the model call.
"""
import json
import re
import os
import logging
from typing import Any, Dict, Optional, List, Tuple
import asyncio
import hashlib

from app.complexity.gemini_analyzer import GeminiModelRecommender
from app.settings import settings

logger = logging.getLogger(__name__)

# Global model instance for singleton pattern  
_GEMMA_MODEL_INSTANCE = None
_MODEL_LOCK = asyncio.Lock()

# Force model reload by clearing the singleton
def _reset_model_instance():
    """Clear the global model instance to force reload with new settings."""
    global _GEMMA_MODEL_INSTANCE
    _GEMMA_MODEL_INSTANCE = None
    logger.info("🔄 Model instance reset - will reload with new quantization priority")

# Reset the model instance immediately to pick up new quantization priority
_reset_model_instance()

# Simple in-memory cache for routing decisions (LRU-style)
_ROUTING_CACHE = {}
_CACHE_MAX_SIZE = 100


class GemmaModelRecommender(GeminiModelRecommender):
    """Model recommender using Google's Gemma-3-270m with fast GGUF inference."""
    
    def __init__(self, api_key: Optional[str] = None, allowed_providers: Optional[List[str]] = None, allowed_models: Optional[List[str]] = None, preload_model: bool = False):
        """
        Initialize the Gemma-3-270m model recommender with llama-cpp-python.
        Extends GeminiModelRecommender to reuse all analysis logic, just changing the model call.
        
        Args:
            api_key: Not used for local model but kept for compatibility
            allowed_providers: Optional list of allowed providers to filter by
            allowed_models: Optional list of allowed models to filter by
            preload_model: Whether to load the model immediately during initialization
        """
        # Call parent constructor to initialize ALL Gemini logic properly
        super().__init__(api_key=api_key, allowed_providers=allowed_providers, allowed_models=allowed_models)
        
        # Override model initialization to use local Gemma-3-270m instead of Gemini API
        self.llm = None
        self.device = "cpu"  # GGUF always uses CPU for compatibility
        self.preload_model = preload_model
        
        # Load the local model if requested
        if preload_model:
            self._load_model()
            self._warmup_model()
    
    def _load_model(self):
        """Load the Gemma-3-270m GGUF model using llama-cpp-python from_pretrained."""
        global _GEMMA_MODEL_INSTANCE
        
        # Use singleton pattern to share model across instances
        if _GEMMA_MODEL_INSTANCE is not None:
            self.llm = _GEMMA_MODEL_INSTANCE
            logger.info("✅ Using existing Gemma-3-270m model instance")
            return
            
        if self.llm is not None:
            return  # Already loaded
            
        try:
            from llama_cpp import Llama
            
            logger.info("🔄 Loading Gemma-3-270m model from Hugging Face...")
            
            # Optimize for speed over precision for routing decisions
            import os
            import multiprocessing
            
            # Use more CPU threads for faster inference
            n_threads = min(8, multiprocessing.cpu_count())
            
            # Try fastest quantization first, fallback to higher quality if needed
            speed_priority = os.getenv('GEMMA_SPEED_PRIORITY', 'balanced')  # ultra_fast, fast, balanced
            
            if speed_priority == 'ultra_fast':
                quantizations = ["gemma-3-270m-it-Q2_K.gguf"]  # Only fastest option
            elif speed_priority == 'fast':
                quantizations = [
                    "gemma-3-270m-it-Q4_K_M.gguf",  # Good balance of speed and quality
                    "gemma-3-270m-it-Q2_K.gguf"     # Fastest but problematic - fallback only
                ]
            else:  # balanced
                quantizations = [
                    "gemma-3-270m-it-Q4_K_M.gguf",  # Balanced: ~2x speed, good quality - MOVED TO FIRST
                    "gemma-3-270m-it-F16.gguf",     # Original: best quality, slower
                    "gemma-3-270m-it-Q2_K.gguf"     # Fastest: ~4x speed, lower quality - MOVED TO LAST (problematic)
                ]
            
            model_loaded = False
            for filename in quantizations:
                try:
                    logger.info(f"🔄 Trying {filename}...")
                    self.llm = Llama.from_pretrained(
                        repo_id="unsloth/gemma-3-270m-it-GGUF",
                        filename=filename,
                        n_ctx=4096,  # Increased context window for complex routing prompts
                        n_threads=n_threads,  # Use more CPU threads
                        n_batch=512,  # Optimize batch size for throughput
                        verbose=False,
                        # Additional optimizations
                        use_mlock=True,  # Keep model in memory to avoid swapping
                        use_mmap=True,   # Memory-map model file for faster loading
                        low_vram=False,  # Use full RAM for speed
                        # GPU acceleration if available (10-50x speedup)
                        n_gpu_layers=-1 if os.getenv('GEMMA_USE_GPU', 'false').lower() == 'true' else 0
                    )
                    model_loaded = True
                    logger.info(f"✅ Successfully loaded {filename}")
                    break
                except Exception as e:
                    logger.info(f"⚠️ Failed to load {filename}: {e}")
                    continue
            
            if not model_loaded:
                raise Exception("Failed to load any Gemma-3-270m quantization")
            
            # Store in global singleton
            _GEMMA_MODEL_INSTANCE = self.llm
            logger.info("✅ Gemma-3-270m model loaded successfully from Hugging Face")
            
        except ImportError:
            logger.warning("⚠️ llama-cpp-python not installed. Gemma-3-270m analyzer will use fallback mode.")
            logger.info("💡 Install with: pip install llama-cpp-python")
            self.llm = None
        except Exception as e:
            logger.warning(f"⚠️ Failed to load Gemma-3-270m model from Hugging Face: {e}")
            logger.info("💡 This is normal on first run - the model will be downloaded automatically")
            logger.info("💡 Falling back to Gemini API for now")
            self.llm = None
            # Don't raise error - allow fallback behavior
    
    def _warmup_model(self):
        """Warm up the model with a small inference to reduce first-call latency."""
        if self.llm is None:
            return
            
        try:
            logger.info("🔥 Warming up Gemma-3-270m model...")
            warmup_response = self.llm.create_chat_completion(
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
                temperature=0.0
            )
            logger.info("✅ Model warmup completed")
        except Exception as e:
            logger.warning(f"⚠️ Model warmup failed: {e}")
    
    async def _analyze_internal(self, text: str, **kwargs) -> Dict[str, Any]:
        """
        Override the parent's _analyze_internal to use local Gemma-3-270m instead of Gemini API.
        Reuses all the parent's logic but changes the model call.
        """
        # Check cache for identical prompts (for sub-100ms responses)
        cache_key = hashlib.md5(f"{text}:{kwargs.get('system_message', '')}".encode()).hexdigest()
        if cache_key in _ROUTING_CACHE:
            logger.info("⚡ Cache hit - returning cached routing decision")
            return _ROUTING_CACHE[cache_key].copy()
        
        try:
            # Try to load the local model
            self._load_model()
            
            # If local model is not available, fall back to parent's Gemini implementation
            if self.llm is None:
                logger.info("🔄 Gemma-3-270m model not available, falling back to Gemini API")
                return await super()._analyze_internal(text, **kwargs)
            
            # Extract system message from kwargs
            system_message = kwargs.get("system_message", "")
            
            # Prepare model array for the prompt (reuse parent's logic)
            models_array = []
            for provider_name, models in self.supported_models.items():
                for model_name in models:
                    # Map performance data model name to actual API model name
                    api_model_name = self.map_performance_model_to_api(model_name)
                    
                    # Find model performance data
                    model_data = next((m for m in self.performance_data if m.get("model") == model_name), {})
                    
                    # Extract performance and other data with safe access
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
            
            # Detect prompt features for enhanced analysis (reuse parent's method)
            prompt_features = self._detect_prompt_features(text, system_message)
            
            # Extract benchmark information if available (reuse parent's logic)
            benchmark_model = kwargs.get("benchmark_model")
            benchmark_info = ""
            benchmark_quality = 0
            benchmark_cost = 0
            
            if benchmark_model:
                # Find benchmark model data (same logic as parent)
                benchmark_data = next((m for m in self.performance_data if m.get("model") == benchmark_model), None)
                if not benchmark_data:
                    # Try mapped name lookup with fallback if mapping doesn't exist
                    try:
                        if hasattr(self, 'performance_to_api_mapping'):
                            mapped_name = next((k for k, v in self.performance_to_api_mapping.items() if v == benchmark_model), None)
                            if mapped_name:
                                benchmark_data = next((m for m in self.performance_data if m.get("model") == mapped_name), None)
                    except Exception as e:
                        logger.warning(f"Could not lookup mapped benchmark model: {e}")
                        pass
                
                if benchmark_data:
                    benchmark_other = benchmark_data.get("other", {})
                    benchmark_perf = benchmark_other.get("performance", {})
                    benchmark_pricing = benchmark_other.get("pricing", {})
                    benchmark_quality = benchmark_perf.get("quality_index", 0)
                    benchmark_cost = benchmark_pricing.get("input_price_usd1m_tokens", 0) + benchmark_pricing.get("output_price_usd1m_tokens", 0)
                    
                    # Enhanced benchmark comparison (reuse parent's method if available)
                    try:
                        benchmark_comparison_data = self._enhance_benchmark_comparison(benchmark_model, models_array, prompt_features)
                    except Exception as e:
                        logger.warning(f"Could not enhance benchmark comparison: {e}")
                        benchmark_comparison_data = {"task_specific_scores": {}}
                    
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

            # Check if we can use a compressed router prompt for speed
            use_fast_routing = len(text) < 200 and not kwargs.get("detailed_analysis", False)
            
            if use_fast_routing:
                # Ultra-fast routing for simple prompts - minimal context
                # Super simple prompt for Gemma-3 with explicit JSON requirement
                router_prompt = f"""Task: {text}

Models: gpt-4o-mini, claude-3-haiku-20240307, gemini-1.5-flash

RETURN JSON ONLY - NO OTHER TEXT:
{{"recommended_model": "model_name", "recommended_provider": "provider_name", "confidence": 0.8, "task_complexity": 3, "reasoning": "why"}}

JSON:"""
            else:
                # Build the same router prompt as parent class to ensure identical analysis logic
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

### CRITICAL: RESPOND ONLY WITH JSON
You must respond with valid JSON only. No explanations, no text before or after.

Example format:
{{
  "recommended_model": "gpt-4o-mini",
  "recommended_provider": "OpenAI", 
  "confidence": 0.85,
  "task_complexity": 2,
  "complexity_analysis": {{
    "cognitive_complexity": 2,
    "semantic_complexity": 1,
    "domain_complexity": 2,
    "task_type": "question_answering",
    "key_requirements": ["factual_accuracy", "conciseness"]
  }},
  "complexity_reasoning": "Simple factual question requiring basic knowledge lookup",
  "reasoning": "GPT-4o-mini optimal for straightforward questions with good accuracy and low cost",
  "benchmark_comparison": {"comparison_text" if benchmark_model else "null"}
}}

JSON OUTPUT ONLY:
"""

            # Use local Gemma-3-270m instead of Gemini API
            logger.info(f"🔍 Making Gemma-3-270m local call for prompt: '{text[:50]}...'")
            
            # Use the local llama-cpp model
            if self.llm is None:
                raise RuntimeError("Gemma-3-270m model not loaded")
            
            logger.info(f"🔍 Router prompt length: {len(router_prompt)} chars")
            logger.info(f"🔍 Router prompt preview: {router_prompt[:200]}...")
                
            # Adjusted settings for Gemma-3 to force text generation
            max_tokens = 150 if use_fast_routing else 300  # Conservative token limit
            
            response = self.llm.create_chat_completion(
                messages=[
                    {
                        "role": "user",
                        "content": router_prompt
                    }
                ],
                max_tokens=max_tokens,
                temperature=0.3,  # Higher temperature to encourage generation
                top_p=0.9,  # More focused sampling
                repeat_penalty=1.1,  # Prevent repetition
                # No stop sequences to let it complete
            )
            
            logger.info(f"🔍 Raw response: {response}")
            
            if 'choices' not in response or not response['choices']:
                raise ValueError("No choices in Gemma-3-270m response")
                
            response_text = response['choices'][0]['message']['content'].strip()
            logger.info(f"🔍 Gemma-3-270m response received ({len(response_text)} chars)")
            
            if not response_text:
                logger.warning(f"⚠️ Empty response from Gemma-3-270m model. Raw response: {response}")
                raise RuntimeError("Empty response from Gemma-3 model")
            
            # Check if response is natural language instead of JSON - convert it
            if not response_text.strip().startswith('{') and ('recommend' in response_text.lower() or 'gpt-4o-mini' in response_text.lower() or 'claude' in response_text.lower() or 'gemini' in response_text.lower()):
                logger.info(f"🔄 Converting natural language response to JSON: {response_text[:100]}...")
                
                # Extract model name from natural language
                recommended_model = "gpt-4o-mini"  # default
                recommended_provider = "openai"  # default
                
                if 'claude' in response_text.lower():
                    recommended_model = "claude-3-haiku-20240307" 
                    recommended_provider = "anthropic"
                elif 'gemini' in response_text.lower():
                    recommended_model = "gemini-1.5-flash"
                    recommended_provider = "google"
                
                # Extract complexity if mentioned
                complexity = 3  # default
                if 'simple' in response_text.lower() or 'easy' in response_text.lower():
                    complexity = 2
                elif 'complex' in response_text.lower() or 'difficult' in response_text.lower():
                    complexity = 4
                    
                # Create JSON response from natural language
                response_text = json.dumps({
                    "recommended_model": recommended_model,
                    "recommended_provider": recommended_provider,
                    "confidence": 0.8,
                    "task_complexity": complexity,
                    "reasoning": f"Converted from natural language: {response_text[:100]}..."
                })
                logger.info(f"✅ Converted to JSON: {response_text}")
            
            # Extract JSON from response with better cleaning
            json_match = re.search(r'{.*}', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                
                # Handle incomplete JSON by checking if it ends properly
                if not json_str.strip().endswith('}'):
                    logger.info("🔧 Detected incomplete JSON, attempting to fix...")
                    # Try to find the last complete field and close the JSON
                    lines = json_str.split('\n')
                    complete_lines = []
                    for line in lines:
                        line = line.strip()
                        if line and not line.endswith(',') and '"' in line and ':' in line:
                            complete_lines.append(line)
                        elif line and line.endswith(',') and '"' in line and ':' in line:
                            complete_lines.append(line)
                    
                    # Rebuild JSON with essential fields only
                    if complete_lines:
                        # Ensure no trailing comma on last line
                        if complete_lines[-1].endswith(','):
                            complete_lines[-1] = complete_lines[-1][:-1]
                        json_str = '{\n' + '\n'.join(complete_lines) + '\n}'
                        logger.info(f"🔧 Reconstructed JSON: {json_str}")
                
                # Clean up common JSON issues from Gemma model output
                # 1. Fix decimal complexity scores to integers (1-5 scale)
                json_str = re.sub(r'"cognitive_complexity":\s*0\.\d+', '"cognitive_complexity": 1', json_str)
                json_str = re.sub(r'"semantic_complexity":\s*0\.\d+', '"semantic_complexity": 1', json_str)
                json_str = re.sub(r'"domain_complexity":\s*0\.\d+', '"domain_complexity": 1', json_str)
                
                # 2. Fix template placeholders
                json_str = re.sub(r'"<[^>]*>"', '"general"', json_str)  # Fix template placeholders
                json_str = json_str.replace('"value"', '"general_reasoning"')  # Fix value placeholders
                
                # 3. Fix common formatting issues
                json_str = re.sub(r',\s*}', '}', json_str)  # Remove trailing commas
                json_str = re.sub(r',\s*]', ']', json_str)  # Remove trailing commas in arrays
                
                try:
                    result = json.loads(json_str)
                    logger.info(f"🔍 Successfully parsed Gemma-3-270m JSON response")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Gemma-3-270m JSON parse error: {e}")
                    logger.error(f"Problematic JSON: {json_str[:500]}...")
                    
                    # Try again with simpler JSON request to Gemma-3
                    logger.info("🔧 Attempting Gemma-3 JSON repair with simpler format...")
                    
                    # Very simple format for Gemma-3 to understand
                    repair_prompt = f"""Please recommend a model for this task: {text[:100]}

Models available: gpt-4o-mini, claude-3-haiku-20240307, gemini-1.5-flash

Return only valid JSON:
{{"recommended_model": "gpt-4o-mini", "confidence": 0.8, "reasoning": "good for this task"}}"""

                    repair_response = self.llm.create_chat_completion(
                        messages=[{"role": "user", "content": repair_prompt}],
                        max_tokens=100,
                        temperature=0.0,
                        stop=["\n", "```"]
                    )
                    
                    if 'choices' in repair_response and repair_response['choices']:
                        repair_text = repair_response['choices'][0]['message']['content'].strip()
                        repair_json = re.search(r'{.*}', repair_text, re.DOTALL)
                        if repair_json:
                            try:
                                result = json.loads(repair_json.group(0))
                                logger.info("✅ Gemma-3 JSON repair successful")
                            except json.JSONDecodeError:
                                logger.error("❌ Gemma-3 JSON repair also failed")
                                raise RuntimeError("Gemma-3 unable to produce valid JSON response")
                        else:
                            logger.error("❌ No JSON found in Gemma-3 repair response")
                            raise RuntimeError("Gemma-3 not producing JSON format")
                    else:
                        logger.error("❌ Gemma-3 repair attempt failed")
                        raise RuntimeError("Gemma-3 repair attempt returned no response")
                
                # Validate the recommendation against supported models (reuse parent's method)
                self._validate_recommendation(result)
                
                # Transform the result into our standard recommendation format (same as parent)
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
                
                # Get tier and cost information (reuse parent's methods)
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
                
                # Cache the result for future identical requests
                if len(_ROUTING_CACHE) >= _CACHE_MAX_SIZE:
                    # Simple LRU: remove oldest entry
                    oldest_key = next(iter(_ROUTING_CACHE))
                    del _ROUTING_CACHE[oldest_key]
                    
                _ROUTING_CACHE[cache_key] = recommendation.copy()
                logger.info(f"💾 Cached routing decision (cache size: {len(_ROUTING_CACHE)})")
                
                return recommendation
            
            logger.warning("⚠️ Could not extract JSON from Gemma-3-270m response")
            logger.error(f"❌ Response text: {response_text}")
            raise RuntimeError("Gemma-3 model did not return valid JSON format")
        
        except Exception as e:
            logger.error(f"❌ Gemma-3-270m analysis failed: {str(e)}")
            logger.error("Cannot provide model recommendation without working Gemma-3")
            raise RuntimeError(f"Gemma-3 model analysis failed: {str(e)}")
    
    def _extract_model_from_text(self, text: str) -> str:
        """Extract a model name from text response as fallback."""
        # Try to find any model name in the text
        model_patterns = [
            r'gpt-[0-9o.-]+[a-z]*',
            r'claude-[0-9.-]+[a-z-]*',
            r'gemini-[0-9.-]+[a-z-]*'
        ]
        
        for pattern in model_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0)
        
        # Default fallback
        return "gpt-3.5-turbo"
    
    
    def _detect_task_type_from_features(self, prompt_features: Dict[str, Any]) -> str:
        """Detect task type from prompt features."""
        if prompt_features.get("has_code", False):
            return "coding"
        elif prompt_features.get("has_math", False):
            return "mathematical"
        elif prompt_features.get("has_analysis", False):
            return "analytical"
        elif prompt_features.get("has_creative_writing", False):
            return "creative"
        elif prompt_features.get("has_reasoning", False):
            return "reasoning"
        else:
            return "general"
    
    def _extract_key_requirements(self, prompt_features: Dict[str, Any]) -> List[str]:
        """Extract key requirements from prompt features."""
        requirements = []
        
        if prompt_features.get("has_code", False):
            requirements.append("code_generation")
        if prompt_features.get("has_math", False):
            requirements.append("mathematical_reasoning")
        if prompt_features.get("has_tools", False):
            requirements.append("function_calling")
        if prompt_features.get("requires_structured_output", False):
            requirements.append("structured_output")
        if prompt_features.get("requires_factual_accuracy", False):
            requirements.append("factual_accuracy")
        if prompt_features.get("has_multimodal", False):
            requirements.append("multimodal_processing")
        
        if not requirements:
            requirements.append("general_reasoning")
        
        return requirements
    
    def _get_available_models(self) -> List[str]:
        """Get list of available models from allowed_models."""
        if hasattr(self, 'allowed_models') and self.allowed_models:
            return self.allowed_models
        
        # Return default models from supported_models
        all_models = []
        for provider_models in self.supported_models.values():
            all_models.extend(provider_models)
        return all_models