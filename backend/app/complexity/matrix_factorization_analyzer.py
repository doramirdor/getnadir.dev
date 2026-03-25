"""
Matrix Factorization-based complexity analyzer as an advanced alternative to Gemini.
Uses learned embeddings and neural collaborative filtering for accurate routing decisions.
"""

import json
import os
import time
from typing import Dict, List, Optional, Any
import numpy as np
import torch
import torch.nn as nn
from openai import OpenAI
import logging

logger = logging.getLogger(__name__)


class MFModel(nn.Module):
    """
    Matrix Factorization model for prompt-model compatibility prediction.
    Based on RouteGM's implementation but adapted for our use case.
    """
    
    def __init__(
        self,
        dim: int = 128,
        num_models: int = 64,
        text_dim: int = 1536,
        num_classes: int = 1,
        use_proj: bool = True,
    ):
        super().__init__()
        self.use_proj = use_proj
        self.P = nn.Embedding(num_models, dim)  # Model embeddings
        
        # Text projection layer
        if self.use_proj:
            self.text_proj = nn.Sequential(
                nn.Linear(text_dim, dim, bias=False)
            )
        else:
            assert text_dim == dim, f"text_dim {text_dim} must equal dim {dim} if not using projection"
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Linear(dim, num_classes, bias=False)
        )
        
        # Initialize embeddings
        nn.init.normal_(self.P.weight, mean=0, std=0.1)
    
    def get_device(self):
        return self.P.weight.device
    
    def forward(self, model_ids, prompt_embeddings):
        """
        Forward pass for multiple models and prompts.
        
        Args:
            model_ids: Tensor of model IDs
            prompt_embeddings: Tensor of prompt embeddings
            
        Returns:
            Model scores for routing decisions
        """
        model_ids = torch.tensor(model_ids, dtype=torch.long).to(self.get_device())
        prompt_embeddings = torch.tensor(prompt_embeddings, device=self.get_device())
        
        # Get model embeddings
        model_embed = self.P(model_ids)
        model_embed = torch.nn.functional.normalize(model_embed, p=2, dim=1)
        
        # Project prompt embeddings
        if self.use_proj:
            prompt_embed = self.text_proj(prompt_embeddings)
        else:
            prompt_embed = prompt_embeddings
        
        # Element-wise multiplication and classification
        combined = model_embed * prompt_embed
        scores = self.classifier(combined).squeeze()
        
        return scores
    
    @torch.no_grad()
    def predict_win_rate(self, model_a_id, model_b_id, prompt_embedding):
        """
        Predict win rate between two models for a given prompt.
        
        Args:
            model_a_id: ID of first model
            model_b_id: ID of second model
            prompt_embedding: Embedding of the prompt
            
        Returns:
            Win rate of model_a over model_b
        """
        scores = self.forward([model_a_id, model_b_id], [prompt_embedding, prompt_embedding])
        winrate = torch.sigmoid(scores[0] - scores[1]).item()
        return winrate


