"""Unit tests for app.services.anthropic_translate.

Pure-function tests, no fixtures, no I/O.
"""
import pytest

from app.services.anthropic_translate import (
    UnsupportedAnthropicFeature,
    anthropic_to_chat_messages,
    make_anthropic_error,
    openai_response_to_anthropic,
)


class TestAnthropicToChatMessages:
    def test_minimal_user_message(self):
        body = {
            "model": "claude-sonnet-4-6",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": "hello"}],
        }
        chat, passthrough = anthropic_to_chat_messages(body)
        assert chat == [{"role": "user", "content": "hello"}]
        assert passthrough["max_tokens"] == 256

    def test_string_system_prompt(self):
        body = {
            "model": "claude-sonnet-4-6",
            "system": "you are concise",
            "messages": [{"role": "user", "content": "hi"}],
        }
        chat, _ = anthropic_to_chat_messages(body)
        assert chat[0] == {"role": "system", "content": "you are concise"}
        assert chat[1] == {"role": "user", "content": "hi"}

    def test_block_array_system_prompt(self):
        body = {
            "system": [{"type": "text", "text": "alpha "}, {"type": "text", "text": "beta"}],
            "messages": [{"role": "user", "content": "hi"}],
        }
        chat, _ = anthropic_to_chat_messages(body)
        assert chat[0]["content"] == "alpha beta"

    def test_block_array_user_message(self):
        body = {
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "part1 "}, {"type": "text", "text": "part2"}]},
            ],
        }
        chat, _ = anthropic_to_chat_messages(body)
        assert chat == [{"role": "user", "content": "part1 part2"}]

    def test_multi_turn(self):
        body = {
            "messages": [
                {"role": "user", "content": "q1"},
                {"role": "assistant", "content": "a1"},
                {"role": "user", "content": "q2"},
            ],
        }
        chat, _ = anthropic_to_chat_messages(body)
        assert len(chat) == 3
        assert [m["role"] for m in chat] == ["user", "assistant", "user"]

    def test_image_block_rejected(self):
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "text", "text": "describe"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}},
                ]},
            ],
        }
        with pytest.raises(UnsupportedAnthropicFeature):
            anthropic_to_chat_messages(body)

    def test_tool_use_block_rejected(self):
        body = {
            "messages": [
                {"role": "assistant", "content": [
                    {"type": "tool_use", "id": "tool_1", "name": "calc", "input": {}},
                ]},
            ],
        }
        with pytest.raises(UnsupportedAnthropicFeature):
            anthropic_to_chat_messages(body)

    def test_passthrough_carries_extras(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "max_tokens": 100,
            "temperature": 0.5,
            "stop_sequences": ["STOP"],
            "tools": [{"name": "t"}],
            "anthropic_version": "2023-06-01",
        }
        _, passthrough = anthropic_to_chat_messages(body)
        assert passthrough["max_tokens"] == 100
        assert passthrough["temperature"] == 0.5
        assert passthrough["stop_sequences"] == ["STOP"]
        assert passthrough["tools"] == [{"name": "t"}]
        assert passthrough["anthropic_version"] == "2023-06-01"

    def test_empty_messages_rejected(self):
        with pytest.raises(ValueError, match="non-empty"):
            anthropic_to_chat_messages({"messages": []})

    def test_invalid_role_rejected(self):
        with pytest.raises(ValueError, match="role"):
            anthropic_to_chat_messages({"messages": [{"role": "tool", "content": "x"}]})

    def test_non_dict_body_rejected(self):
        with pytest.raises(ValueError):
            anthropic_to_chat_messages("not a dict")  # type: ignore[arg-type]


class TestOpenAIResponseToAnthropic:
    def _openai_response(self, text="hello", finish="stop", in_tok=10, out_tok=5):
        return {
            "id": "chatcmpl-abc",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "claude-sonnet-4-6",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": finish,
            }],
            "usage": {"prompt_tokens": in_tok, "completion_tokens": out_tok, "total_tokens": in_tok + out_tok},
        }

    def test_basic_text_response(self):
        out = openai_response_to_anthropic(self._openai_response(), "claude-sonnet-4-6")
        assert out["type"] == "message"
        assert out["role"] == "assistant"
        assert out["content"] == [{"type": "text", "text": "hello"}]
        assert out["stop_reason"] == "end_turn"
        assert out["usage"] == {"input_tokens": 10, "output_tokens": 5}
        assert out["model"] == "claude-sonnet-4-6"
        assert out["id"].startswith("msg_")

    def test_finish_reason_map_length(self):
        out = openai_response_to_anthropic(
            self._openai_response(finish="length"), "claude-haiku-4-5"
        )
        assert out["stop_reason"] == "max_tokens"

    def test_finish_reason_map_tool_calls(self):
        out = openai_response_to_anthropic(
            self._openai_response(finish="tool_calls"), "claude-opus-4-6"
        )
        assert out["stop_reason"] == "tool_use"

    def test_finish_reason_unknown_defaults_to_end_turn(self):
        out = openai_response_to_anthropic(
            self._openai_response(finish="something_new"), "claude-sonnet-4-6"
        )
        assert out["stop_reason"] == "end_turn"

    def test_block_array_content(self):
        resp = {
            "choices": [{
                "message": {"role": "assistant", "content": [
                    {"type": "text", "text": "a"},
                    {"type": "text", "text": "b"},
                ]},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2},
        }
        out = openai_response_to_anthropic(resp, "claude-haiku-4-5")
        assert out["content"] == [{"type": "text", "text": "ab"}]

    def test_missing_usage_defaults_to_zero(self):
        resp = {
            "choices": [{"message": {"content": "x"}, "finish_reason": "stop"}],
        }
        out = openai_response_to_anthropic(resp, "claude-sonnet-4-6")
        assert out["usage"] == {"input_tokens": 0, "output_tokens": 0}

    def test_no_choices_raises(self):
        with pytest.raises(ValueError, match="no choices"):
            openai_response_to_anthropic({"choices": []}, "claude-sonnet-4-6")


class TestMakeAnthropicError:
    def test_shape(self):
        err = make_anthropic_error("invalid_request_error", "bad input")
        assert err == {
            "type": "error",
            "error": {"type": "invalid_request_error", "message": "bad input"},
        }
