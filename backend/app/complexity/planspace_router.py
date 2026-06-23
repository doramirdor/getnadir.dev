"""Planspace router -- FLIGHTPLAN Stage A (design doc: docs/ROUTER_V3_DESIGN.md).

Routes in plan space: enumerate the plan grid (Stage A: menu models; the effort
knob is scaffolded but disabled until the offline effort sweep trains delta
heads), score each plan with calibrated per-model P(correct) heads, predict
each plan's cost with per-model quantile regressors, and dispatch the cheapest
plan clearing a Mondrian conformal floor -- failing UP to the benchmark model
when nothing clears (never fail-down).

``select_plan`` is the pure decision rule. The offline trainer
(eval/planspace/train_planspace.py) and the eval harness import it from here
so the calibrated object is the exact composed decision rule that runs in
production -- never a reimplementation.

This module must stay importable with the standard library only (no torch, no
sklearn at import time); heavy deps load lazily inside methods.

Artifact contract: backend/app/complexity/artifacts/planspace_artifact.pkl
(schema version "planspace_v1").
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import threading

logger = logging.getLogger(__name__)

__all__ = [
    "select_plan",
    "load_artifact",
    "PlanspaceRouter",
    "PlanspaceAnalyzer",
    "get_planspace_router",
    "get_planspace_analyzer",
]

_DEFAULT_ARTIFACT = os.environ.get(
    "PLANSPACE_ARTIFACT",
    os.path.join(os.path.dirname(__file__), "artifacts", "planspace_artifact.pkl"),
)


def select_plan(plan_ids, q_scores, costs, tau, dead_band=0.03,
                session_plan=None, benchmark_plan=None):
    """plan_ids: list of hashable plan identifiers; q_scores, costs: aligned float lists.
    feasible = q >= tau + (dead_band if session_plan is not None and pid != session_plan else 0).
    Return (chosen_plan_id, fail_up: bool): cheapest feasible plan (ties -> higher q);
    if none feasible -> (benchmark_plan, True) when given, else (argmax q, True)."""
    n = len(plan_ids)
    if not (len(q_scores) == n and len(costs) == n):
        raise ValueError("plan_ids, q_scores and costs must be aligned")

    best_i = None
    for i in range(n):
        margin = dead_band if (session_plan is not None
                               and plan_ids[i] != session_plan) else 0.0
        if q_scores[i] < tau + margin:
            continue
        if best_i is None or (costs[i], -q_scores[i]) < (costs[best_i], -q_scores[best_i]):
            best_i = i
    if best_i is not None:
        return plan_ids[best_i], False

    # No plan clears the floor: fail UP, never fail-down (design doc section 3.7).
    if benchmark_plan is not None:
        return benchmark_plan, True
    if n == 0:
        raise ValueError("no plans and no benchmark_plan to fail up to")
    best_i = max(range(n), key=lambda i: q_scores[i])
    return plan_ids[best_i], True


def load_artifact(path):
    """Lazily unpickle a planspace artifact (requires sklearn at call time)."""
    import pickle

    with open(path, "rb") as fh:
        artifact = pickle.load(fh)
    version = artifact.get("version")
    if version != "planspace_v1":
        raise ValueError(f"unsupported planspace artifact version: {version!r}")
    return artifact


def _structural_extractor():
    """StructuralFeatureExtractor without triggering the backend package
    __init__ (so this module also works from the offline eval venv)."""
    try:
        from .structural_features import StructuralFeatureExtractor  # type: ignore
    except Exception:  # noqa: BLE001 -- standalone import (eval venv, tests)
        import importlib.util
        sf_path = os.path.join(os.path.dirname(__file__), "structural_features.py")
        spec = importlib.util.spec_from_file_location("planspace_structural_features", sf_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        StructuralFeatureExtractor = mod.StructuralFeatureExtractor
    return StructuralFeatureExtractor()


class PlanDecision:
    """Outcome of one plan-space routing decision (plain object, no deps)."""

    __slots__ = ("model", "q", "tau", "cluster_id", "fail_up", "plans",
                 "cost_p50", "cost_p90", "reason", "fallback")

    def __init__(self, model, q, tau, cluster_id, fail_up, plans,
                 cost_p50, cost_p90, reason, fallback=False):
        self.model = model
        self.q = q
        self.tau = tau
        self.cluster_id = cluster_id
        self.fail_up = fail_up
        self.plans = plans          # [{"model", "q", "cost_p50", "cost_p90"}]
        self.cost_p50 = cost_p50
        self.cost_p90 = cost_p90
        self.reason = reason
        self.fallback = fallback


class PlanspaceRouter:
    """FLIGHTPLAN Stage A router. Thread-safe after construction (read-only)."""

    def __init__(self, artifact_path: str = _DEFAULT_ARTIFACT):
        self._artifact = None
        self._heads = {}
        self._cost_models = {}
        self._model_meta = {}
        self._menu = []
        self._centroids = None       # np.ndarray (k, 384) on normalized embeddings
        self._conformal = {}
        self._dead_band = 0.03
        self._benchmark = None
        self._knobs = {}
        self._embedder = None
        self._embedder_lock = threading.Lock()
        self._embedder_name = "sentence-transformers/all-MiniLM-L6-v2"
        self._normalize = True
        self._struct = _structural_extractor()
        self._load(artifact_path)

    # -- loading -------------------------------------------------------------
    def _load(self, path: str) -> None:
        try:
            art = load_artifact(path)
        except Exception as e:  # noqa: BLE001
            logger.warning("PlanspaceRouter: artifact unavailable (%s); heuristic fallback only.", e)
            return
        art_skl = art.get("sklearn_version")
        if art_skl:
            try:
                import sklearn
                if sklearn.__version__ != art_skl:
                    logger.warning(
                        "PlanspaceRouter: artifact trained with sklearn %s but runtime has %s; "
                        "pickled estimators may misbehave. Pin scikit-learn==%s.",
                        art_skl, sklearn.__version__, art_skl)
            except Exception:  # noqa: BLE001
                pass
        self._artifact = art
        self._heads = art["per_model_heads"]
        self._cost_models = art["cost_models"]
        self._model_meta = art["model_meta"]
        self._menu = list(art["models"])
        self._centroids = art["clusters"]["kmeans_centroids"]
        self._conformal = art["conformal"]
        self._dead_band = float(art.get("dead_band", 0.03))
        self._benchmark = art["benchmark_model"]
        self._knobs = art.get("knobs", {})
        self._embedder_name = art.get("embedder", self._embedder_name)
        self._normalize = bool(art.get("normalize_embeddings", True))

    def _get_embedder(self):
        if self._embedder is not None:
            return self._embedder
        with self._embedder_lock:
            if self._embedder is not None:   # double-checked under the lock
                return self._embedder
            try:
                from sentence_transformers import SentenceTransformer
                self._embedder = SentenceTransformer(self._embedder_name)
            except Exception as e:  # noqa: BLE001
                logger.error("PlanspaceRouter: embedder unavailable (%s); heuristic fallback.", e)
                self._embedder = False
        return self._embedder

    def warm(self) -> bool:
        """Eagerly load the embedder (call from the app startup hook)."""
        return self._get_embedder() is not False

    @property
    def ready(self) -> bool:
        return bool(self._heads)

    # -- features ------------------------------------------------------------
    def _features(self, text: str, messages=None, system_message: str = ""):
        import numpy as np

        embedder = self._get_embedder()
        if embedder is False:
            return None
        # Training embedded the bare prompt text (arena cache); match it.
        emb = embedder.encode([text], normalize_embeddings=False)[0].astype(np.float32)
        if self._normalize:
            n = float(np.linalg.norm(emb))
            if n > 0:
                emb = emb / n
        msgs = messages or [{"role": "user", "content": text}]
        struct = np.nan_to_num(np.asarray(
            self._struct.extract_vector(msgs, system_message or ""), dtype=np.float32))
        return emb, np.concatenate([emb, struct]).astype(np.float32)

    def _cluster_and_tau(self, emb):
        import numpy as np

        cid = -1
        if self._centroids is not None and len(self._centroids):
            d = np.linalg.norm(self._centroids - emb[None, :], axis=1)
            cid = int(np.argmin(d))
        conf = self._conformal
        global_tau = float(conf.get("global_tau", 0.8))
        entry = (conf.get("cluster_taus") or {}).get(cid)
        if entry is None:
            return cid, global_tau + float(conf.get("buffer_small", 0.02))
        # Trainer stores inherited (global+buffer) taus for thin clusters already.
        return cid, float(entry["tau"])

    # -- routing ---------------------------------------------------------------
    def route(self, prompt: str, system_message: str = "", messages=None,
              session_plan=None, alpha_tau_override=None) -> PlanDecision:
        if not self.ready:
            return self._heuristic("no trained artifact")
        feats = self._features(prompt, messages, system_message)
        if feats is None:
            return self._heuristic("embedder unavailable")
        import numpy as np

        emb, x = feats
        X = x.reshape(1, -1)
        cid, tau = self._cluster_and_tau(emb)
        if alpha_tau_override is not None:
            tau = float(alpha_tau_override)

        plans = []
        for m in self._menu:
            head = self._heads[m]
            raw = head["scorer"].predict_proba(X)[:, 1]
            cal = head.get("calibrator")
            q = float(cal.predict(raw)[0]) if cal is not None else float(raw[0])
            q = min(max(q, 0.0), 1.0)
            cm = self._cost_models[m]
            # Rank plans by predicted p50 call cost -- the conformal floor was
            # calibrated on the composed rule under p50 ordering (trainer);
            # p90 is surfaced for tail-spend visibility, not ranking.
            c50 = max(float(cm["p50"].predict(X)[0]), 0.0)
            c90 = max(float(cm["p90"].predict(X)[0]), c50)
            plans.append({"model": m, "q": q, "cost_p50": c50, "cost_p90": c90})

        chosen, fail_up = select_plan(
            [p["model"] for p in plans],
            [p["q"] for p in plans],
            [p["cost_p50"] for p in plans],
            tau, dead_band=self._dead_band,
            session_plan=session_plan, benchmark_plan=self._benchmark)
        rec = next(p for p in plans if p["model"] == chosen)
        reason = (f"fail-up to benchmark {chosen}: no plan cleared floor {tau:.2f}"
                  if fail_up else
                  f"cheapest plan clearing conformal floor {tau:.2f} (cluster {cid})")
        return PlanDecision(model=chosen, q=rec["q"], tau=tau, cluster_id=cid,
                            fail_up=fail_up, plans=plans, cost_p50=rec["cost_p50"],
                            cost_p90=rec["cost_p90"], reason=reason)

    def _heuristic(self, why: str) -> PlanDecision:
        """No artifact/embedder: mid-priced menu model (never silently the most
        expensive -- that would turn the cost saver into a cost maximizer)."""
        logger.error("PlanspaceRouter: heuristic fallback (%s); check artifact path.", why)
        menu = self._menu or ["claude-sonnet-4-6"]
        meta = self._model_meta or {}
        ranked = sorted(menu, key=lambda m: meta.get(m, {}).get("input_price", float("inf")))
        m = ranked[len(ranked) // 2]
        return PlanDecision(model=m, q=float("nan"), tau=float("nan"), cluster_id=-1,
                            fail_up=False, plans=[], cost_p50=float("nan"),
                            cost_p90=float("nan"),
                            reason=f"heuristic fallback ({why})", fallback=True)


_singleton = None
_singleton_lock = threading.Lock()


def get_planspace_router(artifact_path: str = _DEFAULT_ARTIFACT) -> PlanspaceRouter:
    """Process-wide singleton (lazy, thread-safe)."""
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = PlanspaceRouter(artifact_path)
    return _singleton


# ---------------------------------------------------------------------------
# Analyzer adapter: conforms to the ComplexityAnalyzerFactory contract
# (async analyze(text, system_message) -> dict with recommended_model etc.)
# so the router is selectable via COMPLEXITY_ANALYZER_TYPE=planspace.
# ---------------------------------------------------------------------------
class PlanspaceAnalyzer:
    """Drop-in analyzer wrapping PlanspaceRouter. Picks a concrete model (a
    plan) directly; the tier fields are derived for observability only and
    MUST NOT be remapped back to a model (see production_completion.py
    plan-space short-circuit)."""

    ANALYZER_VERSION = "planspace"

    def __init__(self, artifact_path: str = _DEFAULT_ARTIFACT):
        self.router = get_planspace_router(artifact_path)

    async def analyze(self, text: str = "", system_message: str = "", **kwargs) -> dict:
        import time
        start = time.perf_counter()
        decision = await asyncio.to_thread(
            self.router.route, text or system_message, system_message,
            kwargs.get("messages"), kwargs.get("session_plan"))
        latency_ms = (time.perf_counter() - start) * 1000.0

        meta = self.router._model_meta
        order = sorted(self.router._menu or [decision.model],
                       key=lambda m: meta.get(m, {}).get("input_price", float("inf")))
        pos = next((i for i, m in enumerate(order) if m == decision.model), 0)
        tier_idx = min(2, pos * 3 // max(1, len(order)))   # 0..2
        tier_name = ("simple", "medium", "complex")[tier_idx]
        cheapest_q = decision.plans[0]["q"] if decision.plans else float("nan")
        complexity_score = (1.0 - cheapest_q) if math.isfinite(cheapest_q) else 0.5
        confidence = decision.q if math.isfinite(decision.q) else 0.5

        plan_table = sorted(decision.plans, key=lambda p: p["cost_p50"])[:8]
        return {
            "recommended_model": decision.model,
            "confidence": confidence,
            "complexity_score": min(max(complexity_score, 0.0), 1.0),
            # 1-based to match every other analyzer (tier=0 is falsy in consumers)
            "tier": tier_idx + 1,
            "tier_name": tier_name,
            "complexity_tier": tier_idx + 1,
            "complexity_name": tier_name,
            "reasoning": (
                f"plan {decision.model}: P(good)={decision.q:.2f} vs floor "
                f"{decision.tau:.2f}; est cost ${decision.cost_p50:.5f} "
                f"(p90 ${decision.cost_p90:.5f}); {len(decision.plans)} plans, "
                f"fail_up={decision.fail_up}"
            ) if not decision.fallback else decision.reason,
            "analyzer_latency_ms": latency_ms,
            "analyzer_type": self.ANALYZER_VERSION,
            "selection_method": "planspace_router",
            "model_type": "planspace_router",
            "routing_fallback": decision.fallback,
            "full_analysis": {
                "plan": {
                    "model": decision.model,
                    "q": decision.q,
                    "tau": decision.tau,
                    "cluster_id": decision.cluster_id,
                    "fail_up": decision.fail_up,
                    "cost_p50": decision.cost_p50,
                    "cost_p90": decision.cost_p90,
                },
                "plan_table": plan_table,
                "propensity": 1.0,   # no exploration in Stage A
                "knobs": {"effort": "off"},
            },
        }


def get_planspace_analyzer(artifact_path: str = _DEFAULT_ARTIFACT) -> PlanspaceAnalyzer:
    return PlanspaceAnalyzer(artifact_path)
