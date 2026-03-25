"""
Hybrid Fast Analyzer: Combines rule-based fast path with ML fallback.
Designed for sub-500ms routing with high accuracy.
"""

import re
import asyncio
import logging
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class HybridFastAnalyzer:
    """
    Ultra-fast analyzer that uses rule-based classification for 80-90% of prompts,
    falling back to Gemma-3 only for complex edge cases.
    
    Target: <100ms for 90% of prompts, <500ms for remaining 10%.
    """
    
    def __init__(self, allowed_providers: Optional[List[str]] = None, 
                 allowed_models: Optional[List[str]] = None, **kwargs):
        self.allowed_providers = allowed_providers
        self.allowed_models = allowed_models
        
        # Lazy load the ML fallback analyzer
        self._ml_analyzer = None
        
        # Fast classification rules
        self.rules = self._initialize_rules()
        
    def _initialize_rules(self) -> Dict[str, Dict]:
        """Initialize fast classification rules."""
        return {
            # Tier 1: Simple/Basic (complexity_score: 0.0-0.3)
            "simple": {
                "patterns": [
                    r"^\s*what\s+is\s+\d+\s*[\+\-\*\/]\s*\d+\s*\??\s*$",  # Basic math
                    r"^\s*(hi|hello|hey)\s*!?\s*$",                        # Greetings
                    r"^\s*convert\s+\d+\s*\w+\s+to\s+\w+\s*$",            # Unit conversion
                    r"^\s*(yes|no)\s*$",                                   # Simple answers
                    r"^\s*translate\s+[\"'].*[\"']\s+to\s+\w+\s*$"        # Simple translation
                ],
                "keywords": ["what is", "how much", "convert", "translate", "define"],
                "recommended_model": "gpt-4o-mini",
                "provider": "openai",
                "complexity_score": 0.1,
                "confidence": 0.9
            },
            
            # Tier 2: Medium (complexity_score: 0.3-0.7)  
            "medium": {
                "patterns": [
                    r"write.*code|implement.*function|create.*script",      # Basic coding
                    r"explain.*concept|how.*work|describe.*process",        # Explanations
                    r"analyze.*data|summarize.*document|review.*text",      # Analysis
                    r"plan.*project|design.*system|outline.*strategy"      # Planning
                ],
                "keywords": ["write", "implement", "explain", "analyze", "plan", "design"],
                "recommended_model": "gpt-4o",
                "provider": "openai", 
                "complexity_score": 0.5,
                "confidence": 0.8
            },
            
            # Tier 3: Complex (complexity_score: 0.7-1.0)
            "complex": {
                "patterns": [
                    r"research.*deeply|comprehensive.*analysis|detailed.*investigation",
                    r"multi.*step.*reasoning|complex.*logic|advanced.*algorithm",
                    r"creative.*writing.*story|novel|screenplay|poetry",
                    r"expert.*level|professional.*advice|specialized.*knowledge"
                ],
                "keywords": ["research", "comprehensive", "multi-step", "creative writing", "expert"],
                "recommended_model": "o3",
                "provider": "openai",
                "complexity_score": 0.85,
                "confidence": 0.75
            }
        }
    
    def _classify_fast(self, prompt: str, system_message: str = "") -> Optional[Dict[str, Any]]:
        """
        Fast rule-based classification. Returns None if ML fallback needed.
        Target: <10ms response time.
        """
        full_text = f"{system_message} {prompt}".lower().strip()
        
        # Quick length check
        if len(full_text) > 1000:  # Complex prompts need ML analysis
            return None
            
        # Check each tier
        for tier_name, tier_config in self.rules.items():
            # Pattern matching
            for pattern in tier_config["patterns"]:
                if re.search(pattern, full_text, re.IGNORECASE):
                    return self._create_fast_response(tier_config, f"Pattern match: {pattern[:30]}...")
            
            # Keyword matching (less precise but fast)
            keyword_matches = sum(1 for keyword in tier_config["keywords"] 
                                if keyword in full_text)
            
            if keyword_matches >= 2:  # Multiple keyword match = confident classification
                return self._create_fast_response(tier_config, f"Keyword match: {keyword_matches} keywords")
        
        # Check for tool use (complex)
        if any(indicator in full_text for indicator in ["function", "tool", "api", "execute", "run"]):
            return self._create_fast_response(
                self.rules["complex"], 
                "Tool use detected"
            )
        
        # No clear match - needs ML analysis
        return None
    
    def _create_fast_response(self, tier_config: Dict, reasoning: str) -> Dict[str, Any]:
        """Create a standardized fast response."""
        # Filter by allowed models/providers if specified
        model = tier_config["recommended_model"]
        provider = tier_config["provider"]
        
        if self.allowed_models and model not in self.allowed_models:
            # Use first allowed model as fallback
            model = self.allowed_models[0] if self.allowed_models else model
            
        if self.allowed_providers and provider not in self.allowed_providers:
            # Use first allowed provider as fallback  
            provider = self.allowed_providers[0] if self.allowed_providers else provider
        
        return {
            "recommended_model": model,
            "recommended_provider": provider,
            "confidence": tier_config["confidence"],
            "complexity_score": tier_config["complexity_score"],
            "task_complexity": int(tier_config["complexity_score"] * 4) + 1,  # Convert to 1-5 scale
            "complexity_analysis": {
                "cognitive_complexity": int(tier_config["complexity_score"] * 5) + 1,
                "semantic_complexity": int(tier_config["complexity_score"] * 5) + 1,
                "domain_complexity": int(tier_config["complexity_score"] * 5) + 1,
                "task_type": "rule_classified",
                "key_requirements": ["fast_routing"]
            },
            "complexity_reasoning": f"Fast rule-based classification: {reasoning}",
            "reasoning": f"Selected {model} via fast heuristic routing: {reasoning}",
            "selection_method": "rule_based_fast_path",
            "response_time_ms": 0,  # Will be filled by caller
            "analyzer": "Hybrid Fast Analyzer"
        }
    
    async def _get_ml_analyzer(self):
        """Lazy load the ML analyzer only when needed."""
        if self._ml_analyzer is None:
            from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
            self._ml_analyzer = ComplexityAnalyzerFactory.create_analyzer(
                'phi2', 
                allowed_providers=self.allowed_providers,
                allowed_models=self.allowed_models,
                preload_model=True
            )
        return self._ml_analyzer
    
    async def analyze(self, text: str, system_message: str = "", **kwargs) -> Dict[str, Any]:
        """
        Hybrid analysis: Fast rules first, ML fallback for edge cases.
        """
        import time
        start_time = time.time()
        
        # Try fast classification first
        fast_result = self._classify_fast(text, system_message)
        
        if fast_result is not None:
            # Fast path success
            elapsed_ms = (time.time() - start_time) * 1000
            fast_result["response_time_ms"] = elapsed_ms
            logger.info(f"⚡ Fast path classification: {elapsed_ms:.1f}ms")
            return fast_result
        
        # Fall back to ML analysis for complex cases
        logger.info("🧠 Using ML fallback for complex prompt")
        ml_analyzer = await self._get_ml_analyzer()
        ml_result = await ml_analyzer.analyze(text, system_message=system_message, **kwargs)
        
        # Add hybrid metadata
        elapsed_ms = (time.time() - start_time) * 1000
        ml_result["response_time_ms"] = elapsed_ms
        ml_result["selection_method"] = "hybrid_ml_fallback"
        ml_result["analyzer"] = "Hybrid Fast Analyzer (ML path)"
        
        return ml_result
    
    # Compatibility methods
    async def analyze_complexity(self, prompt: str, system_message: str = "", **kwargs) -> Dict[str, Any]:
        """Compatibility method for analyze_complexity interface."""
        return await self.analyze(prompt, system_message, **kwargs)