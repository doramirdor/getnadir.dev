"""Outcome-Conditioned Retraining (OCR) pipeline.

Weekly job that closes the verifier feedback loop:

  1. Sample `n` rows from `cascade_decisions` in the last `days` days,
     stratified by `verifier_accepted` for balanced labels.
  2. Join with `usage_logs` (on request_id) to retrieve the served
     response. Skip rows where the prompt was hashed
     (`store_prompts=false`) — we cannot judge what we cannot read.
  3. For each (prompt, response), call `OCRJudge.judge()`.
  4. Find disagreements between the verifier and the judge. Keep only
     judge calls with confidence >= 0.7 so the next training round
     learns from high-quality labels.
  5. Write the disagreements to a JSONL file shaped for
     `verifier/train_local.py`.

The retraining itself runs on Colab. This module stops at the JSONL.

This file builds infrastructure only — `run_weekly()` is not wired to
Celery and the operator must explicitly approve LLM cost before live
execution (see `verifier/ocr_runbook.md`). All I/O is testable via the
fake Supabase + injected judge pattern used in `test_ocr_pipeline.py`.
"""

from __future__ import annotations

import json
import logging
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Confidence floor for judge labels. Below this we treat the label as
# noisy and exclude the row from the disagreement set. Calibrated to
# match the OAuth-judge `min_confidence` default used in the seed-label
# pipeline (verifier/oauth_judge.py).
DISAGREEMENT_CONFIDENCE_FLOOR: float = 0.7


# Prefix used by `supabase_unified_llm_service._redact_for_privacy` when
# `user_session.store_prompts=False`. Rows starting with this prefix
# have no usable prompt text and must be skipped.
HASHED_PROMPT_PREFIX: str = "sha256:"


