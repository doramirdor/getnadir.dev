"""
Two-Tower Neural Collaborative Filtering Model Analyzer.
Production-ready model selection using trained neural networks with production model names.
"""

import os
import json
import pickle
import logging
import numpy as np
import torch
import torch.nn as nn
from typing import Dict, List, Optional, Any, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder

from app.complexity.base_analyzer import BaseAnalyzer
from app.settings import settings

logger = logging.getLogger(__name__)


class FastTwoTowerModel(nn.Module):
    """Fast Two-Tower model using TF-IDF features for production."""

    def __init__(self, tfidf_dim, num_models, embedding_dim=128):
        super(FastTwoTowerModel, self).__init__()

        # Prompt tower (processes TF-IDF features)
        self.prompt_tower = nn.Sequential(
            nn.Linear(tfidf_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, embedding_dim),
            nn.ReLU()
        )

        # Model tower (learns model embeddings)
        self.model_embeddings = nn.Embedding(num_models, embedding_dim)

        # Prediction layer
        self.predictor = nn.Sequential(
            nn.Linear(embedding_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 1)
        )

    def forward(self, tfidf_features, model_ids):
        # Get prompt embeddings
        prompt_emb = self.prompt_tower(tfidf_features)

        # Get model embeddings
        model_emb = self.model_embeddings(model_ids)

        # Compute similarity score
        similarity = torch.sum(prompt_emb.unsqueeze(1) * model_emb, dim=2)

        return similarity


