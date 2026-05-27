"""Cascade rule engine — generic, data-driven routing policy.

The engine evaluates declarative YAML rules against an incoming prompt
and emits a `RuleDecision` that `CascadeRouter` honors before falling
through to its built-in verifier-gated path. Rules are loaded from
`backend/app/services/cascade_rules/profiles/<name>.yaml` and cached
with a short TTL so operators can tune routing policy without a
redeploy. Per-tenant overrides flow through `profiles.model_parameters.
cascade.rules_profile` (load a named profile) or `rules_inline` (carry
the rule list inline on the user row).

# Rule schema

```yaml
- name: math_keywords_force_escalate          # required, descriptive
  priority: 100                                # higher = evaluated first
  match:                                       # any_of: OR over conditions
    any_of:
      - substring: "prove that"
      - substring: "derive"
      - regex: "\\bstep\\s+\\d+:"
      - prompt_length_min: 2000                # rough char-based proxy
      - prompt_length_max: 50                  # very-short prompts
      - classifier_confidence_max: 0.5
      - classifier_confidence_min: 0.9
  applies_when:                                # optional pre-filter
    tier_predicted_in: [simple, medium]
  action:
    type: force_escalate                       # | set_threshold | force_cheap
    to_tier: complex                           # for force_escalate
    threshold: 0.85                            # for set_threshold
  meta:
    rationale: "Math proofs need stepwise reasoning"
    discovered_at: 2026-05-27
    source: "RouterArena sub_10 diagnosis pass3"
```

# Action types

- **force_escalate** — route this prompt to `to_tier` regardless of
  what the classifier said. Highest-priority matching rule of this type
  wins. Equivalent to the old `DEFAULT_FORCE_ESCALATE_PATTERNS` but
  generalised: rules can opt into any concrete tier, not only "the next
  one up".

- **set_threshold** — raise the verifier's acceptance threshold for
  this prompt (we never lower it). When multiple `set_threshold` rules
  match, the strictest wins. Equivalent to the old
  `DEFAULT_DOMAIN_THRESHOLDS`.

- **force_cheap** — force the cheap tier even when the classifier
  picked something more expensive. Rare; used for trivially-easy
  benchmark patterns where we want to claw back cost. Highest-priority
  matching rule wins.

- **set_max_tokens** — cap the output token budget for this prompt
  (R2-Router-style length budgeting). Carries `value: <int>`.
  When multiple `set_max_tokens` rules match, the MAX wins — a
  less-restrictive budget is the safer default for a routing-side
  cap. Composes with any other action: a `force_cheap` rule can fire
  alongside a `set_max_tokens` rule and both fields appear on the
  decision.

# Engine semantics

1. Rules are sorted by `priority` descending.
2. For each rule, `applies_when` (if set) gates evaluation by the
   predicted tier.
3. Conditions inside `match.any_of` are ORed. A rule matches if ANY
   condition is true.
4. The first matching `force_escalate` or `force_cheap` rule wins for
   that decision channel; subsequent ones in that channel are recorded
   for telemetry but ignored.
5. `set_threshold` rules stack: the engine returns
   max(default, all matched thresholds).
6. Each matched rule's name is surfaced in `RuleDecision.matched_rules`
   for the audit trail.

# Backwards compatibility

The built-in `default.yaml` profile re-encodes the legacy
`DEFAULT_FORCE_ESCALATE_PATTERNS` and `DEFAULT_DOMAIN_THRESHOLDS` from
`cascade_router.py`. With `default.yaml` loaded the engine's behaviour
is a strict superset of the legacy hardcoded path. The legacy
constants remain exported from `cascade_router.py` (tests import them
directly).
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Directory where built-in profiles live. Resolves once at import time.
PROFILES_DIR: Path = Path(__file__).parent / "profiles"

# How long a parsed profile stays cached before we re-stat the file and
# (if mtime changed) reparse. Marketed as "tune without redeploy" — the
# value below is the worst-case staleness on hot-reload.
_PROFILE_TTL_SEC: float = 30.0

# Cap on total rules per profile. Defensive: a degenerate profile should
# not turn the cascade into a hot loop. 1000 is well above any realistic
# customer config (current default is 13 rules).
_MAX_RULES_PER_PROFILE: int = 1000

# Action types — kept as plain strings to keep YAML hand-editable.
ACTION_FORCE_ESCALATE: str = "force_escalate"
ACTION_SET_THRESHOLD: str = "set_threshold"
ACTION_FORCE_CHEAP: str = "force_cheap"
ACTION_SET_MAX_TOKENS: str = "set_max_tokens"
_VALID_ACTIONS = {
    ACTION_FORCE_ESCALATE,
    ACTION_SET_THRESHOLD,
    ACTION_FORCE_CHEAP,
    ACTION_SET_MAX_TOKENS,
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Rule:
    """One parsed rule. Frozen so engines can be shared across requests."""

    name: str
    priority: int
    conditions: Tuple["Condition", ...]
    action_type: str
    to_tier: Optional[str] = None
    threshold: Optional[float] = None
    max_tokens: Optional[int] = None
    tier_predicted_in: Optional[Tuple[str, ...]] = None
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Condition:
    """One predicate inside ``match.any_of``.

    Exactly one of the optional fields is non-None per condition.
    """

    substring: Optional[str] = None
    regex: Optional[re.Pattern] = None  # type: ignore[type-arg]
    prompt_length_min: Optional[int] = None
    prompt_length_max: Optional[int] = None
    classifier_confidence_min: Optional[float] = None
    classifier_confidence_max: Optional[float] = None


@dataclass
class RuleDecision:
    """Engine output for one (prompt, predicted_tier, confidence) tuple."""

    # "none" | "force_escalate" | "set_threshold" | "force_cheap"
    #         | "set_max_tokens"
    action: str = "none"
    # When action == "force_escalate" or "force_cheap": the target tier.
    to_tier: Optional[str] = None
    # When action == "set_threshold" OR a set_threshold rule fired
    # alongside a non-threshold action: the strictest matched threshold.
    threshold: Optional[float] = None
    # When one or more `set_max_tokens` rules fired: the per-prompt
    # length budget (max tokens) to forward to the provider. When
    # multiple rules match, the MAX wins — less-restrictive is the
    # safer default for a routing-side budget (we'd rather pay a few
    # cents than truncate a real answer).
    max_tokens: Optional[int] = None
    # All matched rule names, in evaluation order. Logged into cascade
    # meta so post-hoc analysis can see "this request fired rule X".
    matched_rules: List[str] = field(default_factory=list)
    # The profile that produced this decision (e.g. "default",
    # "routerarena_v1", "inline"). Useful for telemetry on per-tenant
    # custom profiles.
    profile_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class CascadeRuleEngine:
    """Evaluate a list of declarative rules against a single request."""

    def __init__(
        self,
        rules: List[Rule],
        profile_name: Optional[str] = None,
    ) -> None:
        # Stable sort by descending priority. Ties retain source order.
        self.rules: Tuple[Rule, ...] = tuple(
            sorted(rules, key=lambda r: -r.priority)
        )
        self.profile_name: Optional[str] = profile_name

    def evaluate(
        self,
        prompt: str,
        predicted_tier: Optional[str] = None,
        classifier_confidence: Optional[float] = None,
    ) -> RuleDecision:
        """Run the engine and return a `RuleDecision`.

        ``predicted_tier`` and ``classifier_confidence`` may be None — a
        rule that depends on them via ``applies_when`` /
        ``classifier_confidence_*`` will simply not fire in that case.
        """
        decision = RuleDecision(profile_name=self.profile_name)
        if not prompt:
            # Defensive: empty prompts can't match any substring/regex/length
            # condition. Confidence-only rules also need a prompt context
            # to be meaningful; we noop and let the cascade fall through.
            return decision

        matched_threshold_values: List[float] = []
        matched_max_tokens_values: List[int] = []
        primary_action_set = False  # force_escalate OR force_cheap

        lowered = prompt.lower() if prompt else ""
        plen = len(prompt) if prompt else 0

        for rule in self.rules:
            # Tier-predicate gate.
            if rule.tier_predicted_in is not None:
                if predicted_tier is None:
                    continue
                if predicted_tier not in rule.tier_predicted_in:
                    continue

            # any_of evaluation.
            if not self._any_condition_matches(
                rule.conditions, prompt, lowered, plen, classifier_confidence
            ):
                continue

            decision.matched_rules.append(rule.name)

            if rule.action_type == ACTION_SET_THRESHOLD:
                if rule.threshold is not None:
                    matched_threshold_values.append(rule.threshold)
                continue

            if rule.action_type == ACTION_SET_MAX_TOKENS:
                if rule.max_tokens is not None:
                    matched_max_tokens_values.append(rule.max_tokens)
                continue

            if primary_action_set:
                # Already locked in a force_escalate / force_cheap from a
                # higher-priority rule. We still log this rule's name
                # for the audit trail (above) but don't change the action.
                continue

            if rule.action_type == ACTION_FORCE_ESCALATE:
                decision.action = ACTION_FORCE_ESCALATE
                decision.to_tier = rule.to_tier
                primary_action_set = True
            elif rule.action_type == ACTION_FORCE_CHEAP:
                decision.action = ACTION_FORCE_CHEAP
                decision.to_tier = rule.to_tier
                primary_action_set = True

        # If only set_threshold rules fired, surface that as the action.
        if matched_threshold_values:
            decision.threshold = max(matched_threshold_values)
            if not primary_action_set:
                decision.action = ACTION_SET_THRESHOLD

        # `set_max_tokens` rules stack: the MAX value wins so the
        # routing layer never silently picks the tightest budget on
        # top of a long-form prompt. This is independent of the
        # primary action — a force_cheap + set_max_tokens combo is
        # valid and we surface both fields.
        if matched_max_tokens_values:
            decision.max_tokens = max(matched_max_tokens_values)
            if not primary_action_set and not matched_threshold_values:
                decision.action = ACTION_SET_MAX_TOKENS

        return decision

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _any_condition_matches(
        conditions: Tuple[Condition, ...],
        prompt: str,
        lowered: str,
        plen: int,
        confidence: Optional[float],
    ) -> bool:
        for cond in conditions:
            if cond.substring is not None:
                if cond.substring.lower() in lowered:
                    return True
            elif cond.regex is not None:
                # `prompt` (case-sensitive). YAML authors that want
                # case-insensitive regex should compile with (?i).
                if cond.regex.search(prompt):
                    return True
            elif cond.prompt_length_min is not None:
                if plen >= cond.prompt_length_min:
                    return True
            elif cond.prompt_length_max is not None:
                if plen <= cond.prompt_length_max:
                    return True
            elif cond.classifier_confidence_min is not None:
                if confidence is not None and confidence >= cond.classifier_confidence_min:
                    return True
            elif cond.classifier_confidence_max is not None:
                if confidence is not None and confidence <= cond.classifier_confidence_max:
                    return True
        return False


# ---------------------------------------------------------------------------
# Loading + parsing
# ---------------------------------------------------------------------------


def _parse_condition(raw: Any) -> Optional[Condition]:
    if not isinstance(raw, dict):
        return None
    if "substring" in raw and isinstance(raw["substring"], str) and raw["substring"]:
        return Condition(substring=raw["substring"])
    if "regex" in raw and isinstance(raw["regex"], str) and raw["regex"]:
        try:
            return Condition(regex=re.compile(raw["regex"]))
        except re.error as e:
            logger.warning("Invalid regex %r in rule: %s", raw["regex"], e)
            return None
    if "prompt_length_min" in raw:
        try:
            return Condition(prompt_length_min=int(raw["prompt_length_min"]))
        except (TypeError, ValueError):
            return None
    if "prompt_length_max" in raw:
        try:
            return Condition(prompt_length_max=int(raw["prompt_length_max"]))
        except (TypeError, ValueError):
            return None
    if "classifier_confidence_min" in raw:
        try:
            return Condition(classifier_confidence_min=float(raw["classifier_confidence_min"]))
        except (TypeError, ValueError):
            return None
    if "classifier_confidence_max" in raw:
        try:
            return Condition(classifier_confidence_max=float(raw["classifier_confidence_max"]))
        except (TypeError, ValueError):
            return None
    return None


def _parse_rule(raw: Any) -> Optional[Rule]:
    if not isinstance(raw, dict):
        return None
    name = raw.get("name")
    if not isinstance(name, str) or not name:
        return None
    try:
        priority = int(raw.get("priority", 0))
    except (TypeError, ValueError):
        priority = 0

    match = raw.get("match") or {}
    any_of_raw = match.get("any_of") if isinstance(match, dict) else None
    if not isinstance(any_of_raw, list) or not any_of_raw:
        return None
    conditions: List[Condition] = []
    for c_raw in any_of_raw:
        c = _parse_condition(c_raw)
        if c is not None:
            conditions.append(c)
    if not conditions:
        return None

    action = raw.get("action") or {}
    if not isinstance(action, dict):
        return None
    action_type = action.get("type")
    if action_type not in _VALID_ACTIONS:
        return None
    to_tier = action.get("to_tier")
    if to_tier is not None and not isinstance(to_tier, str):
        to_tier = None
    threshold = action.get("threshold")
    try:
        threshold_f = float(threshold) if threshold is not None else None
    except (TypeError, ValueError):
        threshold_f = None

    # set_max_tokens action carries `value` (int). Skip the rule if
    # it claims that action but supplies no positive integer value;
    # falsely-typed YAML should not silently become a no-op rule
    # masquerading as a budget rule.
    max_tokens_v: Optional[int] = None
    if action_type == ACTION_SET_MAX_TOKENS:
        raw_v = action.get("value")
        try:
            v_int = int(raw_v) if raw_v is not None else None
        except (TypeError, ValueError):
            v_int = None
        if v_int is None or v_int <= 0:
            return None
        max_tokens_v = v_int

    applies_when = raw.get("applies_when") or {}
    tier_predicted_in: Optional[Tuple[str, ...]] = None
    if isinstance(applies_when, dict):
        tpi = applies_when.get("tier_predicted_in")
        if isinstance(tpi, list) and tpi:
            tier_predicted_in = tuple(str(x) for x in tpi if isinstance(x, str))
            if not tier_predicted_in:
                tier_predicted_in = None

    return Rule(
        name=name,
        priority=priority,
        conditions=tuple(conditions),
        action_type=action_type,
        to_tier=to_tier,
        threshold=threshold_f,
        max_tokens=max_tokens_v,
        tier_predicted_in=tier_predicted_in,
        meta=raw.get("meta") or {},
    )


def _parse_rule_list(raw_list: Any) -> List[Rule]:
    if not isinstance(raw_list, list):
        return []
    rules: List[Rule] = []
    for r_raw in raw_list[:_MAX_RULES_PER_PROFILE]:
        rule = _parse_rule(r_raw)
        if rule is not None:
            rules.append(rule)
        else:
            logger.warning("Skipping malformed cascade rule: %r", r_raw)
    return rules


# ---------------------------------------------------------------------------
# Profile loader with TTL + mtime hot-reload cache
# ---------------------------------------------------------------------------


# Cache key is the absolute profile path. Value is (mtime, ts_loaded, engine).
_PROFILE_CACHE: Dict[str, Tuple[float, float, CascadeRuleEngine]] = {}
_PROFILE_CACHE_LOCK = threading.Lock()


def _resolve_profile_path(name_or_path: str) -> Path:
    """Resolve a name (e.g. "default") or absolute path to a Path."""
    if not name_or_path:
        return PROFILES_DIR / "default.yaml"
    p = Path(name_or_path)
    if p.is_absolute() and p.suffix in (".yaml", ".yml"):
        return p
    # Treat as profile name. Look up under PROFILES_DIR. Allow `.yaml`
    # suffix to be omitted.
    if p.suffix in (".yaml", ".yml"):
        return PROFILES_DIR / p.name
    return PROFILES_DIR / f"{name_or_path}.yaml"


def load_profile(name_or_path: str) -> CascadeRuleEngine:
    """Load a YAML profile, returning a cached engine when possible.

    Cache invalidates after `_PROFILE_TTL_SEC` seconds OR when the
    file's mtime changes — whichever comes first. This is what makes
    the rule engine hot-reloadable: edit a profile YAML on disk, wait
    up to 30s, and the new rules take effect without a restart.

    If yaml or the file are missing, returns an empty engine (no rules
    match → action="none" → cascade falls through to legacy path).
    """
    path = _resolve_profile_path(name_or_path)
    key = str(path.resolve()) if path.exists() else str(path)

    now = time.time()
    with _PROFILE_CACHE_LOCK:
        cached = _PROFILE_CACHE.get(key)
        if cached is not None:
            mtime_cached, ts_loaded, engine = cached
            # Use stale cache if file gone (treat as no change).
            if (now - ts_loaded) < _PROFILE_TTL_SEC:
                return engine
            try:
                mtime_now = path.stat().st_mtime
            except OSError:
                mtime_now = mtime_cached
            if mtime_now == mtime_cached:
                # Refresh the timestamp so we skip the stat for the next TTL.
                _PROFILE_CACHE[key] = (mtime_cached, now, engine)
                return engine

    # (Re-)parse.
    engine = _parse_profile_file(path, profile_name=_profile_name_from_path(path))
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0.0
    with _PROFILE_CACHE_LOCK:
        _PROFILE_CACHE[key] = (mtime, now, engine)
    return engine


def load_inline(rules_raw: List[Any], profile_name: str = "inline") -> CascadeRuleEngine:
    """Build an engine from a list of rule dicts (per-tenant override).

    Inline rules are NOT cached: the user row carries the YAML on it
    and the dict identity may change without the file system seeing it.
    Parsing is cheap (microseconds) compared to a model call.
    """
    rules = _parse_rule_list(rules_raw)
    return CascadeRuleEngine(rules, profile_name=profile_name)


def _profile_name_from_path(path: Path) -> str:
    stem = path.stem or "unknown"
    return stem


def _parse_profile_file(path: Path, profile_name: str) -> CascadeRuleEngine:
    if yaml is None:
        logger.warning(
            "PyYAML not installed; cascade rule profile %s cannot load — "
            "returning empty engine.",
            profile_name,
        )
        return CascadeRuleEngine([], profile_name=profile_name)
    if not path.exists():
        logger.warning(
            "Cascade rule profile not found at %s; returning empty engine.", path
        )
        return CascadeRuleEngine([], profile_name=profile_name)
    try:
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except Exception as e:  # noqa: BLE001
        logger.error("Failed to parse cascade profile %s: %s", path, e)
        return CascadeRuleEngine([], profile_name=profile_name)
    if isinstance(data, dict):
        # Allow either `rules:` envelope or a bare list at the top.
        data = data.get("rules", [])
    rules = _parse_rule_list(data)
    logger.info(
        "Loaded cascade rule profile %s (%d rules)", profile_name, len(rules)
    )
    return CascadeRuleEngine(rules, profile_name=profile_name)


# ---------------------------------------------------------------------------
# Test/eval helpers
# ---------------------------------------------------------------------------


def _clear_profile_cache() -> None:
    """Drop the profile cache. Test-only — production hot-reload uses TTL."""
    with _PROFILE_CACHE_LOCK:
        _PROFILE_CACHE.clear()
