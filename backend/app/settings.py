"""
Settings module for Nadir.
Centralized configuration management for the intelligent LLM routing platform.
"""
import os
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from pydantic import Field, PostgresDsn


# Load environment variables from .env file
# override=False so runtime env vars (e.g. from App Runner) take precedence
ENV_FILE = os.getenv("ENV_FILE", ".env")
load_dotenv(ENV_FILE, override=False)
load_dotenv(".env.local", override=True)  # Local overrides always win (dev only)


class Settings:
    """Application settings using environment variables."""
    
    def __init__(self):
    # API settings
        self.APP_NAME: str = os.getenv("APP_NAME", "Nadir")
        self.APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
        self.DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    
    # Database
        self.DATABASE_URI: str = os.getenv("DATABASE_URI", "")
    
    # Redis for Celery and rate limiting
        self.REDIS_URI: str = os.getenv("REDIS_URI", "")
    
    # Rate limiting
        self.RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
        # Set to the number of app instances (e.g. GCP max_instances) so each
        # instance enforces 1/N of the total limit, giving correct aggregate RPM.
        self.RATE_LIMIT_INSTANCE_DIVISOR: int = int(os.getenv("RATE_LIMIT_INSTANCE_DIVISOR", "1"))
    
    # Supabase Authentication
        self.SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
        self.SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
        self.SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
        self.SUPABASE_PROJECT_ID: str = os.getenv("SUPABASE_PROJECT_ID", "")
    
    # LLM Provider API Keys
        self.OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
        self.ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
        self.GOOGLE_API_KEY: Optional[str] = os.getenv("GOOGLE_API_KEY")
    
    # AWS Bedrock settings
        self.AWS_ACCESS_KEY_ID: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
        self.AWS_SECRET_ACCESS_KEY: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")
        self.AWS_SESSION_TOKEN: Optional[str] = os.getenv("AWS_SESSION_TOKEN")
        self.AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    
    # Google Cloud settings
        self.GCP_PROJECT_ID: Optional[str] = os.getenv("GCP_PROJECT_ID")
        self.GCP_LOCATION: str = os.getenv("GCP_LOCATION", "us-central1")
    
    # Gemini settings
        self.USE_GEMINI_FOR_COMPLEXITY: bool = os.getenv("USE_GEMINI_FOR_COMPLEXITY", "True").lower() in ("true", "1", "t")
        self.USE_GEMINI_FOR_CLUSTERING: bool = os.getenv("USE_GEMINI_FOR_CLUSTERING", "True").lower() in ("true", "1", "t")
        self.GEMINI_TIMEOUT_SECONDS: float = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "5.0"))
    
    # Complexity analyzer settings (fallback if Gemini not used)
        self.COMPLEXITY_ANALYZER_MODEL: str = os.getenv("COMPLEXITY_ANALYZER_MODEL", "gpt-3.5-turbo-0125")
        self.COMPLEXITY_ANALYZER_PROVIDER: str = os.getenv("COMPLEXITY_ANALYZER_PROVIDER", "openai")
        
        # New ML-based complexity analyzer settings
        self.COMPLEXITY_ANALYZER_TYPE: str = os.getenv("COMPLEXITY_ANALYZER_TYPE", "trained")  # trained (default, 96% accuracy), heuristic (zero-dep fallback), binary, two_tower, gemini, bert, matrix_factorization, ensemble
        self.BERT_MODEL_PATH: str = os.getenv("BERT_MODEL_PATH", "distilbert-base-uncased")
        self.MF_MODEL_PATH: str = os.getenv("MF_MODEL_PATH", "")  # Path to pre-trained MF model
        self.TWO_TOWER_MODEL_PATH: str = os.getenv("TWO_TOWER_MODEL_PATH", "")  # Path to pre-trained Two-Tower model
        self.ANALYZER_DEVICE: str = os.getenv("ANALYZER_DEVICE", "auto")  # cpu, cuda, auto
        self.BINARY_CLASSIFIER_CONFIDENCE_THRESHOLD: float = float(os.getenv("BINARY_CLASSIFIER_CONFIDENCE_THRESHOLD", "0.06"))
        self.CLASSIFIER_PROTOTYPES_PATH: Optional[str] = os.getenv("CLASSIFIER_PROTOTYPES_PATH")  # None = use default
        self.CLASSIFIER_CENTROID_REFRESH_HOURS: int = int(os.getenv("CLASSIFIER_CENTROID_REFRESH_HOURS", "6"))
        self.ENSEMBLE_ANALYZERS: str = os.getenv("ENSEMBLE_ANALYZERS", "bert,matrix_factorization")  # Comma-separated list
        self.ENSEMBLE_WEIGHTS: str = os.getenv("ENSEMBLE_WEIGHTS", "0.6,0.4")  # Comma-separated weights
        self.CONFIDENCE_ESCALATION_THRESHOLD: float = float(os.getenv("CONFIDENCE_ESCALATION_THRESHOLD", "0.75"))
    
    # Clustering settings
        self.EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        self.CLUSTER_SIMILARITY_THRESHOLD: float = float(os.getenv("CLUSTER_SIMILARITY_THRESHOLD", "0.75"))
        self.MIN_SAMPLES_FOR_EXPERT_MODEL: int = int(os.getenv("MIN_SAMPLES_FOR_EXPERT_MODEL", "200"))

        # Local embedding clustering settings
        self.USE_LOCAL_CLUSTERING: bool = os.getenv("USE_LOCAL_CLUSTERING", "True").lower() in ("true", "1", "t")
        self.CLUSTERING_SIMILARITY_THRESHOLD: float = float(os.getenv("CLUSTERING_SIMILARITY_THRESHOLD", "0.75"))
    
    # Response healing (auto-fix malformed JSON in structured output)
        self.ENABLE_RESPONSE_HEALING: bool = os.getenv("ENABLE_RESPONSE_HEALING", "True").lower() in ("true", "1", "t")

    # Provider health monitoring
        self.HEALTH_MONITOR_WINDOW_SIZE: int = int(os.getenv("HEALTH_MONITOR_WINDOW_SIZE", "100"))
        self.HEALTH_MONITOR_SNAPSHOT_INTERVAL: int = int(os.getenv("HEALTH_MONITOR_SNAPSHOT_INTERVAL", "300"))

    # Distillation settings
        self.DISTILLATION_ENABLED: bool = os.getenv("DISTILLATION_ENABLED", "True").lower() in ("true", "1", "t")
        self.DISTILLATION_MIN_SAMPLES: int = int(os.getenv("DISTILLATION_MIN_SAMPLES", str(self.MIN_SAMPLES_FOR_EXPERT_MODEL)))
        self.DISTILLATION_BASE_MODEL: str = os.getenv("DISTILLATION_BASE_MODEL", "gpt-4o-mini-2024-07-18")
        self.DISTILLATION_LOCAL_BASE_MODEL: str = os.getenv("DISTILLATION_LOCAL_BASE_MODEL", "microsoft/Phi-3-mini-4k-instruct")
        self.DISTILLATION_QUALITY_THRESHOLD: float = float(os.getenv("DISTILLATION_QUALITY_THRESHOLD", "0.70"))
        self.DISTILLATION_PASS_RATE_THRESHOLD: float = float(os.getenv("DISTILLATION_PASS_RATE_THRESHOLD", "0.80"))
        self.DISTILLATION_AUTO_TRAIN: bool = os.getenv("DISTILLATION_AUTO_TRAIN", "False").lower() in ("true", "1", "t")
        self.DISTILLATION_MONITOR_INTERVAL_MINUTES: int = int(os.getenv("DISTILLATION_MONITOR_INTERVAL_MINUTES", "15"))
        self.DISTILLATION_QUALITY_CHECK_HOURS: int = int(os.getenv("DISTILLATION_QUALITY_CHECK_HOURS", "24"))
        self.DISTILLATION_VALIDATION_SPLIT: float = float(os.getenv("DISTILLATION_VALIDATION_SPLIT", "0.1"))

    # LLM request timeout (seconds)
        self.LLM_REQUEST_TIMEOUT: int = int(os.getenv("LLM_REQUEST_TIMEOUT", "60"))

    # Complexity analysis timeout (seconds) — prevents a hung analyzer from blocking requests
        self.COMPLEXITY_ANALYSIS_TIMEOUT: int = int(os.getenv("COMPLEXITY_ANALYSIS_TIMEOUT", "10"))

    # Background processing settings
        self.USE_ASYNC_TASKS: bool = os.getenv("USE_ASYNC_TASKS", "True").lower() in ("true", "1", "t")
        self.USE_CELERY: bool = os.getenv("USE_CELERY", "False").lower() in ("true", "1", "t")
    
    # LiteLLM routing configuration
        self.LITELLM_MODEL_LIST: Dict = {}
        
        # LiteLLM specific settings
        self.LITELLM_MAX_BUDGET: Optional[float] = float(os.getenv("LITELLM_MAX_BUDGET", "0")) if os.getenv("LITELLM_MAX_BUDGET") else None
        self.LITELLM_CACHE_TYPE: str = os.getenv("LITELLM_CACHE_TYPE", "local")
        self.LITELLM_DROP_PARAMS: bool = os.getenv("LITELLM_DROP_PARAMS", "True").lower() in ("true", "1", "t")
        self.LITELLM_SET_VERBOSE: bool = os.getenv("LITELLM_SET_VERBOSE", str(self.DEBUG)).lower() in ("true", "1", "t")
        
        # Additional provider API keys
        self.XAI_API_KEY: Optional[str] = os.getenv("XAI_API_KEY")
        self.REPLICATE_API_KEY: Optional[str] = os.getenv("REPLICATE_API_KEY")
        self.TOGETHERAI_API_KEY: Optional[str] = os.getenv("TOGETHERAI_API_KEY")
        self.COHERE_API_KEY: Optional[str] = os.getenv("COHERE_API_KEY")
        self.MISTRAL_API_KEY: Optional[str] = os.getenv("MISTRAL_API_KEY")
        self.OPENROUTER_API_KEY: Optional[str] = os.getenv("OPENROUTER_API_KEY")
        self.GROQ_API_KEY: Optional[str] = os.getenv("GROQ_API_KEY")
    
    # Encryption
        self.ENCRYPTION_SECRET: Optional[str] = os.getenv("ENCRYPTION_SECRET")

    # Stripe billing
        self.STRIPE_SECRET_KEY: Optional[str] = os.getenv("STRIPE_SECRET_KEY")
        self.STRIPE_WEBHOOK_SECRET: Optional[str] = os.getenv("STRIPE_WEBHOOK_SECRET")
        self.STRIPE_PRICE_ID_BASE: Optional[str] = os.getenv("STRIPE_PRICE_ID_BASE")  # $9/mo base plan

    # PostHog (server-side capture for events the client can't see, e.g.
    # Stripe Checkout abandonment — Stripe's hosted page is off-domain so
    # the PostHog snippet never fires there).
        self.POSTHOG_API_KEY: Optional[str] = os.getenv("POSTHOG_API_KEY")
        self.POSTHOG_HOST: str = os.getenv("POSTHOG_HOST", "https://us.i.posthog.com")
        self.ADMIN_API_KEY: Optional[str] = os.getenv("ADMIN_API_KEY")  # Admin key for internal endpoints

    # API keys for authentication
        self.API_KEYS: Dict[str, str] = self._parse_api_keys()

        # Beta client settings
        self.BETA_CLIENT_IDS: List[str] = self._parse_beta_client_ids()

        # Validate critical settings
        self._validate_required()
    
    def _validate_required(self):
        """Validate that critical environment variables are set at startup."""
        import logging
        _logger = logging.getLogger(__name__)

        required = {
            "SUPABASE_URL": self.SUPABASE_URL,
            "SUPABASE_SERVICE_KEY": self.SUPABASE_SERVICE_KEY,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            msg = (
                f"Missing required environment variables: {', '.join(missing)}. "
                "The application will start but authentication and database "
                "operations will fail. Set these in your .env file."
            )
            _logger.critical(msg)
            # Raise in production to prevent a broken deploy from accepting traffic
            if not self.DEBUG:
                raise ValueError(msg)

        # Validate at least one LLM provider key is configured
        has_provider_key = any([
            self.OPENAI_API_KEY,
            self.ANTHROPIC_API_KEY,
            self.GOOGLE_API_KEY,
            self.AWS_ACCESS_KEY_ID,  # Bedrock counts as a provider
        ])
        if not has_provider_key:
            msg = (
                "No LLM provider API key configured. At least one of "
                "OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or AWS_ACCESS_KEY_ID is required. "
                "LLM routing requests will fail."
            )
            _logger.critical(msg)
            if not self.DEBUG:
                raise ValueError(msg)

        # Validate encryption secret for provider key storage
        if not self.ENCRYPTION_SECRET:
            msg = (
                "ENCRYPTION_SECRET is not set. Provider API keys cannot be stored securely. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
            _logger.critical(msg)
            if not self.DEBUG:
                raise ValueError(msg)


    def _parse_api_keys(self) -> Dict[str, str]:
        """Parse API_KEYS environment variable into a dictionary."""
        api_keys_str = os.getenv("API_KEYS", "")
        if not api_keys_str:
            return {}
            
        result = {}
        for pair in api_keys_str.split(','):
            if ':' in pair:
                key, value = pair.split(':', 1)
                result[key.strip()] = value.strip()
        return result
    
    def _parse_beta_client_ids(self) -> List[str]:
        """Parse BETA_CLIENT_IDS environment variable into a list."""
        beta_clients_str = os.getenv("BETA_CLIENT_IDS", "")
        if not beta_clients_str:
            return []
            
        # Handle different possible formats
        if beta_clients_str.startswith('[') and beta_clients_str.endswith(']'):
            # Try as JSON, but fall back to simple string parsing
            import json
            try:
                return json.loads(beta_clients_str)
            except Exception:
                # Strip the brackets and split
                beta_clients_str = beta_clients_str.strip('[]')
                
        # Simple comma-split
        return [id.strip() for id in beta_clients_str.split(',') if id.strip()]


# Create global settings instance
settings = Settings() 