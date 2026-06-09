"""Tests for verifier/validation_runner.py.

Supabase is mocked via small fake objects matching the supabase-py
chained-builder API surface the runner uses. The judge client is a
hand-rolled fake so we never touch oauth_judge's transport plumbing
(that has its own test file).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

import pytest

from oauth_judge import JudgeResult  # type: ignore
from validation_runner import (  # type: ignore
    PENDING_LABEL_SOURCE,
    check_calibration,
    run_validation_slice,
)


# ---------------------------------------------------------------------- helpers


class _Query:
    """Chainable stand-in for the supabase-py PostgrestQueryBuilder.

    Records each `.update(...).eq(...)` call so tests can assert on the
    update side-effects.
    """

    def __init__(self, parent: "FakeSupabase", table: str):
        self.parent = parent
        self.table = table
        self._mode: Optional[str] = None
        self._update_payload: Optional[dict] = None
        self._update_filter: Optional[tuple[str, object]] = None

    # SELECT chain ------------------------------------------------------
    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def is_(self, *_a, **_kw):
        return self

    def eq(self, col, val):
        if self._mode == "update":
            self._update_filter = (col, val)
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, _n):
        return self

    # UPDATE chain ------------------------------------------------------
    def update(self, payload: dict):
        self._mode = "update"
        self._update_payload = payload
        return self

    # INSERT chain (unused here, kept for completeness) -----------------
    def insert(self, _payload):
        self._mode = "insert"
        return self

    # Terminal ----------------------------------------------------------
    def execute(self):
        if self._mode == "select":
            return _Result(data=list(self.parent.rows))
        if self._mode == "update":
            self.parent.updates.append(
                {
                    "filter": self._update_filter,
                    "payload": self._update_payload,
                }
            )
            return _Result(data=[{"ok": True}])
        return _Result(data=[])


class _Result:
    def __init__(self, data):
        self.data = data


class FakeSupabase:
    def __init__(self, rows: Optional[list[dict]] = None):
        self.rows = list(rows or [])
        self.updates: list[dict] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


class ScriptedJudge:
    """Returns a sequence of JudgeResults in order. Tracks call args."""

    def __init__(self, results: list[JudgeResult]):
        self._results = list(results)
        self.calls: list[dict] = []

    async def judge_triple(self, prompt, cheap_answer, expensive_answer, **kw):
        self.calls.append(
            {
                "prompt": prompt,
                "cheap_answer": cheap_answer,
                "expensive_answer": expensive_answer,
                **kw,
            }
        )
        if not self._results:
            raise AssertionError("ScriptedJudge ran out of results")
        return self._results.pop(0)


def _row(row_id: str, prompt: str = "p?", cheap: str = "c", expensive: str = "e") -> dict:
    return {
        "id": row_id,
        "prompt": prompt,
        "cheap_answer": cheap,
        "expensive_answer": expensive,
        "cheap_model": "claude-haiku-4-5",
        "expensive_model": "claude-opus-4-6",
        "label": None,
        "label_source": PENDING_LABEL_SOURCE,
    }


def _accept(label: int, conf: float = 0.9) -> JudgeResult:
    return JudgeResult(
        label=label,
        confidence=conf,
        rationale="ok",
        raw_response="{}",
        error=None,
        pending_review=False,
    )


def _err(tag: str = "auth_failure: 401") -> JudgeResult:
    return JudgeResult(
        label=None,
        confidence=0.0,
        rationale="",
        raw_response="",
        error=tag,
        pending_review=False,
    )


# ---------------------------------------------------------------------- tests


# 1. n>100 raises ValueError synchronously --------------------------------
def test_n_cap_raises_value_error_synchronously():
    # Important: this must raise BEFORE entering the coroutine body, so
    # we never even start awaiting. Calling the async function returns
    # a coroutine object; ValueError should fire when that coroutine is
    # first stepped. The blueprint specifies "synchronously at function
    # entry"; since this is an async def, "function entry" means the
    # first statement of the coroutine body. Either way, asyncio.run
    # must surface the ValueError.
    import asyncio

    with pytest.raises(ValueError, match="max allowed N is 100"):
        asyncio.run(run_validation_slice(n=200, supabase_client=FakeSupabase()))


# 2. Report has all required fields --------------------------------------
async def test_report_has_required_fields(tmp_path: Path):
    rows = [_row(f"id-{i}", prompt=f"prompt-{i}") for i in range(3)]
    supa = FakeSupabase(rows)
    judge = ScriptedJudge([_accept(1, 0.9), _accept(0, 0.8), _accept(1, 0.95)])

    report = await run_validation_slice(
        n=3,
        judge_client=judge,
        supabase_client=supa,
        report_dir=str(tmp_path),
    )

    required_keys = {
        "run_at",
        "n_requested",
        "n_judged",
        "n_errors",
        "label_distribution",
        "avg_confidence",
        "wall_time_seconds",
        "estimated_full_batch_seconds",
        "calibration",
        "abort_reason",
        "random_examples",
    }
    assert required_keys.issubset(report.keys()), report.keys()
    assert report["n_requested"] == 3
    assert report["n_judged"] == 3
    assert report["n_errors"] == 0
    assert report["label_distribution"]["1"] == 2
    assert report["label_distribution"]["0"] == 1
    assert report["abort_reason"] is None
    # 3 successful updates were dispatched.
    assert len(supa.updates) == 3
    for u in supa.updates:
        assert u["payload"]["label_source"] == "oauth_judge"
        assert u["payload"]["label"] in (0, 1)
        assert 0.0 <= u["payload"]["label_confidence"] <= 1.0
    # Report file written to tmp dir.
    files = list(tmp_path.glob("validation_slice_*.json"))
    assert len(files) == 1


# 3. Idempotency: empty query → n_judged=0, no writes ---------------------
async def test_idempotency_empty_query_no_writes(tmp_path: Path):
    supa = FakeSupabase([])
    judge = ScriptedJudge([])  # never called
    report = await run_validation_slice(
        n=10,
        judge_client=judge,
        supabase_client=supa,
        report_dir=str(tmp_path),
    )
    assert report["n_judged"] == 0
    assert report["n_errors"] == 0
    assert report["label_distribution"] == {"0": 0, "1": 0}
    assert supa.updates == []
    assert judge.calls == []
    assert report["abort_reason"] is None


# 4. Kill switch: 3 consecutive errors → abort_reason set ----------------
async def test_kill_switch_three_consecutive_errors(tmp_path: Path):
    rows = [_row(f"id-{i}") for i in range(5)]
    supa = FakeSupabase(rows)
    judge = ScriptedJudge(
        [
            _err("auth_failure: 401"),
            _err("auth_failure: 401"),
            _err("rate_limit_429"),
            # We never reach these:
            _accept(1, 0.9),
            _accept(1, 0.9),
        ]
    )
    report = await run_validation_slice(
        n=5,
        judge_client=judge,
        supabase_client=supa,
        report_dir=str(tmp_path),
    )
    assert report["abort_reason"] is not None
    assert "kill_switch" in report["abort_reason"]
    # Only 3 judge calls happened before the kill switch tripped.
    assert len(judge.calls) == 3
    # No successful labels persisted.
    assert supa.updates == []
    assert report["n_errors"] == 3
    assert report["n_judged"] == 0


# 5. Calibration concern flagged when judge agrees on 3/4 clear triples ---
def test_calibration_concern_flagged_on_3_of_4_agreement():
    judged_results = [
        # Clear seeds: expected 1, 0, 0, 1. Judge gets the last one wrong.
        {"id": "seed-1", "label": 1, "rationale": "ok"},
        {"id": "seed-2", "label": 0, "rationale": "wrong"},
        {"id": "seed-3", "label": 0, "rationale": "buggy"},
        {"id": "seed-4", "label": 0, "rationale": "judge missed it"},
        # Borderline: expected None. Judge says 1; should be observation-only.
        {"id": "seed-5", "label": 1, "rationale": "judge opinion"},
    ]
    seed_triples = {
        "seed-1": 1,
        "seed-2": 0,
        "seed-3": 0,
        "seed-4": 1,
        "seed-5": None,  # borderline, observation-only
    }
    out = check_calibration(judged_results, seed_triples)
    assert out["total"] == 4  # borderline excluded from denominator
    assert out["agreed"] == 3
    assert out["calibration_concern"] is True
    # Borderline observation recorded but not scored.
    assert len(out["observed_borderline"]) == 1
    assert out["observed_borderline"][0]["id"] == "seed-5"
    assert out["observed_borderline"][0]["judge_label"] == 1
    # Disagreement is on seed-4 (expected 1, got 0).
    assert any(
        d["id"] == "seed-4" and d["expected"] == 1 and d["got"] == 0
        for d in out["disagreements"]
    )


# Bonus: founder-approval gate trips when supabase_client is None --------
async def test_founder_approval_gate_required_without_supabase_client():
    # Make sure FOUNDER_APPROVED is unset for this test.
    prior = os.environ.pop("FOUNDER_APPROVED", None)
    try:
        with pytest.raises(RuntimeError, match="FOUNDER_APPROVED"):
            await run_validation_slice(n=5, supabase_client=None)
    finally:
        if prior is not None:
            os.environ["FOUNDER_APPROVED"] = prior
