"""Tests for OCRPipeline (weekly outcome-conditioned retraining loop).

All tests use an in-memory fake Supabase client and an injected fake
judge. No network, no real LiteLLM, no Colab.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from app.services.ocr_pipeline import (
    DISAGREEMENT_CONFIDENCE_FLOOR,
    HASHED_PROMPT_PREFIX,
    OCRPipeline,
)


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _FakeTable:
    """Query-builder fake that records filters and applies them on .execute()."""

    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._filters: List = []
        self._select_cols: Optional[str] = None
        self._limit: Optional[int] = None

    def select(self, cols: str = "*"):
        self._select_cols = cols
        return self

    def gte(self, col: str, value: Any):
        self._filters.append(("gte", col, value))
        return self

    def eq(self, col: str, value: Any):
        self._filters.append(("eq", col, value))
        return self

    def in_(self, col: str, values: List[Any]):
        self._filters.append(("in", col, list(values)))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def execute(self) -> _FakeResult:
        rows = list(self._rows)
        for op, col, value in self._filters:
            if op == "gte":
                rows = [r for r in rows if r.get(col) is not None and r[col] >= value]
            elif op == "eq":
                rows = [r for r in rows if r.get(col) == value]
            elif op == "in":
                rows = [r for r in rows if r.get(col) in value]
        if self._limit is not None:
            rows = rows[: self._limit]
        # Apply projection if columns were requested explicitly.
        if self._select_cols and self._select_cols != "*":
            wanted = [c.strip() for c in self._select_cols.split(",")]
            rows = [{k: r.get(k) for k in wanted} for r in rows]
        return _FakeResult(rows)


class _FakeSupabase:
    def __init__(self):
        self.cascade_decisions: List[Dict[str, Any]] = []
        self.usage_logs: List[Dict[str, Any]] = []

    def table(self, name: str) -> _FakeTable:
        if name == "cascade_decisions":
            return _FakeTable(self.cascade_decisions)
        if name == "usage_logs":
            return _FakeTable(self.usage_logs)
        raise AssertionError(f"unexpected table: {name}")


# ---------------------------------------------------------------------------
# Fake judge
# ---------------------------------------------------------------------------


class _FakeJudge:
    """Deterministic judge keyed off (prompt, response) → verdict dict."""

    def __init__(self, verdicts: Optional[Dict[tuple, Dict[str, Any]]] = None,
                 default: Optional[Dict[str, Any]] = None):
        self.verdicts = verdicts or {}
        self.default = default or {
            "accept": True,
            "confidence": 0.9,
            "reasoning": "default",
            "raw": "{}",
        }
        self.calls: List[tuple] = []

    async def judge(self, prompt: str, response: str) -> Dict[str, Any]:
        self.calls.append((prompt, response))
        if (prompt, response) in self.verdicts:
            return self.verdicts[(prompt, response)]
        return self.default


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _seed_decisions(supabase: _FakeSupabase, *, accepted: int, rejected: int) -> None:
    """Drop in `accepted` accepted + `rejected` rejected rows with recent timestamps."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    for i in range(accepted):
        rid = f"acc-{i}"
        supabase.cascade_decisions.append(
            {
                "request_id": rid,
                "user_id": "u1",
                "cheap_model": "claude-haiku-4-5",
                "escalation_model": "claude-sonnet-4-6",
                "verifier_score": 0.85,
                "acceptance_threshold": 0.70,
                "verifier_accepted": True,
                "escalated": False,
                "shadow_mode": False,
                "verifier_latency_ms": 12,
                "created_at": now,
            }
        )
        supabase.usage_logs.append(
            {
                "request_id": rid,
                "prompt": f"accepted prompt {i}",
                "response": f"accepted response {i}",
            }
        )
    for i in range(rejected):
        rid = f"rej-{i}"
        supabase.cascade_decisions.append(
            {
                "request_id": rid,
                "user_id": "u1",
                "cheap_model": "claude-haiku-4-5",
                "escalation_model": "claude-sonnet-4-6",
                "verifier_score": 0.42,
                "acceptance_threshold": 0.70,
                "verifier_accepted": False,
                "escalated": True,
                "shadow_mode": False,
                "verifier_latency_ms": 15,
                "created_at": now,
            }
        )
        supabase.usage_logs.append(
            {
                "request_id": rid,
                "prompt": f"rejected prompt {i}",
                "response": f"rejected response {i}",
            }
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_sample_decisions_stratified_returns_balanced():
    sb = _FakeSupabase()
    _seed_decisions(sb, accepted=100, rejected=100)
    pipeline = OCRPipeline(supabase=sb, judge=_FakeJudge())

    rows = asyncio.run(pipeline.sample_decisions(n=40, days=7, stratify=True))
    assert len(rows) == 40
    accepted = [r for r in rows if r["verifier_accepted"]]
    rejected = [r for r in rows if not r["verifier_accepted"]]
    # Strictly balanced (n/2 each) when both buckets have enough rows.
    assert len(accepted) == 20
    assert len(rejected) == 20


def test_sample_decisions_unstratified_returns_random_sample():
    sb = _FakeSupabase()
    _seed_decisions(sb, accepted=50, rejected=50)
    pipeline = OCRPipeline(supabase=sb, judge=_FakeJudge())

    rows = asyncio.run(pipeline.sample_decisions(n=30, days=7, stratify=False))
    assert len(rows) == 30
    # No guarantee on balance — just that the rows came from the pool.
    request_ids = {r["request_id"] for r in rows}
    assert len(request_ids) == 30


def test_fetch_responses_skips_hashed_prompts():
    sb = _FakeSupabase()
    sb.usage_logs.extend(
        [
            {"request_id": "good", "prompt": "real prompt", "response": "real answer"},
            {
                "request_id": "hashed",
                "prompt": f"{HASHED_PROMPT_PREFIX}deadbeef",
                "response": "would-be-ok",
            },
            {"request_id": "no-resp", "prompt": "x", "response": None},
            {"request_id": "empty", "prompt": "   ", "response": "ok"},
        ]
    )
    pipeline = OCRPipeline(supabase=sb, judge=_FakeJudge())

    out = asyncio.run(
        pipeline.fetch_responses(["good", "hashed", "no-resp", "empty", "missing"])
    )
    assert set(out.keys()) == {"good"}
    assert out["good"]["prompt"] == "real prompt"


def test_label_with_judge_skips_samples_missing_prompt_or_response():
    judge = _FakeJudge()
    pipeline = OCRPipeline(supabase=_FakeSupabase(), judge=judge)

    samples = [
        {"request_id": "1", "prompt": "p1", "response": "r1", "verifier_accepted": True},
        {"request_id": "2", "prompt": "", "response": "r2", "verifier_accepted": True},
        {"request_id": "3", "prompt": "p3", "response": None, "verifier_accepted": False},
        {"request_id": "4", "prompt": "p4", "response": "r4", "verifier_accepted": False},
    ]
    labeled = asyncio.run(pipeline.label_with_judge(samples))
    assert {row["request_id"] for row in labeled} == {"1", "4"}
    assert len(judge.calls) == 2
    for row in labeled:
        assert "judge_accept" in row
        assert "judge_confidence" in row
        assert "judge_reasoning" in row


def test_find_disagreements_returns_only_mismatches():
    pipeline = OCRPipeline(supabase=_FakeSupabase(), judge=_FakeJudge())
    labeled = [
        # Agreement (both accept) → drop.
        {"request_id": "a", "verifier_accepted": True, "judge_accept": True,
         "judge_confidence": 0.95},
        # Agreement (both reject) → drop.
        {"request_id": "b", "verifier_accepted": False, "judge_accept": False,
         "judge_confidence": 0.95},
        # Disagreement → keep.
        {"request_id": "c", "verifier_accepted": True, "judge_accept": False,
         "judge_confidence": 0.9},
        # Disagreement → keep.
        {"request_id": "d", "verifier_accepted": False, "judge_accept": True,
         "judge_confidence": 0.85},
    ]
    out = pipeline.find_disagreements(labeled)
    assert {row["request_id"] for row in out} == {"c", "d"}


def test_find_disagreements_filters_low_confidence():
    pipeline = OCRPipeline(supabase=_FakeSupabase(), judge=_FakeJudge())
    floor = DISAGREEMENT_CONFIDENCE_FLOOR
    labeled = [
        {"request_id": "hi", "verifier_accepted": True, "judge_accept": False,
         "judge_confidence": floor + 0.05},
        {"request_id": "lo", "verifier_accepted": True, "judge_accept": False,
         "judge_confidence": floor - 0.05},
        # Exactly at the floor → kept.
        {"request_id": "edge", "verifier_accepted": False, "judge_accept": True,
         "judge_confidence": floor},
    ]
    out = pipeline.find_disagreements(labeled)
    assert {row["request_id"] for row in out} == {"hi", "edge"}


def test_write_training_set_writes_correct_shape_and_labels(tmp_path: Path):
    pipeline = OCRPipeline(supabase=_FakeSupabase(), judge=_FakeJudge())
    disagreements = [
        # judge_accept=True → label=1.
        {
            "request_id": "r1",
            "prompt": "what is 2+2?",
            "response": "4",
            "verifier_accepted": False,
            "judge_accept": True,
            "judge_confidence": 0.9,
            "judge_reasoning": "correct math",
        },
        # judge_accept=False → label=0.
        {
            "request_id": "r2",
            "prompt": "capital of France?",
            "response": "Berlin",
            "verifier_accepted": True,
            "judge_accept": False,
            "judge_confidence": 0.95,
            "judge_reasoning": "wrong city",
        },
    ]
    out_path = tmp_path / "training.jsonl"
    written = pipeline.write_training_set(disagreements, out_path)
    assert written == 2

    lines = out_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    rec1 = json.loads(lines[0])
    rec2 = json.loads(lines[1])

    # Shape compatible with verifier/train_local.py.
    for rec in (rec1, rec2):
        for field in ("prompt", "cheap_answer", "expensive_answer", "label"):
            assert field in rec

    assert rec1["label"] == 1
    assert rec1["cheap_answer"] == "4"
    assert rec1["source_request_id"] == "r1"
    assert rec2["label"] == 0
    assert rec2["cheap_answer"] == "Berlin"


def test_run_weekly_end_to_end_returns_stats_dict(tmp_path: Path):
    sb = _FakeSupabase()
    _seed_decisions(sb, accepted=20, rejected=20)

    # Build a judge that disagrees on a known subset.
    # For rejected rows, judge says "accept" with high confidence → disagreement.
    verdicts: Dict[tuple, Dict[str, Any]] = {}
    for i in range(20):
        # Judge disagrees with verifier on rejected rows.
        verdicts[(f"rejected prompt {i}", f"rejected response {i}")] = {
            "accept": True,
            "confidence": 0.92,
            "reasoning": "actually fine",
            "raw": "{}",
        }
        # Judge agrees with verifier on accepted rows.
        verdicts[(f"accepted prompt {i}", f"accepted response {i}")] = {
            "accept": True,
            "confidence": 0.92,
            "reasoning": "also fine",
            "raw": "{}",
        }
    judge = _FakeJudge(verdicts=verdicts)
    pipeline = OCRPipeline(supabase=sb, judge=judge)

    out_path = tmp_path / "ocr_training.jsonl"
    stats = asyncio.run(pipeline.run_weekly(out_path, n=20, days=7))

    expected_keys = {
        "sampled",
        "fetched",
        "judged",
        "disagreements_written",
        "output_path",
    }
    assert set(stats.keys()) == expected_keys
    assert stats["sampled"] == 20
    assert stats["fetched"] == 20
    assert stats["judged"] == 20
    # Half the sample is rejected rows → those become disagreements.
    assert stats["disagreements_written"] == 10
    assert stats["output_path"] == str(out_path)
    assert out_path.exists()
    # Every written row must be a disagreement labelled 1 (judge accepted).
    for line in out_path.read_text().strip().splitlines():
        rec = json.loads(line)
        assert rec["label"] == 1
