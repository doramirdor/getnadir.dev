"""Tests for the public PDR taxonomy contract.

Schema is checked-in IP, so these tests double as a backward-compat
guard: renaming a member, dropping a tier-mapping entry, or breaking
override resolution all fail here.
"""
from __future__ import annotations

from app.services.decomposer_taxonomy import (
    SUBTASK_DEFAULT_TIER,
    SubTaskType,
    resolve_tier_for,
)


def test_eight_subtask_members_no_duplicates():
    members = list(SubTaskType)
    assert len(members) == 8, f"expected exactly 8 SubTaskType members, got {len(members)}"
    values = [m.value for m in members]
    assert len(set(values)) == 8, f"duplicate string values in SubTaskType: {values}"
    # Canonical membership.
    expected = {
        "plan",
        "interpret_error",
        "write_code",
        "reflect",
        "read",
        "execute",
        "summarize",
        "translate",
    }
    assert set(values) == expected


def test_default_tier_mapping_covers_all_members():
    for member in SubTaskType:
        assert member in SUBTASK_DEFAULT_TIER, (
            f"SUBTASK_DEFAULT_TIER missing entry for {member}"
        )
        tier = SUBTASK_DEFAULT_TIER[member]
        assert tier in {"simple", "medium", "complex"}, (
            f"unexpected tier '{tier}' for {member}"
        )


def test_resolve_tier_for_applies_override():
    # Without override: PLAN -> "complex" (default policy).
    assert resolve_tier_for(SubTaskType.PLAN) == "complex"
    # With override: caller can demote PLAN to medium.
    assert resolve_tier_for(SubTaskType.PLAN, {"plan": "medium"}) == "medium"
    # Unrelated override keys are ignored.
    assert resolve_tier_for(SubTaskType.PLAN, {"write_code": "simple"}) == "complex"
    # None override is the same as no override.
    assert resolve_tier_for(SubTaskType.PLAN, None) == "complex"
