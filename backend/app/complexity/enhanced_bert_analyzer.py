"""
Enhanced BERT-based complexity analyzer with improved heuristics.
No fine-tuning required - uses advanced feature extraction and rule-based classification.
"""

import json
import os
import re
import time
from typing import Dict, List, Optional, Any
import numpy as np
import logging

logger = logging.getLogger(__name__)


class EnhancedBERTComplexityAnalyzer:
    """
    Enhanced complexity analyzer using advanced heuristics and feature extraction.
    
    This provides much better complexity classification without requiring
    fine-tuning, using linguistic features and domain-specific rules.
    """
    
    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        device: str = "auto"
    ):
        """Initialize the enhanced analyzer."""
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []
        
        # Load performance data
        self.performance_data = self._load_performance_data()
        
        # Define complexity features and weights
        self._init_complexity_features()
        
        logger.info("Enhanced BERT analyzer initialized with advanced heuristics")
    
    def _init_complexity_features(self):
        """Initialize complexity feature definitions."""
        
        # Simple task indicators (score: 0.1-0.3) — pre-compiled for performance
        self.simple_patterns = {
            'basic_math': [re.compile(r'\d+\s*[\+\-\*\/]\s*\d+'), re.compile(r'what is \d+'), re.compile(r'calculate \d+')],
            'simple_definitions': [re.compile(r'what is (?:a|an|the)?\s*\w+'), re.compile(r'define \w+')],
            'basic_questions': [re.compile(r'how do you'), re.compile(r'can you'), re.compile(r'what does')],
            'single_word': [re.compile(r'^\w+\?*$'), re.compile(r'^explain \w+$')],
        }

        # Medium complexity indicators (score: 0.4-0.6)
        self.medium_patterns = {
            'code_simple': [re.compile(r'write (?:a|an)?\s*function'), re.compile(r'how to \w+ in python'), re.compile(r'create (?:a|an)?\s*\w+')],
            'explanations': [re.compile(r'explain how'), re.compile(r'describe the'), re.compile(r'what are the steps')],
            'comparisons': [re.compile(r'difference between'), re.compile(r'compare \w+ and \w+'), re.compile(r'vs\.?')],
            'tutorials': [re.compile(r'how to (?:\w+\s+){2,}'), re.compile(r'step by step'), re.compile(r'guide to')],
        }

        # Complex task indicators (score: 0.7-1.0)
        self.complex_patterns = {
            'advanced_code': [re.compile(r'implement (?:a|an)?\s*\w+(?:\s+\w+)+'), re.compile(r'design (?:a|an)?\s*system'), re.compile(r'architecture')],
            'analysis': [re.compile(r'analyze'), re.compile(r'evaluate'), re.compile(r'critique'), re.compile(r'assess')],
            'research': [re.compile(r'research'), re.compile(r'investigate'), re.compile(r'comprehensive'), re.compile(r'detailed analysis')],
            'creative': [re.compile(r'write (?:a|an)?\s*(?:story|essay|article)'), re.compile(r'creative'), re.compile(r'generate')],
            'multi_part': [re.compile(r'first.*then.*finally'), re.compile(r'multiple'), re.compile(r'several')],
            'reasoning': [re.compile(r'reasoning'), re.compile(r'logic'), re.compile(r'proof'), re.compile(r'demonstrate')],
        }
        
        # Domain-specific complexity
        self.domain_complexity = {
            'mathematics': {'keywords': ['calculus', 'algebra', 'theorem', 'proof', 'equation'], 'base_score': 0.6},
            'programming': {'keywords': ['algorithm', 'data structure', 'optimization', 'refactor'], 'base_score': 0.5},
            'science': {'keywords': ['quantum', 'molecular', 'scientific', 'research'], 'base_score': 0.7},
            'business': {'keywords': ['strategy', 'analysis', 'report', 'presentation'], 'base_score': 0.5},
        }
        
        # Linguistic complexity features
        self.linguistic_features = {
            'sentence_complexity': {'weight': 0.1},
            'vocabulary_sophistication': {'weight': 0.15},
            'technical_terms': {'weight': 0.2},
            'question_complexity': {'weight': 0.1},
        }
    
    def _load_performance_data(self) -> List[Dict]:
        """Load model performance data."""
        try:
            file_path = os.path.join(
                os.path.dirname(__file__), 
                "..", 
                "reference_data", 
                "model_performance_clean.json"
            )
            with open(file_path, "r") as f:
                data = json.load(f)
                return data.get("models", [])
        except Exception as e:
            logger.error(f"Error loading performance data: {e}")
            return []
    
    def calculate_strong_win_rate(self, prompt: str) -> float:
        """
        Calculate complexity score using enhanced heuristics.
        
        Args:
            prompt: Input prompt to analyze
            
        Returns:
            Float between 0-1 representing complexity
        """
        return self._enhanced_complexity_analysis(prompt)
    
    def _enhanced_complexity_analysis(self, prompt: str) -> float:
        """
        Advanced complexity analysis using multiple feature types.
        
        Returns:
            Complexity score between 0-1
        """
        prompt_lower = prompt.lower().strip()
        scores = []
        
        # 1. Pattern-based scoring
        pattern_score = self._analyze_patterns(prompt_lower)
        scores.append(('patterns', pattern_score, 0.3))
        
        # 2. Linguistic complexity
        linguistic_score = self._analyze_linguistic_complexity(prompt)
        scores.append(('linguistic', linguistic_score, 0.25))
        
        # 3. Domain-specific complexity
        domain_score = self._analyze_domain_complexity(prompt_lower)
        scores.append(('domain', domain_score, 0.2))
        
        # 4. Length and structure
        structure_score = self._analyze_structure_complexity(prompt)
        scores.append(('structure', structure_score, 0.15))
        
        # 5. Intent complexity
        intent_score = self._analyze_intent_complexity(prompt_lower)
        scores.append(('intent', intent_score, 0.1))
        
        # Weighted average
        total_score = sum(score * weight for _, score, weight in scores)
        
        # Apply calibration curve to improve distribution
        calibrated_score = self._calibrate_score(total_score)
        
        logger.debug(f"Complexity analysis for '{prompt[:50]}...': {dict((name, score) for name, score, _ in scores)} -> {calibrated_score:.3f}")
        
        return calibrated_score
    
    def _analyze_patterns(self, prompt_lower: str) -> float:
        """Analyze prompt against pre-compiled pattern libraries."""
        max_score = 0.0

        # Check simple patterns (low complexity)
        for category, patterns in self.simple_patterns.items():
            for pattern in patterns:
                if pattern.search(prompt_lower):
                    max_score = max(max_score, 0.2)

        # Check medium patterns
        for category, patterns in self.medium_patterns.items():
            for pattern in patterns:
                if pattern.search(prompt_lower):
                    max_score = max(max_score, 0.5)

        # Check complex patterns (high complexity)
        for category, patterns in self.complex_patterns.items():
            for pattern in patterns:
                if pattern.search(prompt_lower):
                    max_score = max(max_score, 0.8)

        return max_score
    
    def _analyze_linguistic_complexity(self, prompt: str) -> float:
        """Analyze linguistic features for complexity."""
        score = 0.0
        
        # Sentence complexity
        sentences = prompt.count('.') + prompt.count('!') + prompt.count('?')
        avg_sentence_length = len(prompt.split()) / max(sentences, 1)
        if avg_sentence_length > 20:
            score += 0.2
        elif avg_sentence_length > 15:
            score += 0.1
        
        # Vocabulary sophistication
        sophisticated_words = [
            'sophisticated', 'comprehensive', 'elaborate', 'intricate', 'nuanced',
            'methodology', 'implementation', 'optimization', 'paradigm', 'framework'
        ]
        sophisticated_count = sum(1 for word in sophisticated_words if word in prompt.lower())
        score += min(sophisticated_count * 0.1, 0.3)
        
        # Technical jargon
        technical_terms = [
            'algorithm', 'architecture', 'infrastructure', 'scalability', 'optimization',
            'refactoring', 'deployment', 'integration', 'configuration', 'specification'
        ]
        technical_count = sum(1 for term in technical_terms if term in prompt.lower())
        score += min(technical_count * 0.15, 0.4)
        
        return min(score, 1.0)
    
    def _analyze_domain_complexity(self, prompt_lower: str) -> float:
        """Analyze domain-specific complexity indicators."""
        max_score = 0.0
        
        for domain, config in self.domain_complexity.items():
            keyword_matches = sum(1 for keyword in config['keywords'] if keyword in prompt_lower)
            if keyword_matches > 0:
                domain_score = config['base_score'] + (keyword_matches - 1) * 0.1
                max_score = max(max_score, min(domain_score, 1.0))
        
        return max_score
    
    def _analyze_structure_complexity(self, prompt: str) -> float:
        """Analyze structural complexity of the prompt."""
        score = 0.0
        
        # Length-based complexity (more nuanced)
        word_count = len(prompt.split())
        if word_count > 100:
            score += 0.4
        elif word_count > 50:
            score += 0.25
        elif word_count > 20:
            score += 0.1
        elif word_count < 5:
            score += 0.05  # Very short prompts are often simple
        
        # Multiple questions/parts
        question_count = prompt.count('?')
        if question_count > 2:
            score += 0.2
        elif question_count > 1:
            score += 0.1
        
        # Lists and enumerations
        if any(marker in prompt for marker in ['1.', '2.', 'a)', 'b)', '•', '-']):
            score += 0.15
        
        # Code blocks or technical formatting
        if any(marker in prompt for marker in ['```', '`', 'def ', 'class ', 'function']):
            score += 0.2
        
        return min(score, 1.0)
    
    def _analyze_intent_complexity(self, prompt_lower: str) -> float:
        """Analyze the complexity of what the user is trying to achieve."""
        score = 0.0
        
        # Creative tasks
        creative_indicators = ['write a story', 'create', 'design', 'invent', 'imagine']
        if any(indicator in prompt_lower for indicator in creative_indicators):
            score += 0.6
        
        # Analysis tasks
        analysis_indicators = ['analyze', 'compare', 'evaluate', 'assess', 'critique']
        if any(indicator in prompt_lower for indicator in analysis_indicators):
            score += 0.7
        
        # Problem-solving
        problem_indicators = ['solve', 'fix', 'debug', 'optimize', 'improve']
        if any(indicator in prompt_lower for indicator in problem_indicators):
            score += 0.5
        
        # Teaching/explanation
        teaching_indicators = ['explain', 'teach', 'show how', 'demonstrate']
        if any(indicator in prompt_lower for indicator in teaching_indicators):
            score += 0.3
        
        return min(score, 1.0)
    
    def _calibrate_score(self, raw_score: float) -> float:
        """
        Apply calibration curve to improve score distribution.
        
        This prevents scores from clustering around 0.5 and provides
        better discrimination between complexity levels.
        """
        # Sigmoid-like transformation to spread scores
        if raw_score < 0.3:
            return raw_score * 0.7  # Compress low scores: 0.0-0.3 -> 0.0-0.21
        elif raw_score > 0.7:
            return 0.7 + (raw_score - 0.7) * 1.5  # Expand high scores: 0.7-1.0 -> 0.7-1.0
        else:
            # Linear interpolation in middle range: 0.3-0.7 -> 0.21-0.7
            return 0.21 + (raw_score - 0.3) * 1.225
    
    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        """
        Async analyze method for compatibility with service interface.
        
        Args:
            text: Text to analyze
            **kwargs: Additional parameters
            
        Returns:
            Analysis results
        """
        system_message = kwargs.pop('system_message', '')  # Remove from kwargs to avoid duplicate
        return self.analyze_complexity(text, system_message, **kwargs)
    
    def analyze_complexity(
        self,
        prompt: str,
        system_message: str = "",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze prompt complexity and recommend models.

        Args:
            prompt: User prompt to analyze
            system_message: System message context (optional)
            **kwargs: Additional parameters

        Returns:
            Dictionary with complexity analysis and model recommendations
        """
        from app.complexity.base_analyzer import BaseAnalyzer
        prompt = BaseAnalyzer._validate_prompt(prompt)

        start_time = time.time()

        # Calculate complexity score
        complexity_score = self.calculate_strong_win_rate(prompt)
        
        # Map score to complexity tier
        if complexity_score < 0.35:
            complexity_tier = 1
            complexity_name = "simple"
            reasoning = f"Enhanced BERT analyzer classified this as simple complexity (score: {complexity_score:.3f}). Basic models should handle this well."
        elif complexity_score < 0.65:
            complexity_tier = 2
            complexity_name = "medium"
            reasoning = f"Enhanced BERT analyzer classified this as medium complexity (score: {complexity_score:.3f}). Moderate capability models recommended."
        else:
            complexity_tier = 3
            complexity_name = "complex"
            reasoning = f"Enhanced BERT analyzer classified this as high complexity (score: {complexity_score:.3f}). Advanced models recommended."
        
        # Filter and rank models
        candidate_models = self._filter_candidate_models()
        ranked_models = self._rank_models_by_complexity(candidate_models, complexity_tier, complexity_score)
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Extract top-ranked model for compatibility with service interface
        recommended_model = "gpt-4o-mini"  # Default fallback
        recommended_provider = "openai"
        confidence = 0.7  # Default confidence
        
        if ranked_models:
            top_model = ranked_models[0]
            recommended_model = top_model.get("model_name", "gpt-4o-mini")
            recommended_provider = top_model.get("provider", "openai") 
            confidence = top_model.get("confidence", 0.7)
        elif self.allowed_models:
            # If no ranked models but we have allowed models, use the first one
            recommended_model = self.allowed_models[0]
            # Extract provider from model name if it has a prefix
            if "/" in recommended_model:
                recommended_provider = recommended_model.split("/")[0]
            else:
                recommended_provider = "unknown"
            confidence = 0.5  # Lower confidence since no analysis data available
        
        return {
            "recommended_model": recommended_model,
            "recommended_provider": recommended_provider, 
            "confidence": confidence,
            "complexity_score": complexity_score,
            "complexity_tier": complexity_tier,
            "complexity_name": complexity_name,
            "reasoning": reasoning,
            "ranked_models": ranked_models,
            "analyzer_latency_ms": latency_ms,
            "analyzer_type": "enhanced_bert"
        }
    
    def _filter_candidate_models(self) -> List[Dict]:
        """Filter models based on allowed providers and models."""
        if not self.performance_data:
            return []
        
        filtered_models = []
        for model in self.performance_data:
            # Check provider filter
            if self.allowed_providers:
                provider = model.get("provider", "").lower()
                if provider not in [p.lower() for p in self.allowed_providers]:
                    continue
            
            # Check model filter
            if self.allowed_models:
                model_name = model.get("model", "")
                api_id = model.get("api_id", "")
                if not any(allowed in [model_name, api_id] for allowed in self.allowed_models):
                    continue
            
            filtered_models.append(model)
        
        return filtered_models
    
    def _rank_models_by_complexity(self, models: List[Dict], complexity_tier: int, complexity_score: float) -> List[Dict]:
        """Rank models based on complexity requirements."""
        if not models:
            return []
        
        ranked = []
        for model in models:
            # Get model capabilities - ensure proper type conversion
            try:
                quality_index = float(model.get("quality_index", 50))
            except (ValueError, TypeError):
                quality_index = 50.0
                
            try:
                cost_per_1m = float(model.get("cost_per_1m_tokens", 1.0))
            except (ValueError, TypeError):
                cost_per_1m = 1.0
                
            try:
                context_window = int(model.get("context_window", 4000))
            except (ValueError, TypeError):
                context_window = 4000
            
            # Calculate suitability score
            suitability = self._calculate_model_suitability(
                quality_index, cost_per_1m, context_window, complexity_tier, complexity_score
            )
            
            from app.complexity.analyzer_factory import _calibrate_confidence
            calibrated_conf = _calibrate_confidence(min(suitability / 100.0, 1.0), "enhanced_bert")
            model_info = {
                "model_name": model.get("api_id", model.get("model", "")),
                "provider": model.get("provider", ""),
                "confidence": calibrated_conf,
                "reasoning": f"Enhanced analysis: complexity {complexity_score:.3f}, quality {quality_index}, cost-effective for {complexity_tier}-tier tasks",
                "cost_per_million_tokens": cost_per_1m,
                "performance_name": model.get("model", ""),
                "quality_index": quality_index,
                "cost_per_1m_tokens": cost_per_1m,
                "api_id": model.get("api_id", ""),
                "context_window": context_window,
                "function_calling": model.get("function_calling", False),
                "json_mode": model.get("json_mode", False),
                "suitability_score": suitability
            }
            
            ranked.append(model_info)
        
        # Sort by suitability score (descending)
        ranked.sort(key=lambda x: x["suitability_score"], reverse=True)
        
        return ranked[:10]  # Return top 10 models
    
    def _calculate_model_suitability(self, quality_index: float, cost_per_1m: float, 
                                   context_window: int, complexity_tier: int, 
                                   complexity_score: float) -> float:
        """Calculate how suitable a model is for the given complexity."""
        
        # Base suitability from quality
        base_score = quality_index
        
        # Adjust for complexity requirements
        if complexity_tier == 1:  # Simple tasks
            # Prefer cost-effective models, don't need highest quality
            if base_score > 40:  # Good enough quality
                cost_bonus = max(0, 50 - cost_per_1m * 10)  # Bonus for lower cost
                base_score += cost_bonus
        elif complexity_tier == 2:  # Medium tasks
            # Balance quality and cost
            if base_score > 60:  # Good quality
                cost_penalty = min(20, cost_per_1m * 2)  # Small penalty for high cost
                base_score -= cost_penalty
        else:  # Complex tasks
            # Prioritize quality over cost
            if base_score > 80:  # High quality preferred
                base_score += 20
            elif base_score < 60:  # Low quality penalty
                base_score -= 30
        
        # Context window bonus for complex tasks
        try:
            context_window_int = int(context_window) if context_window else 4000
            if complexity_tier >= 2 and context_window_int > 8000:
                base_score += 10
        except (ValueError, TypeError):
            # Skip context window bonus if conversion fails
            pass
        
        return max(0, min(100, base_score))