"""
BERT-based complexity analyzer as an alternative to Gemini.
Fast, efficient complexity analysis using fine-tuned BERT models.
"""

import json
import os
import time
from typing import Dict, List, Optional, Any
import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import logging

logger = logging.getLogger(__name__)


class BERTComplexityAnalyzer:
    """
    Fast BERT-based complexity analyzer for prompt routing.
    
    This class provides an alternative to Gemini for complexity analysis,
    using fine-tuned BERT models for fast and accurate routing decisions.
    """
    
    def __init__(
        self,
        model_path: str = "distilbert-base-uncased",
        num_labels: int = 3,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        device: str = "auto"
    ):
        """
        Initialize the BERT complexity analyzer.
        
        Args:
            model_path: Path to pre-trained BERT model or HuggingFace model name
            num_labels: Number of complexity classes (3 = simple/medium/complex)
            allowed_providers: List of allowed providers
            allowed_models: List of allowed models
            device: Device to run inference on ('cpu', 'cuda', or 'auto')
        """
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []
        self.num_labels = num_labels
        
        # Set device
        if device == "auto":
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
            
        logger.info(f"Using device: {self.device}")
        
        # Load model and tokenizer
        try:
            self.model = AutoModelForSequenceClassification.from_pretrained(
                model_path, 
                num_labels=num_labels
            )
            self.tokenizer = AutoTokenizer.from_pretrained(model_path)
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"Loaded BERT model from {model_path}")
        except Exception as e:
            logger.warning(f"Could not load pre-trained model: {e}")
            logger.info("Using random baseline model")
            # Fallback to a basic model for demonstration
            self.model = None
            self.tokenizer = None
        
        # Load performance data
        self.performance_data = self._load_performance_data()
        
        # Complexity tier mappings
        self.complexity_tiers = {
            0: {"name": "simple", "tier": 1, "description": "Simple tasks requiring basic models"},
            1: {"name": "medium", "tier": 2, "description": "Medium complexity tasks"},
            2: {"name": "complex", "tier": 3, "description": "Complex tasks requiring advanced models"}
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
        Calculate the probability that a strong model is needed.
        
        Args:
            prompt: Input prompt to analyze
            
        Returns:
            Float between 0-1 representing strong model win rate
        """
        if not self.model or not self.tokenizer:
            # Fallback: simple heuristic based on prompt length and keywords
            return self._heuristic_complexity(prompt)
        
        try:
            # Tokenize input
            inputs = self.tokenizer(
                prompt, 
                return_tensors="pt", 
                padding=True, 
                truncation=True,
                max_length=512
            )
            
            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Get predictions
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits.cpu().numpy()[0]
            
            # Convert logits to probabilities
            exp_scores = np.exp(logits - np.max(logits))
            softmax_scores = exp_scores / np.sum(exp_scores)
            
            # Calculate strong model probability
            # Label 0 = simple (weak model), Label 1 = medium, Label 2 = complex (strong model)
            weak_prob = softmax_scores[0]
            medium_prob = softmax_scores[1] if len(softmax_scores) > 1 else 0
            strong_prob = softmax_scores[2] if len(softmax_scores) > 2 else 0
            
            # Return probability of needing medium or strong model
            return medium_prob * 0.5 + strong_prob * 1.0
            
        except Exception as e:
            logger.error(f"Error in BERT inference: {e}")
            return self._heuristic_complexity(prompt)
    
    def _heuristic_complexity(self, prompt: str) -> float:
        """
        Fallback heuristic complexity calculation.
        
        Args:
            prompt: Input prompt
            
        Returns:
            Complexity score between 0-1
        """
        # Simple heuristics for complexity
        complexity_score = 0.0
        
        # Length-based complexity
        if len(prompt) > 1000:
            complexity_score += 0.3
        elif len(prompt) > 500:
            complexity_score += 0.2
        elif len(prompt) > 200:
            complexity_score += 0.1
        
        # Keyword-based complexity
        complex_keywords = [
            "analyze", "compare", "explain", "reasoning", "logic", "mathematical",
            "code", "programming", "algorithm", "research", "detailed", "comprehensive",
            "creative", "story", "essay", "technical", "scientific", "complex"
        ]
        
        prompt_lower = prompt.lower()
        keyword_matches = sum(1 for keyword in complex_keywords if keyword in prompt_lower)
        complexity_score += min(keyword_matches * 0.1, 0.4)
        
        # Question complexity
        question_marks = prompt.count("?")
        if question_marks > 2:
            complexity_score += 0.1
        
        return min(complexity_score, 1.0)
    
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
            system_message: System message (if any)
            **kwargs: Additional parameters
            
        Returns:
            Dictionary containing complexity analysis and model recommendations
        """
        start_time = time.time()
        
        # Calculate complexity
        strong_win_rate = self.calculate_strong_win_rate(prompt)
        
        # Determine complexity tier
        if strong_win_rate < 0.3:
            complexity_tier = 0  # Simple
            tier_name = "simple"
            confidence = 1.0 - strong_win_rate
        elif strong_win_rate < 0.7:
            complexity_tier = 1  # Medium
            tier_name = "medium"
            confidence = 0.8
        else:
            complexity_tier = 2  # Complex
            tier_name = "complex"
            confidence = strong_win_rate
        
        # Get supported models
        supported_models = self._get_supported_models()
        
        # Rank models based on complexity
        ranked_models = self._rank_models_by_complexity(
            supported_models, complexity_tier, strong_win_rate
        )
        
        # Analysis time
        analysis_time = time.time() - start_time
        
        # Fallback to first allowed model if no ranked models
        fallback_model = self.allowed_models[0] if self.allowed_models else "gpt-3.5-turbo"
        fallback_provider = "openai"
        if ranked_models:
            fallback_model = ranked_models[0]["model_name"]
            fallback_provider = ranked_models[0]["provider"]
        elif self.allowed_models:
            # Find provider for fallback model
            for model_data in self.performance_data:
                if model_data.get("model") == fallback_model:
                    fallback_provider = model_data.get("api_provider", "openai").lower()
                    break
        
        return {
            "recommended_model": fallback_model,
            "recommended_provider": fallback_provider,
            "complexity_score": strong_win_rate,
            "tier": complexity_tier + 1,  # 1-based for consistency
            "tier_name": tier_name,
            "confidence": confidence,
            "selection_method": "bert_analysis",
            "reasoning": f"BERT model classified this as {tier_name} complexity (score: {strong_win_rate:.3f})",
            "ranked_models": ranked_models[:5],  # Top 5 models
            "analysis_time_ms": analysis_time * 1000,
            "model_type": "bert_complexity_analyzer"
        }
    
    def _get_supported_models(self) -> List[Dict]:
        """Get list of supported models based on constraints."""
        supported_models = []
        
        for model_data in self.performance_data:
            model_name = model_data.get("model", "")
            provider = model_data.get("api_provider", "").lower()
            
            # Check provider constraints
            if self.allowed_providers and provider not in [p.lower() for p in self.allowed_providers]:
                continue
                
            # Check model constraints  
            if self.allowed_models and model_name not in self.allowed_models:
                continue
            
            # Map provider names
            provider_mapping = {
                "openai": "openai",
                "anthropic": "anthropic", 
                "google": "google",
                "amazon bedrock": "amazon"
            }
            
            normalized_provider = provider_mapping.get(provider, provider)
            
            supported_models.append({
                "model_name": model_name,
                "provider": normalized_provider,
                "performance": model_data.get("performance", {}),
                "pricing": model_data.get("pricing", {}),
                "capabilities": {
                    "function_calling": model_data.get("function_calling", "No") == "Yes",
                    "json_mode": model_data.get("json_mode", "No") == "Yes"
                }
            })
        
        return supported_models
    
    def _rank_models_by_complexity(
        self, 
        models: List[Dict], 
        complexity_tier: int, 
        complexity_score: float
    ) -> List[Dict]:
        """
        Rank models based on complexity requirements.
        
        Args:
            models: List of available models
            complexity_tier: Complexity tier (0=simple, 1=medium, 2=complex)
            complexity_score: Raw complexity score
            
        Returns:
            List of ranked models with scores
        """
        ranked_models = []
        
        for model in models:
            perf = model["performance"]
            pricing = model["pricing"]
            
            # Get quality and cost metrics
            quality_index = float(perf.get("quality_index", 50)) if perf.get("quality_index") else 50
            
            # Calculate cost (simplified)
            try:
                input_cost = float(pricing.get("prompt", 0))
                output_cost = float(pricing.get("completion", 0))
                avg_cost = (input_cost + output_cost) / 2
            except (ValueError, TypeError):
                avg_cost = 0.001  # Default cost
            
            # Calculate model score based on complexity needs
            if complexity_tier == 0:  # Simple tasks - prefer cost efficiency
                score = (100 - quality_index) * 0.3 + (1 / (avg_cost + 0.0001)) * 0.7
            elif complexity_tier == 1:  # Medium tasks - balance quality and cost
                score = quality_index * 0.6 + (1 / (avg_cost + 0.0001)) * 0.4
            else:  # Complex tasks - prefer quality
                score = quality_index * 0.8 + (1 / (avg_cost + 0.0001)) * 0.2
            
            ranked_models.append({
                "model_name": model["model_name"],
                "provider": model["provider"],
                "score": score,
                "quality_index": quality_index,
                "estimated_cost": avg_cost,
                "confidence": min(complexity_score + 0.2, 1.0),
                "reasoning": f"Selected for {self.complexity_tiers[complexity_tier]['name']} task"
            })
        
        # Sort by score (descending)
        ranked_models.sort(key=lambda x: x["score"], reverse=True)
        
        return ranked_models

    async def analyze(self, text: str, system_message: str = "", **kwargs) -> Dict[str, Any]:
        """
        Async compatibility wrapper for analyze_complexity.
        
        This method provides compatibility with the existing analyzer interface
        that expects an async analyze() method.
        
        Args:
            text: User prompt to analyze
            system_message: System message (if any)
            **kwargs: Additional parameters including candidate_models
            
        Returns:
            Dictionary containing complexity analysis and model recommendations
        """
        # Extract candidate models if provided
        candidate_models = kwargs.get('candidate_models', None)
        
        # Temporarily override allowed_models with candidate_models if provided
        original_allowed_models = self.allowed_models
        if candidate_models:
            self.allowed_models = candidate_models
            logger.info(f"🔍 BERT analyzer using candidate models: {candidate_models}")
        
        try:
            # Call the synchronous analyze_complexity method
            result = self.analyze_complexity(text, system_message, **kwargs)
        finally:
            # Restore original allowed_models
            self.allowed_models = original_allowed_models
            
        return result


# Factory function for easy integration
def create_bert_analyzer(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
    model_path: str = "distilbert-base-uncased"
) -> BERTComplexityAnalyzer:
    """
    Factory function to create a BERT complexity analyzer.
    
    Args:
        allowed_providers: List of allowed providers
        allowed_models: List of allowed models  
        model_path: Path to BERT model
        
    Returns:
        Configured BERTComplexityAnalyzer instance
    """
    return BERTComplexityAnalyzer(
        model_path=model_path,
        allowed_providers=allowed_providers,
        allowed_models=allowed_models
    )