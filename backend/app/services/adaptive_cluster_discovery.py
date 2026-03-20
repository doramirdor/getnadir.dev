"""
Adaptive cluster discovery.

Samples recent usage_events prompts, encodes them, runs HDBSCAN to
discover latent clusters, compares against existing clusters, and
writes suggestions to `cluster_suggestions` table.

Designed to run as a daily background task. Never auto-creates clusters —
users accept or reject from the dashboard.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import numpy as np

from app.settings import settings

logger = logging.getLogger(__name__)


class AdaptiveClusterDiscovery:
    """Discovers new cluster patterns from recent traffic."""

    def __init__(self):
        from app.auth.supabase_auth import supabase
        self.supabase = supabase

    async def discover_clusters(
        self,
        user_id: Optional[str] = None,
        lookback_days: int = 7,
        min_cluster_size: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Sample recent prompts, cluster them, compare against existing
        clusters, and return new suggestions.
        """
        from app.services.embedding_cache import get_shared_encoder

        # 1. Fetch recent prompts
        cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
        try:
            query = (
                self.supabase.table("usage_events")
                .select("user_id, prompt, cluster_id")
                .gte("created_at", cutoff)
                .not_.is_("prompt", "null")
                .order("created_at", desc=True)
                .limit(3000)
            )
            if user_id:
                query = query.eq("user_id", user_id)
            response = query.execute()
            events = response.data or []
        except Exception as e:
            logger.error("Error fetching prompts for discovery: %s", e)
            return []

        if len(events) < min_cluster_size * 2:
            logger.info("Not enough prompts (%d) for cluster discovery", len(events))
            return []

        # 2. Focus on unclustered or weakly-clustered prompts
        prompts = [e["prompt"][:500] for e in events if e.get("prompt")]
        user_ids = [e.get("user_id") for e in events if e.get("prompt")]
        if not prompts:
            return []

        # 3. Encode
        encoder = await get_shared_encoder()
        embeddings = encoder.encode(prompts, show_progress_bar=False, batch_size=64)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        embeddings = embeddings / norms

        # 4. Cluster with HDBSCAN (auto-determines cluster count)
        try:
            from sklearn.cluster import HDBSCAN as SklearnHDBSCAN
            clusterer = SklearnHDBSCAN(min_cluster_size=max(min_cluster_size, 2), metric="cosine")
            labels = clusterer.fit_predict(embeddings)
        except ImportError:
            from sklearn.cluster import AgglomerativeClustering
            n = max(2, min(15, int(len(embeddings) ** 0.5 / 2)))
            clusterer = AgglomerativeClustering(n_clusters=n, metric="cosine", linkage="average")
            labels = clusterer.fit_predict(embeddings)

        # 5. Build discovered clusters
        discovered: Dict[int, List[str]] = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue
            discovered.setdefault(label, []).append(prompts[idx])

        if not discovered:
            logger.info("No clusters discovered from traffic")
            return []

        # 6. Load existing cluster centroids for comparison
        existing_centroids = await self._load_existing_centroids(user_id)

        # 7. Filter out clusters that match existing ones
        suggestions: List[Dict[str, Any]] = []
        for label, samples in discovered.items():
            if len(samples) < min_cluster_size:
                continue

            # Compute centroid of discovered cluster
            sample_embs = encoder.encode(samples[:20], show_progress_bar=False)
            centroid = np.mean(sample_embs, axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 0:
                centroid = centroid / norm

            # Check similarity to existing clusters
            is_novel = True
            if existing_centroids is not None and len(existing_centroids) > 0:
                sims = existing_centroids @ centroid
                if np.max(sims) > 0.75:  # Too similar to existing
                    is_novel = False

            if is_novel:
                suggestions.append({
                    "suggested_name": f"Discovered_{label}",
                    "description": f"Auto-discovered cluster with {len(samples)} similar prompts",
                    "sample_prompts": samples[:5],
                    "prompt_count": len(samples),
                    "user_id": user_id or (user_ids[0] if user_ids else None),
                })

        logger.info(
            "Adaptive discovery: %d clusters discovered, %d novel suggestions",
            len(discovered), len(suggestions),
        )
        return suggestions

    async def _load_existing_centroids(self, user_id: Optional[str]) -> Optional[np.ndarray]:
        """Load existing cluster centroids for comparison."""
        try:
            from app.clusters.supabase_clustering import local_clustering_service
            if local_clustering_service._loaded and local_clustering_service.centroids is not None:
                return local_clustering_service.centroids
        except Exception:
            pass
        return None

    async def run_and_save(self, user_id: Optional[str] = None) -> int:
        """Run discovery and save suggestions to database. Returns count of new suggestions."""
        suggestions = await self.discover_clusters(user_id=user_id)
        saved = 0
        for s in suggestions:
            try:
                self.supabase.table("cluster_suggestions").insert({
                    "user_id": s["user_id"],
                    "suggested_name": s["suggested_name"],
                    "description": s["description"],
                    "sample_prompts": s["sample_prompts"],
                    "prompt_count": s["prompt_count"],
                    "status": "pending",
                }).execute()
                saved += 1
            except Exception as e:
                logger.debug("Failed to save cluster suggestion: %s", e)
        if saved:
            logger.info("Saved %d cluster suggestions", saved)
        return saved


# Module-level singleton
_discovery: Optional[AdaptiveClusterDiscovery] = None


def get_cluster_discovery() -> AdaptiveClusterDiscovery:
    global _discovery
    if _discovery is None:
        _discovery = AdaptiveClusterDiscovery()
    return _discovery
