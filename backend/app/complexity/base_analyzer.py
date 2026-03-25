"""
Base analyzer class for text analysis.
"""
import logging
from typing import Any, Dict, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)

MAX_PROMPT_LENGTH = 50_000

@runtime_checkable
class AnalyzerProtocol(Protocol):
    """Protocol defining the analyzer interface."""

    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        """Analyze text and return results."""
        ...

class BaseAnalyzer:
    """Base class for text analyzers."""

    def __init__(self, model_name: str, api_key: Optional[str] = None):
        """
        Initialize the analyzer.

        Args:
            model_name: Name of the model to use
            api_key: Optional API key for the service
        """
        self.model_name = model_name
        self.api_key = api_key

    @staticmethod
    def _validate_prompt(prompt: str) -> str:
        """Validate and sanitize a prompt before analysis.

        Args:
            prompt: Raw prompt string.

        Returns:
            Stripped (and possibly truncated) prompt.

        Raises:
            ValueError: If prompt is None or empty after stripping.
        """
        if prompt is None:
            raise ValueError("Prompt must not be None")
        prompt = prompt.strip()
        if not prompt:
            raise ValueError("Prompt must not be empty")
        if len(prompt) > MAX_PROMPT_LENGTH:
            logger.warning(
                "Prompt truncated from %d to %d characters",
                len(prompt),
                MAX_PROMPT_LENGTH,
            )
            prompt = prompt[:MAX_PROMPT_LENGTH]
        return prompt

    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        """
        Analyze text and return results.

        Args:
            text: Text to analyze
            **kwargs: Additional parameters for the analysis

        Returns:
            Dictionary containing analysis results
        """
        raise NotImplementedError("Subclasses must implement analyze method")