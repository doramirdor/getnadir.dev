"""Validation-slice runner for the OAuth judge.

Day-1 (this file): implementation + mocked tests. NO real OAuth calls.

Day-2 (founder-approved): pulls up to N=100 pending triples from
`verifier_training_corpus`, sends each through `OAuthJudgeClient`,
upserts labels, and writes a JSON report.

Hard gates:
  - `n > 100` raises ValueError synchronously at function entry.
  - `FOUNDER_APPROVED=1` env var is required when `supabase_client`
    is None (i.e. real-Supabase mode). In test mode the caller passes
    a mock client and the gate is bypassed.
  - 3 consecutive errored judge calls → kill switch.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from oauth_judge import JudgeResult, OAuthJudgeClient  # type: ignore

logger = logging.getLogger(__name__)

MAX_N = 100
KILL_SWITCH_CONSECUTIVE_ERRORS = 3
PENDING_LABEL_SOURCE = "pending_oauth_judge"
JUDGED_LABEL_SOURCE = "oauth_judge"


async def run_validation_slice(
    n: int = 50,
    judge_client: Optional[OAuthJudgeClient] = None,
    supabase_client: Any = None,
    report_dir: str = "verifier/reports",
    seed_triple_ids: Optional[list[str]] = None,
) -> dict:
    """Run a bounded validation slice through the OAuth judge.

    Args:
        n: How many pending triples to judge. Must be <= 100.
        judge_client: OAuthJudgeClient (real or mocked).
        supabase_client: Supabase client with `.table().select()...` and
            `.table().update().eq().execute()` semantics. If None, the
            function refuses to run unless FOUNDER_APPROVED=1.
        report_dir: Where to write the JSON report. Created if absent.
        seed_triple_ids: Optional list of seed-row UUIDs. When present,
            calibration is computed against `verifier/seed_labels.json`.

    Returns:
        The report dict (also persisted to `report_dir`).
    """
    if n > MAX_N:
        raise ValueError(f"max allowed N is {MAX_N}; got {n}")
    if n <= 0:
        raise ValueError(f"N must be positive; got {n}")

    if supabase_client is None and os.getenv("FOUNDER_APPROVED") != "1":
        raise RuntimeError(
            "Set FOUNDER_APPROVED=1 to confirm TOS review before running real OAuth calls."
        )

    if judge_client is None:
        # Defer construction: instantiating OAuthJudgeClient without
        # overrides will try to import nadirclaw.credentials. Only do
        # this when the caller did not supply a client.
        judge_client = OAuthJudgeClient()

    started_at = datetime.now(timezone.utc)
    started_monotonic = time.monotonic()

    pending_rows = await _fetch_pending_rows(supabase_client, n)
    logger.info("validation slice: %d pending rows fetched", len(pending_rows))

    consecutive_errors = 0
    abort_reason: Optional[str] = None
    judged_results: list[dict] = []
    n_errors = 0
    label_distribution = {"0": 0, "1": 0}
    confidence_sum = 0.0
    confidence_count = 0

    for row in pending_rows:
        result = await judge_client.judge_triple(
            prompt=row["prompt"],
            cheap_answer=row["cheap_answer"],
            expensive_answer=row["expensive_answer"],
            cheap_model=row.get("cheap_model", "claude-haiku-4-5"),
            expensive_model=row.get("expensive_model", "claude-opus-4-6"),
        )

        record = {
            "id": row["id"],
            "prompt": row["prompt"],
            "cheap_answer": row["cheap_answer"],
            "expensive_answer": row["expensive_answer"],
            "label": result.label,
            "confidence": result.confidence,
            "rationale": result.rationale,
            "error": result.error,
            "pending_review": result.pending_review,
        }
        judged_results.append(record)

        if result.error is not None:
            n_errors += 1
            consecutive_errors += 1
            if consecutive_errors >= KILL_SWITCH_CONSECUTIVE_ERRORS:
                abort_reason = (
                    f"kill_switch: {KILL_SWITCH_CONSECUTIVE_ERRORS} consecutive errors; "
                    f"last error={result.error}"
                )
                logger.error(abort_reason)
                break
            continue

        # Successful judge call: reset the streak and persist the label.
        consecutive_errors = 0
        if result.label is not None and not result.pending_review:
            label_distribution[str(result.label)] = label_distribution.get(str(result.label), 0) + 1
            confidence_sum += result.confidence
            confidence_count += 1
            await _upsert_label(
                supabase_client,
                row_id=row["id"],
                label=result.label,
                confidence=result.confidence,
            )

    wall_time_seconds = time.monotonic() - started_monotonic
    n_judged = sum(label_distribution.values())

    # Naive linear extrapolation. Useful as a back-of-envelope only.
    if n_judged > 0:
        per_call_seconds = wall_time_seconds / max(n_judged, 1)
        estimated_full_batch_seconds = int(per_call_seconds * 10_000)
    else:
        estimated_full_batch_seconds = 0

    avg_confidence = (confidence_sum / confidence_count) if confidence_count else 0.0

    # Calibration against seed triples (if any).
    calibration: dict
    if seed_triple_ids:
        seed_triples = _load_seed_labels()
        seed_subset = [r for r in judged_results if r["id"] in seed_triple_ids]
        calibration = check_calibration(seed_subset, seed_triples)
    else:
        calibration = {
            "agreed": 0,
            "total": 0,
            "calibration_concern": False,
            "note": "no seed_triple_ids supplied; calibration skipped",
        }

    random_examples = _sample_examples(judged_results, k=min(5, len(judged_results)))

    report = {
        "run_at": started_at.isoformat(),
        "n_requested": n,
        "n_judged": n_judged,
        "n_errors": n_errors,
        "label_distribution": label_distribution,
        "avg_confidence": round(avg_confidence, 4),
        "wall_time_seconds": round(wall_time_seconds, 2),
        "estimated_full_batch_seconds": estimated_full_batch_seconds,
        "calibration": calibration,
        "abort_reason": abort_reason,
        "random_examples": random_examples,
    }

    _write_report(report, report_dir, started_at)
    return report


def check_calibration(judged_results: list[dict], seed_triples: dict) -> dict:
    """Compare judge labels against the human-labeled seed.

    `seed_triples` maps row_id -> expected_label (0, 1, or None).
    Rows with `expected_label is None` are observation-only and are
    excluded from agreement scoring (only the clear-cut triples count).

    Returns:
        {
          "agreed": int, "total": int, "calibration_concern": bool,
          "observed_borderline": [{"id", "judge_label", "judge_rationale"}],
          "disagreements": [{"id", "expected", "got"}],
        }
    `calibration_concern` is True when total > 0 and agreed < total.
    """
    agreed = 0
    total = 0
    observed_borderline: list[dict] = []
    disagreements: list[dict] = []

    for row in judged_results:
        expected = seed_triples.get(row["id"])
        if expected is None:
            observed_borderline.append(
                {
                    "id": row["id"],
                    "judge_label": row.get("label"),
                    "judge_rationale": row.get("rationale", ""),
                }
            )
            continue
        total += 1
        if row.get("label") == expected:
            agreed += 1
        else:
            disagreements.append(
                {"id": row["id"], "expected": expected, "got": row.get("label")}
            )

    calibration_concern = total > 0 and agreed < total
    return {
        "agreed": agreed,
        "total": total,
        "calibration_concern": calibration_concern,
        "observed_borderline": observed_borderline,
        "disagreements": disagreements,
    }


# Internals --------------------------------------------------------------


async def _fetch_pending_rows(supabase_client: Any, n: int) -> list[dict]:
    """Query `verifier_training_corpus` for unlabeled pending-judge rows.

    Returns a list of dicts with at least: id, prompt, cheap_answer,
    expensive_answer, cheap_model, expensive_model.

    Supports both:
      - Real supabase-py client (sync .execute()).
      - Mock clients in tests that return either a dict-like with .data
        or a plain list.
    """
    if supabase_client is None:
        return []

    query = (
        supabase_client.table("verifier_training_corpus")
        .select("id, prompt, cheap_answer, expensive_answer, cheap_model, expensive_model, label, label_source")
        .is_("label", None)
        .eq("label_source", PENDING_LABEL_SOURCE)
        .order("created_at")
        .limit(n)
    )
    result = query.execute()
    data = getattr(result, "data", result)
    if asyncio.iscoroutine(data):
        data = await data
    return list(data or [])


async def _upsert_label(
    supabase_client: Any, row_id: str, label: int, confidence: float
) -> None:
    if supabase_client is None:
        return
    payload = {
        "label": label,
        "label_source": JUDGED_LABEL_SOURCE,
        "label_confidence": confidence,
    }
    op = (
        supabase_client.table("verifier_training_corpus")
        .update(payload)
        .eq("id", row_id)
    )
    result = op.execute()
    awaitable = getattr(result, "data", None)
    if asyncio.iscoroutine(awaitable):
        await awaitable


def _load_seed_labels() -> dict:
    path = Path(__file__).resolve().parent / "seed_labels.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _sample_examples(records: list[dict], k: int) -> list[dict]:
    if not records or k <= 0:
        return []
    sample = random.sample(records, min(k, len(records)))
    out = []
    for r in sample:
        out.append(
            {
                "id": r["id"],
                "prompt": r["prompt"][:300],
                "cheap_answer": (r.get("cheap_answer") or "")[:300],
                "expensive_answer": (r.get("expensive_answer") or "")[:300],
                "label": r.get("label"),
                "rationale": r.get("rationale", ""),
            }
        )
    return out


def _write_report(report: dict, report_dir: str, started_at: datetime) -> Path:
    Path(report_dir).mkdir(parents=True, exist_ok=True)
    # Microsecond precision avoids collisions across rapid retries.
    stem = started_at.strftime("validation_slice_%Y%m%dT%H%M%S_%f")
    path = Path(report_dir) / f"{stem}.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return path


# CLI --------------------------------------------------------------------


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the OAuth-judge validation slice. Requires FOUNDER_APPROVED=1."
    )
    parser.add_argument("--n", type=int, default=50, help="Number of triples (max 100).")
    parser.add_argument(
        "--report-dir",
        type=str,
        default="verifier/reports",
        help="Directory to write the JSON report.",
    )
    return parser


async def _amain(argv: Optional[list[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    # Real-Supabase path. Deferred imports so test envs do not need
    # supabase installed.
    from supabase import create_client  # type: ignore

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    client = create_client(url, key)

    judge = OAuthJudgeClient()
    report = await run_validation_slice(
        n=args.n,
        judge_client=judge,
        supabase_client=client,
        report_dir=args.report_dir,
    )
    print(json.dumps(report, indent=2))
    if report.get("abort_reason"):
        return 1
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    return asyncio.run(_amain(argv))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
