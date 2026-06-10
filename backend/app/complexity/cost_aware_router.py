"""
cost_aware_router.py - Model-generic, calibrated, cost-aware LLM router.

This is a NEW router (not the tier classifier, not a rule base). It predicts,
per candidate model, the probability that model answers the prompt correctly,
then routes to the CHEAPEST model whose calibrated P(correct) clears an
operating-point threshold tau (falling back to the most-likely-correct model).

Why it is "generic to the model": the scorer is INDUCTIVE. It consumes
[prompt_embedding , model_feature_vector] where the model features are just
price descriptors + a reasoning flag. Adding or removing a model in the pool
needs only that model's feature row, NO retraining. Pass any pool of models to
route(); models the scorer never trained on are still scored from their
features.

Operating point (single knob):
  mode="benchmark"  -> tau_benchmark : route grok-dominant, maximize arena score
  mode="prod"       -> tau_prod       : route down more aggressively, save cost

Empirical basis: eval/routerarena/nadirroute/ (train_router.py + RESULTS.md).
On RouterArena's 3-model menu the inductive router does real routing (routes
~25-40% of traffic to cheaper models) while scoring above the leaderboard #1,
and it improves on our current cascade. It does not beat the theoretical
always-best-single-model on the arena metric (no honest router can, the metric
is cost-saturated), but among deployable routers it is the frontier and it is
the configuration that both serves prod and lifts the benchmark.

The module degrades gracefully: if the trained artifact or the embedder is not
available it falls back to a transparent price/typed heuristic so callers never
crash.
"""
from __future__ import annotations

import asyncio
import os
import math
import pickle
import logging
import threading
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

_HERE = os.path.dirname(os.path.abspath(__file__))
# Primary: artifact shipped inside the backend package (present in the Docker
# image). Fallback: the eval workspace path (dev checkouts).
_ARTIFACT_CANDIDATES = (
    os.environ.get("COST_AWARE_ROUTER_ARTIFACT"),
    os.path.join(_HERE, "artifacts", "router_artifact.pkl"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_HERE))),
                 "eval", "routerarena", "nadirroute", "router_artifact.pkl"),
)
_DEFAULT_ARTIFACT = next((p for p in _ARTIFACT_CANDIDATES if p and os.path.exists(p)),
                         os.path.join(_HERE, "artifacts", "router_artifact.pkl"))
# Keep in lockstep with train_router.model_feat's reasoning-token list.
_REASONING_TOKENS = ("reason", "-r1", "think")


@dataclass
class ModelSpec:
    """A candidate model in the routable pool. Prices are USD per million tokens."""
    name: str
    input_price: float
    output_price: float
    is_reasoning: Optional[bool] = None  # inferred from name when None

    def reasoning_flag(self) -> float:
        if self.is_reasoning is not None:
            return 1.0 if self.is_reasoning else 0.0
        return 1.0 if any(t in self.name.lower() for t in _REASONING_TOKENS) else 0.0

    def features(self) -> np.ndarray:
        """MUST match train_router.model_feat: [log10 in, log10 out, log10 blended, reasoning].
        Non-finite or zero prices fall back to a small floor so a model with an
        unknown price is still scorable (mirrors the trainer's median backfill)."""
        inp = self.input_price if (self.input_price and math.isfinite(self.input_price) and self.input_price > 0) else 0.2
        outp = self.output_price if (self.output_price and math.isfinite(self.output_price) and self.output_price > 0) else 0.2
        blended = (inp + outp) / 2.0
        return np.array(
            [math.log10(inp + 1e-6), math.log10(outp + 1e-6),
             math.log10(blended + 1e-6), self.reasoning_flag()],
            dtype=np.float32,
        )

    def price_known(self) -> bool:
        return bool(self.input_price and math.isfinite(self.input_price) and self.input_price > 0
                    and self.output_price and math.isfinite(self.output_price) and self.output_price > 0)

    def blended_price(self) -> float:
        inp = self.input_price if (self.input_price and math.isfinite(self.input_price) and self.input_price > 0) else 0.2
        outp = self.output_price if (self.output_price and math.isfinite(self.output_price) and self.output_price > 0) else 0.2
        return (inp + outp) / 2.0

    def sort_price(self) -> tuple:
        """Cheapest-first sort key. Models with UNKNOWN prices sort last so they
        can never win the cheapest-clearing-tau scan on a fabricated floor price.
        When PR #13's compression_policy is available, the EFFECTIVE cost
        (cache-read discounts, compression factor, 3:1 input weighting) replaces
        the list-price blend, so "cheapest" reflects what a request really costs."""
        eff = _effective_price(self)
        price = eff if eff is not None else self.blended_price()
        return (0, price) if self.price_known() else (1, price)


