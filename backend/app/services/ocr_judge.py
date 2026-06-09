"""LLM-as-judge for Outcome-Conditioned Retraining (OCR).

The judge inspects a (prompt, response) pair from production logs and
returns a JSON verdict on whether the served response was acceptable.
This is the labeling step in the weekly OCR retraining loop — see
`backend/app/services/ocr_pipeline.py`.

The judge is intentionally minimal:
  * One LiteLLM completion per call, structured-JSON output.
  * Tolerant parser that handles prose-prefixed JSON and stray text
    (Sonnet occasionally adds "Here is my judgement:" before the JSON).
  * Bounded retries with parse-failure fallback so a single bad call
    cannot break the pipeline.

All I/O is dependency-injected via `completion_fn` so tests run without
touching the network. The production default lazily imports LiteLLM only
when first needed, mirroring how `oauth_judge` defers its `httpx` import.

Companion to `verifier/ocr_runbook.md`.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)


# The prompt template is module-level so tests can assert against it.
# Double-braces around the JSON example are required so .format() leaves
# literal braces in the rendered output.
JUDGE_PROMPT_TEMPLATE = """You are evaluating whether an AI assistant's response to a user prompt is acceptable.

Acceptable means: factually correct (no hallucinations), addresses what was asked, complete enough to be useful. Refusals on safe prompts and trivial truncations are NOT acceptable.

PROMPT:
{prompt}

RESPONSE:
{response}

Reply with ONLY valid JSON, no prose, in this exact shape:
{{"accept": true_or_false, "confidence": 0.0_to_1.0, "reasoning": "one short sentence"}}"""


# Regex to fish a JSON object out of prose-prefixed responses. We match
# the first balanced-ish {...} run; the strict json.loads call after
# this catches any false positives.
_JSON_BLOCK_RE = re.compile(r"\{[^{}]*\}", re.DOTALL)


class OCRJudge:
    """LLM-based judge that decides whether a served response was acceptable.

    Uses LiteLLM (already in the backend stack) to call Sonnet-4-6 with a
    structured prompt that returns JSON {accept, confidence, reasoning}.
    Robust to malformed JSON — falls back to a parse heuristic and surfaces
    the parse failure as confidence=0.0.
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-6",
        max_retries: int = 2,
        completion_fn: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.model = model
        self.max_retries = max_retries
        self._completion_fn = completion_fn

    async def _call_llm(self, rendered_prompt: str) -> str:
        """Single LLM call. Returns the raw text content."""
        if self._completion_fn is not None:
            # Test seam. The mock may be sync or async — handle both.
            result = self._completion_fn(
                model=self.model,
                messages=[{"role": "user", "content": rendered_prompt}],
            )
            if hasattr(result, "__await__"):
                result = await result
            return _extract_content(result)

        # Lazy import so importing this module never pulls litellm into
        # test processes that mock everything out.
        from litellm import acompletion  # type: ignore[import-not-found]

        response = await acompletion(
            model=self.model,
            messages=[{"role": "user", "content": rendered_prompt}],
        )
        return _extract_content(response)

    async def judge(self, prompt: str, response: str) -> Dict[str, Any]:
        """Judge a (prompt, response) pair.

        Returns:
            {"accept": bool, "confidence": float, "reasoning": str, "raw": str}

        On total parse failure (after retries) returns
            {"accept": False, "confidence": 0.0,
             "reasoning": "parse_failure", "raw": <last raw>}
        """
        rendered = JUDGE_PROMPT_TEMPLATE.format(prompt=prompt, response=response)
        last_raw = ""
        # Attempts: initial + max_retries.
        attempts = max(1, self.max_retries + 1)
        for attempt in range(attempts):
            try:
                raw = await self._call_llm(rendered)
            except Exception as exc:  # noqa: BLE001
                logger.warning("ocr_judge: LLM call failed (attempt %d): %s", attempt, exc)
                last_raw = f"error: {exc}"
                continue
            last_raw = raw
            parsed = _parse_judge_json(raw)
            if parsed is not None:
                parsed["raw"] = raw
                return parsed
            logger.info("ocr_judge: parse failure on attempt %d", attempt)

        return {
            "accept": False,
            "confidence": 0.0,
            "reasoning": "parse_failure",
            "raw": last_raw,
        }


def _extract_content(response: Any) -> str:
    """Pull the assistant content out of a LiteLLM-shaped response.

    Tolerates both dict and object forms (LiteLLM returns ModelResponse,
    tests usually pass a plain dict).
    """
    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        choices = response.get("choices") or []
        if choices:
            msg = choices[0].get("message") or {}
            return msg.get("content", "") or ""
        return ""
    # Object form (LiteLLM ModelResponse).
    try:
        return response.choices[0].message.content or ""
    except (AttributeError, IndexError):
        return ""


def _parse_judge_json(raw: str) -> Optional[Dict[str, Any]]:
    """Best-effort JSON parser for judge output.

    Strategy:
      1. Strip whitespace and try json.loads directly.
      2. If that fails, find the first {...} substring and try again.
      3. If still failing, return None so the caller can retry.
    """
    if not raw or not raw.strip():
        return None
    candidates = [raw.strip()]
    # If the model prefixed the JSON with prose, try fishing the object out.
    block = _JSON_BLOCK_RE.search(raw)
    if block is not None:
        candidates.append(block.group(0))
    for candidate in candidates:
        try:
            obj = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if not isinstance(obj, dict):
            continue
        if "accept" not in obj:
            continue
        accept = bool(obj.get("accept"))
        try:
            confidence = float(obj.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        # Clamp into [0,1] so a stray confidence=2 doesn't break filtering.
        confidence = max(0.0, min(1.0, confidence))
        reasoning = str(obj.get("reasoning", "")).strip()
        return {
            "accept": accept,
            "confidence": confidence,
            "reasoning": reasoning,
        }
    return None