class ImprovedTwoTowerModel(nn.Module):
    """Improved Two-Tower model with complexity features and uncertainty estimation."""

    def __init__(self, tfidf_dim, num_models, complexity_dim=3, embedding_dim=128):
        super(ImprovedTwoTowerModel, self).__init__()

        # Prompt tower (processes TF-IDF + complexity features)
        prompt_input_dim = tfidf_dim + complexity_dim
        self.prompt_tower = nn.Sequential(
            nn.Linear(prompt_input_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, embedding_dim),
            nn.ReLU()
        )

        # Model tower (learns model embeddings)
        self.model_embeddings = nn.Embedding(num_models, embedding_dim)

        # Main prediction head
        self.prediction = nn.Sequential(
            nn.Linear(embedding_dim * 2, 64),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

        # Uncertainty estimation head (for confidence calibration)
        self.uncertainty = nn.Sequential(
            nn.Linear(embedding_dim * 2, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, tfidf_features, complexity_features, model_ids):
        # Combine TF-IDF and complexity features
        prompt_input = torch.cat([tfidf_features, complexity_features], dim=1)

        # Get prompt embeddings
        prompt_emb = self.prompt_tower(prompt_input)

        # Get model embeddings
        model_emb = self.model_embeddings(model_ids).squeeze(1)

        # Concatenate embeddings
        combined = torch.cat([prompt_emb, model_emb], dim=1)

        # Get prediction and uncertainty
        prediction = self.prediction(combined)
        uncertainty = self.uncertainty(combined)

        return prediction, uncertainty




class TwoTowerModel(nn.Module):
    """Two-tower neural network for model recommendation."""
    
    def __init__(self, prompt_dim, model_dim, embedding_dim=128, hidden_dims=[256, 128]):
        super(TwoTowerModel, self).__init__()
        
        # Prompt tower
        prompt_layers = []
        in_dim = prompt_dim
        for hidden_dim in hidden_dims:
            prompt_layers.extend([
                nn.Linear(in_dim, hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.BatchNorm1d(hidden_dim)
            ])
            in_dim = hidden_dim
        prompt_layers.append(nn.Linear(in_dim, embedding_dim))
        self.prompt_tower = nn.Sequential(*prompt_layers)
        
        # Model tower
        model_layers = []
        in_dim = model_dim
        for hidden_dim in hidden_dims:
            model_layers.extend([
                nn.Linear(in_dim, hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.BatchNorm1d(hidden_dim)
            ])
            in_dim = hidden_dim
        model_layers.append(nn.Linear(in_dim, embedding_dim))
        self.model_tower = nn.Sequential(*model_layers)
        
        # Final prediction layer
        self.prediction = nn.Sequential(
            nn.Linear(embedding_dim * 2, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(64, 1),
            nn.Sigmoid()
        )
    
    def forward(self, prompt_features, model_features):
        # Get embeddings from both towers
        prompt_embedding = self.prompt_tower(prompt_features)
        model_embedding = self.model_tower(model_features)
        
        # Concatenate embeddings
        combined = torch.cat([prompt_embedding, model_embedding], dim=1)
        
        # Final prediction
        score = self.prediction(combined)
        return score.squeeze()


class TwoTowerModelRecommender(BaseAnalyzer):
    """
    Two-tower neural collaborative filtering model recommender.
    
    Uses a trained neural network to predict model preferences based on
    prompt characteristics and model capabilities.
    """
    
    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        model_path: Optional[str] = None,
        device: str = 'auto'
    ):
        """
        Initialize the two-tower model recommender with production-trained model.
        
        Args:
            allowed_providers: List of allowed providers
            allowed_models: List of allowed models
            model_path: Path to trained production model (.pkl file)
            device: Device to run inference on ('cpu', 'cuda', 'auto')
        """
        super().__init__(model_name="two-tower-neural", api_key=None)
        
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []
        
        # Set device
        if device == 'auto':
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)
        
        # Default path to the latest trained two-tower model (complexity aware 2025)
        if model_path is None:
            model_path = os.path.join(
                os.path.dirname(__file__),
                '../../training/model_recommender',
                'two_tower_complexity_aware_2025.pkl'
            )
        
        self.model_path = model_path
        
        # Production model names (user-specified targets)
        self.target_production_models = [
            'claude-3-5-haiku-20241022',
            'claude-3-5-sonnet-20240620',
            'claude-3-5-sonnet-20241022', 
            'claude-3-7-sonnet-20250219',
            'claude-3-haiku-20240307',
            'claude-3-opus-20240229',
            'claude-opus-4-20250514',
            'claude-sonnet-4-20250514',
            'gemini-1.5-flash',
            'gemini-2.0-flash'
        ]
        
        # Filter target models by allowed models if specified
        if self.allowed_models:
            self.target_models = [m for m in self.target_production_models if m in self.allowed_models]
        else:
            self.target_models = self.target_production_models
        
        # Model components (lazy loading)
        self._model = None
        self._tfidf_vectorizer = None
        self._label_encoder = None
        self._complexity_scaler = None
        self._model_type = 'fast'  # 'fast' or 'improved'
        self._model_loaded = False
        
        # Initialize on first use
        try:
            self._load_production_model()
            logger.info(f"✅ Two-Tower production model initialized with {len(self.target_models)} models")
        except Exception as e:
            logger.error(f"Failed to initialize two-tower model: {e}")
            raise e
    
    def _load_production_model(self):
        """Load the production-trained Two-Tower model with TF-IDF features."""
        try:
            if not os.path.exists(self.model_path):
                logger.warning(f"Production model not found at {self.model_path}")
                return

            # Load the complete model data
            with open(self.model_path, 'rb') as f:
                model_data = pickle.load(f)

            # Extract components
            self._tfidf_vectorizer = model_data['tfidf_vectorizer']
            self._label_encoder = model_data['label_encoder']
            model_config = model_data['model_config']

            # Detect model type based on config or state dict keys
            state_dict = model_data['model_state_dict']
            is_improved_model = any('uncertainty' in key for key in state_dict.keys())
            has_complexity_features = model_config.get('complexity_dim', 0) > 0

            if is_improved_model or has_complexity_features:
                # Use ImprovedTwoTowerModel architecture
                self._model = ImprovedTwoTowerModel(
                    tfidf_dim=model_config['tfidf_dim'],
                    num_models=model_config['num_models'],
                    complexity_dim=model_config.get('complexity_dim', 3),
                    embedding_dim=model_config['embedding_dim']
                )
                self._model_type = 'improved'
                logger.info("🧠 Using ImprovedTwoTowerModel architecture")
            else:
                # Use FastTwoTowerModel architecture
                self._model = FastTwoTowerModel(
                    tfidf_dim=model_config['tfidf_dim'],
                    num_models=model_config['num_models'],
                    embedding_dim=model_config['embedding_dim']
                )
                self._model_type = 'fast'
                logger.info("⚡ Using FastTwoTowerModel architecture")

            # Load the trained weights
            self._model.load_state_dict(model_data['model_state_dict'])
            self._model.to(self.device)
            self._model.eval()

            # Load complexity scaler if available (for improved model)
            self._complexity_scaler = model_data.get('complexity_scaler')

            self._model_loaded = True

            logger.info(f"✅ Loaded production Two-Tower model from {self.model_path}")
            logger.info(f"📐 TF-IDF dimension: {model_config['tfidf_dim']}")
            logger.info(f"🎯 Number of models: {model_config['num_models']}")
            logger.info(f"📋 Model classes: {list(self._label_encoder.classes_)}")
            if has_complexity_features:
                logger.info(f"🔍 Complexity features: {model_config.get('complexity_dim', 3)}")

        except Exception as e:
            logger.error(f"Failed to load production model: {e}")
            self._model = None
            self._tfidf_vectorizer = None
            self._label_encoder = None
            self._model_loaded = False
    
    def _load_encoders(self):
        """Load feature encoders."""
        if self._encoders_loaded:
            return
            
        try:
            # Load TF-IDF vectorizer
            with open(os.path.join(self.encoders_path, "prompt_vectorizer.pkl"), 'rb') as f:
                self.prompt_vectorizer = pickle.load(f)
            
            # Load model encoder
            with open(os.path.join(self.encoders_path, "model_encoder.pkl"), 'rb') as f:
                self.model_encoder = pickle.load(f)
                
            # Load complexity encoder
            with open(os.path.join(self.encoders_path, "complexity_encoder.pkl"), 'rb') as f:
                self.complexity_encoder = pickle.load(f)
                
            # Load tier encoder
            with open(os.path.join(self.encoders_path, "tier_encoder.pkl"), 'rb') as f:
                self.tier_encoder = pickle.load(f)
            
            self._encoders_loaded = True
            logger.info("Two-tower encoders loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load encoders: {e}")
            raise e
    
    def _load_model(self):
        """Load trained PyTorch model."""
        if self._model is not None:
            return
            
        try:
            # Load checkpoint
            checkpoint = torch.load(self.model_path, map_location=self.device)
            
            # Get model dimensions from encoders
            prompt_dim = self.prompt_vectorizer.transform([""]).shape[1] + 3  # +3 for metadata
            model_dim = len(self.model_encoder.classes_) + 5  # +5 for model type features
            
            # Initialize model
            self._model = TwoTowerModel(prompt_dim=prompt_dim, model_dim=model_dim)
            
            # Load state dict
            self._model.load_state_dict(checkpoint['model_state_dict'])
            self._model.to(self.device)
            self._model.eval()
            
            logger.info(f"Two-tower model loaded successfully on {self.device}")
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise e
    
    def _create_prompt_features(self, prompt: str, complexity: int = 2, tier_name: str = "medium") -> np.ndarray:
        """Create features for a prompt."""
        # Prompt features (TF-IDF)
        prompt_features = self.prompt_vectorizer.transform([prompt]).toarray()[0]
        
        # Add prompt metadata features
        prompt_length_norm = (len(prompt) - 200) / 100  # Rough normalization
        
        try:
            complexity_encoded = self.complexity_encoder.transform([complexity])[0]
        except (ValueError, IndexError):
            complexity_encoded = 1  # Default to medium

        try:
            tier_encoded = self.tier_encoder.transform([tier_name])[0]
        except (ValueError, IndexError):
            tier_encoded = 1  # Default to medium
        
        # Combine prompt features
        prompt_metadata = np.array([prompt_length_norm, complexity_encoded, tier_encoded])
        full_prompt_features = np.hstack([prompt_features, prompt_metadata])
        
        return full_prompt_features
    
    def _load_model_name_mapping(self) -> Dict[str, str]:
        """Load model name mapping from file or use default."""
        mapping_file = os.path.join(
            os.path.dirname(__file__), 
            'two_tower_models', 
            'model_name_mapping.json'
        )
        
        if os.path.exists(mapping_file):
            try:
                with open(mapping_file, 'r') as f:
                    data = json.load(f)
                    return data.get('model_name_mapping', {})
            except Exception as e:
                logger.warning(f"Failed to load model name mapping: {e}")
        
        # Default mapping if file doesn't exist
        return {
            # OpenAI Models
            "gpt-4o": "gpt-5",
            "gpt-4o-mini": "gpt-5-mini", 
            "gpt-4o-2024-11-20": "gpt-5",
            "gpt-4-turbo": "gpt-4",
            "gpt-3.5-turbo": "gpt-3.5",
            
            # Anthropic Models  
            "claude-3-5-sonnet-20241022": "sonnet-3-5",
            "claude-3-5-sonnet-20240620": "sonnet-3-5", 
            "claude-3-haiku-20240307": "sonnet-3-haiku",
            "claude-3-opus-20240229": "sonnet-3-opus",
            "claude-sonnet-4-20250514": "sonnet-4",
            "claude-3-7-sonnet-20250219": "sonnet-3-7",
            
            # Google Models
            "gemini-1.5-pro": "gemini-1.5-pro",
            "gemini-1.5-flash": "gemini-1.5-flash", 
            "gemini-2.0-flash": "gemini-2.0-flash",
            "gemini-2.5-flash": "gemini-2.5-flash",
            "gemini-2.5-pro": "gemini-2.5-pro",
            "gemini-pro": "gemini-1.0-pro"
        }
    
    def _map_runtime_to_training_name(self, runtime_model: str) -> str:
        """Map runtime model name to training model name."""
        return self.model_name_mapping.get(runtime_model, runtime_model)
    
    def _create_model_features(self, model_name: str) -> np.ndarray:
        """Create features for a model using mapped training name."""
        # Map to training name first
        training_name = self._map_runtime_to_training_name(model_name)
        
        # Use training name for encoder
        try:
            model_encoded = self.model_encoder.transform([training_name])[0]
            model_onehot = np.eye(len(self.model_encoder.classes_))[model_encoded]
        except (ValueError, IndexError):
            # Unknown model, create zero vector
            model_onehot = np.zeros(len(self.model_encoder.classes_))
        
        # Model-specific features using both names
        is_gpt = 1.0 if 'gpt' in model_name.lower() or 'gpt' in training_name.lower() else 0.0
        is_sonnet = 1.0 if 'sonnet' in model_name.lower() or 'claude' in model_name.lower() else 0.0
        is_gemini = 1.0 if 'gemini' in model_name.lower() else 0.0
        
        # Model size indicators (heuristic)
        is_large = 1.0 if any(x in model_name.lower() for x in ['pro', '4', '5']) else 0.0
        is_small = 1.0 if any(x in model_name.lower() for x in ['nano', 'mini', 'flash', 'haiku']) else 0.0
        
        model_metadata = np.array([is_gpt, is_sonnet, is_gemini, is_large, is_small])
        full_model_features = np.hstack([model_onehot, model_metadata])
        
        return full_model_features
    
    def _predict_model_scores(self, prompt: str, available_models: List[str], complexity: int = 2, tier_name: str = "medium") -> Dict[str, float]:
        """Predict scores for available models using neural network with complexity features."""
        if self._model is None:
            raise RuntimeError("Model not loaded")
            
        prompt_features = self._create_prompt_features(prompt, complexity, tier_name)
        predictions = {}
        
        with torch.no_grad():
            for model in available_models:
                model_features = self._create_model_features(model)
                
                # Convert to tensors
                prompt_tensor = torch.FloatTensor(prompt_features).unsqueeze(0).to(self.device)
                model_tensor = torch.FloatTensor(model_features).unsqueeze(0).to(self.device)
                
                # Predict score - neural network prediction with complexity
                score = self._model(prompt_tensor, model_tensor).item()
                predictions[model] = score
        
        return predictions
    
    def _predict_model_scores_pure(self, prompt: str, available_models: List[str]) -> Dict[str, float]:
        """Predict scores for available models using production neural network."""
        if not self._model_loaded or self._model is None:
            raise RuntimeError("Production model not loaded")

        # Transform prompt using production TF-IDF vectorizer
        tfidf_features = self._tfidf_vectorizer.transform([prompt]).toarray()
        prompt_tensor = torch.FloatTensor(tfidf_features).to(self.device)

        # Prepare complexity features if using improved model
        complexity_tensor = None
        if self._model_type == 'improved':
            # Analyze prompt complexity
            complexity_score, _ = self._analyze_prompt_complexity(prompt)

            # Create complexity features [complexity_score, word_count, char_count]
            word_count = len(prompt.split())
            char_count = len(prompt)
            complexity_features = np.array([[complexity_score, word_count, char_count]], dtype=np.float32)

            # Scale features if scaler is available
            if self._complexity_scaler:
                complexity_features = self._complexity_scaler.transform(complexity_features)

            complexity_tensor = torch.FloatTensor(complexity_features).to(self.device)

        predictions = {}
        uncertainties = {}
        self._last_uncertainties = {}  # Reset per-request to prevent cross-request leakage

        with torch.no_grad():
            self._model.eval()

            # Get scores for all available models
            for model in available_models:
                try:
                    # Get model index from label encoder
                    if model in self._label_encoder.classes_:
                        model_idx = self._label_encoder.transform([model])[0]
                        model_tensor = torch.LongTensor([model_idx]).to(self.device)

                        # Get prediction score based on model type
                        if self._model_type == 'improved' and complexity_tensor is not None:
                            # Improved model with complexity features
                            prediction, uncertainty = self._model(prompt_tensor, complexity_tensor, model_tensor)
                            score = prediction.item()
                            unc = uncertainty.item()
                            uncertainties[model] = unc
                            # Additive uncertainty penalty (capped at 0.3)
                            score = score - min(unc * 0.2, 0.3)
                        else:
                            # Fast model without complexity features
                            score = self._model(prompt_tensor, model_tensor.unsqueeze(0)).item()

                        predictions[model] = max(0.0, min(1.0, score))  # Clamp to [0,1]
                    else:
                        # Model not in training data, assign default low score
                        predictions[model] = 0.1
                        logger.debug(f"Model {model} not in training data, assigned default score")

                except Exception as e:
                    logger.warning(f"Failed to predict for model {model}: {e}")
                    predictions[model] = 0.1

        # Store uncertainties for later use
        self._last_uncertainties = uncertainties
        return predictions
    
    def _analyze_prompt_complexity(self, prompt: str) -> Tuple[int, str]:
        """Analyze prompt complexity using heuristics."""
        length = len(prompt)

        # Check for complexity indicators
        complex_keywords = [
            'algorithm', 'optimization', 'database', 'distributed', 'machine learning',
            'neural network', 'blockchain', 'microservices', 'architecture', 'framework',
            'concurrent', 'parallel', 'async', 'scalable', 'performance', 'system design'
        ]

        medium_keywords = [
            'function', 'class', 'method', 'implement', 'create', 'develop', 'design',
            'build', 'write', 'program', 'script', 'application', 'api', 'interface'
        ]

        complex_count = sum(1 for keyword in complex_keywords if keyword.lower() in prompt.lower())
        medium_count = sum(1 for keyword in medium_keywords if keyword.lower() in prompt.lower())

        # Determine complexity tier
        if length > 500 or complex_count >= 2:
            return 3, "complex"
        elif length > 200 or medium_count >= 2 or complex_count >= 1:
            return 2, "medium"
        else:
            return 1, "simple"
    
    def _apply_complexity_override(self, ranked_models: List[Tuple[str, float]], complexity: int, tier_name: str) -> List[Tuple[str, float]]:
        """Deprecated: returns rankings unchanged. Neural network predictions stand on their own."""
        return ranked_models
    
    def _filter_available_models(self) -> List[str]:
        """Get available models based on allowed providers and models."""
        available_models = self.target_models.copy()
        
        # Filter by allowed models if specified
        if self.allowed_models:
            available_models = [m for m in available_models if m in self.allowed_models]
        
        # Filter by allowed providers if specified
        if self.allowed_providers:
            filtered_models = []
            for model in available_models:
                model_lower = model.lower()
                if any(provider.lower() in model_lower for provider in self.allowed_providers):
                    filtered_models.append(model)
                # Handle special cases
                elif 'openai' in self.allowed_providers and 'gpt' in model_lower:
                    filtered_models.append(model)
                elif 'anthropic' in self.allowed_providers and ('sonnet' in model_lower or 'claude' in model_lower or 'haiku' in model_lower):
                    filtered_models.append(model)
                elif 'google' in self.allowed_providers and 'gemini' in model_lower:
                    filtered_models.append(model)
            available_models = filtered_models
        
        return available_models
    
    def _apply_benchmark_logic(
        self, 
        model_scores: Dict[str, float], 
        ranked_models: List[Tuple[str, float]], 
        benchmark_model: Optional[str],
        prompt: str,
        complexity: int,
        tier_name: str
    ) -> Dict[str, Any]:
        """
        Apply benchmark model logic to find optimal recommendation.
        
        Priority logic:
        1. If benchmark model is in available models and performs well enough, recommend it
        2. Look for cost-effective models with similar performance to benchmark
        3. If no suitable alternatives, fall back to benchmark model
        4. If benchmark not available, use highest scoring model
        
        Args:
            model_scores: Dictionary of model scores
            ranked_models: List of (model, score) tuples sorted by score
            benchmark_model: User's benchmark model preference
            prompt: Original prompt for analysis
            complexity: Complexity tier (1-3)
            tier_name: Complexity tier name
            
        Returns:
            Dictionary with final recommendation details
        """
        if not benchmark_model:
            # No benchmark specified, use highest scoring model
            top_model, top_score = ranked_models[0]
            return {
                "model": top_model,
                "score": top_score,
                "reasoning_suffix": ""
            }
        
        # Check if benchmark model is in available models
        benchmark_score = model_scores.get(benchmark_model)
        
        if benchmark_score is not None:
            # Benchmark is available, analyze its performance relative to top models
            top_model, top_score = ranked_models[0]
            
            # Define performance thresholds for cost optimization
            significant_performance_gap = 0.15  # 15% score difference threshold
            minimal_performance_gap = 0.05     # 5% score difference threshold
            
            score_gap = top_score - benchmark_score
            
            if score_gap <= minimal_performance_gap:
                # Benchmark performs very similarly to top model, prefer it for consistency
                return {
                    "model": benchmark_model,
                    "score": benchmark_score,
                    "reasoning_suffix": f" (chose benchmark {benchmark_model} for consistency, similar performance to top model)"
                }
            elif score_gap <= significant_performance_gap:
                # Check if we can find a cost-effective alternative with similar performance
                alternative = self._find_cost_effective_alternative(ranked_models, benchmark_score, complexity)
                
                if alternative:
                    return {
                        "model": alternative["model"],
                        "score": alternative["score"],
                        "reasoning_suffix": f" (cost-effective alternative to benchmark {benchmark_model})"
                    }
                else:
                    # No good alternative, stick with benchmark for consistency
                    return {
                        "model": benchmark_model,
                        "score": benchmark_score,
                        "reasoning_suffix": f" (chose benchmark {benchmark_model} for consistency)"
                    }
            else:
                # Significant performance gap exists, evaluate trade-offs
                if complexity >= 3:
                    # High complexity task, prioritize performance over cost
                    return {
                        "model": top_model,
                        "score": top_score,
                        "reasoning_suffix": f" (chose higher-performance {top_model} over benchmark {benchmark_model} for complex task)"
                    }
                else:
                    # Medium/low complexity, benchmark might still be suitable
                    if benchmark_score >= 0.6:  # Reasonable performance threshold
                        return {
                            "model": benchmark_model,
                            "score": benchmark_score,
                            "reasoning_suffix": f" (chose benchmark {benchmark_model} for cost efficiency)"
                        }
                    else:
                        return {
                            "model": top_model,
                            "score": top_score,
                            "reasoning_suffix": f" (chose {top_model} due to poor benchmark performance)"
                        }
        else:
            # Benchmark model not in available models
            # Look for similar model class or fall back to top model
            benchmark_alternative = self._find_benchmark_alternative(benchmark_model, ranked_models)
            
            if benchmark_alternative:
                return {
                    "model": benchmark_alternative["model"],
                    "score": benchmark_alternative["score"],
                    "reasoning_suffix": f" (chose {benchmark_alternative['model']} as similar alternative to unavailable benchmark {benchmark_model})"
                }
            else:
                top_model, top_score = ranked_models[0]
                return {
                    "model": top_model,
                    "score": top_score,
                    "reasoning_suffix": f" (benchmark {benchmark_model} not available, using top recommendation)"
                }
    
    def _find_cost_effective_alternative(
        self, 
        ranked_models: List[Tuple[str, float]], 
        benchmark_score: float,
        complexity: int
    ) -> Optional[Dict[str, Any]]:
        """Find a cost-effective model with performance similar to benchmark."""
        # Define cost tiers (lower tier = more cost effective)
        cost_tiers = {
            1: ['mini', 'nano', 'flash', 'haiku'],     # Most cost-effective
            2: ['gpt-4o', 'sonnet', 'pro'],           # Medium cost
            3: ['gpt-4', 'opus', 'claude-3']          # Higher cost
        }
        
        performance_threshold = benchmark_score * 0.95  # Within 5% of benchmark
        
        # Look for models in cost-effective tiers with good performance
        for tier in [1, 2]:  # Check cost-effective tiers first
            tier_keywords = cost_tiers[tier]
            
            for model, score in ranked_models:
                if score >= performance_threshold:
                    model_lower = model.lower()
                    if any(keyword in model_lower for keyword in tier_keywords):
                        return {"model": model, "score": score}
        
        return None
    
    def _find_benchmark_alternative(
        self, 
        benchmark_model: str, 
        ranked_models: List[Tuple[str, float]]
    ) -> Optional[Dict[str, Any]]:
        """Find an alternative model similar to the benchmark."""
        benchmark_lower = benchmark_model.lower()
        
        # Model family mappings
        if 'gpt' in benchmark_lower:
            # Look for other OpenAI models
            for model, score in ranked_models:
                if 'gpt' in model.lower():
                    return {"model": model, "score": score}
        elif 'claude' in benchmark_lower or 'sonnet' in benchmark_lower or 'haiku' in benchmark_lower:
            # Look for other Anthropic models
            for model, score in ranked_models:
                model_lower = model.lower()
                if any(keyword in model_lower for keyword in ['claude', 'sonnet', 'haiku', 'opus']):
                    return {"model": model, "score": score}
        elif 'gemini' in benchmark_lower:
            # Look for other Google models
            for model, score in ranked_models:
                if 'gemini' in model.lower():
                    return {"model": model, "score": score}
        
        # No family match found, return None
        return None
    
    def _apply_benchmark_logic_pure(
        self, 
        model_scores: Dict[str, float], 
        ranked_models: List[Tuple[str, float]], 
        benchmark_model: Optional[str]
    ) -> Dict[str, Any]:
        """
        Apply benchmark model logic using PURE neural network scores only.
        No heuristic overrides or complexity adjustments.
        
        Args:
            model_scores: Dictionary of model scores from neural network
            ranked_models: List of (model, score) tuples sorted by neural network score
            benchmark_model: User's benchmark model preference
            
        Returns:
            Dictionary with final recommendation details
        """
        if not benchmark_model:
            # No benchmark specified, use highest scoring model from neural network
            top_model, top_score = ranked_models[0]
            return {
                "model": top_model,
                "score": top_score,
                "reasoning_suffix": " (pure neural network prediction)"
            }
        
        # Check if benchmark model is in available models
        benchmark_score = model_scores.get(benchmark_model)
        
        if benchmark_score is not None:
            # Benchmark is available, use neural network scores only for decision
            top_model, top_score = ranked_models[0]
            
            # Simple threshold-based decision using neural network scores
            score_gap = top_score - benchmark_score
            
            if score_gap <= 0.05:  # 5% neural network score difference
                # Neural scores are very close, prefer benchmark for consistency
                return {
                    "model": benchmark_model,
                    "score": benchmark_score,
                    "reasoning_suffix": f" (chose benchmark {benchmark_model}, neural scores similar)"
                }
            elif score_gap <= 0.15:  # 15% neural network score difference  
                # Moderate difference, still prefer benchmark for user consistency
                return {
                    "model": benchmark_model,
                    "score": benchmark_score,
                    "reasoning_suffix": f" (chose benchmark {benchmark_model} for user consistency)"
                }
            else:
                # Significant neural network score difference, recommend better model
                return {
                    "model": top_model,
                    "score": top_score,
                    "reasoning_suffix": f" (neural network strongly favors {top_model} over benchmark)"
                }
        else:
            # Benchmark model not available, use top neural network recommendation
            top_model, top_score = ranked_models[0]
            return {
                "model": top_model,
                "score": top_score,
                "reasoning_suffix": f" (benchmark {benchmark_model} not available, using neural network top choice)"
            }
    
    def _score_to_tier(self, score: float) -> int:
        """Convert neural network score to complexity tier."""
        if score >= 0.8:
            return 3  # High complexity
        elif score >= 0.6:
            return 2  # Medium complexity
        else:
            return 1  # Low complexity
    
    def _score_to_tier_name(self, score: float) -> str:
        """Convert neural network score to tier name."""
        tier = self._score_to_tier(score)
        tier_names = {1: "simple", 2: "medium", 3: "complex"}
        return tier_names.get(tier, "medium")
    
    async def analyze(
        self,
        text: str,
        system_message: Optional[str] = None,
        candidate_models: Optional[List[str]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze text using two-tower neural collaborative filtering.
        
        This method is required by the BaseAnalyzer interface and used by 
        the analyzer comparison service.
        
        Args:
            text: Text to analyze (prompt)
            system_message: Optional system message
            candidate_models: Optional list of candidate models to consider
            **kwargs: Additional parameters
            
        Returns:
            Dictionary containing analysis results compatible with comparison service
        """
        try:
            # Use candidate_models if provided, otherwise use allowed models
            if candidate_models:
                # Temporarily update allowed models for this analysis
                original_allowed = self.allowed_models.copy() if self.allowed_models else None
                self.allowed_models = candidate_models
                
                try:
                    # Extract benchmark_model from kwargs to avoid duplication
                    benchmark_model = kwargs.pop('benchmark_model', None)
                    result = self.analyze_complexity(
                        prompt=text,
                        system_message=system_message or "",
                        benchmark_model=benchmark_model,
                        **kwargs
                    )
                finally:
                    # Restore original allowed models
                    if original_allowed is not None:
                        self.allowed_models = original_allowed
            else:
                # Extract benchmark_model from kwargs to avoid duplication
                benchmark_model = kwargs.pop('benchmark_model', None)
                result = self.analyze_complexity(
                    prompt=text,
                    system_message=system_message or "",
                    benchmark_model=benchmark_model,
                    **kwargs
                )
            
            # Convert result to format expected by analyzer comparison service
            return {
                "recommended_model": result.get("recommended_model", "unknown"),
                "confidence": float(result.get("confidence", 0.0)),
                "reasoning": result.get("reasoning", "Two-tower neural collaborative filtering recommendation"),
                "complexity_score": result.get("tier", 2),  # Use tier as complexity score
                "metadata": {
                    "analyzer_type": "two_tower_neural",
                    "tier": result.get("tier", 2),
                    "tier_name": result.get("tier_name", "medium"),
                    "ranked_models": result.get("ranked_models", []),
                    "prompt_features_count": 5003,
                    "model_features_count": 16,
                    "embedding_dim": 128
                }
            }
            
        except Exception as e:
            logger.error(f"Two-tower analysis failed: {e}")
            return {
                "recommended_model": "error",
                "confidence": 0.0,
                "reasoning": f"Two-tower analysis failed: {str(e)}",
                "complexity_score": None,
                "metadata": {"error": str(e), "analyzer_type": "two_tower_neural"}
            }
    
    def analyze_complexity(
        self,
        prompt: str,
        system_message: str = "",
        benchmark_model: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze complexity and recommend models using two-tower neural network.
        
        Args:
            prompt: User prompt to analyze
            system_message: System message (if any)
            **kwargs: Additional parameters
            
        Returns:
            Dictionary containing analysis results
        """
        try:
            prompt = self._validate_prompt(prompt)

            # Ensure model is loaded
            if self._model is None:
                self._load_model()

            # Get available models
            available_models = self._filter_available_models()
            
            if not available_models:
                # No models available - this is a configuration error
                raise ValueError("No available models for two-tower analysis. Check allowed_models configuration.")
            
            # PURE NEURAL NETWORK PREDICTION - NO HEURISTICS
            model_scores = self._predict_model_scores_pure(prompt, available_models)
            
            # Rank models by neural network score only
            ranked_models = sorted(model_scores.items(), key=lambda x: x[1], reverse=True)
            
            # Apply benchmark model logic if provided (only override, no heuristics)
            final_recommendation = self._apply_benchmark_logic_pure(
                model_scores, ranked_models, benchmark_model
            )
            
            # Get top recommendation (either from benchmark logic or highest score)
            top_model = final_recommendation["model"]
            top_score = final_recommendation["score"]
            reasoning_suffix = final_recommendation.get("reasoning_suffix", "")
            
            # Map model to provider
            provider_mapping = {
                'gpt': 'openai',
                'sonnet': 'anthropic', 
                'claude': 'anthropic',
                'gemini': 'google'
            }
            
            recommended_provider = 'openai'  # default
            for key, provider in provider_mapping.items():
                if key in top_model.lower():
                    recommended_provider = provider
                    break
            
            # Calculate confidence based on score distribution and score separation
            from app.complexity.analyzer_factory import _calibrate_confidence
            scores = list(model_scores.values())
            if len(scores) > 1:
                sorted_scores = sorted(scores, reverse=True)
                score_gap = sorted_scores[0] - sorted_scores[1]
                raw_confidence = top_score + score_gap
            else:
                raw_confidence = top_score
            confidence = _calibrate_confidence(raw_confidence, "two_tower")
            
            # Compute mean uncertainty from the last prediction pass
            per_model_unc = getattr(self, "_last_uncertainties", {})
            unc_values = list(per_model_unc.values())
            mean_uncertainty = float(np.mean(unc_values)) if unc_values else 0.0

            return {
                "recommended_model": top_model,
                "recommended_provider": recommended_provider,
                "complexity_score": top_score,
                "tier": self._score_to_tier(top_score),  # Infer tier from neural score
                "tier_name": self._score_to_tier_name(top_score),
                "confidence": confidence,
                "selection_method": "pure_two_tower_neural_network",
                "reasoning": f"Neural network analysis selected {top_model} with confidence {confidence:.3f}{reasoning_suffix}",
                "ranked_models": [{"model": model, "score": score} for model, score in ranked_models[:5]],
                "model_type": "pure_two_tower_neural_network",
                "available_models": available_models,
                "model_scores": model_scores,
                "prompt_complexity": self._score_to_tier(top_score),
                "neural_confidence": confidence,
                "uncertainty": mean_uncertainty,
                "per_model_uncertainty": per_model_unc,
            }
            
        except Exception as e:
            logger.error(f"Error in two-tower analysis: {e}")
            raise e
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the two-tower model."""
        return {
            "analyzer_type": "two_tower_neural",
            "description": "Neural collaborative filtering model trained on prompt-model preferences",
            "training_data": "2,667 samples with 8,001 interactions across 11 models",
            "performance": {
                "top_1_accuracy": "52.0%",
                "top_3_accuracy": "97.5%", 
                "top_5_accuracy": "100.0%",
                "score_correlation": "0.478"
            },
            "target_models": self.target_models,
            "device": str(self.device),
            "model_path": self.model_path,
            "encoders_path": self.encoders_path
        }