def _effective_price(spec: "ModelSpec") -> Optional[float]:
    """Effective $/Mtok via app.services.compression_policy (PR #13). Optional:
    returns None when the module is absent or errors, callers fall back to the
    list-price blend. Import is cached after first success/failure."""
    global _COMPRESSION_POLICY
    if _COMPRESSION_POLICY is None:
        try:
            from app.services import compression_policy as _cp
            _COMPRESSION_POLICY = _cp
        except Exception:  # noqa: BLE001
            _COMPRESSION_POLICY = False
    if not _COMPRESSION_POLICY:
        return None
    try:
        fn = getattr(_COMPRESSION_POLICY, "effective_cost_per_million", None)
        if fn is None:
            return None
        mode = os.environ.get("COST_AWARE_OPTIMIZE_MODE", "off")
        val = fn(spec.name, optimize_mode=mode)
        return float(val) if val is not None and math.isfinite(float(val)) else None
    except Exception:  # noqa: BLE001
        return None


_COMPRESSION_POLICY = None  # None=untried, False=unavailable, module=loaded


@dataclass
class RoutingDecision:
    model: str
    p_correct: float
    scores: dict = field(default_factory=dict)   # model name -> calibrated P(correct)
    tau: float = 0.0
    reason: str = ""
    fallback: bool = False


