"""Unit tests for anthropic_body_to_openai_body.

Pure-function tests, no fixtures, no I/O. Covers the 9 blueprint cases plus
the multi-tool-result reviewer-mandated case.
"""
import json

import pytest

from app.services.anthropic_translate import anthropic_body_to_openai_body


class TestBasicMapping:
    def test_minimal_user_message(self):
        body = {
            "model": "gpt-4o",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": "hello"}],
        }
        out = anthropic_body_to_openai_body(body)
        assert out["model"] == "gpt-4o"
        assert out["max_tokens"] == 256
        assert out["messages"] == [{"role": "user", "content": "hello"}]

    def test_string_system_becomes_first_system_message(self):
        body = {
            "system": "you are concise",
            "messages": [{"role": "user", "content": "hi"}],
        }
        out = anthropic_body_to_openai_body(body)
        assert out["messages"][0] == {"role": "system", "content": "you are concise"}
        assert out["messages"][1] == {"role": "user", "content": "hi"}

    def test_list_system_blocks_flatten(self):
        body = {
            "system": [
                {"type": "text", "text": "alpha "},
                {"type": "text", "text": "beta"},
            ],
            "messages": [{"role": "user", "content": "hi"}],
        }
        out = anthropic_body_to_openai_body(body)
        assert out["messages"][0] == {"role": "system", "content": "alpha beta"}

    def test_passthrough_scalars(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "max_tokens": 100,
            "temperature": 0.5,
            "top_p": 0.9,
            "top_k": 7,  # must be DROPPED
            "stop_sequences": ["STOP", "DONE"],
            "metadata": {"user_id": "u1"},  # DROPPED
        }
        out = anthropic_body_to_openai_body(body)
        assert out["max_tokens"] == 100
        assert out["temperature"] == 0.5
        assert out["top_p"] == 0.9
        assert out["stop"] == ["STOP", "DONE"]
        assert "top_k" not in out
        assert "metadata" not in out
        assert "stop_sequences" not in out


class TestStripList:
    def test_strips_thinking_betas_version_beta_header_cache_control(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "thinking": {"type": "enabled", "budget_tokens": 1024},
            "betas": ["computer-use-2024-10-22"],
            "anthropic_version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
            "cache_control": {"type": "ephemeral"},
        }
        out = anthropic_body_to_openai_body(body)
        for forbidden in ("thinking", "betas", "anthropic_version", "anthropic-beta", "cache_control"):
            assert forbidden not in out


