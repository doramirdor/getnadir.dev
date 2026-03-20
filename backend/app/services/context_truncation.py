"""
Middle-out context truncation for requests that exceed a model's context window.

Strategy (mirrors OpenRouter's "middle-out" transform):
  - Always keep: system message (if present) + first user message
  - Always keep: last N messages (most recent context)
  - Drop: middle messages until token count fits within the model's context window

Usage:
    from app.services.context_truncation import truncate_middle_out
    messages = truncate_middle_out(messages_dicts, "gpt-4o")
"""

import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Leave 8% headroom for completion tokens and safety margin
_SAFETY_MARGIN = 0.92
# Always keep at least the last 2 messages (e.g. latest user + assistant)
_MIN_TAIL_MESSAGES = 2


def _count_tokens(model: str, messages: List[Dict[str, Any]]) -> int:
    """Count tokens for a list of messages using LiteLLM's tokenizer."""
    try:
        import litellm
        return litellm.token_counter(model=model, messages=messages)
    except Exception:
        # Rough fallback: ~4 chars per token
        total_chars = sum(len(str(m.get("content", ""))) for m in messages)
        return total_chars // 4


def _get_max_context(model: str) -> Optional[int]:
    """Get the model's maximum context window from LiteLLM."""
    try:
        import litellm
        info = litellm.get_max_tokens(model)
        return int(info) if info else None
    except Exception:
        return None


def parse_context_window_string(s: str) -> int:
    """
    Parse context window strings from model_performance_clean.json.

    Examples:
        "1m"   -> 1,000,000
        "200k" -> 200,000
        "32k"  -> 32,000
        "8192" -> 8,192
    """
    s = s.strip().lower()
    if s.endswith("m"):
        return int(float(s[:-1]) * 1_000_000)
    elif s.endswith("k"):
        return int(float(s[:-1]) * 1_000)
    return int(s)


def truncate_middle_out(
    messages: List[Dict[str, Any]],
    model: str,
    context_window_hint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Truncate messages using middle-out strategy if they exceed the model's context window.

    Keeps the beginning (system prompt + first user message) and the end (most recent
    messages), dropping from the middle. This preserves initial context and recent
    conversation while removing older, less relevant middle turns.

    Args:
        messages: List of message dicts (preserves cache_control and other fields).
        model: LiteLLM model name used for token counting and max-token lookup.
        context_window_hint: Optional context window from model_performance_clean.json
                             (e.g. "1m", "200k"). Used as fallback if LiteLLM lookup fails.

    Returns:
        A new messages list, possibly shorter. Returns the original list unchanged if:
        - No truncation is needed (fits within context)
        - The context window cannot be determined
        - The message list is too short to truncate (<=3 messages)
    """
    if not messages or len(messages) <= 3:
        return messages

    # Determine max context window
    max_ctx = _get_max_context(model)
    if max_ctx is None and context_window_hint:
        try:
            max_ctx = parse_context_window_string(context_window_hint)
        except (ValueError, TypeError):
            pass

    if max_ctx is None:
        logger.debug("truncate_middle_out: cannot determine context window for %s, skipping", model)
        return messages

    target_tokens = int(max_ctx * _SAFETY_MARGIN)
    current_tokens = _count_tokens(model, messages)

    if current_tokens <= target_tokens:
        return messages  # No truncation needed

    logger.info(
        "truncate_middle_out: %d tokens exceeds %d target (model=%s, max_ctx=%d), truncating",
        current_tokens, target_tokens, model, max_ctx,
    )

    # Split messages into anchors (head), middle (droppable), and tail (recent)
    #
    # Head anchors: system message (if first) + first user/assistant message after it
    head = []
    rest_start = 0

    if messages[0].get("role") == "system":
        head.append(messages[0])
        rest_start = 1

    if rest_start < len(messages):
        head.append(messages[rest_start])
        rest_start += 1

    remaining = messages[rest_start:]

    # Tail: always keep the last _MIN_TAIL_MESSAGES
    if len(remaining) > _MIN_TAIL_MESSAGES:
        tail = remaining[-_MIN_TAIL_MESSAGES:]
        middle = remaining[:-_MIN_TAIL_MESSAGES]
    else:
        tail = remaining
        middle = []

    # Drop messages from the front of middle until we fit.
    # Incremental approach: compute head+tail tokens once, track middle running total.
    head_tail_tokens = _count_tokens(model, head + tail)
    middle_tokens = _count_tokens(model, middle) if middle else 0

    while middle and (head_tail_tokens + middle_tokens) > target_tokens:
        dropped_msg_tokens = _count_tokens(model, [middle[0]])
        middle_tokens -= dropped_msg_tokens
        middle = middle[1:]

    result = head + middle + tail
    final_tokens = head_tail_tokens + middle_tokens

    dropped = len(messages) - len(result)
    if dropped > 0:
        logger.info(
            "truncate_middle_out: dropped %d messages (%d -> %d), final tokens=%d",
            dropped, len(messages), len(result), final_tokens,
        )

    return result
