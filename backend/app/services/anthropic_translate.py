"""
Anthropic Messages <-> OpenAI Chat translation.

Pure functions, no I/O. Used by the /v1/messages endpoint to bridge the
Anthropic Messages format into Nadir's existing OpenAI-shaped routing pipeline
and back out.

Reference:
  Anthropic Messages API: https://docs.anthropic.com/en/api/messages
  OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple


SUPPORTED_BLOCK_TYPES = {"text", "image", "tool_use", "tool_result"}


class UnsupportedAnthropicFeature(ValueError):
    """Raised when an Anthropic Messages request uses a feature we don't yet translate."""


def anthropic_to_chat_messages(
    body: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Convert an Anthropic Messages request body to OpenAI Chat messages + metadata.

    Returns (messages, passthrough) where:
      - messages is a list of {"role", "content", ...} dicts ready for the
        ProductionCompletion pipeline.
      - passthrough carries fields the OpenAI shape doesn't have (max_tokens,
        tools, tool_choice, stop_sequences, anthropic_version) so the caller
        can forward them upstream.
    """
    if not isinstance(body, dict):
        raise ValueError("body must be a JSON object")

    raw_messages = body.get("messages") or []
    if not isinstance(raw_messages, list) or not raw_messages:
        raise ValueError("messages must be a non-empty array")

    chat: List[Dict[str, Any]] = []

    system = body.get("system")
    if system:
        system_text = _flatten_text_blocks(system)
        if system_text:
            chat.append({"role": "system", "content": system_text})

    for idx, msg in enumerate(raw_messages):
        if not isinstance(msg, dict):
            raise ValueError(f"messages[{idx}] must be an object")
        role = msg.get("role")
        if role not in ("user", "assistant"):
            raise ValueError(f"messages[{idx}].role must be 'user' or 'assistant'")
        content = msg.get("content")
        text = _flatten_text_blocks(content)
        if text is None:
            raise UnsupportedAnthropicFeature(
                f"messages[{idx}] uses non-text content blocks not yet supported"
            )
        chat.append({"role": role, "content": text})

    passthrough: Dict[str, Any] = {}
    for key in ("max_tokens", "stop_sequences", "temperature", "top_p", "top_k",
                "tools", "tool_choice", "metadata", "anthropic_version"):
        if key in body:
            passthrough[key] = body[key]

    return chat, passthrough


def _flatten_text_blocks(content: Any) -> Optional[str]:
    """Anthropic content can be a string, or a list of blocks. Return concatenated text.

    Returns None if the content includes non-text blocks (image/tool_use/tool_result).
    Returns empty string if the content is empty.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return None

    pieces: List[str] = []
    for block in content:
        if isinstance(block, str):
            pieces.append(block)
            continue
        if not isinstance(block, dict):
            return None
        block_type = block.get("type")
        if block_type == "text":
            pieces.append(block.get("text", ""))
        elif block_type in SUPPORTED_BLOCK_TYPES:
            return None
        else:
            return None
    return "".join(pieces)


def openai_response_to_anthropic(
    openai_response: Dict[str, Any],
    requested_anthropic_model: str,
) -> Dict[str, Any]:
    """Convert an OpenAI Chat Completions response into Anthropic Messages format.

    Maps:
      choices[0].message.content        -> content: [{"type": "text", "text": ...}]
      choices[0].finish_reason          -> stop_reason
      usage.prompt_tokens               -> usage.input_tokens
      usage.completion_tokens           -> usage.output_tokens
    """
    if not isinstance(openai_response, dict):
        raise ValueError("openai_response must be a JSON object")

    choices = openai_response.get("choices") or []
    if not choices:
        raise ValueError("openai_response has no choices")

    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message") or {}
    text = ""
    raw_content = message.get("content")
    if isinstance(raw_content, str):
        text = raw_content
    elif isinstance(raw_content, list):
        text = "".join(
            b.get("text", "")
            for b in raw_content
            if isinstance(b, dict) and b.get("type") == "text"
        )

    finish_reason = first.get("finish_reason")
    stop_reason_map = {
        "stop": "end_turn",
        "length": "max_tokens",
        "tool_calls": "tool_use",
        "content_filter": "stop_sequence",
    }
    stop_reason = stop_reason_map.get(finish_reason, "end_turn")

    usage_in = openai_response.get("usage") or {}
    usage_out = {
        "input_tokens": usage_in.get("prompt_tokens", 0) or 0,
        "output_tokens": usage_in.get("completion_tokens", 0) or 0,
    }

    return {
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "role": "assistant",
        "model": requested_anthropic_model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": usage_out,
    }


