"""
Custom embedding-based LLM response cache.

This cache uses semantic similarity to retrieve cached responses for similar prompts,
providing a CUDA-free alternative to LMCache.
"""

import hashlib
import json
import logging
import pickle
import fcntl  # For file locking to prevent race conditions
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta
import asyncio
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from app.settings import settings

logger = logging.getLogger(__name__)

# --- Shared Encoder Singleton ---
_shared_encoder = None
_shared_encoder_lock = asyncio.Lock()


def get_shared_encoder_sync() -> SentenceTransformer:
    """
    Lazily initialize and return a shared SentenceTransformer instance (synchronous).
    Safe to call from sync contexts. The first call loads the model.
    """
    global _shared_encoder
    if _shared_encoder is None:
        logger.info("Loading shared SentenceTransformer encoder: all-MiniLM-L6-v2")
        _shared_encoder = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Shared SentenceTransformer encoder loaded successfully")
    return _shared_encoder


async def get_shared_encoder() -> SentenceTransformer:
    """
    Lazily initialize and return a shared SentenceTransformer instance (async).
    Uses a lock to prevent duplicate loading under concurrent access.
    """
    global _shared_encoder
    if _shared_encoder is not None:
        return _shared_encoder
    async with _shared_encoder_lock:
        if _shared_encoder is not None:
            return _shared_encoder
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, get_shared_encoder_sync)
        return _shared_encoder


