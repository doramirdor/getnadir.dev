"""OAuth-based Claude judge client for verifier-corpus labeling.

This is the Day-1 implementation. It performs no real network or OAuth
calls under test (all I/O is dependency-injected via `transport_fn`,
`credential_fn`, and `sleep_fn`).

Day-2 (founder-approved) usage instantiates it with no overrides, which
defers to `nadirclaw.credentials.get_credential("anthropic")` for the
token and to `httpx.AsyncClient` for the transport.

Companion to:
  - validation-oauth-judge.md (this file's blueprint)
  - ip-1-verifier-gated-cascade.md Section 2 (parent corpus plan)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

# Upstream constants. Mirror backend/app/api/anthropic_messages.py:53-54
# and NadirClaw/nadirclaw/claude_integration.py:123.
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# Where the prompt template lives by default. Resolved relative to this
# module so the package is location-independent.
_DEFAULT_TEMPLATE_PATH = str(Path(__file__).resolve().parent / "judge_prompt_template.txt")


@dataclass
class JudgeResult:
    """Outcome of a single judge call.

    Attributes:
        label: 1 if cheap response was acceptable, 0 if not, None on error.
        confidence: Judge-reported confidence in [0, 1]. 0.0 on error.
        rationale: One-sentence judge rationale, or error description.
        raw_response: Raw text returned by the judge (for audit).
        error: None on success, otherwise a short tag like
            "auth_failure: 401", "rate_limit_429", "malformed_json: ...".
        pending_review: True when the response could not be parsed and a
            human should look at it.
    """

    label: Optional[int]
    confidence: float
    rationale: str
    raw_response: str
    error: Optional[str] = None
    pending_review: bool = False


TransportFn = Callable[[str, dict, dict, float], Awaitable[Any]]
# (url, headers, json_body, timeout_s) -> response-like with .status_code, .text, .json()


class OAuthJudgeClient:
    """LLM-as-judge client that authenticates via the founder's Claude
    subscription OAuth token (or any Anthropic API key).

    All I/O is injectable so tests can run without touching the network
    or the local credentials store.
    """

    def __init__(
        self,
        credential_fn: Optional[Callable[[], Optional[str]]] = None,
        transport_fn: Optional[TransportFn] = None,
        sleep_fn: Optional[Callable[[float], Awaitable[None]]] = None,
        judge_model: str = "claude-haiku-4-5",
        max_calls: int = 50,
        call_interval_s: float = 5.0,
        prompt_template_path: Optional[str] = None,
        request_timeout_s: float = 60.0,
    ) -> None:
        if credential_fn is None:
            # Deferred import so `nadirclaw` stays an optional dependency
            # in test environments where the package may not be installed.
            from nadirclaw.credentials import get_credential  # type: ignore

            credential_fn = lambda: get_credential("anthropic")
        self._credential_fn = credential_fn

        if transport_fn is None:
            transport_fn = _default_httpx_transport
        self._transport_fn = transport_fn

        if sleep_fn is None:
            sleep_fn = asyncio.sleep
        self._sleep_fn = sleep_fn

        self.judge_model = judge_model
        self.max_calls = max_calls
        self.call_interval_s = call_interval_s
        self.request_timeout_s = request_timeout_s

        template_path = prompt_template_path or _DEFAULT_TEMPLATE_PATH
        self._template = Path(template_path).read_text(encoding="utf-8")

        self._call_count = 0

    # Public API ----------------------------------------------------------

    @property
    def call_count(self) -> int:
        return self._call_count

    async def judge_triple(
        self,
        prompt: str,
        cheap_answer: str,
        expensive_answer: str,
        cheap_model: str = "claude-haiku-4-5",
        expensive_model: str = "claude-opus-4-6",
    ) -> JudgeResult:
        """Score a single (prompt, cheap, expensive) triple.

        Returns a `JudgeResult`. NEVER raises on auth, rate-limit, or
        parse failures; callers rely on `error`/`pending_review` flags
        for control flow.
        """
        # Hard rate-limit guard BEFORE any HTTP. If we are at the cap,
        # do not even attempt a call.
        if self._call_count >= self.max_calls:
            return JudgeResult(
                label=None,
                confidence=0.0,
                rationale="",
                raw_response="",
                error=f"rate_limit_exceeded: max_calls={self.max_calls}",
            )

        # Per-call pacing. Sleep BEFORE the call so the very first call
        # in a run is not penalised by a leading sleep when interval=0,
        # but every call (including the first) consumes one sleep_fn
        # invocation. This keeps the test for sleep_fn deterministic.
        await self._sleep_fn(self.call_interval_s)

        token = self._credential_fn()
        if not token:
            return JudgeResult(
                label=None,
                confidence=0.0,
                rationale="",
                raw_response="",
                error="auth_failure: no_credential",
            )

        headers = _build_auth_headers(token)
        body = self._build_body(prompt, cheap_answer, expensive_answer, cheap_model, expensive_model)

        try:
            response = await self._transport_fn(
                ANTHROPIC_MESSAGES_URL, headers, body, self.request_timeout_s
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("transport failure during judge call")
            return JudgeResult(
                label=None,
                confidence=0.0,
                rationale="",
                raw_response="",
                error=f"transport_error: {exc.__class__.__name__}",
            )

        status = getattr(response, "status_code", 0)
        text = getattr(response, "text", "") or ""

        if status in (401, 403):
            # Do NOT increment call count: an auth failure should not
            # burn the per-run budget while the operator re-authenticates.
            return JudgeResult(
                label=None,
                confidence=0.0,
                rationale="",
                raw_response=text,
                error=f"auth_failure: {status}",
            )

        if status == 429:
            self._call_count += 1
            return JudgeResult(
                label=None,
                confidence=0.0,
                rationale="",
                raw_response=text,
                error="rate_limit_429",
            )

        if status >= 400:
            self._call_count += 1
            return JudgeResult(
                label=None,
                confidence=0.0,
                rationale="",
                raw_response=text,
                error=f"http_error: {status}",
            )

        # Happy path: HTTP 2xx. Count this against the cap regardless
        # of whether parsing succeeds (we consumed a real subscription
        # message).
        self._call_count += 1

        try:
            envelope = response.json()
        except Exception:
            try:
                envelope = json.loads(text)
            except Exception:
                preview = text[:120].replace("\n", " ")
                return JudgeResult(
                    label=None,
                    confidence=0.0,
                    rationale="",
                    raw_response=text,
                    error=f"malformed_json: {preview}",
                    pending_review=True,
                )

        content_text = _extract_text_from_messages_response(envelope)
        return _parse_judge_output(content_text or text)

    # Internals -----------------------------------------------------------

    def _build_body(
        self,
        prompt: str,
        cheap_answer: str,
        expensive_answer: str,
        cheap_model: str,
        expensive_model: str,
    ) -> dict:
        rendered = (
            self._template
            .replace("{prompt}", prompt)
            .replace("{cheap_answer}", cheap_answer)
            .replace("{expensive_answer}", expensive_answer)
            .replace("{cheap_model}", cheap_model)
            .replace("{expensive_model}", expensive_model)
        )
        return {
            "model": self.judge_model,
            "max_tokens": 256,
            "temperature": 0.0,
            "messages": [
                {"role": "user", "content": rendered},
            ],
        }


# Module-level helpers ----------------------------------------------------


def _build_auth_headers(token: str) -> dict:
    """Build Anthropic auth headers per the same rule as
    NadirClaw/nadirclaw/claude_integration.py:115-130.

    `sk-ant-oat*` (subscription OAuth) → Authorization: Bearer.
    Anything else (including `sk-ant-api*`) → x-api-key.
    """
    common = {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    if token.startswith("sk-ant-oat"):
        return {"Authorization": f"Bearer {token}", **common}
    return {"x-api-key": token, **common}


def _extract_text_from_messages_response(envelope: Any) -> str:
    """Pull the first text block out of an Anthropic /v1/messages
    response envelope. Returns "" if no text block is present.
    """
    if not isinstance(envelope, dict):
        return ""
    content = envelope.get("content")
    if not isinstance(content, list):
        return ""
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                return text
    return ""


_JSON_LINE_RE = re.compile(r"\{[^{}]*\}")


def _parse_judge_output(text: str) -> JudgeResult:
    """Parse the strict single-line JSON envelope the judge is asked to
    produce. Tolerates leading/trailing whitespace but nothing else.

    On any deviation (missing key, wrong type, confidence out of range),
    returns a pending-review result so a human can adjudicate.
    """
    candidate = text.strip()
    parsed: Optional[dict] = None
    try:
        parsed = json.loads(candidate)
    except Exception:
        match = _JSON_LINE_RE.search(candidate)
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                parsed = None

    if not isinstance(parsed, dict):
        preview = candidate[:120].replace("\n", " ")
        return JudgeResult(
            label=None,
            confidence=0.0,
            rationale="",
            raw_response=text,
            error=f"malformed_json: {preview}",
            pending_review=True,
        )

    if "acceptable" not in parsed or not isinstance(parsed["acceptable"], bool):
        return JudgeResult(
            label=None,
            confidence=0.0,
            rationale=str(parsed.get("rationale", "")),
            raw_response=text,
            error="malformed_json: missing or non-boolean acceptable",
            pending_review=True,
        )

    confidence_raw = parsed.get("confidence", 0.0)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        return JudgeResult(
            label=None,
            confidence=0.0,
            rationale=str(parsed.get("rationale", "")),
            raw_response=text,
            error="malformed_json: non-numeric confidence",
            pending_review=True,
        )

    if not (0.0 <= confidence <= 1.0):
        return JudgeResult(
            label=None,
            confidence=0.0,
            rationale=str(parsed.get("rationale", "")),
            raw_response=text,
            error=f"malformed_json: confidence out of range ({confidence})",
            pending_review=True,
        )

    rationale = str(parsed.get("rationale", ""))[:500]
    label = 1 if parsed["acceptable"] else 0
    return JudgeResult(
        label=label,
        confidence=confidence,
        rationale=rationale,
        raw_response=text,
        error=None,
        pending_review=False,
    )


async def _default_httpx_transport(
    url: str, headers: dict, json_body: dict, timeout_s: float
) -> Any:
    """Default transport: performs a real httpx.AsyncClient POST.

    Only imported when the client is instantiated WITHOUT a transport_fn,
    so the test suite (which always injects) never has to install httpx.
    """
    import httpx  # local import keeps tests independent of httpx

    async with httpx.AsyncClient(timeout=timeout_s) as client:
        return await client.post(url, headers=headers, json=json_body)