_STRIP_TOP_LEVEL = (
    "thinking",
    "betas",
    "anthropic_version",
    "anthropic-beta",
    "cache_control",
)


def _system_to_openai_messages(system: Any) -> List[Dict[str, Any]]:
    """Translate an Anthropic `system` field into zero or one OpenAI system message.

    Accepts:
      - None / missing -> []
      - string         -> [{role:system, content:str}] (empty string preserved)
      - list of blocks -> flattened text concatenation; non-text blocks dropped.
    """
    if system is None:
        return []
    if isinstance(system, str):
        return [{"role": "system", "content": system}]
    if isinstance(system, list):
        text = _flatten_text_blocks(system) or ""
        if text:
            return [{"role": "system", "content": text}]
        return []
    return []


def _tool_use_input_to_arguments(value: Any) -> str:
    """Serialize an Anthropic tool_use input dict to OpenAI tool_call arguments.

    Per reviewer should-fix #5: None and empty-dict both serialize to "{}",
    NEVER "null". Anthropic SDK clients fail to parse "null" as a JSON object.
    """
    if value is None or value == {}:
        return "{}"
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return "{}"


def _user_blocks_to_openai_messages(
    blocks: List[Any],
) -> List[Dict[str, Any]]:
    """Translate an Anthropic user `content` block list into OpenAI messages.

    Multi-block fan-out semantics (reviewer blocking #2):
      - text/image blocks accumulate into a single role:user message.
        Text-only collapses to a string content; presence of any image promotes
        to OpenAI multipart {type: text|image_url} array.
      - Each tool_result block becomes its OWN role:tool message with its
        own tool_call_id, ordered as they appear in the source array.

    A single Anthropic user message with N tool_results -> N tool messages.
    """
    text_parts: List[str] = []
    image_parts: List[Dict[str, Any]] = []
    out: List[Dict[str, Any]] = []

    def _flush_user():
        if image_parts:
            content: List[Dict[str, Any]] = []
            if text_parts:
                content.append({"type": "text", "text": "".join(text_parts)})
            content.extend(image_parts)
            out.append({"role": "user", "content": content})
        elif text_parts:
            out.append({"role": "user", "content": "".join(text_parts)})
        text_parts.clear()
        image_parts.clear()

    for block in blocks:
        if isinstance(block, str):
            text_parts.append(block)
            continue
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            txt = block.get("text", "")
            if isinstance(txt, str):
                text_parts.append(txt)
        elif btype == "image":
            source = block.get("source") or {}
            if source.get("type") == "base64":
                mime = source.get("media_type", "image/png")
                data = source.get("data", "")
                image_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{data}"},
                })
            elif source.get("type") == "url":
                url = source.get("url", "")
                image_parts.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                })
        elif btype == "tool_result":
            # Flush any accumulated user content first, preserving source order.
            _flush_user()
            tool_call_id = block.get("tool_use_id", "")
            raw_content = block.get("content", "")
            if isinstance(raw_content, list):
                inner = []
                for sub in raw_content:
                    if isinstance(sub, dict) and sub.get("type") == "text":
                        inner.append(sub.get("text", ""))
                    elif isinstance(sub, str):
                        inner.append(sub)
                content_str = "".join(inner)
            elif isinstance(raw_content, str):
                content_str = raw_content
            else:
                content_str = json.dumps(raw_content)
            out.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": content_str,
            })
        # Unknown block types are skipped.

    _flush_user()
    return out


