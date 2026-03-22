"""
Context optimization and middle-out truncation for LLM requests.

Optimization modes:
  - ``safe``       Deterministic, lossless transforms (whitespace, dedup, minify).
  - ``aggressive`` All safe transforms + semantic deduplication via embeddings.

Middle-out truncation (runs after optimization if context is still too long):
  - Always keep: system message (if present) + first user message
  - Always keep: last N messages (most recent context)
  - Drop: middle messages until token count fits within the model's context window

Usage:
    from app.services.context_truncation import optimize_safe, optimize_aggressive, truncate_middle_out
"""

import json
import logging
import re
from difflib import SequenceMatcher
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


# ---------------------------------------------------------------------------
# Safe transforms — lossless content reduction
# ---------------------------------------------------------------------------

_MULTI_BLANK_LINES = re.compile(r"\n{3,}")
_MULTI_SPACES = re.compile(r"[ \t]{2,}")
_ASCII_ART = re.compile(
    r"(?m)^[ \t]*(?:[│├└─┌┐┘┬┴┼╔╗╚╝║═╠╣╦╩╬|+\-*/\\#=~^]{3,}[ \t]*\n?){2,}"
)
_COMMENT_BLOCK_C = re.compile(r"/\*.*?\*/", re.DOTALL)
_COMMENT_BLOCK_LINE = re.compile(r"^[ \t]*(?://|#)[ \t]*[-=*]{3,}.*$", re.MULTILINE)


def _normalize_whitespace(content: str) -> str:
    """Collapse excessive blank lines and runs of spaces, preserving code blocks."""
    if not content:
        return content
    lines = content.split("\n")
    in_code_block = False
    out: List[str] = []
    for line in lines:
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            out.append(line)
            continue
        if in_code_block:
            out.append(line)
            continue
        out.append(_MULTI_SPACES.sub(" ", line))
    result = "\n".join(out)
    result = _MULTI_BLANK_LINES.sub("\n\n", result)
    return result


def _strip_ascii_art(content: str) -> str:
    """Remove ASCII art / box-drawing sequences."""
    return _ASCII_ART.sub("", content)


def _strip_comment_blocks(content: str) -> str:
    """Remove decorative comment blocks (/* ... */ and //---... lines)."""
    content = _COMMENT_BLOCK_C.sub("", content)
    content = _COMMENT_BLOCK_LINE.sub("", content)
    return content


def _remove_empty_messages(messages: List[dict]) -> List[dict]:
    """Drop messages whose content is empty or whitespace-only."""
    return [
        m for m in messages
        if not isinstance(m.get("content"), str) or m["content"].strip()
    ]


def _dedup_system_prompts(messages: List[dict]) -> List[dict]:
    """Remove system-prompt text that is duplicated verbatim in later messages."""
    system_texts: List[str] = []
    for m in messages:
        if m.get("role") == "system":
            content = m.get("content", "")
            if isinstance(content, str) and len(content) >= 20:
                system_texts.append(content)
    if not system_texts:
        return messages

    result: List[dict] = []
    for m in messages:
        if m.get("role") == "system":
            result.append(m)
            continue
        content = m.get("content")
        if not isinstance(content, str):
            result.append(m)
            continue
        new_content = content
        for sys_text in system_texts:
            if sys_text in new_content:
                new_content = new_content.replace(sys_text, "").strip()
        if new_content != content:
            result.append({**m, "content": new_content})
        else:
            result.append(m)
    return result


def optimize_safe(messages: List[dict]) -> List[dict]:
    """Apply lossless, deterministic transforms to reduce token count.

    Transforms applied (in order):
      1. Whitespace normalization (collapse blank lines / multi-spaces)
      2. Empty message removal
      3. Duplicate system prompt removal
      4. ASCII art stripping
      5. Comment block removal

    Returns a new list; the input is not mutated.
    """
    msgs = [{**m} for m in messages]

    # Content-level transforms
    for i, m in enumerate(msgs):
        content = m.get("content")
        if not isinstance(content, str) or not content:
            continue
        c = _normalize_whitespace(content)
        c = _strip_ascii_art(c)
        c = _strip_comment_blocks(c)
        if c != content:
            msgs[i] = {**m, "content": c}

    # Message-level transforms
    msgs = _remove_empty_messages(msgs)
    msgs = _dedup_system_prompts(msgs)

    return msgs


