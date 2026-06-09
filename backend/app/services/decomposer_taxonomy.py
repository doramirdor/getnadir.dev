"""Cognitive sub-task taxonomy for Prompt Decomposition Routing (PDR).

This module is the public-IP surface of PDR. The eight SubTaskType members
form the canonical taxonomy described in IP-2 blueprint Section 2. The
default-tier mapping is the open-source policy contract: any future
classifier (heuristic, fine-tuned head, T5 decomposer) must emit a value
from this enum and the router maps it to a tier via SUBTASK_DEFAULT_TIER
with optional per-user overrides.

Schema is intentionally stable and additive. Adding a new sub-task type is
a breaking change for trained classifiers, so the v0 taxonomy locks in the
eight types from the blueprint and treats them as a versioned contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional


class SubTaskType(Enum):
    """Eight canonical cognitive sub-task types.

    The string values are the on-the-wire contract (logged into
    `decomposer_decisions.sub_task`, surfaced in
    `analysis.sub_task`, used as keys for `tier_overrides`). Do not
    rename without a migration.
    """

    PLAN = "plan"
    INTERPRET_ERROR = "interpret_error"
    WRITE_CODE = "write_code"
    REFLECT = "reflect"
    READ = "read"
    EXECUTE = "execute"
    SUMMARIZE = "summarize"
    TRANSLATE = "translate"


# Default tier mapping per IP-2 blueprint Section 2.
# Tiers are the existing complexity-tier strings used by
# production_completion._map_tier_to_model ("simple", "medium", "complex"),
# so PDR slots into the same model-resolution pipeline as the wide_deep_asym
# analyzer without a parallel mapping layer.
SUBTASK_DEFAULT_TIER: Dict[SubTaskType, str] = {
    SubTaskType.PLAN: "complex",
    SubTaskType.INTERPRET_ERROR: "complex",
    SubTaskType.WRITE_CODE: "medium",
    SubTaskType.REFLECT: "medium",
    SubTaskType.READ: "simple",
    SubTaskType.EXECUTE: "simple",
    SubTaskType.SUMMARIZE: "simple",
    SubTaskType.TRANSLATE: "simple",
}


@dataclass
class DecomposerDecision:
    """Single classification result for one conversational turn.

    Carries enough state for both the routing branch (tier, model) and
    the shadow-mode analytics row (turn_index, latency_ms, source,
    confidence). `source` is one of:
      - "classifier": trained head produced this label with confidence >= threshold
      - "heuristic_fallback": regex/structural rules (v0 default, or trained
        head under threshold)
      - "override": explicit user tier_override applied on top of a label
    """

    sub_task: SubTaskType
    confidence: float
    tier: str
    model: str
    turn_index: int
    latency_ms: int
    source: str


def resolve_tier_for(
    sub_task: SubTaskType,
    overrides: Optional[Dict[str, str]] = None,
) -> str:
    """Resolve the routing tier for a sub-task, applying user overrides.

    `overrides` is the `model_parameters.pdr.tier_overrides` dict keyed by
    sub_task string value, e.g. `{"plan": "medium"}` to demote planning
    routes. Unknown keys are ignored. Missing/None overrides fall through
    to SUBTASK_DEFAULT_TIER.
    """
    if overrides and sub_task.value in overrides:
        return overrides[sub_task.value]
    return SUBTASK_DEFAULT_TIER[sub_task]
