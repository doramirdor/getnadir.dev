"""Seed 15 validation triples into `verifier_training_corpus`.

Defaults to --dry-run: prints what would be inserted but writes nothing
to Supabase and produces a `seed_labels.json` next to this file mapping
each row_id to its expected human label (or null for observation-only).

Companion to validation-oauth-judge.md "verifier/seed_validation_triples.py".

15 triples (5 calibration-graded + 10 observation-only):
  1. "What is 2+2?" cheap correct -> expected 1 (acceptable)
  2. "What year did WW2 end?" cheap factually wrong -> expected 0
  3. Code task with off-by-one bug in cheap -> expected 0
  4. Two reasonable one-sentence summaries -> expected 1 (acceptable)
  5. Borderline incomplete-but-not-wrong -> expected None (observation-only)
  6-15. Ten synthetic triples spanning math, code, summarization, instructions,
        translation, and reasoning. expected_label=None (observation-only:
        validation_runner records the judge's label and rationale but does not
        count them in the calibration agreement score).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

SEED_TRIPLES: list[dict] = [
    {
        "prompt": "What is 2 + 2?",
        "cheap_answer": "4",
        "expensive_answer": "2 + 2 = 4. This is basic addition.",
        "expected_label": 1,
        "domain_hint": "math_trivial",
        "note": "Cheap is correct and complete; expensive only adds non-essential context.",
    },
    {
        "prompt": "In what year did World War II end?",
        "cheap_answer": "World War II ended in 1944.",
        "expensive_answer": "World War II ended in 1945, with Japan's formal surrender signed on September 2, 1945.",
        "expected_label": 0,
        "domain_hint": "history_factual",
        "note": "Cheap is factually wrong; expensive corrects the year.",
    },
    {
        "prompt": (
            "Write a Python function `sum_to(n)` that returns the sum of all integers "
            "from 1 to n inclusive."
        ),
        "cheap_answer": (
            "def sum_to(n):\n"
            "    total = 0\n"
            "    for i in range(1, n):\n"
            "        total += i\n"
            "    return total\n"
        ),
        "expensive_answer": (
            "def sum_to(n):\n"
            "    total = 0\n"
            "    for i in range(1, n + 1):\n"
            "        total += i\n"
            "    return total\n"
        ),
        "expected_label": 0,
        "domain_hint": "code_correctness",
        "note": "Cheap has an off-by-one bug (excludes n); expensive includes n correctly.",
    },
    {
        "prompt": (
            "Summarize this paragraph in one sentence: 'Photosynthesis is the process "
            "by which green plants use sunlight to synthesize foods from carbon dioxide "
            "and water, releasing oxygen as a byproduct.'"
        ),
        "cheap_answer": (
            "Photosynthesis lets green plants turn sunlight, CO2, and water into food "
            "and oxygen."
        ),
        "expensive_answer": (
            "Photosynthesis is the process where plants use sunlight to convert carbon "
            "dioxide and water into food, producing oxygen as a byproduct."
        ),
        "expected_label": 1,
        "domain_hint": "summarization",
        "note": "Two reasonable, semantically equivalent one-sentence summaries.",
    },
    {
        "prompt": (
            "List three benefits of regular exercise."
        ),
        "cheap_answer": (
            "1. It improves cardiovascular health.\n"
            "2. It helps with weight management."
        ),
        "expensive_answer": (
            "1. Improves cardiovascular health.\n"
            "2. Helps manage weight.\n"
            "3. Improves mood and reduces symptoms of depression and anxiety."
        ),
        "expected_label": None,
        "domain_hint": "list_completeness",
        "note": (
            "Borderline: cheap gives only 2 of 3 requested items. Not factually wrong, "
            "but materially incomplete relative to the explicit ask. Recorded for human "
            "review, excluded from calibration agreement scoring."
        ),
    },
    # ---- Observation-only triples (expected_label=None, variance check) ----
    {
        "prompt": "Translate 'good morning' into Spanish.",
        "cheap_answer": "Buenos dias.",
        "expensive_answer": "Buenos días. (Note: the 'i' carries an acute accent.)",
        "expected_label": None,
        "domain_hint": "translation_short",
        "note": "Both correct; expensive only adds a typographic note.",
    },
    {
        "prompt": "What is the boiling point of water at sea level in Celsius?",
        "cheap_answer": "100",
        "expensive_answer": "100 degrees Celsius at standard atmospheric pressure (1 atm).",
        "expected_label": None,
        "domain_hint": "science_factual",
        "note": "Both correct; expensive adds the standard-pressure caveat.",
    },
    {
        "prompt": "Write a one-line Python expression to reverse the string s.",
        "cheap_answer": "s[::-1]",
        "expensive_answer": "''.join(reversed(s))",
        "expected_label": None,
        "domain_hint": "code_idiom",
        "note": "Both work; cheap is more idiomatic.",
    },
    {
        "prompt": "Name the three branches of the United States federal government.",
        "cheap_answer": "Executive, Legislative, Judicial.",
        "expensive_answer": "Executive (President), Legislative (Congress), and Judicial (Supreme Court).",
        "expected_label": None,
        "domain_hint": "civics_factual",
        "note": "Both complete; expensive adds canonical examples.",
    },
    {
        "prompt": "What does the SQL keyword JOIN do?",
        "cheap_answer": "It connects rows from two tables.",
        "expensive_answer": "JOIN combines rows from two or more tables based on a related column between them; common variants include INNER, LEFT, RIGHT, and FULL OUTER.",
        "expected_label": None,
        "domain_hint": "technical_definition",
        "note": "Cheap is correct but terse; expensive adds variants.",
    },
    {
        "prompt": "Convert 25 Celsius to Fahrenheit.",
        "cheap_answer": "75 F",
        "expensive_answer": "77 degrees Fahrenheit (25 * 9/5 + 32 = 77).",
        "expected_label": None,
        "domain_hint": "math_conversion",
        "note": "Cheap is factually wrong (off by 2). Worth seeing if the judge catches it.",
    },
    {
        "prompt": "Explain what 'idempotent' means in the context of HTTP methods.",
        "cheap_answer": "An idempotent HTTP method can be called multiple times without different outcomes.",
        "expensive_answer": "An HTTP method is idempotent if making the same request multiple times produces the same server state as making it once. GET, PUT, and DELETE are idempotent; POST is not.",
        "expected_label": None,
        "domain_hint": "technical_definition",
        "note": "Both reasonable; expensive adds the canonical method classification.",
    },
    {
        "prompt": "What is the time complexity of binary search?",
        "cheap_answer": "O(log n).",
        "expensive_answer": "Binary search has O(log n) time complexity on a sorted array, where n is the number of elements.",
        "expected_label": None,
        "domain_hint": "algorithms",
        "note": "Both correct; expensive adds the precondition (sorted).",
    },
    {
        "prompt": "Write a haiku about a router.",
        "cheap_answer": "Packets find their way.\nThe router sends each one home.\nLights blink in the dark.",
        "expensive_answer": "Routes converge at dawn.\nA quiet machine decides:\nfast path, less burned light.",
        "expected_label": None,
        "domain_hint": "creative_short",
        "note": "Both are valid haikus on the topic; subjective quality.",
    },
    {
        "prompt": "How do I create a new Git branch named feature/x and switch to it?",
        "cheap_answer": "git checkout -b feature/x",
        "expensive_answer": "Modern Git: `git switch -c feature/x`. Legacy: `git checkout -b feature/x`. Both create the branch and check it out.",
        "expected_label": None,
        "domain_hint": "tools_howto",
        "note": "Cheap is correct legacy form; expensive adds the modern alternative.",
    },
]


def _build_rows(cheap_model: str, expensive_model: str) -> list[dict]:
    rows: list[dict] = []
    for triple in SEED_TRIPLES:
        row_id = str(uuid.uuid4())
        rows.append(
            {
                "id": row_id,
                "prompt": triple["prompt"],
                "cheap_answer": triple["cheap_answer"],
                "expensive_answer": triple["expensive_answer"],
                "cheap_model": cheap_model,
                "expensive_model": expensive_model,
                "label": None,
                "label_source": "pending_oauth_judge",
                "label_confidence": None,
                "domain_hint": triple["domain_hint"],
                "added_by": "seed_validation_triples",
                "_expected_label": triple["expected_label"],
                "_note": triple["note"],
            }
        )
    return rows


def _write_seed_labels(rows: list[dict], out_path: Path) -> None:
    mapping = {r["id"]: r["_expected_label"] for r in rows}
    out_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")


def _persist_rows(supabase_client: Any, rows: list[dict]) -> None:
    """Strip the leading-underscore audit fields and insert into the
    corpus table. Only called when --dry-run is explicitly off AND
    FOUNDER_APPROVED=1.
    """
    payload = [
        {k: v for k, v in r.items() if not k.startswith("_")} for r in rows
    ]
    op = supabase_client.table("verifier_training_corpus").insert(payload)
    op.execute()


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Seed 15 validation triples (5 graded + 10 observation-only; default: dry-run)."
    )
    # Default is dry-run TRUE. Real inserts require --no-dry-run AND
    # FOUNDER_APPROVED=1.
    parser.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        default=True,
        help="Print what would be inserted; do not write to Supabase (default).",
    )
    parser.add_argument(
        "--no-dry-run",
        dest="dry_run",
        action="store_false",
        help="Actually insert rows. Requires FOUNDER_APPROVED=1.",
    )
    parser.add_argument(
        "--cheap-model",
        type=str,
        default="claude-haiku-4-5",
        help="Value for `cheap_model` column.",
    )
    parser.add_argument(
        "--expensive-model",
        type=str,
        default="claude-opus-4-6",
        help="Value for `expensive_model` column.",
    )
    parser.add_argument(
        "--labels-out",
        type=str,
        default=str(Path(__file__).resolve().parent / "seed_labels.json"),
        help="Where to write seed_labels.json (row_id -> expected label).",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    rows = _build_rows(args.cheap_model, args.expensive_model)
    _write_seed_labels(rows, Path(args.labels_out))

    if args.dry_run:
        print("DRY RUN — would insert the following rows (no Supabase write):")
        for r in rows:
            preview = {
                "id": r["id"],
                "prompt": r["prompt"][:80],
                "expected_label": r["_expected_label"],
                "note": r["_note"],
            }
            print(json.dumps(preview, indent=2))
        print(f"\nSeed labels written to: {args.labels_out}")
        print(
            "\nTo actually insert, set FOUNDER_APPROVED=1 and re-run with --no-dry-run."
        )
        return 0

    if os.getenv("FOUNDER_APPROVED") != "1":
        print(
            "Refusing to insert: FOUNDER_APPROVED is not set. "
            "Re-run with `FOUNDER_APPROVED=1 ... --no-dry-run`.",
            file=sys.stderr,
        )
        return 2

    from supabase import create_client  # type: ignore

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    client = create_client(url, key)
    _persist_rows(client, rows)
    print(f"Inserted {len(rows)} seed rows; labels written to {args.labels_out}.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