class OCRPipeline:
    """Sample, judge, extract disagreements, write training set."""

    def __init__(
        self,
        supabase: Any,
        judge: Any,
    ) -> None:
        self.supabase = supabase
        self.judge = judge

    # ------------------------------------------------------------------
    # 1. Sampling
    # ------------------------------------------------------------------

    async def sample_decisions(
        self,
        n: int = 500,
        days: int = 7,
        stratify: bool = True,
    ) -> List[Dict[str, Any]]:
        """Sample `n` rows from cascade_decisions in the last `days` days.

        With stratify=True, returns balanced accepted/rejected samples
        (n/2 each, or as close as the underlying data allows). With
        stratify=False, returns a random sample of size n drawn from
        all rows in the window.

        Live cascade_decisions can be millions of rows. We rely on the
        caller-provided supabase client's `.limit(...)` to keep the
        scan bounded; for stratified sampling we pull 5x the requested
        slice to give random.sample enough headroom.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        if stratify:
            half = max(1, n // 2)
            # Headroom multiplier so random.sample has variety to draw
            # from when the window has more than `n` rows.
            scan_limit = max(half * 5, half)

            accepted_rows = await self._fetch_decisions(
                cutoff=cutoff,
                verifier_accepted=True,
                limit=scan_limit,
            )
            rejected_rows = await self._fetch_decisions(
                cutoff=cutoff,
                verifier_accepted=False,
                limit=scan_limit,
            )

            sampled_accepted = _random_subset(accepted_rows, half)
            sampled_rejected = _random_subset(rejected_rows, n - len(sampled_accepted))

            combined = sampled_accepted + sampled_rejected
            random.shuffle(combined)
            return combined

        rows = await self._fetch_decisions(
            cutoff=cutoff,
            verifier_accepted=None,
            limit=max(n * 5, n),
        )
        return _random_subset(rows, n)

    async def _fetch_decisions(
        self,
        cutoff: str,
        verifier_accepted: Optional[bool],
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Single supabase scan against cascade_decisions."""
        query = self.supabase.table("cascade_decisions").select("*").gte(
            "created_at", cutoff
        )
        if verifier_accepted is not None:
            query = query.eq("verifier_accepted", verifier_accepted)
        query = query.limit(limit)
        result = query.execute()
        data = getattr(result, "data", None)
        if data is None and isinstance(result, dict):
            data = result.get("data")
        return list(data or [])

    # ------------------------------------------------------------------
    # 2. Response fetch
    # ------------------------------------------------------------------

    async def fetch_responses(
        self, request_ids: List[str]
    ) -> Dict[str, Dict[str, str]]:
        """Fetch served (prompt, response) for each request_id.

        Rows where prompt was hashed for privacy
        (`store_prompts=false` → 'sha256:<hex>') are silently skipped.
        Rows missing either prompt or response are skipped.
        """
        if not request_ids:
            return {}

        # Batch in groups so we don't blow up the .in_() URL length.
        out: Dict[str, Dict[str, str]] = {}
        for batch in _chunk(request_ids, 100):
            query = (
                self.supabase.table("usage_logs")
                .select("request_id, prompt, response")
                .in_("request_id", batch)
            )
            result = query.execute()
            data = getattr(result, "data", None) or (
                result.get("data") if isinstance(result, dict) else None
            ) or []
            for row in data:
                request_id = row.get("request_id")
                prompt = row.get("prompt")
                response = row.get("response")
                if not request_id or prompt is None or response is None:
                    continue
                if isinstance(prompt, str) and prompt.startswith(HASHED_PROMPT_PREFIX):
                    # Privacy contract: cannot judge what we cannot read.
                    continue
                if not isinstance(prompt, str) or not isinstance(response, str):
                    continue
                if not prompt.strip() or not response.strip():
                    continue
                out[str(request_id)] = {"prompt": prompt, "response": response}
        return out

    # ------------------------------------------------------------------
    # 3. Judge labeling
    # ------------------------------------------------------------------

    async def label_with_judge(
        self, samples: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Call the judge for each sample and attach its verdict.

        Samples missing `prompt` or `response` are skipped silently.
        Returns a new list — does not mutate the input.
        """
        labeled: List[Dict[str, Any]] = []
        for sample in samples:
            prompt = sample.get("prompt")
            response = sample.get("response")
            if not prompt or not response:
                continue
            try:
                verdict = await self.judge.judge(prompt, response)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "ocr_pipeline: judge call failed for %s: %s",
                    sample.get("request_id"),
                    exc,
                )
                continue
            enriched = dict(sample)
            enriched["judge_accept"] = bool(verdict.get("accept"))
            enriched["judge_confidence"] = float(verdict.get("confidence", 0.0))
            enriched["judge_reasoning"] = str(verdict.get("reasoning", ""))
            labeled.append(enriched)
        return labeled

    # ------------------------------------------------------------------
    # 4. Disagreement extraction
    # ------------------------------------------------------------------

    def find_disagreements(
        self, labeled: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Rows where the verifier and the judge disagree.

        Filters out rows with judge_confidence below
        `DISAGREEMENT_CONFIDENCE_FLOOR` so we never train on noisy labels.
        """
        out: List[Dict[str, Any]] = []
        for row in labeled:
            if "verifier_accepted" not in row or "judge_accept" not in row:
                continue
            confidence = float(row.get("judge_confidence", 0.0))
            if confidence < DISAGREEMENT_CONFIDENCE_FLOOR:
                continue
            if bool(row["verifier_accepted"]) != bool(row["judge_accept"]):
                out.append(row)
        return out

    # ------------------------------------------------------------------
    # 5. Training-set writer
    # ------------------------------------------------------------------

    def write_training_set(
        self, disagreements: List[Dict[str, Any]], output_path: Path
    ) -> int:
        """Write JSONL shaped for `verifier/train_local.py`.

        Schema per row:
            {"prompt", "cheap_answer", "expensive_answer", "label",
             "judge_confidence", "judge_reasoning", "source_request_id"}

        Label mapping (disagreements only):
          * judge_accept=True, verifier_accepted=False
              → label=1 ("cheap was actually fine, verifier was too strict")
          * judge_accept=False, verifier_accepted=True
              → label=0 ("verifier missed it, cheap was actually bad")

        We don't have the expensive answer at log time (the cheap one is
        what was served), so `expensive_answer` is left blank — the
        train_local script tolerates this for the cross-encoder format
        used by the verifier.

        Returns the number of rows written.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        written = 0
        with output_path.open("w", encoding="utf-8") as f:
            for row in disagreements:
                judge_accept = bool(row.get("judge_accept"))
                record = {
                    "prompt": row.get("prompt", ""),
                    "cheap_answer": row.get("response", ""),
                    "expensive_answer": "",
                    "label": 1 if judge_accept else 0,
                    "judge_confidence": float(row.get("judge_confidence", 0.0)),
                    "judge_reasoning": row.get("judge_reasoning", ""),
                    "source_request_id": row.get("request_id", ""),
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                written += 1
        return written

    # ------------------------------------------------------------------
    # 6. Orchestrator
    # ------------------------------------------------------------------

    async def run_weekly(
        self,
        output_path: Path,
        n: int = 500,
        days: int = 7,
    ) -> Dict[str, Any]:
        """End-to-end. Returns a stats dict for monitoring."""
        decisions = await self.sample_decisions(n=n, days=days, stratify=True)
        sampled = len(decisions)

        request_ids = [str(d["request_id"]) for d in decisions if d.get("request_id")]
        responses = await self.fetch_responses(request_ids)
        fetched = len(responses)

        # Inner-join the decisions with their corresponding response text.
        joined: List[Dict[str, Any]] = []
        for d in decisions:
            rid = str(d.get("request_id") or "")
            if rid not in responses:
                continue
            merged = dict(d)
            merged["prompt"] = responses[rid]["prompt"]
            merged["response"] = responses[rid]["response"]
            joined.append(merged)

        labeled = await self.label_with_judge(joined)
        judged = len(labeled)

        disagreements = self.find_disagreements(labeled)
        written = self.write_training_set(disagreements, output_path)

        return {
            "sampled": sampled,
            "fetched": fetched,
            "judged": judged,
            "disagreements_written": written,
            "output_path": str(output_path),
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _random_subset(rows: List[Dict[str, Any]], n: int) -> List[Dict[str, Any]]:
    if n <= 0 or not rows:
        return []
    if len(rows) <= n:
        return list(rows)
    return random.sample(rows, n)


def _chunk(items: List[Any], size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]