class MatrixFactorizationAnalyzer:
    """
    Advanced complexity analyzer using matrix factorization and learned embeddings.
    
    This provides more sophisticated routing decisions based on learned patterns
    from model-prompt compatibility data.
    """
    
    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        model_path: Optional[str] = None,
        embedding_model: str = "text-embedding-3-small",
        device: str = "auto"
    ):
        """
        Initialize the Matrix Factorization analyzer.
        
        Args:
            allowed_providers: List of allowed providers
            allowed_models: List of allowed models
            model_path: Path to pre-trained MF model (optional)
            embedding_model: OpenAI embedding model to use
            device: Device for inference ('cpu', 'cuda', or 'auto')
        """
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []
        self.embedding_model = embedding_model
        
        # Set device
        if device == "auto":
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        
        logger.info(f"Using device: {self.device}")
        
        # Initialize OpenAI client for embeddings
        try:
            self.openai_client = OpenAI()
        except Exception as e:
            logger.warning(f"Could not initialize OpenAI client: {e}")
            self.openai_client = None
        
        # Load performance data and create model mappings
        self.performance_data = self._load_performance_data()
        self.model_id_mapping = self._create_model_id_mapping()
        
        # Initialize or load MF model
        self.mf_model = self._initialize_mf_model(model_path)
        
        # Quality thresholds for routing decisions
        self.quality_thresholds = {
            "simple": 40,    # Models with quality >= 40 for simple tasks
            "medium": 60,    # Models with quality >= 60 for medium tasks  
            "complex": 80    # Models with quality >= 80 for complex tasks
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
    
    def _create_model_id_mapping(self) -> Dict[str, int]:
        """Create mapping from model names to integer IDs."""
        model_mapping = {}
        model_id = 0
        
        for model_data in self.performance_data:
            model_name = model_data.get("model", "")
            if model_name and model_name not in model_mapping:
                model_mapping[model_name] = model_id
                model_id += 1
        
        logger.info(f"Created mapping for {len(model_mapping)} models")
        return model_mapping
    
    def _initialize_mf_model(self, model_path: Optional[str]) -> Optional[MFModel]:
        """Initialize the matrix factorization model."""
        try:
            num_models = len(self.model_id_mapping)
            if num_models == 0:
                logger.warning("No models available for MF model")
                return None
            
            mf_model = MFModel(
                dim=128,
                num_models=num_models,
                text_dim=1536,  # OpenAI embedding dimension
                num_classes=1,
                use_proj=True
            )
            
            if model_path and os.path.exists(model_path):
                # Load pre-trained weights
                mf_model.load_state_dict(torch.load(model_path, map_location=self.device))
                logger.info(f"Loaded pre-trained MF model from {model_path}")
            else:
                logger.info("Using randomly initialized MF model")
            
            mf_model.to(self.device)
            mf_model.eval()
            
            return mf_model
            
        except Exception as e:
            logger.error(f"Error initializing MF model: {e}")
            return None
    
    def _get_prompt_embedding(self, prompt: str) -> Optional[np.ndarray]:
        """Get embedding for a prompt using OpenAI API."""
        if not self.openai_client:
            return None
        
        try:
            response = self.openai_client.embeddings.create(
                input=[prompt],
                model=self.embedding_model
            )
            embedding = response.data[0].embedding
            return np.array(embedding)
        except Exception as e:
            logger.error(f"Error getting prompt embedding: {e}")
            return None
    
    def calculate_strong_win_rate(self, prompt: str) -> float:
        """
        Calculate probability that a strong model is needed.
        
        Args:
            prompt: Input prompt to analyze
            
        Returns:
            Float between 0-1 representing strong model preference
        """
        if not self.mf_model:
            return self._heuristic_complexity(prompt)
        
        # Get prompt embedding
        prompt_embedding = self._get_prompt_embedding(prompt)
        if prompt_embedding is None:
            return self._heuristic_complexity(prompt)
        
        try:
            # Get available models
            available_models = self._get_supported_models()
            if len(available_models) < 2:
                return self._heuristic_complexity(prompt)
            
            # Find strong and weak model candidates
            strong_model = self._find_best_model(available_models, "complex")
            weak_model = self._find_best_model(available_models, "simple")
            
            if not strong_model or not weak_model:
                return self._heuristic_complexity(prompt)
            
            # Get model IDs
            strong_id = self.model_id_mapping.get(strong_model["model_name"])
            weak_id = self.model_id_mapping.get(weak_model["model_name"])
            
            if strong_id is None or weak_id is None:
                return self._heuristic_complexity(prompt)
            
            # Predict win rate
            win_rate = self.mf_model.predict_win_rate(
                strong_id, weak_id, prompt_embedding
            )
            
            return win_rate
            
        except Exception as e:
            logger.error(f"Error in MF inference: {e}")
            return self._heuristic_complexity(prompt)
    
    def _find_best_model(self, models: List[Dict], complexity_type: str) -> Optional[Dict]:
        """Find the best model for a given complexity type."""
        threshold = self.quality_thresholds.get(complexity_type, 50)
        
        suitable_models = []
        for model in models:
            quality = model["performance"].get("quality_index")
            if quality:
                try:
                    quality_float = float(quality)
                    if complexity_type == "simple" and quality_float <= 60:
                        suitable_models.append((model, quality_float))
                    elif complexity_type == "complex" and quality_float >= 70:
                        suitable_models.append((model, quality_float))
                except ValueError:
                    continue
        
        if not suitable_models:
            return models[0] if models else None
        
        # Sort by quality
        if complexity_type == "simple":
            # For simple tasks, prefer lower quality (more efficient)
            suitable_models.sort(key=lambda x: x[1])
        else:
            # For complex tasks, prefer higher quality
            suitable_models.sort(key=lambda x: x[1], reverse=True)
        
        return suitable_models[0][0]
    
    def _heuristic_complexity(self, prompt: str) -> float:
        """Fallback heuristic complexity calculation."""
        complexity_score = 0.0
        
        # Length-based complexity
        if len(prompt) > 1000:
            complexity_score += 0.4
        elif len(prompt) > 500:
            complexity_score += 0.3
        elif len(prompt) > 200:
            complexity_score += 0.2
        
        # Keyword-based complexity
        complex_keywords = [
            "analyze", "compare", "explain", "reasoning", "logic", "mathematical",
            "code", "programming", "algorithm", "research", "detailed", "comprehensive"
        ]
        
        prompt_lower = prompt.lower()
        keyword_matches = sum(1 for keyword in complex_keywords if keyword in prompt_lower)
        complexity_score += min(keyword_matches * 0.15, 0.5)
        
        return min(complexity_score, 1.0)
    
    def analyze_complexity(
        self,
        prompt: str,
        system_message: str = "",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze prompt complexity and recommend models using matrix factorization.
        
        Args:
            prompt: User prompt to analyze
            system_message: System message (if any)
            **kwargs: Additional parameters
            
        Returns:
            Dictionary containing complexity analysis and model recommendations
        """
        start_time = time.time()
        
        # Calculate complexity using MF model
        strong_win_rate = self.calculate_strong_win_rate(prompt)
        
        # Determine complexity tier
        if strong_win_rate < 0.3:
            complexity_tier = 1
            tier_name = "simple"
            confidence = 1.0 - strong_win_rate
        elif strong_win_rate < 0.7:
            complexity_tier = 2
            tier_name = "medium"
            confidence = 0.8
        else:
            complexity_tier = 3
            tier_name = "complex"
            confidence = strong_win_rate
        
        # Get and rank models
        supported_models = self._get_supported_models()
        ranked_models = self._rank_models_with_mf(
            supported_models, prompt, strong_win_rate
        )
        
        analysis_time = time.time() - start_time
        
        return {
            "recommended_model": ranked_models[0]["model_name"] if ranked_models else "gpt-3.5-turbo",
            "recommended_provider": ranked_models[0]["provider"] if ranked_models else "openai",
            "complexity_score": strong_win_rate,
            "tier": complexity_tier,
            "tier_name": tier_name,
            "confidence": confidence,
            "selection_method": "matrix_factorization",
            "reasoning": f"Matrix factorization model predicted {tier_name} complexity (win rate: {strong_win_rate:.3f})",
            "ranked_models": ranked_models[:5],
            "analysis_time_ms": analysis_time * 1000,
            "model_type": "matrix_factorization_analyzer"
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
    
    def _rank_models_with_mf(
        self,
        models: List[Dict],
        prompt: str,
        complexity_score: float
    ) -> List[Dict]:
        """Rank models using matrix factorization predictions."""
        if not self.mf_model:
            return self._rank_models_heuristic(models, complexity_score)
        
        prompt_embedding = self._get_prompt_embedding(prompt)
        if prompt_embedding is None:
            return self._rank_models_heuristic(models, complexity_score)
        
        ranked_models = []
        
        for model in models:
            model_id = self.model_id_mapping.get(model["model_name"])
            if model_id is None:
                continue
            
            try:
                # Get model score from MF model
                with torch.no_grad():
                    score = self.mf_model.forward([model_id], [prompt_embedding]).item()
                
                # Get quality metrics
                quality_index = model["performance"].get("quality_index", 50)
                try:
                    quality_float = float(quality_index)
                except (ValueError, TypeError):
                    quality_float = 50
                
                ranked_models.append({
                    "model_name": model["model_name"],
                    "provider": model["provider"],
                    "score": score,
                    "quality_index": quality_float,
                    "confidence": min(complexity_score + 0.2, 1.0),
                    "reasoning": f"MF score: {score:.3f}, Quality: {quality_float}"
                })
                
            except Exception as e:
                logger.error(f"Error scoring model {model['model_name']}: {e}")
                continue
        
        # Sort by MF score
        ranked_models.sort(key=lambda x: x["score"], reverse=True)
        
        return ranked_models
    
    def _rank_models_heuristic(self, models: List[Dict], complexity_score: float) -> List[Dict]:
        """Fallback heuristic ranking when MF model is not available."""
        ranked_models = []
        
        for model in models:
            perf = model["performance"]
            quality_index = perf.get("quality_index", 50)
            
            try:
                quality_float = float(quality_index)
            except (ValueError, TypeError):
                quality_float = 50
            
            # Simple scoring based on complexity needs
            if complexity_score < 0.3:  # Simple task
                score = 100 - quality_float  # Prefer simpler models
            else:  # Complex task
                score = quality_float  # Prefer better models
            
            ranked_models.append({
                "model_name": model["model_name"],
                "provider": model["provider"],
                "score": score,
                "quality_index": quality_float,
                "confidence": min(complexity_score + 0.2, 1.0),
                "reasoning": f"Heuristic score: {score:.1f}, Quality: {quality_float}"
            })
        
        ranked_models.sort(key=lambda x: x["score"], reverse=True)
        return ranked_models


# Factory function for easy integration
def create_mf_analyzer(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
    model_path: Optional[str] = None
) -> MatrixFactorizationAnalyzer:
    """
    Factory function to create a Matrix Factorization analyzer.
    
    Args:
        allowed_providers: List of allowed providers
        allowed_models: List of allowed models
        model_path: Path to pre-trained MF model
        
    Returns:
        Configured MatrixFactorizationAnalyzer instance
    """
    return MatrixFactorizationAnalyzer(
        allowed_providers=allowed_providers,
        allowed_models=allowed_models,
        model_path=model_path
    )