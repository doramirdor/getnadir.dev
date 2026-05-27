"""Verifier-gated cascade orchestration (IP-1).

`CascadeRouter` sits between the tier classifier and the LLM dispatch in
`production_completion.py`. When enabled and the verifier is available, it
calls the cheap model first, scores the response with the verifier, and
escalates to the configured per-tier expensive model when the score falls
below the acceptance threshold. When disabled or when the verifier has no
weights, dispatch is a single dict lookup that returns the cheap model
unchanged. Zero-overhead noop is the default.

Shadow mode (`mode="shadow"`) calls the verifier and logs the decision but
never actually escalates. Active mode (`mode="active"`) escalates on reject.
A kill-switch trips after `KILL_SWITCH_THRESHOLD` consecutive verifier errors
to keep a misbehaving verifier from taking the request path down.

Streaming is not supported in v0; the insertion point only runs on the
non-streaming path. Per IP-1 Section 3.

Blueprint: competitor-profiles/blueprints/ip-1-verifier-gated-cascade.md
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# Three consecutive verifier errors → fall through and stop calling it for
# the lifetime of this router instance. Matches the conservative posture used
# by `response_healer` for upstream JSON repair failures.
KILL_SWITCH_THRESHOLD: int = 3

# Default acceptance threshold. Calibrated against the held-out RouterBench
# test split (n=11,420, see verifier/reports/eval_20260526T184516.json):
#   τ=0.70  → accept 0.69, catastrophic 0.024, wasted 0.078, quality preserved 97.6%
#   τ=0.75  → accept 0.67, catastrophic 0.019, wasted 0.089, quality preserved 98.1%
#   τ=0.80  → accept 0.67, catastrophic 0.017, wasted 0.092, quality preserved 98.3%
#   τ=0.90  → accept 0.64, catastrophic 0.011, wasted 0.108, quality preserved 98.9%
# 0.80 is the production operating point that matches the public marketing
# claim of "98% of always-Opus quality preserved" (catastrophic ≤ 1.7%, i.e.
# quality_preserved ≥ 98.3% rounded to 98%). 0.70 was the earlier default.
# Env override: CASCADE_DEFAULT_THRESHOLD (same name used in app/settings.py).
# Per-customer overrides via `model_parameters.cascade.acceptance_threshold`
# still take precedence (read in app/api/production_completion.py).
# NB: production paths use settings.CASCADE_DEFAULT_THRESHOLD; this constant
# is the bare-import fallback for callers that construct CascadeRouter
# without a cfg (tests, NadirClaw embedding, eval harnesses).
import os as _os
try:
    DEFAULT_ACCEPTANCE_THRESHOLD: float = float(
        _os.environ.get("CASCADE_DEFAULT_THRESHOLD", "0.80")
    )
except ValueError:
    DEFAULT_ACCEPTANCE_THRESHOLD = 0.80

# Substring patterns that bypass the verifier and force escalation. The held-
# out eval flagged three domain families where the verifier's AUROC is too
# low to trust: code generation (mbpp, AUROC 0.653), open-ended chat
# (mtbench, AUROC 0.000 on n=21), and long-form summarization
# (consensus_summary, AUROC 0.772). When a prompt matches any of these
# substrings (case-insensitive) the cascade forces escalation regardless of
# the verifier score so we never serve a cheap answer on a domain the
# verifier cannot reliably grade. Customers may extend or override the list
# via `cfg["force_escalate_patterns"]`.
DEFAULT_FORCE_ESCALATE_PATTERNS: tuple[str, ...] = (
    "```python",
    "```javascript",
    "```typescript",
    "def ",
    "function ",
    "summarize the following",
    "summarize this",
)


# Per-domain acceptance thresholds. The verifier's AUROC degrades on
# specific domain families:
#   code (mbpp pattern):           AUROC 0.66
#   summarization (consensus):     AUROC 0.78
#   math (gsm8k pattern):          AUROC 0.79
# When a prompt matches one of these substrings (case-insensitive) we
# raise the acceptance threshold so a borderline verifier score does NOT
# accept the cheap answer on a domain we cannot reliably grade. The
# effective threshold is the MAX of the default cfg threshold and every
# matched pattern's threshold; if multiple patterns match we pick the
# strictest. Customers can override or extend this list via
# ``cfg["domain_thresholds"]`` (a list of ``[pattern, threshold]`` pairs).
DEFAULT_DOMAIN_THRESHOLDS: tuple[tuple[str, float], ...] = (
    ("```python", 0.85),
    ("```javascript", 0.85),
    ("def ", 0.85),
    ("summarize", 0.80),
    ("solve for", 0.80),
)
# NB: math/summarize domain thresholds now equal the global default (0.80) —
# they no longer add extra strictness for those patterns, only the code
# patterns (0.85) raise the bar above default. This is acceptable: when the
# default rose from 0.70 → 0.80 we absorbed the math/summarize "extra
# strictness" into the global floor. See test_default_domain_thresholds_constant_shape.


@dataclass
class CascadeDecision:
    """Outcome of a single `dispatch_with_verifier` call.

    `response` is the LLM payload from the cheap or escalation call, if one
    was made; in the zero-overhead noop path it is None and the caller uses
    `final_model` to dispatch downstream as it normally would.
    """

    final_model: str
    response: Optional[dict] = None
    verifier_score: Optional[float] = None
    escalated: bool = False
    meta: Dict[str, Any] = field(default_factory=dict)


class CascadeRouter:
    """Orchestrate cheap-first dispatch + verifier-gated escalation.

    Parameters
    ----------
    cfg:
        Per-user cascade configuration. Read from
        `model_parameters.cascade` on the user profile. Shape:
        `{enabled, mode, acceptance_threshold, escalation_models}`.
    verifier:
        Injected `VerifierModel`. When unavailable the router noops.
    llm_service:
        Optional LLM dispatch handle. Tests inject a mock; in production
        the cascade router only runs on the cheap-first path which calls
        the existing supabase_unified_llm_service.
    supabase:
        Optional Supabase client for `_log_decision`. Tests inject a mock;
        production passes the live client. Logging failures are swallowed.
    """

    def __init__(
        self,
        cfg: Dict[str, Any],
        verifier: Optional[Any] = None,
        llm_service: Optional[Any] = None,
        supabase: Optional[Any] = None,
        pre_classifier: Optional[Any] = None,
        rule_engine: Optional[Any] = None,
    ) -> None:
        self.cfg: Dict[str, Any] = cfg or {}
        self.verifier = verifier
        self.llm_service = llm_service
        self.supabase = supabase
        # Optional generic rule engine. See
        # `backend/app/services/cascade_rules/engine.py`. When None the
        # router resolves the engine lazily on first dispatch from
        # cfg["rules_profile"] / cfg["rules_inline"] (the new per-tenant
        # override surface) or falls back to the built-in "default"
        # profile. The legacy hardcoded DEFAULT_* constants remain the
        # backward-compat fallback when even that load fails.
        self._rule_engine: Optional[Any] = rule_engine
        self._rule_engine_resolved: bool = rule_engine is not None
        # Optional pre-generation classifier (e.g. RouterBenchClassifierAnalyzer).
        # When set and `pre_classifier_enabled` is True in cfg, a high-confidence
        # binary prediction can short-circuit the verifier path:
        #   - high_confidence + predict="cheap"      → ship cheap_response unchanged
        #   - high_confidence + predict="expensive"  → escalate directly without cheap call
        # When confidence is below threshold the cascade falls through to the
        # standard verifier path. This is the latency / cost optimization layer
        # sitting in front of the verifier; the verifier remains the quality
        # floor. See verifier/train_routerbench_classifier.py.
        self.pre_classifier = pre_classifier
        self._consecutive_verifier_errors: int = 0
        self._kill_switch_tripped: bool = False

    # ------------------------------------------------------------------
    # Rule engine wiring (additive, backwards-compatible)
    # ------------------------------------------------------------------

    def _resolve_rule_engine(self) -> Optional[Any]:
        """Resolve the active rule engine from cfg, lazily.

        Resolution order (highest priority first):
          1. Engine passed to __init__ (tests / advanced callers).
          2. cfg["rules_inline"]  — inline rule list on the user row.
          3. cfg["rules_profile"] — named profile string.
          4. Built-in "default" profile.

        Returns None when the cascade_rules package fails to import
        (e.g. PyYAML missing). Callers fall back to the legacy
        DEFAULT_FORCE_ESCALATE_PATTERNS / DEFAULT_DOMAIN_THRESHOLDS in
        that case.
        """
        if self._rule_engine_resolved:
            return self._rule_engine
        self._rule_engine_resolved = True
        try:
            from app.services.cascade_rules import load_inline, load_profile
        except Exception as e:  # noqa: BLE001
            logger.debug("cascade_rules unavailable: %s", e)
            self._rule_engine = None
            return None

        inline = self.cfg.get("rules_inline")
        if isinstance(inline, list) and inline:
            try:
                self._rule_engine = load_inline(inline)
                return self._rule_engine
            except Exception as e:  # noqa: BLE001
                logger.warning("Inline cascade rules failed to parse: %s", e)

        profile_name = self.cfg.get("rules_profile")
        if not profile_name:
            # Auto-load `default` profile UNLESS the caller already
            # supplied a legacy override list. This preserves the
            # original contract: a customer that passes their own
            # `force_escalate_patterns` / `domain_thresholds` is in
            # full control of the legacy path; don't stack the
            # built-in defaults on top of their overrides. Production
            # cfg sets neither key, so the default rule engine still
            # loads on the production path.
            if (
                "force_escalate_patterns" in self.cfg
                or "domain_thresholds" in self.cfg
            ):
                self._rule_engine = None
                return None
            profile_name = "default"
        try:
            self._rule_engine = load_profile(profile_name)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "Failed to load cascade rule profile %r: %s", profile_name, e
            )
            self._rule_engine = None
        return self._rule_engine

    def evaluate_rules(
        self,
        prompt: str,
        predicted_tier: Optional[str] = None,
        classifier_confidence: Optional[float] = None,
    ) -> Optional[Any]:
        """Evaluate the active rule engine and return a `RuleDecision`,
        or None when no engine is wired. Exposed for offline scoring
        and for the production_completion pre-dispatch path.
        """
        engine = self._resolve_rule_engine()
        if engine is None:
            return None
        try:
            return engine.evaluate(prompt, predicted_tier, classifier_confidence)
        except Exception as e:  # noqa: BLE001
            logger.warning("Cascade rule evaluation failed: %s", e)
            return None

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    async def dispatch_with_verifier(
        self,
        messages: list[dict],
        cheap_model: str,
        tier_name: str,
        user_session: Any,
        request_id: Optional[str] = None,
        cheap_response_text: Optional[str] = None,
    ) -> CascadeDecision:
        """Run the cascade for one request.

        See `CascadeDecision` for the return shape. Noop early returns when
        cascade is disabled, when the verifier is unavailable, or when no
        escalation model is configured for the requested tier.

        ``cheap_response_text`` is the production wiring path: when the
        caller has already invoked the cheap model and has the response
        text in hand, pass it here and the cascade will skip its
        internal `llm_service.call(cheap_model)` step and score the
        provided text directly. This is how `production_completion.py`
        gets the verifier to actually grade real responses instead of
        empty strings (the previous fail-open behavior).
        """
        # Zero-overhead noop: feature disabled at the config level.
        if not self.cfg.get("enabled", False):
            return CascadeDecision(
                final_model=cheap_model,
                meta={"cascade_skipped": "disabled"},
            )

        # Zero-overhead noop: verifier has no weights / no transport.
        if self.verifier is None or not self.verifier.is_available():
            return CascadeDecision(
                final_model=cheap_model,
                meta={"cascade_skipped": "verifier_unavailable"},
            )

        # Kill switch from prior errors in this router's lifetime.
        if self._kill_switch_tripped:
            return CascadeDecision(
                final_model=cheap_model,
                meta={"cascade_skipped": "kill_switch"},
            )

        # No escalation target configured for this tier.
        escalation_model = self._resolve_escalation_model(tier_name)
        if not escalation_model:
            return CascadeDecision(
                final_model=cheap_model,
                meta={"cascade_skipped": "no_escalation_model"},
            )

        # Default mode is "active" in production. Operators can pin a
        # specific user back to "shadow" via `model_parameters.cascade.mode`
        # if they want telemetry without behaviour change for that account.
        mode: str = self.cfg.get("mode", "active")
        shadow_mode: bool = mode == "shadow"
        threshold: float = float(
            self.cfg.get("acceptance_threshold", DEFAULT_ACCEPTANCE_THRESHOLD)
        )
        force_escalate_patterns = self.cfg.get(
            "force_escalate_patterns", DEFAULT_FORCE_ESCALATE_PATTERNS
        )
        domain_thresholds_cfg = self.cfg.get(
            "domain_thresholds", DEFAULT_DOMAIN_THRESHOLDS
        )
        # Default to True: the composed_v2 router ships pre-classifier
        # enabled. Per-profile override stays in
        # `model_parameters.cascade.pre_classifier_enabled` and a hard
        # disable falls back here.
        pre_classifier_enabled: bool = bool(
            self.cfg.get("pre_classifier_enabled", True)
        )

        prompt_text = _extract_last_user_message(messages)

        # Optional latency / cost short-circuit BEFORE the cheap call. A
        # well-calibrated pre-generation classifier covers ~10% of the test
        # distribution at >= 99% accuracy (see verifier/reports/router_v2_*).
        # On that slice we trust its binary prediction and skip both the
        # cheap call's wasted compute (when predict=expensive) and the
        # verifier overhead (when predict=cheap). On the rest we fall
        # through to the full verifier path. Active mode only — shadow
        # mode still wants the verifier's score for telemetry.
        if (
            pre_classifier_enabled
            and not shadow_mode
            and self.pre_classifier is not None
        ):
            try:
                pc = self.pre_classifier.predict_binary(prompt_text)
            except Exception as e:  # noqa: BLE001
                logger.warning("pre_classifier failed; falling through: %s", e)
                pc = None
            if pc is not None and pc.get("high_confidence"):
                short_meta: Dict[str, Any] = {
                    "mode": mode,
                    "shadow_mode": False,
                    "threshold": threshold,
                    "pre_classifier_used": True,
                    "pre_classifier_prediction": pc["predicted_class"],
                    "pre_classifier_confidence": pc["confidence"],
                    "pre_classifier_p_cheap": pc["p_cheap_acceptable"],
                    "escalation_model": escalation_model,
                }
                if pc["predicted_class"] == "cheap":
                    # High-confidence cheap: serve cheap, skip verifier.
                    cheap_response = None
                    if self.llm_service is not None:
                        cheap_response = await self.llm_service.call(
                            messages=messages,
                            model=cheap_model,
                            user_session=user_session,
                        )
                    short_meta["escalated"] = False
                    return CascadeDecision(
                        final_model=cheap_model,
                        response=cheap_response,
                        verifier_score=None,
                        escalated=False,
                        meta=short_meta,
                    )
                # High-confidence expensive: skip the cheap call entirely.
                escalated_response = None
                if self.llm_service is not None:
                    escalated_response = await self.llm_service.call(
                        messages=messages,
                        model=escalation_model,
                        user_session=user_session,
                    )
                short_meta["escalated"] = True
                short_meta["skipped_cheap_call"] = True
                return CascadeDecision(
                    final_model=escalation_model,
                    response=escalated_response,
                    verifier_score=None,
                    escalated=True,
                    meta=short_meta,
                )

        # Call cheap model first. Tests inject a stub; the production
        # insertion point hands off here only when llm_service is wired.
        # If the caller supplied `cheap_response_text` we use it directly
        # and skip the internal call — this is how production hands the
        # already-generated response in for scoring.
        cheap_response: Optional[dict] = None
        if cheap_response_text is not None:
            cheap_answer_text = cheap_response_text
        elif self.llm_service is not None:
            cheap_response = await self.llm_service.call(
                messages=messages,
                model=cheap_model,
                user_session=user_session,
            )
            cheap_answer_text = _extract_response_text(cheap_response)
        else:
            cheap_answer_text = ""

        # CRITICAL fail-open: when no `llm_service` is wired (production
        # path where the actual LLM call happens AFTER cascade returns),
        # we have no cheap response to score. Scoring the empty string
        # always returns a low value and the cascade would systematically
        # escalate every request — over-charging the user. Treat this as
        # "accept" so cascade behaves as a pre-classifier shortcut only.
        # Refinement also requires llm_service so it stays disabled in
        # this mode by the same gate later in the function.
        if self.llm_service is None and not cheap_answer_text:
            return CascadeDecision(
                final_model=cheap_model,
                response=None,
                verifier_score=None,
                escalated=False,
                meta={
                    "mode": mode,
                    "shadow_mode": shadow_mode,
                    "threshold": threshold,
                    "default_threshold": threshold,
                    "effective_threshold": threshold,
                    "matched_domain_patterns": [],
                    "verifier_score": None,
                    "verifier_accepted": True,
                    "verifier_latency_ms": None,
                    "verifier_error": None,
                    "verifier_cache_hit": False,
                    "escalation_model": escalation_model,
                    "kill_switch_tripped": self._kill_switch_tripped,
                    "forced_escalation_pattern": None,
                    "escalated": False,
                    "cascade_skipped": "no_llm_service_no_cheap_response",
                },
            )

        # Held-out eval (verifier/reports/eval_*) shows the verifier cannot
        # reliably grade code, open-ended chat, or summarization. Force
        # escalation on prompts that match those domains before we even ask
        # the verifier. In shadow mode we still call the verifier (we want
        # the score for telemetry) but stamp the meta so post-hoc analysis
        # can separate forced from natural escalations.
        forced_pattern: Optional[str] = _matches_any_pattern(
            prompt_text, force_escalate_patterns
        )

        # Per-domain acceptance threshold: raise the bar on domains the
        # verifier grades unreliably (code AUROC 0.66, summarization 0.78,
        # math 0.79). Multiple matches → take the strictest threshold.
        matched_domain_patterns, effective_threshold = _resolve_effective_threshold(
            prompt_text, domain_thresholds_cfg, threshold
        )

        # Generic rule engine layer (additive). Evaluates BEFORE the
        # legacy verifier-gating path runs so a force_escalate rule can
        # short-circuit and a set_threshold rule can raise the bar
        # alongside the legacy DEFAULT_DOMAIN_THRESHOLDS list. The legacy
        # constants stay in force; the engine only escalates further
        # (force_escalate when the legacy path wouldn't have) or
        # tightens the bar (set_threshold > current effective_threshold).
        # `matched_rules` is logged in meta for the audit trail.
        rule_decision = None
        matched_rule_names: list[str] = []
        rule_engine_profile: Optional[str] = None
        if forced_pattern is None:  # legacy force-escalate already wins
            try:
                rule_decision = self.evaluate_rules(
                    prompt_text,
                    predicted_tier=tier_name,
                    classifier_confidence=None,
                )
            except Exception:  # noqa: BLE001
                rule_decision = None
        if rule_decision is not None:
            matched_rule_names = list(rule_decision.matched_rules)
            rule_engine_profile = rule_decision.profile_name
            # set_threshold contribution: never lower the bar.
            if rule_decision.threshold is not None:
                effective_threshold = max(effective_threshold, rule_decision.threshold)
            # force_escalate contribution: treat as a forced pattern so
            # the downstream gate flips verifier_accepted to False. We
            # stamp the rule name into forced_pattern so existing
            # telemetry continues to surface a string identifier.
            if rule_decision.action == "force_escalate":
                forced_pattern = f"rule:{rule_decision.matched_rules[0]}" if rule_decision.matched_rules else "rule:force_escalate"

        verifier_score: Optional[float] = None
        verifier_accepted: bool = True  # fail-open default
        verifier_latency_ms: Optional[float] = None
        verifier_error: Optional[str] = None
        verifier_cache_hit: bool = False

        # Cache lookup: if we've already scored this exact (prompt, cheap)
        # pair recently, skip the ~180ms verifier call. Misses still pay
        # full verifier latency and get written back. Empty inputs are not
        # cached (key would collide across requests). See verifier_cache.py.
        cache = None
        cache_key: Optional[str] = None
        if cfg_uses_cache(self.cfg) and prompt_text and cheap_answer_text:
            try:
                from app.services.verifier_cache import get_shared_verifier_cache
                cache = get_shared_verifier_cache()
                cache_key = cache.key_for(prompt_text, cheap_answer_text, None)
                cached_score = cache.get(cache_key)
                if cached_score is not None:
                    verifier_score = float(cached_score)
                    verifier_latency_ms = 0.0  # signal cache-hit latency
                    verifier_cache_hit = True
                    verifier_accepted = verifier_score >= effective_threshold
                    self._consecutive_verifier_errors = 0
            except Exception as _cache_err:  # noqa: BLE001
                logger.debug("Verifier cache lookup failed (non-fatal): %s", _cache_err)
                cache = None
                cache_key = None

        if not verifier_cache_hit:
            try:
                t0 = time.perf_counter()
                verifier_score = await self.verifier.score(
                    prompt_text, cheap_answer_text, None
                )
                verifier_latency_ms = (time.perf_counter() - t0) * 1000.0
                verifier_accepted = verifier_score >= effective_threshold
                self._consecutive_verifier_errors = 0
                # Cache the fresh score for future near-duplicate requests.
                if cache is not None and cache_key is not None and verifier_score is not None:
                    try:
                        cache.put(cache_key, float(verifier_score))
                    except Exception as _cache_err:  # noqa: BLE001
                        logger.debug(
                            "Verifier cache put failed (non-fatal): %s", _cache_err
                        )
            except asyncio.TimeoutError:
                verifier_error = "timeout"
                verifier_accepted = True  # fail-open
                self._consecutive_verifier_errors += 1
            except Exception as e:  # noqa: BLE001
                verifier_error = type(e).__name__
                verifier_accepted = True  # fail-open
                self._consecutive_verifier_errors += 1
                logger.warning("Verifier scoring failed: %s", e)

        # Apply the force-escalate gate AFTER scoring so shadow-mode logs
        # capture both the verifier's opinion and the override. In active
        # mode this overrides verifier_accepted, never the other way around
        # (we only force MORE escalation, never less).
        if forced_pattern is not None:
            verifier_accepted = False

        # Trip kill switch BEFORE deciding on escalation so the current
        # request still fails-open to cheap and subsequent requests skip
        # verifier work entirely.
        if self._consecutive_verifier_errors >= KILL_SWITCH_THRESHOLD:
            self._kill_switch_tripped = True
            logger.error(
                "Cascade verifier kill switch tripped after %d consecutive errors",
                self._consecutive_verifier_errors,
            )

        meta: Dict[str, Any] = {
            "mode": mode,
            "shadow_mode": shadow_mode,
            "threshold": effective_threshold,
            "default_threshold": threshold,
            "effective_threshold": effective_threshold,
            "matched_domain_patterns": matched_domain_patterns,
            "verifier_score": verifier_score,
            "verifier_accepted": verifier_accepted,
            "verifier_latency_ms": verifier_latency_ms,
            "verifier_error": verifier_error,
            "verifier_cache_hit": verifier_cache_hit,
            "escalation_model": escalation_model,
            "kill_switch_tripped": self._kill_switch_tripped,
            "forced_escalation_pattern": forced_pattern,
            "matched_rules": matched_rule_names,
            "rule_engine_profile": rule_engine_profile,
        }

        # Best-effort log; never raises into the request path.
        await self._log_decision(
            request_id=request_id,
            user_session=user_session,
            cheap_model=cheap_model,
            escalation_model=escalation_model,
            verifier_score=verifier_score,
            threshold=effective_threshold,
            verifier_accepted=verifier_accepted,
            escalated=False,  # provisional, may flip below
            shadow_mode=shadow_mode,
            verifier_latency_ms=verifier_latency_ms,
            meta=meta,
        )

        # Shadow: never escalate regardless of score.
        if shadow_mode:
            meta["escalated"] = False
            return CascadeDecision(
                final_model=cheap_model,
                response=cheap_response,
                verifier_score=verifier_score,
                escalated=False,
                meta=meta,
            )

        # Active accept: cheap response is final.
        if verifier_accepted:
            meta["escalated"] = False
            return CascadeDecision(
                final_model=cheap_model,
                response=cheap_response,
                verifier_score=verifier_score,
                escalated=False,
                meta=meta,
            )

        # ─── Iterative refinement (IP-1 extension, Move 5) ────────────────
        # Before escalating to the more expensive tier, give the cheap
        # model up to N additional attempts with the rejection diagnostic
        # embedded in the prompt. If any retry passes the verifier, we
        # ship the refined cheap answer — at the cost of N+1 cheap calls
        # and N+1 verifier scorings, but no expensive call. Net win
        # whenever expensive_cost > (N * cheap_cost + N * verifier_cost),
        # which holds for the Haiku→Sonnet/Opus ratios (≥12x). When
        # forced_pattern fired we skip refinement entirely — the verifier
        # cannot reliably grade those domains so retries are wasted.
        max_refinement_attempts = int(self.cfg.get("max_refinement_attempts", 1))
        refinement_attempts: list[dict] = []
        if (
            max_refinement_attempts > 0
            and forced_pattern is None
            and self.llm_service is not None
            and verifier_error is None
        ):
            for attempt_idx in range(max_refinement_attempts):
                # Build the diagnostic prompt: keep original conversation
                # + assistant's prior cheap answer + a refinement
                # instruction calibrated by the verifier score.
                diagnostic = _build_refinement_diagnostic(
                    verifier_score or 0.0,
                    attempt_idx + 1,
                    max_refinement_attempts,
                )
                refinement_messages = list(messages) + [
                    {"role": "assistant", "content": cheap_answer_text or ""},
                    {"role": "user", "content": diagnostic},
                ]
                try:
                    refined_response = await self.llm_service.call(
                        messages=refinement_messages,
                        model=cheap_model,
                        user_session=user_session,
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning("Refinement call failed: %s", e)
                    break
                refined_text = _extract_response_text(refined_response)

                # Re-score with verifier (cache enabled the same way as
                # the first pass).
                refined_score: Optional[float] = None
                refined_cache_hit: bool = False
                if cache is not None and refined_text:
                    try:
                        r_key = cache.key_for(prompt_text, refined_text, None)
                        cached_r = cache.get(r_key)
                        if cached_r is not None:
                            refined_score = float(cached_r)
                            refined_cache_hit = True
                    except Exception:  # noqa: BLE001
                        pass
                if refined_score is None:
                    try:
                        refined_score = await self.verifier.score(
                            prompt_text, refined_text, None
                        )
                        if cache is not None and refined_text and refined_score is not None:
                            try:
                                cache.put(
                                    cache.key_for(prompt_text, refined_text, None),
                                    float(refined_score),
                                )
                            except Exception:  # noqa: BLE001
                                pass
                    except Exception as e:  # noqa: BLE001
                        logger.warning("Refinement verifier failed: %s", e)
                        break

                refinement_attempts.append(
                    {
                        "attempt": attempt_idx + 1,
                        "score": refined_score,
                        "accepted": (
                            refined_score is not None
                            and refined_score >= effective_threshold
                        ),
                        "cache_hit": refined_cache_hit,
                    }
                )

                if refined_score is not None and refined_score >= effective_threshold:
                    # Refinement succeeded — ship the refined cheap answer.
                    meta["escalated"] = False
                    meta["refined"] = True
                    meta["refinement_attempts"] = refinement_attempts
                    meta["final_verifier_score"] = refined_score
                    return CascadeDecision(
                        final_model=cheap_model,
                        response=refined_response,
                        verifier_score=refined_score,
                        escalated=False,
                        meta=meta,
                    )

                # Save state for next iteration: most recent refined
                # answer becomes the baseline for the next diagnostic.
                cheap_answer_text = refined_text
                cheap_response = refined_response
                verifier_score = refined_score

        # Active reject (refinement exhausted or skipped): escalate.
        escalated_response: Optional[dict] = None
        if self.llm_service is not None:
            escalated_response = await self.llm_service.call(
                messages=messages,
                model=escalation_model,
                user_session=user_session,
            )
        meta["escalated"] = True
        if refinement_attempts:
            meta["refinement_attempts"] = refinement_attempts
            meta["refined"] = False
        return CascadeDecision(
            final_model=escalation_model,
            response=escalated_response,
            verifier_score=verifier_score,
            escalated=True,
            meta=meta,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_escalation_model(self, tier_name: str) -> Optional[str]:
        """Look up the configured escalation model for a tier, or None."""
        escalation_models = self.cfg.get("escalation_models") or {}
        if not isinstance(escalation_models, dict):
            return None
        target = escalation_models.get(tier_name)
        if not target or not isinstance(target, str):
            return None
        return target

    async def _log_decision(
        self,
        user_session: Any,
        cheap_model: str,
        escalation_model: str,
        verifier_score: Optional[float],
        threshold: float,
        verifier_accepted: bool,
        escalated: bool,
        shadow_mode: bool,
        verifier_latency_ms: Optional[float],
        meta: Dict[str, Any],
        request_id: Optional[str] = None,
    ) -> None:
        """Best-effort write to `cascade_decisions`. Never raises.

        `cascade_decisions.request_id` is NOT NULL in Supabase, so callers
        without a request_id will see the insert fail at the DB level. We
        log such cases at DEBUG and move on (the cascade decision is still
        applied to the response).
        """
        if self.supabase is None:
            return
        try:
            user_id = getattr(user_session, "id", None) or getattr(
                user_session, "user_id", None
            )
            row = {
                "request_id": request_id or str(uuid.uuid4()),
                "user_id": user_id,
                "cheap_model": cheap_model,
                "escalation_model": escalation_model,
                "verifier_score": verifier_score,
                "acceptance_threshold": threshold,
                "verifier_accepted": verifier_accepted,
                "escalated": escalated,
                "shadow_mode": shadow_mode,
                "verifier_latency_ms": verifier_latency_ms,
            }
            insert_call = self.supabase.table("cascade_decisions").insert(row)
            execute = getattr(insert_call, "execute", None)
            if execute is not None:
                result = execute()
                if asyncio.iscoroutine(result):
                    await result
        except Exception as e:  # noqa: BLE001
            logger.debug("cascade_decisions log failed (non-fatal): %s", e)


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def _resolve_effective_threshold(
    text: str,
    domain_thresholds: Any,
    default_threshold: float,
) -> tuple[list[str], float]:
    """Compute the per-prompt acceptance threshold.

    ``domain_thresholds`` may be either the module-level
    ``DEFAULT_DOMAIN_THRESHOLDS`` tuple-of-tuples or a customer-supplied
    list of ``[pattern, threshold]`` pairs (typically deserialized from
    ``model_parameters.cascade.domain_thresholds`` jsonb). Patterns are
    matched case-insensitively against ``text``. If any patterns match,
    the effective threshold is ``max(default_threshold, *matched_thresholds)``
    so a stricter domain rule cannot be relaxed by a permissive default.

    Returns ``(matched_patterns, effective_threshold)``. When ``text`` is
    empty or ``domain_thresholds`` is empty/None/malformed, returns
    ``([], default_threshold)``.
    """
    if not text or not domain_thresholds:
        return [], default_threshold
    try:
        pairs = list(domain_thresholds)
    except TypeError:
        return [], default_threshold

    lowered = text.lower()
    matched_patterns: list[str] = []
    matched_thresholds: list[float] = []
    for pair in pairs:
        # Accept (pattern, threshold) tuples or [pattern, threshold] lists.
        if not isinstance(pair, (tuple, list)) or len(pair) != 2:
            continue
        pattern, thr = pair[0], pair[1]
        if not isinstance(pattern, str) or not pattern:
            continue
        try:
            thr_f = float(thr)
        except (TypeError, ValueError):
            continue
        if pattern.lower() in lowered:
            matched_patterns.append(pattern)
            matched_thresholds.append(thr_f)

    if not matched_thresholds:
        return [], default_threshold
    effective = max(default_threshold, *matched_thresholds)
    return matched_patterns, effective


def _build_refinement_diagnostic(
    verifier_score: float, attempt: int, max_attempts: int
) -> str:
    """Construct the user-role message that asks the cheap model to retry.

    The diagnostic is calibrated by the verifier score so a wildly bad
    answer gets a stronger nudge than a borderline one. The verifier
    cannot expose its internal reasoning (it's a 2-class softmax), so
    we use the score itself as the signal and surface domain-agnostic
    guidance the cheap model can act on.
    """
    if verifier_score < 0.30:
        severity = (
            "Your previous response did not meet the quality bar — it "
            "appears incorrect, incomplete, or off-topic."
        )
    elif verifier_score < 0.50:
        severity = "Your previous response was likely incorrect or substantially incomplete."
    else:
        severity = "Your previous response was close but did not quite meet the quality bar."
    suffix = (
        " Carefully reconsider the original question, double-check facts "
        "and reasoning, and provide an improved answer. Do not repeat the "
        "same response; identify what was weak and address it directly."
    )
    if attempt < max_attempts:
        suffix += (
            f" (Attempt {attempt} of {max_attempts}; "
            f"after this we will escalate to a more capable model.)"
        )
    else:
        suffix += " This is your final attempt before escalation."
    return severity + suffix


def cfg_uses_cache(cfg: Dict[str, Any]) -> bool:
    """Return True iff the verifier-score cache should be consulted for this
    request. Default is True (the cache is opt-out). A profile can disable
    via ``cfg["verifier_cache_enabled"] = False``.
    """
    val = (cfg or {}).get("verifier_cache_enabled", True)
    if isinstance(val, str):
        return val.strip().lower() in ("true", "1", "t", "yes")
    return bool(val)


def _matches_any_pattern(text: str, patterns: Any) -> Optional[str]:
    """Return the first pattern that occurs in `text` (case-insensitive), else None.

    Used by `dispatch_with_verifier` to force escalation on prompts that
    fall in domains where the held-out eval shows the verifier cannot be
    trusted. Empty / non-iterable `patterns` returns None.
    """
    if not text or not patterns:
        return None
    try:
        iterable = list(patterns)
    except TypeError:
        return None
    lowered = text.lower()
    for p in iterable:
        if isinstance(p, str) and p and p.lower() in lowered:
            return p
    return None


def _extract_last_user_message(messages: list[dict]) -> str:
    """Return the most recent user-role content as a flat string."""
    for msg in reversed(messages or []):
        if not isinstance(msg, dict):
            continue
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    text = block.get("text")
                    if isinstance(text, str):
                        parts.append(text)
                elif isinstance(block, str):
                    parts.append(block)
            return "\n".join(parts)
    return ""


def _extract_response_text(response: Optional[dict]) -> str:
    """Pull plain text out of an OpenAI-shape chat completion dict."""
    if not response or not isinstance(response, dict):
        return ""
    choices = response.get("choices") or []
    if not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return ""