class TestToolBlocks:
    def test_assistant_tool_use_to_tool_calls(self):
        body = {
            "messages": [
                {"role": "assistant", "content": [
                    {"type": "text", "text": "I'll call the tool. "},
                    {"type": "tool_use", "id": "tu_abc", "name": "calc", "input": {"x": 2, "y": 3}},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        msg = out["messages"][0]
        assert msg["role"] == "assistant"
        assert msg["content"] == "I'll call the tool. "
        assert len(msg["tool_calls"]) == 1
        tc = msg["tool_calls"][0]
        assert tc["id"] == "tu_abc"
        assert tc["type"] == "function"
        assert tc["function"]["name"] == "calc"
        # Arguments is a JSON string, not a dict.
        assert json.loads(tc["function"]["arguments"]) == {"x": 2, "y": 3}

    def test_tool_use_input_none_becomes_empty_object_string(self):
        """Reviewer should-fix #5: None must NOT serialize to "null"."""
        body = {
            "messages": [
                {"role": "assistant", "content": [
                    {"type": "tool_use", "id": "tu_1", "name": "ping", "input": None},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        args = out["messages"][0]["tool_calls"][0]["function"]["arguments"]
        assert args == "{}"
        # Round-trips to an empty dict, never None.
        assert json.loads(args) == {}

    def test_tool_use_input_empty_dict_becomes_empty_object_string(self):
        body = {
            "messages": [
                {"role": "assistant", "content": [
                    {"type": "tool_use", "id": "tu_1", "name": "ping", "input": {}},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        args = out["messages"][0]["tool_calls"][0]["function"]["arguments"]
        assert args == "{}"

    def test_user_tool_result_becomes_tool_message(self):
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": "tu_abc", "content": "42"},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        msg = out["messages"][0]
        assert msg == {"role": "tool", "tool_call_id": "tu_abc", "content": "42"}

    def test_multi_tool_result_in_one_user_message_fans_out(self):
        """Reviewer blocking #2: N tool_result blocks -> N tool messages,
        each with its own tool_call_id, in source-array order.
        """
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": "tu_1", "content": "result1"},
                    {"type": "tool_result", "tool_use_id": "tu_2", "content": "result2"},
                    {"type": "tool_result", "tool_use_id": "tu_3", "content": "result3"},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        assert len(out["messages"]) == 3
        assert out["messages"][0] == {"role": "tool", "tool_call_id": "tu_1", "content": "result1"}
        assert out["messages"][1] == {"role": "tool", "tool_call_id": "tu_2", "content": "result2"}
        assert out["messages"][2] == {"role": "tool", "tool_call_id": "tu_3", "content": "result3"}

    def test_tool_result_with_text_block_list_content(self):
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": "tu_x", "content": [
                        {"type": "text", "text": "part1 "},
                        {"type": "text", "text": "part2"},
                    ]},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        assert out["messages"][0]["content"] == "part1 part2"


class TestTools:
    def test_tools_mapping(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "tools": [
                {
                    "name": "calc",
                    "description": "do math",
                    "input_schema": {"type": "object", "properties": {"x": {"type": "number"}}},
                },
            ],
        }
        out = anthropic_body_to_openai_body(body)
        assert out["tools"] == [{
            "type": "function",
            "function": {
                "name": "calc",
                "description": "do math",
                "parameters": {"type": "object", "properties": {"x": {"type": "number"}}},
            },
        }]

    def test_tool_choice_auto(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "tool_choice": {"type": "auto"},
        }
        out = anthropic_body_to_openai_body(body)
        assert out["tool_choice"] == "auto"

    def test_tool_choice_any_maps_to_required(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "tool_choice": {"type": "any"},
        }
        out = anthropic_body_to_openai_body(body)
        assert out["tool_choice"] == "required"

    def test_tool_choice_specific_tool(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "tool_choice": {"type": "tool", "name": "calc"},
        }
        out = anthropic_body_to_openai_body(body)
        assert out["tool_choice"] == {"type": "function", "function": {"name": "calc"}}

    def test_tool_choice_absent_omitted(self):
        body = {"messages": [{"role": "user", "content": "x"}]}
        out = anthropic_body_to_openai_body(body)
        assert "tool_choice" not in out


class TestStreamOptions:
    def test_stream_true_injects_include_usage(self):
        """Reviewer blocking #4: stream_options.include_usage must be True."""
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "stream": True,
        }
        out = anthropic_body_to_openai_body(body)
        assert out["stream"] is True
        assert out["stream_options"] == {"include_usage": True}

    def test_stream_false_no_stream_options(self):
        body = {
            "messages": [{"role": "user", "content": "x"}],
            "stream": False,
        }
        out = anthropic_body_to_openai_body(body)
        assert out["stream"] is False
        assert "stream_options" not in out

    def test_stream_absent_no_stream_options(self):
        body = {"messages": [{"role": "user", "content": "x"}]}
        out = anthropic_body_to_openai_body(body)
        assert "stream" not in out
        assert "stream_options" not in out


class TestImageBlocks:
    def test_user_image_block_becomes_multipart(self):
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "text", "text": "describe "},
                    {"type": "image", "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "AAA",
                    }},
                ]},
            ],
        }
        out = anthropic_body_to_openai_body(body)
        msg = out["messages"][0]
        assert msg["role"] == "user"
        assert isinstance(msg["content"], list)
        assert msg["content"][0] == {"type": "text", "text": "describe "}
        assert msg["content"][1] == {
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,AAA"},
        }


class TestErrors:
    def test_non_dict_body_rejected(self):
        with pytest.raises(ValueError):
            anthropic_body_to_openai_body("not a dict")  # type: ignore[arg-type]
