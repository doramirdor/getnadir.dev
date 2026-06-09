"""Tests for verifier/oauth_judge.py.

All HTTP, credential, and sleep boundaries are dependency-injected.
No `mock.patch`, no real network calls, no real OAuth.
"""

from __future__ import annotations

import json
import pytest

from oauth_judge import (  # type: ignore
    ANTHROPIC_MESSAGES_URL,
    ANTHROPIC_VERSION,
    JudgeResult,
    OAuthJudgeClient,
)


class FakeResponse:
    """Minimal stand-in for httpx.Response. Just enough surface for the
    judge client: status_code, text, .json().
    """

    def __init__(self, status_code: int, body: dict | str | None = None):
        self.status_code = status_code
        if isinstance(body, dict):
            self._json = body
            self.text = json.dumps(body)
        elif isinstance(body, str):
            self._json = None
            self.text = body
        else:
            self._json = None
            self.text = ""

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


def _messages_envelope(judge_json: str) -> dict:
    """Wrap a judge JSON line in an Anthropic /v1/messages response envelope."""
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": judge_json}],
        "model": "claude-sonnet-4-5",
        "stop_reason": "end_turn",
    }


def _make_client(
    *,
    responses: list[FakeResponse] | None = None,
    token: str = "sk-ant-api-fake",
    max_calls: int = 50,
    call_interval_s: float = 0.0,
    sleep_calls: list | None = None,
    header_capture: list | None = None,
) -> OAuthJudgeClient:
    """Build a judge client wired to a scripted transport.

    `responses` is consumed in order; if exhausted, the transport raises.
    `header_capture`, if provided, accumulates (url, headers) tuples per call.
    """
    responses = list(responses or [])

    async def transport_fn(url, headers, json_body, timeout_s):
        if header_capture is not None:
            header_capture.append((url, dict(headers)))
        if not responses:
            raise AssertionError("transport_fn called more times than scripted")
        return responses.pop(0)

    async def sleep_fn(secs):
        if sleep_calls is not None:
            sleep_calls.append(secs)

    return OAuthJudgeClient(
        credential_fn=lambda: token,
        transport_fn=transport_fn,
        sleep_fn=sleep_fn,
        max_calls=max_calls,
        call_interval_s=call_interval_s,
    )


# 1. acceptable=true → label=1 -------------------------------------------
async def test_judge_acceptable_true_yields_label_1():
    judge_line = json.dumps(
        {"acceptable": True, "confidence": 0.91, "rationale": "Cheap is fine."}
    )
    client = _make_client(
        responses=[FakeResponse(200, _messages_envelope(judge_line))]
    )
    result = await client.judge_triple("p", "c", "e")
    assert result.label == 1
    assert result.error is None
    assert result.pending_review is False
    assert 0.0 <= result.confidence <= 1.0
    assert result.confidence == pytest.approx(0.91)


# 2. acceptable=false → label=0 ------------------------------------------
async def test_judge_acceptable_false_yields_label_0():
    judge_line = json.dumps(
        {"acceptable": False, "confidence": 0.77, "rationale": "Cheap is wrong."}
    )
    client = _make_client(
        responses=[FakeResponse(200, _messages_envelope(judge_line))]
    )
    result = await client.judge_triple("p", "c", "e")
    assert result.label == 0
    assert result.error is None
    assert result.confidence == pytest.approx(0.77)


# 3. Malformed JSON → pending_review=True --------------------------------
async def test_judge_malformed_json_pending_review():
    client = _make_client(
        responses=[
            FakeResponse(200, _messages_envelope("not json at all just prose"))
        ]
    )
    result = await client.judge_triple("p", "c", "e")
    assert result.label is None
    assert result.pending_review is True
    assert result.error is not None
    assert result.error.startswith("malformed_json")


# 4. Cap enforced: 6th call returns rate_limit error, no HTTP -----------
async def test_cap_enforced_after_max_calls():
    judge_line = json.dumps(
        {"acceptable": True, "confidence": 0.9, "rationale": "ok"}
    )
    # Provide exactly 5 scripted responses; 6th call must not invoke transport.
    client = _make_client(
        responses=[FakeResponse(200, _messages_envelope(judge_line)) for _ in range(5)],
        max_calls=5,
    )
    for _ in range(5):
        r = await client.judge_triple("p", "c", "e")
        assert r.error is None
    # 6th call: cap should fire BEFORE transport is asked.
    r6 = await client.judge_triple("p", "c", "e")
    assert r6.label is None
    assert r6.error is not None
    assert r6.error.startswith("rate_limit_exceeded")
    assert client.call_count == 5


# 5. Per-call delay: sleep_fn called N times -----------------------------
async def test_per_call_delay_invokes_sleep_fn():
    judge_line = json.dumps(
        {"acceptable": True, "confidence": 0.9, "rationale": "ok"}
    )
    sleep_calls: list = []
    client = _make_client(
        responses=[FakeResponse(200, _messages_envelope(judge_line)) for _ in range(3)],
        call_interval_s=5.0,
        sleep_calls=sleep_calls,
    )
    for _ in range(3):
        await client.judge_triple("p", "c", "e")
    assert len(sleep_calls) == 3
    assert all(s == 5.0 for s in sleep_calls)


# 6. Auth failure 401 → error, no exception ------------------------------
async def test_auth_failure_returns_error_no_exception():
    client = _make_client(
        responses=[FakeResponse(401, {"error": {"type": "authentication_error"}})]
    )
    # Must not raise.
    result = await client.judge_triple("p", "c", "e")
    assert result.label is None
    assert result.error == "auth_failure: 401"
    # Auth failure must NOT burn the budget.
    assert client.call_count == 0


# 7. Bearer header for sk-ant-oat token ----------------------------------
async def test_bearer_token_for_sk_ant_oat():
    judge_line = json.dumps(
        {"acceptable": True, "confidence": 0.9, "rationale": "ok"}
    )
    headers_seen: list = []
    client = _make_client(
        responses=[FakeResponse(200, _messages_envelope(judge_line))],
        token="sk-ant-oat-deadbeef",
        header_capture=headers_seen,
    )
    await client.judge_triple("p", "c", "e")
    assert len(headers_seen) == 1
    url, headers = headers_seen[0]
    assert url == ANTHROPIC_MESSAGES_URL
    assert headers.get("Authorization") == "Bearer sk-ant-oat-deadbeef"
    assert "x-api-key" not in headers
    assert headers.get("anthropic-version") == ANTHROPIC_VERSION
    assert headers.get("content-type") == "application/json"


# 8. x-api-key header for sk-ant-api token -------------------------------
async def test_x_api_key_for_sk_ant_api():
    judge_line = json.dumps(
        {"acceptable": True, "confidence": 0.9, "rationale": "ok"}
    )
    headers_seen: list = []
    client = _make_client(
        responses=[FakeResponse(200, _messages_envelope(judge_line))],
        token="sk-ant-api03-realkey",
        header_capture=headers_seen,
    )
    await client.judge_triple("p", "c", "e")
    url, headers = headers_seen[0]
    assert headers.get("x-api-key") == "sk-ant-api03-realkey"
    assert "Authorization" not in headers
    assert headers.get("anthropic-version") == ANTHROPIC_VERSION
