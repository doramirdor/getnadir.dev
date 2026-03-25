"""
Factory for creating different complexity analyzers.
Provides a unified interface to switch between Gemini, BERT, and Matrix Factorization analyzers.
"""

from typing import Dict, List, Optional, Any, Union
from enum import Enum
import logging

from app.complexity.gemini_analyzer import GeminiModelRecommender
from app.complexity.bert_analyzer import BERTComplexityAnalyzer
from app.complexity.matrix_factorization_analyzer import MatrixFactorizationAnalyzer
from app.complexity.phi2_analyzer import GemmaModelRecommender

# Import the enhanced BERT analyzer
from app.complexity.enhanced_bert_analyzer import EnhancedBERTComplexityAnalyzer

# Import the hybrid fast analyzer
from app.complexity.hybrid_fast_analyzer import HybridFastAnalyzer

# Import the two-tower neural analyzer
from app.complexity.two_tower_analyzer import TwoTowerModelRecommender

# Import the binary complexity classifier
from app.complexity.binary_classifier import BinaryComplexityClassifier, get_binary_classifier

# Import the heuristic classifier (zero-dependency, <1ms)
from app.complexity.heuristic_classifier import HeuristicClassifier, get_heuristic_classifier

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Confidence calibration — linear rescaling per analyzer type
# TODO: tune from validation set (full Platt scaling deferred to Week 4)
# ---------------------------------------------------------------------------
_CALIBRATION_PARAMS = {
    # (scale, offset) → calibrated = raw * scale + offset, clamped to [0, 1]
    "binary_distilbert": (1.5, -0.1),   # stretch 0.3-0.7 → ~0.35-0.95
    "binary_centroid":   (1.0, 0.0),     # already calibrated via temperature scaling
    "two_tower":         (2.0, -1.0),    # map 0.5-0.95 → 0.0-0.9
    "enhanced_bert":     (1.0, 0.0),     # pass through (already 0-1)
}


def _calibrate_confidence(raw: float, analyzer_type: str) -> float:
    """Apply per-analyzer linear rescaling to map confidence to a consistent [0, 1] scale."""
    scale, offset = _CALIBRATION_PARAMS.get(analyzer_type, (1.0, 0.0))
    return max(0.0, min(1.0, raw * scale + offset))


class AnalyzerType(str, Enum):
    """Available complexity analyzer types."""
    GEMINI = "gemini"
    PHI2 = "phi2"  # Local Gemma-3-270m model (keeping phi2 for backward compatibility)
    GEMMA = "gemma"  # Alias for Gemma-3-270m model
    BERT = "bert"
    ENHANCED_BERT = "enhanced_bert"  # Enhanced BERT with better heuristics
    MATRIX_FACTORIZATION = "matrix_factorization"
    TWO_TOWER = "two_tower"  # Neural collaborative filtering model
    ENSEMBLE = "ensemble"  # Combines multiple analyzers
    HYBRID_FAST = "hybrid_fast"  # Rule-based with ML fallback for sub-500ms
    BINARY = "binary"  # Semantic prototype binary classifier
    HEURISTIC = "heuristic"  # Zero-dependency rule-based classifier (<1ms)
    CONFIDENCE_AWARE = "confidence_aware"  # Binary → two-tower cascade