class EmbeddingCache:
    """Embedding-based cache for LLM responses using semantic similarity."""
    
    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
        similarity_threshold: float = 0.85,
        max_cache_size: int = 1000,
        cache_ttl_hours: int = 24,
        cache_label: str = "default",
    ):
        """
        Initialize the embedding cache.
        
        Args:
            model_name: SentenceTransformer model name for embeddings
            similarity_threshold: Minimum cosine similarity for cache hits
            max_cache_size: Maximum number of cached items
            cache_ttl_hours: Cache time-to-live in hours
        """
        self.model_name = model_name
        self.similarity_threshold = similarity_threshold
        self.max_cache_size = max_cache_size
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
        self.cache_label = cache_label
        
        # Initialize embedding model
        self.encoder = None
        self._model_lock = asyncio.Lock()
        
        # Cache storage
        self.cache_entries: List[Dict[str, Any]] = []
        self.embeddings: Optional[np.ndarray] = None
        
        # Cache file for persistence
        self.cache_file = Path("cache") / "embedding_cache.pkl"
        self.cache_file.parent.mkdir(exist_ok=True)
        
        # Load existing cache
        self._load_cache()
        
        logger.info(f"Initialized EmbeddingCache with model {model_name}, threshold {similarity_threshold}")
    
    async def _ensure_model_loaded(self):
        """Ensure the embedding model is loaded. Uses the shared singleton for the default model."""
        if self.encoder is None:
            async with self._model_lock:
                if self.encoder is None:  # Double-check pattern
                    try:
                        if self.model_name == "all-MiniLM-L6-v2":
                            # Use the shared singleton to avoid loading multiple copies
                            logger.info(f"Using shared encoder for model: {self.model_name}")
                            self.encoder = await get_shared_encoder()
                        else:
                            logger.info(f"Loading embedding model: {self.model_name}")
                            loop = asyncio.get_event_loop()
                            self.encoder = await loop.run_in_executor(
                                None,
                                lambda: SentenceTransformer(self.model_name)
                            )
                        logger.info("Embedding model loaded successfully")
                    except Exception as e:
                        logger.error(f"Failed to load embedding model: {e}")
                        raise
    
    def _create_cache_key(self, prompt: str, model: str, **kwargs) -> str:
        """Create a unique cache key for the request."""
        # Include relevant parameters that affect the response
        cache_data = {
            "prompt": prompt,
            "model": model,
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens"),
            "system_message": kwargs.get("system_message", "")
        }
        
        # Create hash of the cache data
        cache_str = json.dumps(cache_data, sort_keys=True)
        return hashlib.md5(cache_str.encode()).hexdigest()
    
    async def get(
        self, 
        prompt: str, 
        model: str, 
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached response if similar prompt exists.
        
        Args:
            prompt: The input prompt
            model: Model name used
            **kwargs: Additional parameters (temperature, max_tokens, etc.)
            
        Returns:
            Cached response dict if found, None otherwise
        """
        try:
            await self._ensure_model_loaded()
            
            if not self.cache_entries or self.embeddings is None:
                return None
            
            # Clean expired entries
            self._clean_expired()
            
            if not self.cache_entries:
                return None
            
            # Get embedding for the current prompt
            loop = asyncio.get_event_loop()
            prompt_embedding = await loop.run_in_executor(
                None,
                lambda: self.encoder.encode([prompt])
            )
            
            # Calculate similarities with cached embeddings
            similarities = cosine_similarity(prompt_embedding, self.embeddings)[0]
            
            # Find best match above threshold
            best_match_idx = np.argmax(similarities)
            best_similarity = similarities[best_match_idx]
            
            if best_similarity >= self.similarity_threshold:
                cache_entry = self.cache_entries[best_match_idx]
                
                # Check if model matches (exact match required for model)
                if cache_entry["model"] == model:
                    # Update access time and hit count
                    cache_entry["last_accessed"] = datetime.now()
                    cache_entry["hit_count"] = cache_entry.get("hit_count", 0) + 1
                    
                    from app.metrics import CACHE_OPERATIONS_TOTAL
                    CACHE_OPERATIONS_TOTAL.labels(cache_name=self.cache_label, result="hit").inc()
                    logger.info(f"Cache hit for prompt (similarity: {best_similarity:.3f})")

                    # Return cached response
                    return {
                        "response": cache_entry["response"],
                        "cached": True,
                        "similarity": float(best_similarity),
                        "original_prompt": cache_entry["prompt"],
                        "cache_timestamp": cache_entry["timestamp"].isoformat()
                    }
            
            from app.metrics import CACHE_OPERATIONS_TOTAL
            CACHE_OPERATIONS_TOTAL.labels(cache_name=self.cache_label, result="miss").inc()
            logger.debug(f"No cache hit (best similarity: {best_similarity:.3f})")
            return None
            
        except Exception as e:
            logger.error(f"Error retrieving from cache: {e}")
            return None
    
    async def put(
        self, 
        prompt: str, 
        model: str, 
        response: str,
        **kwargs
    ) -> None:
        """
        Store response in cache with embedding.
        
        Args:
            prompt: The input prompt
            model: Model name used
            response: The LLM response to cache
            **kwargs: Additional parameters
        """
        try:
            await self._ensure_model_loaded()
            
            # Check cache size limit
            if len(self.cache_entries) >= self.max_cache_size:
                self._evict_oldest()
            
            # Get embedding for the prompt
            loop = asyncio.get_event_loop()
            prompt_embedding = await loop.run_in_executor(
                None,
                lambda: self.encoder.encode([prompt])
            )
            
            # Create cache entry
            cache_entry = {
                "prompt": prompt,
                "model": model,
                "response": response,
                "timestamp": datetime.now(),
                "last_accessed": datetime.now(),
                "hit_count": 0,
                "cache_key": self._create_cache_key(prompt, model, **kwargs),
                **kwargs  # Store additional parameters
            }
            
            # Add to cache
            self.cache_entries.append(cache_entry)
            
            # Update embeddings array
            if self.embeddings is None:
                self.embeddings = prompt_embedding
            else:
                self.embeddings = np.vstack([self.embeddings, prompt_embedding])
            
            logger.info(f"Cached response for prompt (cache size: {len(self.cache_entries)})")
            
            # Persist cache
            self._save_cache()
            
        except Exception as e:
            logger.error(f"Error storing in cache: {e}")
    
    def _clean_expired(self) -> None:
        """Remove expired cache entries."""
        current_time = datetime.now()
        original_count = len(self.cache_entries)

        # Find non-expired entries
        valid_indices = []
        for i, entry in enumerate(self.cache_entries):
            if current_time - entry["timestamp"] <= self.cache_ttl:
                valid_indices.append(i)

        if len(valid_indices) < original_count:
            removed_count = original_count - len(valid_indices)
            # Remove expired entries
            self.cache_entries = [self.cache_entries[i] for i in valid_indices]

            if self.embeddings is not None and len(valid_indices) > 0:
                self.embeddings = self.embeddings[valid_indices]
            elif len(valid_indices) == 0:
                self.embeddings = None

            logger.info(f"Cleaned {removed_count} expired cache entries")
    
    def _evict_oldest(self) -> None:
        """Evict the oldest cache entry."""
        if not self.cache_entries:
            return
        
        # Find oldest entry by timestamp
        oldest_idx = min(
            range(len(self.cache_entries)), 
            key=lambda i: self.cache_entries[i]["timestamp"]
        )
        
        # Remove oldest entry
        self.cache_entries.pop(oldest_idx)
        
        if self.embeddings is not None:
            self.embeddings = np.delete(self.embeddings, oldest_idx, axis=0)
            if self.embeddings.shape[0] == 0:
                self.embeddings = None
        
        logger.debug("Evicted oldest cache entry")
    
    def _save_cache(self) -> None:
        """Save cache to disk with file locking to prevent race conditions."""
        try:
            cache_data = {
                "entries": self.cache_entries,
                "embeddings": self.embeddings.tolist() if self.embeddings is not None else None,
                "config": {
                    "model_name": self.model_name,
                    "similarity_threshold": self.similarity_threshold,
                    "max_cache_size": self.max_cache_size,
                    "cache_ttl_hours": self.cache_ttl.total_seconds() / 3600
                }
            }

            # Write to temporary file first, then atomic rename
            temp_file = self.cache_file.with_suffix('.tmp')

            with open(temp_file, "wb") as f:
                # Acquire exclusive lock to prevent concurrent writes
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                    pickle.dump(cache_data, f)
                    f.flush()  # Ensure data is written to disk
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)

            # Atomic rename (POSIX guarantees this is atomic)
            temp_file.replace(self.cache_file)
            logger.debug(f"Cache saved successfully ({len(self.cache_entries)} entries)")

        except Exception as e:
            logger.error(f"Error saving cache: {e}")
            # Clean up temp file if it exists
            if 'temp_file' in locals():
                try:
                    temp_file.unlink(missing_ok=True)
                except Exception:
                    pass
    
    def _load_cache(self) -> None:
        """Load cache from disk with file locking to prevent race conditions."""
        try:
            if not self.cache_file.exists():
                return

            with open(self.cache_file, "rb") as f:
                # Acquire shared lock for reading
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_SH)
                    cache_data = pickle.load(f)
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            # Validate config compatibility
            config = cache_data.get("config", {})
            if config.get("model_name") != self.model_name:
                logger.warning("Cache model mismatch, starting fresh")
                return
            
            # Load entries and embeddings
            self.cache_entries = cache_data.get("entries", [])
            embeddings_list = cache_data.get("embeddings")
            
            if embeddings_list:
                self.embeddings = np.array(embeddings_list)
            
            # Clean expired entries
            self._clean_expired()
            
            logger.info(f"Loaded {len(self.cache_entries)} cache entries from disk")
            
        except Exception as e:
            logger.error(f"Error loading cache: {e}")
            # Start fresh on load error
            self.cache_entries = []
            self.embeddings = None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_hits = sum(entry.get("hit_count", 0) for entry in self.cache_entries)
        
        return {
            "total_entries": len(self.cache_entries),
            "total_hits": total_hits,
            "cache_size_mb": self._get_cache_size_mb(),
            "similarity_threshold": self.similarity_threshold,
            "ttl_hours": self.cache_ttl.total_seconds() / 3600,
            "model_name": self.model_name
        }
    
    def _get_cache_size_mb(self) -> float:
        """Estimate cache size in MB."""
        try:
            if self.cache_file.exists():
                return self.cache_file.stat().st_size / (1024 * 1024)
            return 0.0
        except OSError:
            return 0.0
    
    async def clear(self) -> None:
        """Clear all cache entries."""
        self.cache_entries = []
        self.embeddings = None
        
        if self.cache_file.exists():
            self.cache_file.unlink()
        
        logger.info("Cache cleared")


# Global cache instances for different use cases
gemini_analyzer_cache = EmbeddingCache(
    model_name="all-MiniLM-L6-v2",
    similarity_threshold=0.95,  # Very high threshold — only near-identical prompts hit
    max_cache_size=500,
    cache_ttl_hours=48,
    cache_label="analyzer",
)

gemini_clustering_cache = EmbeddingCache(
    model_name="all-MiniLM-L6-v2",
    similarity_threshold=0.85,  # Slightly lower for clustering
    max_cache_size=1000,
    cache_ttl_hours=72,
    cache_label="clustering",
)