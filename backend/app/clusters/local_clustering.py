"""
Local embedding-based clustering service.

Uses the shared SentenceTransformer encoder to classify prompts into clusters
via cosine similarity against precomputed cluster centroids.
Target: <15ms classification after model warm-up.
"""

import asyncio
import logging
import time
from typing import Dict, List, Any, Optional, Tuple

import numpy as np

from app.services.embedding_cache import get_shared_encoder
from app.settings import settings

logger = logging.getLogger(__name__)


class LocalEmbeddingClusteringService:
    """Fast local clustering using precomputed embedding centroids."""

    def __init__(self, supabase_db=None):
        """
        Initialize the local clustering service.

        Args:
            supabase_db: Reference to the Supabase database helper.
                         If None, it will be imported lazily.
        """
        self.db = supabase_db
        # Centroid matrix: shape (num_clusters, embedding_dim)
        self.centroids: Optional[np.ndarray] = None
        # Ordered list of cluster IDs matching centroid rows
        self.cluster_ids: List[str] = []
        self._loaded = False
        self._lock = asyncio.Lock()

    async def load_clusters(self) -> None:
        """
        Load all clusters from Supabase, embed their descriptions and examples
        using the shared encoder, and compute a centroid per cluster.
        """
        try:
            # Lazy-import db if not provided at init time
            if self.db is None:
                from app.database.supabase_db import supabase_db
                self.db = supabase_db

            encoder = await get_shared_encoder()

            clusters = await self.db.get_all_clusters()
            if not clusters:
                logger.warning("No clusters found in Supabase for local clustering")
                self._loaded = True
                return

            cluster_ids: List[str] = []
            centroid_list: List[np.ndarray] = []

            for cluster in clusters:
                cluster_id = cluster.get("id") or cluster.get("cluster_id") or cluster.get("name")
                if not cluster_id:
                    continue

                # Gather text snippets to embed: description + examples
                texts: List[str] = []
                description = cluster.get("description", "")
                if description:
                    texts.append(description)

                examples = cluster.get("examples", [])
                if examples:
                    texts.extend(examples[:10])  # Limit to avoid excessive encoding

                if not texts:
                    continue

                # Encode all texts for this cluster and average into a centroid
                embeddings = encoder.encode(texts, show_progress_bar=False)
                centroid = np.mean(embeddings, axis=0)
                # Normalize centroid to unit length for fast cosine similarity via dot product
                norm = np.linalg.norm(centroid)
                if norm > 0:
                    centroid = centroid / norm

                cluster_ids.append(cluster_id)
                centroid_list.append(centroid)

            if centroid_list:
                self.centroids = np.vstack(centroid_list).astype(np.float32)
                self.cluster_ids = cluster_ids
                logger.info(
                    f"Local clustering loaded {len(cluster_ids)} cluster centroids "
                    f"(embedding dim={self.centroids.shape[1]})"
                )
            else:
                self.centroids = None
                self.cluster_ids = []
                logger.warning("No valid cluster centroids could be computed")

            self._loaded = True

        except Exception as e:
            logger.error(f"Error loading clusters for local clustering: {e}")
            self._loaded = False
            raise

    async def reload_clusters(self) -> None:
        """Reload cluster centroids from the database (e.g. after warmup or new cluster creation).

        Uses atomic swap: builds new centroids in a temporary instance, then
        swaps fields under a lock so concurrent classify() calls never see
        a partially-cleared state.
        """
        async with self._lock:
            tmp = LocalEmbeddingClusteringService(supabase_db=self.db)
            await tmp.load_clusters()
            self.centroids = tmp.centroids
            self.cluster_ids = tmp.cluster_ids
            self._loaded = tmp._loaded

    async def classify(
        self, prompt: str, user_id: Optional[str] = None
    ) -> Tuple[Optional[str], float]:
        """
        Classify a prompt by cosine similarity against cluster centroids.

        Args:
            prompt: The user prompt to classify.
            user_id: Optional user ID (reserved for future per-user clusters).

        Returns:
            Tuple of (best_cluster_id, confidence). Returns (None, 0.0) if
            no cluster exceeds the similarity threshold or centroids are not loaded.
        """
        # Snapshot state into locals to avoid TOCTOU race with reload_clusters
        loaded = self._loaded
        centroids = self.centroids
        cluster_ids = self.cluster_ids

        if not loaded or centroids is None or len(cluster_ids) == 0:
            return (None, 0.0)

        try:
            start = time.perf_counter()

            encoder = await get_shared_encoder()

            # Encode prompt (single string)
            prompt_embedding = encoder.encode([prompt], show_progress_bar=False)[0]
            # Normalize for dot-product cosine similarity
            norm = np.linalg.norm(prompt_embedding)
            if norm > 0:
                prompt_embedding = prompt_embedding / norm

            # Cosine similarity via dot product (centroids are already normalized)
            similarities = centroids @ prompt_embedding  # shape: (num_clusters,)

            best_idx = int(np.argmax(similarities))
            best_score = float(similarities[best_idx])

            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.debug(
                f"Local clustering classified in {elapsed_ms:.1f}ms "
                f"(best={cluster_ids[best_idx]}, score={best_score:.3f})"
            )

            threshold = settings.CLUSTERING_SIMILARITY_THRESHOLD
            if best_score >= threshold:
                return (cluster_ids[best_idx], best_score)

            return (None, 0.0)

        except Exception as e:
            logger.error(f"Error in local embedding classification: {e}")
            return (None, 0.0)