def _assistant_blocks_to_openai_message(
    blocks: List[Any],
) -> Dict[str, Any]:
    """Translate an Anthropic assistant `content` block list into a single OpenAI assistant message.

    Per OpenAI spec, an assistant message can carry both `content` (text) and
    `tool_calls`. Text blocks concatenate; tool_use blocks map to tool_calls.
    """
    text_parts: List[str] = []
    tool_calls: List[Dict[str, Any]] = []
    for block in blocks:
        if isinstance(block, str):
            text_parts.append(block)
            continue
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            txt = block.get("text", "")
            if isinstance(txt, str):
                text_parts.append(txt)
        elif btype == "tool_use":
            tool_calls.append({
                "id": block.get("id", ""),
                "type": "function",
                "function": {
                    "name": block.get("name", ""),
                    "arguments": _tool_use_input_to_arguments(block.get("input")),
                },
            })
        # Other types silently dropped.

    msg: Dict[str, Any] = {"role": "assistant"}
    text = "".join(text_parts)
    if tool_calls:
        # OpenAI requires content to be null/empty when tool_calls is present
        # in some SDKs. We keep text if present, else use empty string.
        msg["content"] = text if text else ""
        msg["tool_calls"] = tool_calls
    else:
        msg["content"] = text
    return msg


def _tools_to_openai(tools: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(tools, list):
        return None
    out: List[Dict[str, Any]] = []
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        name = tool.get("name")
        if not name:
            continue
        out.append({
            "type": "function",
            "function": {
                "name": name,
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {"type": "object"}),
            },
        })
    return out or None


def _tool_choice_to_openai(choice: Any) -> Any:
    if not isinstance(choice, dict):
        return None
    t = choice.get("type")
    if t == "auto":
        return "auto"
    if t == "any":
        return "required"
    if t == "tool":
        name = choice.get("name", "")
        return {"type": "function", "function": {"name": name}}
    return None


def anthropic_body_to_openai_body(body: Dict[str, Any]) -> Dict[str, Any]:
    """Translate an Anthropic Messages request body into an OpenAI Chat Completions body.

    Pure, no mutation of input. Applies the strip list, system flattening,
    multi-block fan-out for tool_result (one OpenAI tool message per
    tool_result block), and injects `stream_options.include_usage = True`
    when streaming is requested (so usage is available for the Anthropic
    `message_delta` event).
    """
    if not isinstance(body, dict):
        raise ValueError("body must be a JSON object")

    out: Dict[str, Any] = {}
    messages_out: List[Dict[str, Any]] = []

    # 1. System message.
    messages_out.extend(_system_to_openai_messages(body.get("system")))

    # 2. Conversation messages.
    raw_messages = body.get("messages") or []
    for msg in raw_messages:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        content = msg.get("content")
        if role == "user":
            if isinstance(content, str):
                messages_out.append({"role": "user", "content": content})
            elif isinstance(content, list):
                messages_out.extend(_user_blocks_to_openai_messages(content))
        elif role == "assistant":
            if isinstance(content, str):
                messages_out.append({"role": "assistant", "content": content})
            elif isinstance(content, list):
                messages_out.append(_assistant_blocks_to_openai_message(content))

    out["messages"] = messages_out

    # 3. Passthrough scalars.
    for key in ("model", "max_tokens", "temperature", "top_p", "stream"):
        if key in body:
            out[key] = body[key]

    # 4. stop_sequences -> stop.
    if "stop_sequences" in body:
        out["stop"] = body["stop_sequences"]

    # 5. Tools.
    tools = _tools_to_openai(body.get("tools"))
    if tools:
        out["tools"] = tools

    # 6. tool_choice.
    tc = _tool_choice_to_openai(body.get("tool_choice"))
    if tc is not None:
        out["tool_choice"] = tc

    # 7. stream_options.include_usage when streaming.
    # Per reviewer blocking #4: without this OpenAI never emits the final usage
    # chunk and Anthropic message_delta usage stays zero forever.
    if out.get("stream") is True:
        out["stream_options"] = {"include_usage": True}

    # Strip-list fields are simply not copied over (top_k, metadata, thinking,
    # betas, anthropic_version, anthropic-beta, top-level cache_control).
    # Nested cache_control inside messages is left alone.

    return out


def make_anthropic_error(
    error_type: str,
    message: str,
) -> Dict[str, Any]:
    """Build an Anthropic-shaped error envelope for /v1/messages responses."""
    return {
        "type": "error",
        "error": {
            "type": error_type,
            "message": message,
        },
    }
