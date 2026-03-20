"""
Response Healer middleware for auto-fixing malformed JSON responses.

When users request structured output (json_object / json_schema) and the LLM
returns broken JSON, this module attempts progressive repairs before giving up.
"""

import json
import re
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def heal_json_response(raw: str) -> Tuple[str, bool, str]:
    """
    Attempt to heal a malformed JSON string through progressive fixes.

    Args:
        raw: The raw response text from the LLM.

    Returns:
        Tuple of (healed_text, was_healed, details).
        If the input is already valid JSON or empty, was_healed is False.
        details describes what fix was applied (or None).
    """
    if not raw or not raw.strip():
        return raw, False, None

    text = raw.strip()

    # Step 1: Strip markdown ```json ... ``` wrappers
    md_match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", text, re.DOTALL)
    if md_match:
        text = md_match.group(1).strip()

    # Step 2: Try parse — return early if already valid
    if _try_parse(text):
        if text != raw:
            # Only the markdown stripping was needed
            return text, True, "stripped_markdown_wrapper"
        return raw, False, None

    # Step 3: Remove trailing commas before } or ]
    healed = re.sub(r",\s*([}\]])", r"\1", text)
    if _try_parse(healed):
        return healed, True, "removed_trailing_commas"

    # Step 4: Add missing quotes around unquoted keys
    healed = re.sub(
        r"(?<=\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:",
        r' "\1":',
        healed,
    )
    if _try_parse(healed):
        return healed, True, "quoted_unquoted_keys"

    # Step 5: Close missing brackets/braces
    healed = _close_brackets(healed)
    if _try_parse(healed):
        return healed, True, "closed_missing_brackets"

    # Final: return original if nothing worked
    logger.debug("Response healing failed — returning original text")
    return raw, False, None


def _try_parse(text: str) -> bool:
    """Return True if text is valid JSON."""
    try:
        json.loads(text)
        return True
    except (json.JSONDecodeError, ValueError):
        return False


def _close_brackets(text: str) -> str:
    """Append missing closing brackets/braces to make JSON parseable."""
    stack = []
    in_string = False
    escape_next = False

    for ch in text:
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in ("{", "["):
            stack.append("}" if ch == "{" else "]")
        elif ch in ("}", "]"):
            if stack and stack[-1] == ch:
                stack.pop()

    # Append missing closers in reverse order
    while stack:
        text += stack.pop()

    return text