# ---------------------------------------------------------------------------
# Aggressive transforms — safe + semantic deduplication
# ---------------------------------------------------------------------------

_SEMANTIC_SIMILARITY_THRESHOLD = 0.85
_MIN_CONTENT_LEN_FOR_SEMANTIC = 60


def _extract_diff_phrases(earlier: str, later: str) -> str:
    """Return the changed phrases from *later* relative to *earlier*."""
    a_words = earlier.split()
    b_words = later.split()
    sm = SequenceMatcher(None, a_words, b_words, autojunk=False)
    diff_parts: List[str] = []
    for tag, _i1, _i2, j1, j2 in sm.get_opcodes():
        if tag in ("insert", "replace"):
            diff_parts.append(" ".join(b_words[j1:j2]))
    return " ".join(diff_parts)


def _semantic_dedup(messages: List[dict]) -> List[dict]:
    """Deduplicate near-similar messages while preserving unique details.

    System messages and the last 2 user messages are never deduplicated.
    Uses the shared SentenceTransformer encoder from embedding_cache.
    """
    try:
        from app.services.embedding_cache import get_shared_encoder_sync
        import numpy as np
    except ImportError:
        logger.warning("semantic_dedup: sentence-transformers not available, skipping")
        return messages

    # Identify the last 2 user message indices — never dedup those
    user_indices = [i for i, m in enumerate(messages) if m.get("role") == "user"]
    protected_indices = set(user_indices[-2:]) if len(user_indices) >= 2 else set(user_indices)

    # Collect candidates (skip system messages, protected user messages, short content)
    candidates: List[tuple] = []  # (msg_index, content_text)
    for i, m in enumerate(messages):
        if m.get("role") == "system":
            continue
        if i in protected_indices:
            continue
        content = m.get("content")
        if not isinstance(content, str) or len(content) < _MIN_CONTENT_LEN_FOR_SEMANTIC:
            continue
        candidates.append((i, content))

    if len(candidates) < 2:
        return messages

    encoder = get_shared_encoder_sync()
    texts = [c[1] for c in candidates]
    embeddings = encoder.encode(texts, normalize_embeddings=True, show_progress_bar=False)

    result = list(messages)
    removed: set = set()

    for j in range(1, len(candidates)):
        if j in removed:
            continue
        idx_j = candidates[j][0]
        role_j = messages[idx_j].get("role")
        emb_j = embeddings[j]

        for k in range(j):
            if k in removed:
                continue
            idx_k = candidates[k][0]
            if messages[idx_k].get("role") != role_j:
                continue

            sim = float(np.dot(emb_j, embeddings[k]))
            if sim >= _SEMANTIC_SIMILARITY_THRESHOLD:
                # Keep the longer message, replace the shorter one
                if len(texts[j]) >= len(texts[k]):
                    # j is longer — keep j, replace k
                    replace_idx, keep_text, replace_text = idx_k, texts[j], texts[k]
                    removed.add(k)
                else:
                    # k is longer — keep k, replace j
                    replace_idx, keep_text, replace_text = idx_j, texts[k], texts[j]
                    removed.add(j)

                preview = keep_text[:60].replace("\n", " ")
                diff = _extract_diff_phrases(keep_text, replace_text)
                if diff:
                    replacement = (
                        f'[similar to earlier message: "{preview}..."]\n'
                        f"Key differences: {diff}"
                    )
                else:
                    replacement = f'[similar to earlier message: "{preview}..."]'

                # Only replace if we actually save tokens
                if len(replacement) < len(replace_text):
                    result[replace_idx] = {
                        **messages[replace_idx],
                        "content": replacement,
                    }
                break

    return result


def optimize_aggressive(messages: List[dict]) -> List[dict]:
    """Apply all safe transforms plus semantic deduplication.

    Semantic dedup encodes message contents with SentenceTransformer, computes
    pairwise cosine similarity, groups messages above 0.85 threshold, and keeps
    only the longest message from each group (diff-preserving). System messages
    and the last 2 user messages are never deduplicated.

    Returns a new list; the input is not mutated.
    """
    msgs = optimize_safe(messages)
    msgs = _semantic_dedup(msgs)
    return msgs


# ---------------------------------------------------------------------------
# Middle-out truncation
# ---------------------------------------------------------------------------

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