class CostAwareRouter:
    """Model-generic cost-aware router. Thread-safe after construction (read-only)."""

    def __init__(self, artifact_path: str = _DEFAULT_ARTIFACT, mode: str = "prod"):
        if mode not in ("prod", "benchmark"):
            raise ValueError(f"CostAwareRouter: unknown mode {mode!r} (use 'prod' or 'benchmark')")
        self.mode = mode
        self._artifact = None
        self._heads = {}            # model name -> {"scorer","calibrator"} (primary)
        self._scorer = None         # inductive scorer (zero-shot fallback)
        self._calibrator = None
        self._embedder = None
        self._embedder_lock = threading.Lock()
        self._embedder_name = "sentence-transformers/all-MiniLM-L6-v2"
        self.tau = 0.7
        self.beta = 0.1
        self.default_pool: list[ModelSpec] = []
        self._load_artifact(artifact_path)

    # -- loading -----------------------------------------------------------
    def _load_artifact(self, path: str) -> None:
        try:
            with open(path, "rb") as f:
                art = pickle.load(f)
        except Exception as e:  # noqa: BLE001
            logger.warning("CostAwareRouter: artifact unavailable (%s); heuristic fallback only.", e)
            return
        self._artifact = art
        art_skl = art.get("sklearn_version")
        if art_skl:
            try:
                import sklearn
                if sklearn.__version__ != art_skl:
                    logger.warning(
                        "CostAwareRouter: artifact trained with sklearn %s but runtime has %s; "
                        "pickled estimators may misbehave. Pin scikit-learn==%s.",
                        art_skl, sklearn.__version__, art_skl)
            except Exception:  # noqa: BLE001
                pass
        self._heads = art.get("per_model_heads", {}) or {}
        # inductive scorer: new-style key, with back-compat for the old single-scorer artifact
        self._scorer = art.get("inductive_scorer", art.get("scorer"))
        self._calibrator = art.get("inductive_calibrator", art.get("calibrator"))
        self._embedder_name = art.get("embedder", self._embedder_name)
        self.beta = float(art.get("beta", 0.1))
        self.tau = float(art.get("tau_prod" if self.mode == "prod" else "tau_benchmark", 0.7))
        feats = art.get("model_features", {})
        # reconstruct a default pool from the artifact's known menu (prices live
        # implicitly in the feature rows: 10**log10_in, 10**log10_out, with the
        # 1e-6 epsilon from training removed)
        for name, fv in feats.items():
            try:
                inp = max(10 ** fv[0] - 1e-6, 1e-9); outp = max(10 ** fv[1] - 1e-6, 1e-9)
                self.default_pool.append(ModelSpec(name=name, input_price=inp, output_price=outp,
                                                   is_reasoning=bool(fv[3] >= 0.5)))
            except Exception:  # noqa: BLE001
                continue

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
                logger.error("CostAwareRouter: embedder unavailable (%s); heuristic fallback.", e)
                self._embedder = False
        return self._embedder

    def warm(self) -> bool:
        """Eagerly load the embedder (call from the app startup hook so the first
        request does not pay the model-load latency)."""
        return self._get_embedder() is not False

    @property
    def ready(self) -> bool:
        return bool(self._heads) or self._scorer is not None

    # -- scoring -----------------------------------------------------------
    def _p_correct(self, prompt_emb: np.ndarray, models: list[ModelSpec]) -> dict:
        """Calibrated P(correct) per model. Uses the model's trained head when it
        has one (primary, strongest); otherwise the inductive scorer over
        [prompt_emb , model_features] (zero-shot for models added after training)."""
        out = {}
        induct = []  # models routed through the inductive fallback
        for m in models:
            head = self._heads.get(m.name)
            if head is not None:
                raw = head["scorer"].predict_proba(prompt_emb.reshape(1, -1))[:, 1]
                cal = head.get("calibrator")
                p = float(cal.predict(raw)[0]) if cal is not None else float(raw[0])
                out[m.name] = p
            else:
                induct.append(m)
        if induct and self._scorer is not None:
            rows = np.stack([np.concatenate([prompt_emb, m.features()]) for m in induct])
            raw = self._scorer.predict_proba(rows)[:, 1]
            if self._calibrator is not None:
                raw = self._calibrator.predict(raw)
            for m, p in zip(induct, raw):
                out[m.name] = float(p)
        elif induct:
            for m in induct:  # no inductive scorer at all: neutral prior
                out[m.name] = 0.5
        return out

    def route(self, prompt: str, models: Optional[list[ModelSpec]] = None,
              tau: Optional[float] = None) -> RoutingDecision:
        """Route one prompt. `models` may be ANY pool (generic to the model);
        defaults to the artifact's menu. `tau` overrides the mode operating point."""
        pool = models if models else self.default_pool
        if not pool:
            raise ValueError("CostAwareRouter.route: no models provided and no default pool in artifact")
        tau = self.tau if tau is None else tau

        embedder = self._get_embedder()
        if not self.ready or embedder is False:
            return self._heuristic(pool, tau)

        # MUST match training (eval/routerarena/nadirroute/harness.embed uses
        # normalize_embeddings=False). Normalizing here would shift the feature
        # distribution the trees were fit on.
        emb = embedder.encode([prompt], normalize_embeddings=False)[0].astype(np.float32)
        scores = self._p_correct(emb, pool)
        order = sorted(pool, key=lambda m: m.sort_price())  # cheapest first, unknown prices last
        for m in order:
            if scores[m.name] >= tau:
                return RoutingDecision(model=m.name, p_correct=scores[m.name], scores=scores,
                                       tau=tau, reason=f"cheapest model clearing tau={tau:.2f}")
        best = max(pool, key=lambda m: scores[m.name])
        return RoutingDecision(model=best.name, p_correct=scores[best.name], scores=scores,
                               tau=tau, reason="no model cleared tau; picked most-likely-correct")

    def _heuristic(self, pool: list[ModelSpec], tau: float) -> RoutingDecision:
        """No artifact/embedder: pick the MID-priced model. Picking the most
        expensive would silently turn the cost-saving router into a cost
        maximizer; picking the cheapest risks quality. Mid-priced bounds both."""
        logger.error("CostAwareRouter: routing via heuristic fallback (no trained scorer); "
                     "check artifact path and /health readiness.")
        ranked = sorted(pool, key=lambda m: m.sort_price())
        m = ranked[len(ranked) // 2]
        return RoutingDecision(model=m.name, p_correct=float("nan"),
                               scores={x.name: float("nan") for x in pool},
                               tau=tau, reason="heuristic fallback (no trained scorer)", fallback=True)


_singletons: dict = {}
_singleton_lock = threading.Lock()


def get_router(mode: str = "prod") -> CostAwareRouter:
    """Process-wide singleton per mode (lazy, thread-safe)."""
    with _singleton_lock:
        if mode not in _singletons:
            _singletons[mode] = CostAwareRouter(mode=mode)
        return _singletons[mode]


# ---------------------------------------------------------------------------
# Analyzer adapter: conforms to the ComplexityAnalyzerFactory contract
# (async analyze(text, system_message) -> dict with recommended_model etc.)
# so the router is selectable via COMPLEXITY_ANALYZER_TYPE=cost_aware.
# ---------------------------------------------------------------------------
_PROVIDER_PREFIXES = (
    ("claude", "anthropic"), ("anthropic/", "anthropic"),
    ("gpt", "openai"), ("o1", "openai"), ("o3", "openai"), ("o4", "openai"), ("openai/", "openai"),
    ("gemini", "google"), ("google/", "google"),
    ("grok", "xai"), ("xai/", "xai"),
    ("deepseek", "deepseek"), ("qwen", "alibaba"), ("alibaba/", "alibaba"),
    ("mistral", "mistral"), ("llama", "meta"), ("meta/", "meta"),
)


def _infer_provider(model: str) -> str:
    low = model.lower()
    for prefix, provider in _PROVIDER_PREFIXES:
        if low.startswith(prefix) or f"/{prefix}" in low:
            return provider
    return "unknown"


def _litellm_prices(model: str) -> tuple[float, float]:
    """USD per million tokens from litellm's LOCAL price map (no network).
    Returns (nan, nan) when unknown; ModelSpec.features() floors those."""
    try:
        import litellm
        entry = litellm.model_cost.get(model) or litellm.model_cost.get(model.split("/")[-1])
        if entry:
            return (float(entry.get("input_cost_per_token", 0)) * 1e6,
                    float(entry.get("output_cost_per_token", 0)) * 1e6)
    except Exception:  # noqa: BLE001
        pass
    return float("nan"), float("nan")


class CostAwareComplexityAnalyzer:
    """Drop-in analyzer wrapping CostAwareRouter. Unlike the tier classifiers it
    picks a concrete model directly: the cheapest allowed model whose calibrated
    P(correct | prompt, model) clears the operating-point threshold tau."""

    ANALYZER_VERSION = "cost_aware_v1"

    def __init__(self, allowed_providers=None, allowed_models=None, mode: str = "prod"):
        self.router = get_router(mode)
        self.allowed_providers = allowed_providers
        self.allowed_models = allowed_models
        self._pool = self._build_pool()

    # Last-resort pool when the artifact is missing AND the user gave no models;
    # keeps analyze() crash-free on the request path (litellm prices, local map).
    _FALLBACK_POOL_NAMES = ("gpt-4o-mini", "claude-haiku-4-5", "claude-sonnet-4-6")

    def _build_pool(self) -> list[ModelSpec]:
        names = self.allowed_models
        if not names:
            pool = list(self.router.default_pool)
            if self.allowed_providers:
                allowed = {p.lower() for p in self.allowed_providers}
                pool = [m for m in pool if _infer_provider(m.name) in allowed]
                if not pool:
                    # Never silently violate a provider restriction (review finding).
                    raise ValueError(
                        f"cost_aware analyzer: no routable model matches allowed_providers="
                        f"{sorted(allowed)}; pass allowed_models for these providers.")
            if not pool:  # missing artifact and no user constraint: stay crash-free
                names = list(self._FALLBACK_POOL_NAMES)
            else:
                return pool
        pool = []
        for name in names:
            inp, outp = _litellm_prices(name)
            pool.append(ModelSpec(name=name, input_price=inp, output_price=outp))
        return pool

    async def analyze(self, text: str = "", system_message: str = "", **kwargs) -> dict:
        import time
        start = time.perf_counter()
        # route() does CPU-bound work (MiniLM encode + tree inference); off-load
        # so it cannot stall the event loop under concurrent requests.
        decision = await asyncio.to_thread(self.router.route, text or system_message, self._pool)
        latency_ms = (time.perf_counter() - start) * 1000.0

        order = sorted(self._pool, key=lambda m: m.sort_price())
        pos = next((i for i, m in enumerate(order) if m.name == decision.model), 0)
        tier_idx = min(2, pos * 3 // max(1, len(order)))   # 0..2
        tier_name = ("simple", "medium", "complex")[tier_idx]
        cheapest_p = decision.scores.get(order[0].name, float("nan"))
        complexity_score = (1.0 - cheapest_p) if math.isfinite(cheapest_p) else 0.5
        confidence = decision.p_correct if math.isfinite(decision.p_correct) else 0.5

        return {
            "recommended_model": decision.model,
            "recommended_provider": _infer_provider(decision.model),
            "confidence": confidence,
            "complexity_score": complexity_score,
            # 1-based to match every other analyzer (tier=0 is falsy in consumers)
            "tier": tier_idx + 1,
            "tier_name": tier_name,
            "complexity_tier": tier_idx + 1,
            "complexity_name": tier_name,
            "reasoning": f"CostAware ({self.router.mode}, tau={decision.tau:.2f}): {decision.reason}",
            "ranked_models": sorted(decision.scores, key=decision.scores.get, reverse=True),
            "analyzer_latency_ms": latency_ms,
            "analyzer_type": self.ANALYZER_VERSION,
            "selection_method": "cost_aware_router",
            "model_type": "cost_aware_router",
            "model_scores": decision.scores,
            "routing_fallback": decision.fallback,
        }


def get_cost_aware_analyzer(allowed_providers=None, allowed_models=None,
                            mode: str = "prod") -> CostAwareComplexityAnalyzer:
    return CostAwareComplexityAnalyzer(allowed_providers=allowed_providers,
                                       allowed_models=allowed_models, mode=mode)
