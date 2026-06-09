"""Mode A decomposer for Prompt Decomposition Routing (PDR).

v0 ships heuristic-only: the trained head (Linear(1569 -> 256) ReLU
Dropout Linear(256, 8) Softmax over BGE-pooled history + current turn +
structural features) lands in Cycle 4 Weeks 3-4 (IP-2 blueprint Section
4 / Section 15). Until weights ship, `is_classifier_available()` returns
False and `classify_turn` routes through the regex/structural heuristic
documented inline.

Contract:
  - Pure-Python on the v0 path. No model load. No encoder warmup. Zero
    overhead when PDR is disabled (caller guards on `pdr.enabled`).
  - `classify_turn` never raises on a well-formed Anthropic body; on
    unexpected input it returns the EXECUTE default with source
    "heuristic_fallback" so the caller can still proceed or fall
    through to the existing pipeline.
  - The heuristic returns confidence exactly equal to the default
    threshold (0.55). That guarantees `decision.source ==
    "heuristic_fallback"` flows reliably gate behind the
    `use_heuristic_fallback` flag in the route handler.
  - Designed for drop-in replacement: when the trained head ships, the
    classifier branch loads weights via `__init__(model_path=...)` and
    feeds (encoded turn + history mean-pool + structural feats) through
    the head. The heuristic path stays as the under-threshold fallback.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional

from app.services.decomposer_taxonomy import (
    DecomposerDecision,
    SubTaskType,
    resolve_tier_for,
)

logger = logging.getLogger(__name__)


# Heuristic rule precompiled patterns. Order matters: first match wins.
# These mirror the rules enumerated in the IP-2 blueprint Section 4 (and
# the executor brief for this build). Each rule maps a structural or
# lexical signal to a SubTaskType.
_RE_SUMMARIZE = re.compile(r"\b(summari[sz]e|tl;dr|in one sentence)\b", re.IGNORECASE)
_RE_TRANSLATE = re.compile(
    r"\btranslate\b.{0,80}\b("
    r"english|spanish|french|german|italian|portuguese|dutch|"
    r"russian|chinese|japanese|korean|arabic|hindi|hebrew|turkish|"
    r"polish|swedish|norwegian|danish|finnish|greek|czech|"
    r"vietnamese|thai|indonesian"
    r")\b",
    re.IGNORECASE | re.DOTALL,
)
# Stack-trace / exception markers. Three independent signals; any one
# match is enough.
_RE_TRACEBACK = re.compile(r"\bTraceback\b|^\s*at\s+\S+\(.+?\)\s*$|\bException\s*:", re.MULTILINE)
_RE_PLAN = re.compile(
    r"\b(plan|design|architect|approach|how should we|let's plan|roadmap)\b",
    re.IGNORECASE,
)
_RE_WRITE_CODE = re.compile(
    r"\b(implement|write a function|write the function|write a class|"
    r"refactor|add a (method|function|class)|generate code|write code)\b",
    re.IGNORECASE,
)
_RE_REFLECT = re.compile(
    r"\b(is this right|tradeoffs|trade-offs|what do you think|"
    r"does this make sense|critique|review my)\b",
    re.IGNORECASE,
)
# Very loose "starts with a verb" check for short imperative prompts.
# We match the first token against a curated verb set rather than POS-tagging
# (no NLTK dep). This is intentionally conservative — anything that does not
# match a recognized verb falls through to the EXECUTE default below.
_IMPERATIVE_VERBS = frozenset(
    {
        "run", "execute", "apply", "fix", "delete", "remove", "add",
        "rename", "move", "copy", "open", "close", "start", "stop",
        "build", "deploy", "install", "uninstall", "update", "upgrade",
        "format", "lint", "test", "commit", "push", "pull", "merge",
        "create", "kill", "restart", "reload", "list", "show", "print",
        "echo", "set", "unset", "enable", "disable",
    }
)


def _last_user_message(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    msgs = body.get("messages")
    if not isinstance(msgs, list):
        return None
    for msg in reversed(msgs):
        if isinstance(msg, dict) and msg.get("role") == "user":
            return msg
    return None


def _user_has_tool_result(msg: Optional[Dict[str, Any]]) -> bool:
    """True iff the last user message contains a `tool_result` block.

    The Anthropic Messages format represents tool output in the user role
    as a content block with type=tool_result. Presence of one is the
    canonical READ signal per IP-2 Section 2.
    """
    if not isinstance(msg, dict):
        return False
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_result":
            return True
    return False


def _extract_user_text(msg: Optional[Dict[str, Any]]) -> str:
    """Pull text content from a single message, mirroring _extract_routing_text."""
    if not isinstance(msg, dict):
        return ""
    content = msg.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                txt = block.get("text")
                if isinstance(txt, str):
                    parts.append(txt)
        return "".join(parts)
    return ""


def _is_short_imperative(text: str) -> bool:
    stripped = text.strip()
    if not stripped or len(stripped) >= 50:
        return False
    # First word, lowercased, stripped of trailing punctuation.
    first = stripped.split()[0].lower().rstrip(",.;:!?")
    return first in _IMPERATIVE_VERBS


def _heuristic_classify(body: Dict[str, Any]) -> SubTaskType:
    """Apply heuristic rules in order; first match wins. Default EXECUTE."""
    last_user = _last_user_message(body)

    # Rule 1: tool_result block in last user message -> READ.
    if _user_has_tool_result(last_user):
        return SubTaskType.READ

    text = _extract_user_text(last_user)

    # Rule 2: summarize.
    if _RE_SUMMARIZE.search(text):
        return SubTaskType.SUMMARIZE

    # Rule 3: translate (must mention an actual language to avoid
    # false-positives like "translate this idea into code" which is WRITE_CODE).
    if _RE_TRANSLATE.search(text):
        return SubTaskType.TRANSLATE

    # Rule 4: stack-trace / exception patterns -> INTERPRET_ERROR.
    if _RE_TRACEBACK.search(text):
        return SubTaskType.INTERPRET_ERROR

    # Rule 5: planning markers.
    if _RE_PLAN.search(text):
        return SubTaskType.PLAN

    # Rule 6: code-generation markers.
    if _RE_WRITE_CODE.search(text):
        return SubTaskType.WRITE_CODE

    # Rule 7: reflective / evaluative framing.
    if _RE_REFLECT.search(text):
        return SubTaskType.REFLECT

    # Rule 8: short imperative -> EXECUTE.
    if _is_short_imperative(text):
        return SubTaskType.EXECUTE

    # Default: EXECUTE is safer than PLAN. A misrouted PLAN -> Haiku is a
    # bad-plan correctness hazard; a misrouted EXECUTE -> Haiku is at worst
    # a "should have used Sonnet" cost-quality tradeoff.
    return SubTaskType.EXECUTE


class Decomposer:
    """Mode A turn classifier with heuristic fallback.

    v0 ships without a trained head: `is_classifier_available()` returns
    False and `classify_turn` runs the heuristic. When weights ship,
    construct with `model_path` pointing at a `.pt` file. The encoder is
    accepted as an injectable dependency so tests can mock the BGE
    singleton from `wide_deep_asym_analyzer`.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        encoder: Any = None,
    ) -> None:
        self.model_path = model_path
        self._encoder = encoder
        self._head = None
        # v0: never attempts to load weights. Future versions will lazy-load
        # the head from `model_path` here and set `self._head`.

    def is_classifier_available(self) -> bool:
        """True iff a trained head is loaded.

        v0 always returns False. The check is wired into `classify_turn`
        so the heuristic path runs unconditionally until weights ship.
        """
        return self._head is not None

    async def classify_turn(
        self,
        body: Dict[str, Any],
        user_config: Dict[str, Any],
        confidence_threshold: float = 0.55,
    ) -> DecomposerDecision:
        """Classify the last user turn into a SubTaskType + tier + model.

        Behaviour:
          - If `is_classifier_available()` is False (v0 default), run the
            heuristic. Confidence is set to `confidence_threshold` exactly
            (0.55 by default) and `source="heuristic_fallback"`.
          - When a trained head is available, encode + forward + argmax;
            if max softmax < threshold, fall back to the heuristic.
          - Never raises on a well-formed Anthropic body. On unexpected
            errors, logs and returns the EXECUTE default with
            source="heuristic_fallback".
        """
        start = time.perf_counter()
        model_params = user_config.get("model_parameters") or {}
        pdr_cfg = model_params.get("pdr", {}) or {}
        tier_overrides = pdr_cfg.get("tier_overrides") or {}

        try:
            if self.is_classifier_available():
                # Future: trained-head path. For v0 this branch is dead.
                # When it lands it will encode the body via self._encoder,
                # forward through self._head, and compare max-softmax
                # against `confidence_threshold`. Below the threshold it
                # falls into the heuristic below.
                sub_task = _heuristic_classify(body)  # placeholder
                confidence = float(confidence_threshold)
                source = "heuristic_fallback"
            else:
                sub_task = _heuristic_classify(body)
                # Heuristic emits at exactly the threshold so callers using
                # `decision.source != "heuristic_fallback"` as a gate still
                # see the heuristic-flagged result. The numeric confidence
                # is only meaningful once the trained head is online.
                confidence = float(confidence_threshold)
                source = "heuristic_fallback"
        except Exception as e:
            logger.warning("decomposer classify_turn failed, defaulting to EXECUTE: %s", e)
            sub_task = SubTaskType.EXECUTE
            confidence = float(confidence_threshold)
            source = "heuristic_fallback"

        tier = resolve_tier_for(sub_task, tier_overrides)

        # Mode A does not own model resolution; that lives in
        # _map_tier_to_model. We populate `model` opportunistically when
        # the caller passed a precomputed mapping in user_config so
        # downstream logs can carry it, but the route handler is the
        # authoritative mapper.
        precomputed = (user_config.get("pdr_tier_to_model") or {})
        model = precomputed.get(tier, "")

        # Turn index: position of the last user message in the conversation.
        # Useful for shadow-mode analytics (per-turn drift detection).
        turn_index = 0
        msgs = body.get("messages")
        if isinstance(msgs, list):
            turn_index = max(0, len(msgs) - 1)

        latency_ms = int((time.perf_counter() - start) * 1000)

        return DecomposerDecision(
            sub_task=sub_task,
            confidence=confidence,
            tier=tier,
            model=model,
            turn_index=turn_index,
            latency_ms=latency_ms,
            source=source,
        )


# Module-level shared instance. The route handler imports this rather
# than constructing per-request so the (eventual) BGE encoder + head
# load amortizes across requests.
_shared_decomposer = Decomposer()