class ComplexityAnalyzerFactory:
    """
    Factory class for creating and managing different complexity analyzers.
    
    This provides a unified interface to switch between different complexity
    analysis approaches based on configuration or runtime requirements.
    """
    
    @staticmethod
    def create_analyzer(
        analyzer_type: Union[str, AnalyzerType],
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        **kwargs
    ) -> Any:
        """
        Create a complexity analyzer of the specified type.
        
        Args:
            analyzer_type: Type of analyzer to create
            allowed_providers: List of allowed providers
            allowed_models: List of allowed models
            **kwargs: Additional configuration parameters
            
        Returns:
            Configured analyzer instance
            
        Raises:
            ValueError: If analyzer_type is not supported
        """
        if isinstance(analyzer_type, str):
            try:
                analyzer_type = AnalyzerType(analyzer_type.lower())
            except ValueError:
                raise ValueError(f"Unsupported analyzer type: {analyzer_type}")
        
        if analyzer_type == AnalyzerType.GEMINI:
            return ComplexityAnalyzerFactory._create_gemini_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.PHI2:
            return ComplexityAnalyzerFactory._create_phi2_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.GEMMA:
            return ComplexityAnalyzerFactory._create_phi2_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.BERT:
            # Use enhanced BERT by default for better performance
            return ComplexityAnalyzerFactory._create_enhanced_bert_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.ENHANCED_BERT:
            return ComplexityAnalyzerFactory._create_enhanced_bert_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.MATRIX_FACTORIZATION:
            return ComplexityAnalyzerFactory._create_mf_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.TWO_TOWER:
            return ComplexityAnalyzerFactory._create_two_tower_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.ENSEMBLE:
            return ComplexityAnalyzerFactory._create_ensemble_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.HYBRID_FAST:
            return ComplexityAnalyzerFactory._create_hybrid_fast_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.BINARY:
            return ComplexityAnalyzerFactory._create_binary_classifier(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.HEURISTIC:
            return ComplexityAnalyzerFactory._create_heuristic_classifier(
                allowed_providers, allowed_models, **kwargs
            )
        elif analyzer_type == AnalyzerType.CONFIDENCE_AWARE:
            return ComplexityAnalyzerFactory._create_confidence_aware_analyzer(
                allowed_providers, allowed_models, **kwargs
            )
        else:
            raise ValueError(f"Unsupported analyzer type: {analyzer_type}")
    
    @staticmethod
    def _create_gemini_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> GeminiModelRecommender:
        """Create Gemini-based complexity analyzer."""
        return GeminiModelRecommender(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models
        )
    
    @staticmethod
    def _create_phi2_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> GemmaModelRecommender:
        """Create Gemma-3-270m local model analyzer."""
        preload_model = kwargs.get('preload_model', False)
        return GemmaModelRecommender(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            preload_model=preload_model
        )
    
    @staticmethod
    def _create_bert_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> BERTComplexityAnalyzer:
        """Create BERT-based complexity analyzer."""
        model_path = kwargs.get('bert_model_path', 'distilbert-base-uncased')
        num_labels = kwargs.get('bert_num_labels', 3)
        device = kwargs.get('device', 'auto')
        
        return BERTComplexityAnalyzer(
            model_path=model_path,
            num_labels=num_labels,
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            device=device
        )
    
    @staticmethod
    def _create_enhanced_bert_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> EnhancedBERTComplexityAnalyzer:
        """Create enhanced BERT-based complexity analyzer with improved heuristics."""
        device = kwargs.get('device', 'auto')
        
        return EnhancedBERTComplexityAnalyzer(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            device=device
        )
    
    @staticmethod
    def _create_mf_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> MatrixFactorizationAnalyzer:
        """Create Matrix Factorization-based analyzer."""
        model_path = kwargs.get('mf_model_path')
        embedding_model = kwargs.get('embedding_model', 'text-embedding-3-small')
        device = kwargs.get('device', 'auto')
        
        return MatrixFactorizationAnalyzer(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            model_path=model_path,
            embedding_model=embedding_model,
            device=device
        )
    
    @staticmethod
    def _create_two_tower_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> TwoTowerModelRecommender:
        """Create Two-Tower neural collaborative filtering analyzer."""
        from app.settings import settings

        model_path = kwargs.get('two_tower_model_path', settings.TWO_TOWER_MODEL_PATH)
        device = kwargs.get('device', settings.ANALYZER_DEVICE)

        return TwoTowerModelRecommender(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            model_path=model_path if model_path else None,
            device=device
        )
    
    @staticmethod
    def _create_ensemble_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> 'EnsembleComplexityAnalyzer':
        """Create ensemble analyzer that combines multiple approaches."""
        analyzers = kwargs.get('ensemble_analyzers', ['bert', 'matrix_factorization'])
        weights = kwargs.get('ensemble_weights', None)
        
        return EnsembleComplexityAnalyzer(
            analyzer_types=analyzers,
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            weights=weights,
            **kwargs
        )
    
    @staticmethod
    def _create_hybrid_fast_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]], 
        **kwargs
    ) -> HybridFastAnalyzer:
        """Create hybrid fast analyzer with rule-based fast path."""
        return HybridFastAnalyzer(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
            **kwargs
        )
    
    @staticmethod
    def _create_binary_classifier(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> BinaryComplexityClassifier:
        """Create binary semantic prototype classifier."""
        return get_binary_classifier(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
        )

    @staticmethod
    def _create_heuristic_classifier(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs
    ) -> HeuristicClassifier:
        """Create zero-dependency heuristic classifier (<1ms latency)."""
        return get_heuristic_classifier(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
        )

    @staticmethod
    def _create_confidence_aware_analyzer(
        allowed_providers: Optional[List[str]],
        allowed_models: Optional[List[str]],
        **kwargs,
    ):
        """Create confidence-aware cascade analyzer (binary → two-tower)."""
        from app.complexity.confidence_aware_analyzer import ConfidenceAwareAnalyzer
        return ConfidenceAwareAnalyzer(
            allowed_providers=allowed_providers,
            allowed_models=allowed_models,
        )

    @staticmethod
    def get_available_analyzers() -> List[str]:
        """Get list of available analyzer types."""
        return [analyzer.value for analyzer in AnalyzerType]
    
    @staticmethod
    def get_analyzer_info() -> Dict[str, Dict[str, Any]]:
        """Get information about available analyzers."""
        return {
            AnalyzerType.GEMINI.value: {
                "name": "Gemini Complexity Analyzer",
                "description": "Uses Google Gemini for complexity analysis",
                "speed": "slow",
                "accuracy": "high",
                "requires_api": True,
                "cost": "medium"
            },
            AnalyzerType.PHI2.value: {
                "name": "Gemma-3-270m Local Analyzer",
                "description": "Uses Google Gemma-3-270m GGUF running locally for complexity analysis. Same analysis logic as Gemini but uses local model instead of API.",
                "speed": "fast",
                "accuracy": "high",
                "requires_api": False,
                "cost": "very_low"
            },
            AnalyzerType.GEMMA.value: {
                "name": "Gemma-3-270m Local Analyzer",
                "description": "Uses Google Gemma-3-270m GGUF running locally for complexity analysis. Same analysis logic as Gemini but uses local model instead of API.",
                "speed": "fast",
                "accuracy": "high",
                "requires_api": False,
                "cost": "very_low"
            },
            AnalyzerType.BERT.value: {
                "name": "BERT Complexity Analyzer", 
                "description": "Fast BERT-based classification model",
                "speed": "very_fast",
                "accuracy": "medium-high",
                "requires_api": False,
                "cost": "very_low"
            },
            AnalyzerType.ENHANCED_BERT.value: {
                "name": "Enhanced BERT Analyzer",
                "description": "BERT with advanced heuristics for better complexity classification",
                "speed": "very_fast",
                "accuracy": "high",
                "requires_api": False,
                "cost": "very_low"
            },
            AnalyzerType.MATRIX_FACTORIZATION.value: {
                "name": "Matrix Factorization Analyzer",
                "description": "Neural collaborative filtering with embeddings",
                "speed": "fast",
                "accuracy": "high",
                "requires_api": True,  # For embeddings
                "cost": "low"
            },
            AnalyzerType.TWO_TOWER.value: {
                "name": "Two-Tower Neural Analyzer",
                "description": "Production-ready neural collaborative filtering trained on 8,001 interactions across 11 models",
                "speed": "fast",
                "accuracy": "very_high",
                "requires_api": False,
                "cost": "very_low",
                "performance": {
                    "top_1_accuracy": "52.0%",
                    "top_3_accuracy": "97.5%",
                    "top_5_accuracy": "100.0%"
                }
            },
            AnalyzerType.ENSEMBLE.value: {
                "name": "Ensemble Analyzer",
                "description": "Combines multiple analyzers for best accuracy",
                "speed": "medium",
                "accuracy": "very_high", 
                "requires_api": True,
                "cost": "medium"
            },
            AnalyzerType.HYBRID_FAST.value: {
                "name": "Hybrid Fast Analyzer",
                "description": "Rule-based fast path with ML fallback for sub-500ms routing",
                "speed": "ultra_fast",
                "accuracy": "high",
                "requires_api": False,
                "cost": "very_low"
            },
            AnalyzerType.HEURISTIC.value: {
                "name": "Heuristic Rule-Based Classifier",
                "description": "Zero-dependency rule-based classifier using pattern matching and scoring. <1ms latency, no ML models needed. Works out of the box.",
                "speed": "instant",
                "accuracy": "medium",
                "requires_api": False,
                "cost": "zero"
            },
            AnalyzerType.BINARY.value: {
                "name": "Ternary Prototype Classifier",
                "description": "Semantic prototype classifier using sentence embeddings — ternary simple/medium/complex decision with ~12ms latency. 500 seed prototypes loaded from JSON with online learning support.",
                "speed": "very_fast",
                "accuracy": "high",
                "requires_api": False,
                "cost": "very_low"
            }
        }


class EnsembleComplexityAnalyzer:
    """
    Ensemble analyzer that combines multiple complexity analysis approaches.
    
    This analyzer can combine predictions from multiple models to achieve
    better accuracy and robustness.
    """
    
    def __init__(
        self,
        analyzer_types: List[str],
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
        weights: Optional[List[float]] = None,
        **kwargs
    ):
        """
        Initialize ensemble analyzer.
        
        Args:
            analyzer_types: List of analyzer types to ensemble
            allowed_providers: List of allowed providers
            allowed_models: List of allowed models
            weights: Weights for each analyzer (if None, uses equal weights)
            **kwargs: Additional configuration for sub-analyzers
        """
        self.analyzer_types = analyzer_types
        self.allowed_providers = allowed_providers
        self.allowed_models = allowed_models
        
        # Set weights
        if weights is None:
            self.weights = [1.0 / len(analyzer_types)] * len(analyzer_types)
        else:
            if len(weights) != len(analyzer_types):
                raise ValueError("Number of weights must match number of analyzers")
            # Normalize weights
            total_weight = sum(weights)
            self.weights = [w / total_weight for w in weights]
        
        # Create sub-analyzers
        self.analyzers = []
        for analyzer_type in analyzer_types:
            try:
                analyzer = ComplexityAnalyzerFactory.create_analyzer(
                    analyzer_type,
                    allowed_providers=allowed_providers,
                    allowed_models=allowed_models,
                    **kwargs
                )
                self.analyzers.append(analyzer)
                logger.info(f"Created {analyzer_type} analyzer for ensemble")
            except Exception as e:
                logger.error(f"Failed to create {analyzer_type} analyzer: {e}")
                # Mark this weight slot for removal (don't pop mid-iteration)

        # Trim weights to match successfully created analyzers and renormalize
        self.weights = self.weights[:len(self.analyzers)]
        if self.weights:
            total = sum(self.weights)
            if total > 0:
                self.weights = [w / total for w in self.weights]

        if not self.analyzers:
            raise ValueError("No analyzers could be created for ensemble")
        
        logger.info(f"Ensemble created with {len(self.analyzers)} analyzers")
    
    def analyze_complexity(
        self,
        prompt: str,
        system_message: str = "",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze complexity using ensemble of analyzers.
        
        Args:
            prompt: User prompt to analyze
            system_message: System message (if any)
            **kwargs: Additional parameters
            
        Returns:
            Dictionary containing ensemble analysis results
        """
        individual_results = []
        complexity_scores = []
        confidences = []
        
        # Get predictions from each analyzer
        for i, analyzer in enumerate(self.analyzers):
            try:
                result = analyzer.analyze_complexity(
                    prompt=prompt,
                    system_message=system_message,
                    **kwargs
                )
                individual_results.append(result)
                complexity_scores.append(result.get("complexity_score", 0.5))
                confidences.append(result.get("confidence", 0.5))
                
            except Exception as e:
                logger.error(f"Error in analyzer {i}: {e}")
                # Use fallback values
                individual_results.append({
                    "complexity_score": 0.5,
                    "confidence": 0.1,
                    "error": str(e)
                })
                complexity_scores.append(0.5)
                confidences.append(0.1)
        
        # Combine predictions using weighted average for complexity score
        weighted_complexity = sum(
            score * weight for score, weight in zip(complexity_scores, self.weights)
        )
        # Use minimum confidence — routing accuracy is bottlenecked by least-confident component
        weighted_confidence = min(confidences) if confidences else 0.0
        
        # Determine final tier
        if weighted_complexity < 0.3:
            tier = 1
            tier_name = "simple"
        elif weighted_complexity < 0.7:
            tier = 2
            tier_name = "medium"
        else:
            tier = 3
            tier_name = "complex"
        
        # Get model recommendation from best performing analyzer
        best_analyzer_idx = max(range(len(confidences)), key=lambda i: confidences[i])
        best_result = individual_results[best_analyzer_idx]
        
        return {
            "recommended_model": best_result.get("recommended_model", "gpt-3.5-turbo"),
            "recommended_provider": best_result.get("recommended_provider", "openai"),
            "complexity_score": weighted_complexity,
            "tier": tier,
            "tier_name": tier_name,
            "confidence": weighted_confidence,
            "selection_method": "ensemble_analysis",
            "reasoning": f"Ensemble of {len(self.analyzers)} analyzers predicted {tier_name} complexity",
            "ranked_models": best_result.get("ranked_models", []),
            "model_type": "ensemble_analyzer",
            "individual_results": individual_results,
            "ensemble_weights": self.weights,
            "analyzer_types": self.analyzer_types
        }


# Configuration helper
class AnalyzerConfig:
    """Configuration helper for complexity analyzers."""
    
    @staticmethod
    def get_fast_config() -> Dict[str, Any]:
        """Get configuration for fastest analysis."""
        return {
            "analyzer_type": AnalyzerType.BERT,
            "bert_model_path": "distilbert-base-uncased",
            "device": "cpu"
        }
    
    @staticmethod
    def get_accurate_config() -> Dict[str, Any]:
        """Get configuration for most accurate analysis."""
        return {
            "analyzer_type": AnalyzerType.ENSEMBLE,
            "ensemble_analyzers": ["bert", "matrix_factorization"],
            "ensemble_weights": [0.3, 0.7]
        }
    
    @staticmethod
    def get_balanced_config() -> Dict[str, Any]:
        """Get configuration for balanced speed/accuracy."""
        return {
            "analyzer_type": AnalyzerType.MATRIX_FACTORIZATION,
            "embedding_model": "text-embedding-3-small"
        }
    
    @staticmethod
    def get_gemini_fallback_config() -> Dict[str, Any]:
        """Get configuration with Gemini as fallback."""
        return {
            "analyzer_type": AnalyzerType.ENSEMBLE,
            "ensemble_analyzers": ["bert", "gemini"],
            "ensemble_weights": [0.8, 0.2]  # Prefer BERT for speed
        }