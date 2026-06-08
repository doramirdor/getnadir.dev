"""Context Optimize — compact bloated context before LLM dispatch.

Modes
-----
- ``off``        No processing (zero overhead).
- ``safe``       Deterministic, lossless transforms only.
- ``aggressive`` All safe transforms + semantic deduplication via embeddings.

All public functions operate on plain ``list[dict]`` messages so the module
has no dependency on FastAPI, Pydantic, or the rest of the server.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------

@dataclass
class OptimizeResult:
    """Returned by :func:`optimize_messages`."""
    messages: list[dict]
    original_tokens: int
    optimized_tokens: int
    tokens_saved: int
    mode: str
    optimizations_applied: list[str] = field(default_factory=list)
    # aggressive offload: {hash: original_content} so the caller can inject the
    # retrieve tool and serve the fetch-back loop (see ccr.py). Empty unless the
    # offload stage ran (aggressive mode + allow_offload).
    offload_captured: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Token estimation — tiktoken (accurate) with len//4 fallback
# ---------------------------------------------------------------------------

try:
    import tiktoken as _tiktoken
    _enc = _tiktoken.get_encoding("cl100k_base")  # GPT-4 / Claude-family BPE

    def _estimate_tokens_str(text: str) -> int:
        return max(1, len(_enc.encode(text, disallowed_special=())))
except Exception:                       # pragma: no cover — missing or broken tiktoken
    def _estimate_tokens_str(text: str) -> int:
        return max(1, len(text) // 4)


def _estimate_tokens_messages(messages: list[dict]) -> int:
    total = 0
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            total += _estimate_tokens_str(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    total += _estimate_tokens_str(part.get("text", ""))
        # role overhead
        total += 4
    return total


# ---------------------------------------------------------------------------
# Transform 1 — System-prompt deduplication
# ---------------------------------------------------------------------------

def _dedup_system_prompts(messages: list[dict]) -> tuple[list[dict], bool]:
    """Remove system-prompt text that is duplicated verbatim in later messages."""
    system_texts: list[str] = []
    for m in messages:
        if m.get("role") == "system":
            content = m.get("content", "")
            if isinstance(content, str) and len(content) >= 20:
                system_texts.append(content)

    if not system_texts:
        return messages, False

    changed = False
    result: list[dict] = []
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
                changed = True
        if new_content != content:
            result.append({**m, "content": new_content})
        else:
            result.append(m)
    return result, changed


# ---------------------------------------------------------------------------
# Transform 2 — Tool-schema deduplication
# ---------------------------------------------------------------------------

def _dedup_tool_schemas(messages: list[dict]) -> tuple[list[dict], bool]:
    """Replace repeated identical tool/function schemas with a short reference."""
    seen_schemas: dict[str, int] = {}  # canonical JSON → first-seen message index
    changed = False
    result: list[dict] = []

    for idx, m in enumerate(messages):
        content = m.get("content")
        if not isinstance(content, str) or len(content) < 50:
            result.append(m)
            continue

        new_content = content
        # Find JSON objects that look like tool schemas (contain "name" and
        # "parameters" or "function" keys)
        for match_obj in _iter_json_objects(content):
            obj, start, end = match_obj
            if not isinstance(obj, dict):
                continue
            # Heuristic: looks like a tool schema
            if not (_is_tool_schema(obj)):
                continue
            canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"))
            if canonical in seen_schemas:
                ref = f'[see tool "{obj.get("name", "?")}" schema above]'
                new_content = new_content[:start] + ref + new_content[end:]
                changed = True
            else:
                seen_schemas[canonical] = idx

        if new_content != content:
            result.append({**m, "content": new_content})
        else:
            result.append(m)

    return result, changed


def _is_tool_schema(obj: dict) -> bool:
    """Heuristic: dict looks like a tool/function schema."""
    if "name" in obj and ("parameters" in obj or "input_schema" in obj):
        return True
    if "function" in obj and isinstance(obj["function"], dict):
        return True
    return False


# ---------------------------------------------------------------------------
# Transform 3 — JSON minification
# ---------------------------------------------------------------------------

def _minify_json_in_content(content: str) -> tuple[str, bool]:
    """Find JSON objects/arrays in text and re-serialize compactly.

    Uses ``json.JSONDecoder.raw_decode`` to handle JSON embedded in prose.
    Only replaces when the compact form is actually shorter.
    Skips content inside fenced code blocks (``` ... ```).
    """
    if not content or len(content) < 10:
        return content, False

    # Split on code fences — only process non-code segments
    parts = re.split(r"(```[^\n]*\n.*?```)", content, flags=re.DOTALL)
    changed = False
    result_segments: list[str] = []

    for i, segment in enumerate(parts):
        if segment.startswith("```"):
            # Code block — leave untouched
            result_segments.append(segment)
        else:
            minified, seg_changed = _minify_json_segment(segment)
            result_segments.append(minified)
            if seg_changed:
                changed = True

    return "".join(result_segments), changed


def _minify_json_segment(text: str) -> tuple[str, bool]:
    """Minify JSON in a single non-code-block text segment."""
    if not text or len(text) < 10:
        return text, False

    decoder = json.JSONDecoder()
    changed = False
    result_parts: list[str] = []
    pos = 0

    while pos < len(text):
        next_brace = len(text)
        for ch in ("{", "["):
            idx = text.find(ch, pos)
            if idx != -1 and idx < next_brace:
                next_brace = idx

        if next_brace == len(text):
            result_parts.append(text[pos:])
            break

        result_parts.append(text[pos:next_brace])

        try:
            obj, end_idx = decoder.raw_decode(text, next_brace)
            compact = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
            original_slice = text[next_brace:end_idx]
            if len(compact) < len(original_slice):
                result_parts.append(compact)
                changed = True
            else:
                result_parts.append(original_slice)
            pos = end_idx
        except (json.JSONDecodeError, ValueError):
            result_parts.append(text[next_brace])
            pos = next_brace + 1

    return "".join(result_parts), changed


# ---------------------------------------------------------------------------
# Transform 4 — Whitespace normalization
# ---------------------------------------------------------------------------

_MULTI_BLANK_LINES = re.compile(r"\n{3,}")
_MULTI_SPACES = re.compile(r"[ \t]{2,}")

# Lazy-loaded shared encoder for semantic dedup (loaded once, reused)
_shared_encoder = None

def _get_encoder():
    """Get the shared SentenceTransformer encoder (lazy singleton)."""
    global _shared_encoder
    if _shared_encoder is None:
        try:
            from sentence_transformers import SentenceTransformer
            _shared_encoder = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            return None
    return _shared_encoder


def _normalize_whitespace(content: str) -> tuple[str, bool]:
    """Collapse excessive blank lines and spaces, preserving code blocks."""
    if not content:
        return content, False

    lines = content.split("\n")
    in_code_block = False
    out_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            out_lines.append(line)
            continue
        if in_code_block:
            out_lines.append(line)
            continue
        # Collapse interior multi-spaces but PRESERVE leading indentation —
        # otherwise raw (unfenced) source code has its indentation flattened
        # into invalid syntax. Leading whitespace is semantically significant
        # (Python, YAML, diffs), so it must survive even in "safe" mode.
        n_lead = len(line) - len(line.lstrip(" \t"))
        out_lines.append(line[:n_lead] + _MULTI_SPACES.sub(" ", line[n_lead:]))

    result = "\n".join(out_lines)
    # Collapse 3+ consecutive blank lines → 2
    result = _MULTI_BLANK_LINES.sub("\n\n", result)
    return result, result != content


# ---------------------------------------------------------------------------
# Transform 5 — Chat-history trimming
# ---------------------------------------------------------------------------

def _trim_chat_history(
    messages: list[dict], max_turns: int = 40
) -> tuple[list[dict], bool]:
    """Trim long conversations, keeping system msgs + first turn + last N turns.

    A "turn" is a user message followed by zero or more non-user messages
    (assistant, tool, etc.).
    """
    # Separate system messages from the rest
    system_msgs: list[dict] = []
    conversation: list[dict] = []
    for m in messages:
        if m.get("role") == "system":
            system_msgs.append(m)
        else:
            conversation.append(m)

    # Count user turns
    user_indices = [i for i, m in enumerate(conversation) if m.get("role") == "user"]
    if len(user_indices) <= max_turns:
        return messages, False

    # Keep first turn (up to second user message) and last max_turns-1 turns
    first_turn_end = user_indices[1] if len(user_indices) > 1 else len(conversation)
    first_turn = conversation[:first_turn_end]

    # Last (max_turns - 1) turns start from the user_indices[-(max_turns-1)] position
    keep_from = max_turns - 1
    last_start_idx = user_indices[-keep_from] if keep_from <= len(user_indices) else 0
    last_turns = conversation[last_start_idx:]

    trimmed_count = len(user_indices) - max_turns
    placeholder = {
        "role": "system",
        "content": f"[...{trimmed_count} earlier turns trimmed for context optimization...]",
    }

    result = system_msgs + first_turn + [placeholder] + last_turns
    return result, True


# ---------------------------------------------------------------------------
# JSON object iterator (shared utility)
# ---------------------------------------------------------------------------

def _iter_json_objects(text: str):
    """Yield (parsed_obj, start, end) for each top-level JSON value in *text*."""
    decoder = json.JSONDecoder()
    pos = 0
    while pos < len(text):
        # Find next { or [
        next_brace = len(text)
        for ch in ("{", "["):
            idx = text.find(ch, pos)
            if idx != -1 and idx < next_brace:
                next_brace = idx
        if next_brace == len(text):
            break
        try:
            obj, end_idx = decoder.raw_decode(text, next_brace)
            yield obj, next_brace, end_idx
            pos = end_idx
        except (json.JSONDecodeError, ValueError):
            pos = next_brace + 1


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Transform 6 — Semantic deduplication (aggressive mode only)
# ---------------------------------------------------------------------------

_SEMANTIC_SIMILARITY_THRESHOLD = 0.85  # cosine similarity above this = "same"
_MIN_CONTENT_LEN_FOR_SEMANTIC = 60     # skip short messages


def _extract_diff_phrases(earlier: str, later: str) -> str:
    """Return the *changed* phrases from *later* relative to *earlier*.

    Uses ``difflib.SequenceMatcher`` on word tokens to find inserted or
    replaced runs of words.  This captures fine-grained edits like
    "return indices" → "return actual values, not indices" without
    treating the whole message as unique.
    """
    from difflib import SequenceMatcher

    a_words = earlier.split()
    b_words = later.split()
    sm = SequenceMatcher(None, a_words, b_words, autojunk=False)

    diff_parts: list[str] = []
    for tag, _i1, _i2, j1, j2 in sm.get_opcodes():
        if tag in ("insert", "replace"):
            diff_parts.append(" ".join(b_words[j1:j2]))

    return " ".join(diff_parts)


def _semantic_dedup(
    messages: list[dict],
    threshold: float = _SEMANTIC_SIMILARITY_THRESHOLD,
) -> tuple[list[dict], bool]:
    """Deduplicate near-similar messages while preserving unique details.

    Compares each user/assistant message to all prior messages of the same
    role.  If cosine similarity exceeds *threshold*, the later message is
    replaced with a compact reference **plus any sentences that differ** from
    the earlier message.  This keeps token savings high while avoiding
    accuracy loss from losing refinements the user made.

    Requires ``sentence-transformers`` (loaded lazily via the shared encoder).
    System messages and short messages are never deduplicated.
    """
    try:
        import numpy as np
        encoder = _get_encoder()
        if encoder is None:
            return messages, False
    except Exception:
        return messages, False

    # Collect candidate texts and their indices
    candidates: list[tuple[int, str]] = []
    for i, m in enumerate(messages):
        if m.get("role") == "system":
            continue
        content = m.get("content")
        if not isinstance(content, str) or len(content) < _MIN_CONTENT_LEN_FOR_SEMANTIC:
            continue
        candidates.append((i, content))

    if len(candidates) < 2:
        return messages, False

    texts = [c[1] for c in candidates]
    embeddings = encoder.encode(texts, normalize_embeddings=True, show_progress_bar=False)

    changed = False
    removed: set[int] = set()  # candidate indices that were deduped
    result = list(messages)

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
            if sim >= threshold:
                # Build compact replacement: reference + unique diff
                preview = texts[k][:60].replace("\n", " ")
                diff = _extract_diff_phrases(texts[k], texts[j])
                if diff:
                    replacement = (
                        f'[similar to earlier message: "{preview}..."]\n'
                        f"Key differences: {diff}"
                    )
                else:
                    replacement = f'[similar to earlier message: "{preview}..."]'

                # Only replace if we actually save tokens
                if _estimate_tokens_str(replacement) < _estimate_tokens_str(texts[j]):
                    result[idx_j] = {
                        **messages[idx_j],
                        "content": replacement,
                    }
                    removed.add(j)
                    changed = True
                break  # one match is enough

    return result, changed


# ---------------------------------------------------------------------------
# Transform — Homogeneous JSON-array packing (aggressive, columnar)
# ---------------------------------------------------------------------------
#
# Large arrays of objects that share the same keys (DB query results, API list
# responses, tool outputs) repeat every key on every row. Packing them into a
# columnar table — a single header of keys plus one JSON value-array per row —
# emits each key once instead of N times. Information-lossless (deterministically
# reversible via _unpack_table) but not byte-identical JSON, so aggressive only.

_TABLE_OPEN = "⟦cols="   # ⟦cols=[...]⟧
_TABLE_CLOSE = "⟧"       # ⟧
_TABLE_END = "⟦end⟧"  # ⟦end⟧
_MIN_TABLE_ROWS = 5


_CSV_TABLE_OPEN = "⟦tbl⟧"
_CSV_TABLE_END = "⟦/tbl⟧"


def _is_flat_scalar_dict(d: dict) -> bool:
    return all(not isinstance(v, (dict, list)) for v in d.values())


def _pack_array(arr: list, style: str = "json"):
    """Pack a homogeneous list-of-dicts into a columnar table, or None if unfit.

    style="json" (default) -> ``⟦cols=[...]⟧`` + one JSON value-array per row.
        Deterministically reversible to the exact list-of-dicts (types preserved).
    style="csv"  -> a tighter ``⟦tbl⟧`` header + CSV rows. Used only when every
        value is a scalar; ~5-7% smaller and fully model-readable, but values come
        back as strings (information-complete, not byte/type-exact). Falls back to
        the json style automatically for nested/non-flat arrays.
    """
    if len(arr) < _MIN_TABLE_ROWS or not all(isinstance(x, dict) for x in arr):
        return None
    cols = list(arr[0].keys())
    if len(cols) < 2:
        return None
    colset = set(cols)
    for d in arr:
        if set(d.keys()) != colset:
            return None  # not strictly homogeneous — leave for json_minify

    if style == "csv" and all(_is_flat_scalar_dict(d) for d in arr):
        import csv
        import io
        out = io.StringIO()
        out.write(_CSV_TABLE_OPEN + "\n")
        w = csv.writer(out, lineterminator="\n")
        w.writerow(cols)
        for d in arr:
            w.writerow(["" if d[c] is None else d[c] for c in cols])
        out.write(_CSV_TABLE_END)
        return out.getvalue()

    # json style (also the fallback when csv can't apply)
    lines = [f"{_TABLE_OPEN}{json.dumps(cols, separators=(',', ':'), ensure_ascii=False)}{_TABLE_CLOSE}"]
    for d in arr:
        lines.append(json.dumps([d[c] for c in cols], separators=(",", ":"), ensure_ascii=False))
    lines.append(_TABLE_END)
    return "\n".join(lines)


def _unpack_table(packed: str) -> list:
    """Inverse of :func:`_pack_array` — reconstruct the list-of-dicts (json or csv)."""
    if packed.startswith(_CSV_TABLE_OPEN):
        import csv
        import io
        body = packed[len(_CSV_TABLE_OPEN):]
        if body.endswith(_CSV_TABLE_END):
            body = body[: -len(_CSV_TABLE_END)]
        rows = list(csv.reader(io.StringIO(body.strip("\n"))))
        cols, data = rows[0], rows[1:]
        return [dict(zip(cols, r)) for r in data]
    lines = packed.split("\n")
    cols = json.loads(lines[0][len(_TABLE_OPEN):-len(_TABLE_CLOSE)])
    rows = [json.loads(ln) for ln in lines[1:] if ln and ln != _TABLE_END]
    return [dict(zip(cols, r)) for r in rows]


def _pack_homogeneous_arrays(content: str, style: str = "json") -> tuple[str, bool]:
    """Replace embedded homogeneous JSON arrays with a compact columnar table."""
    if not content or len(content) < 80 or "[" not in content:
        return content, False

    parts = re.split(r"(```[^\n]*\n.*?```)", content, flags=re.DOTALL)
    changed = False
    out_segments: list[str] = []
    for seg in parts:
        if seg.startswith("```"):
            out_segments.append(seg)
            continue
        new_seg, seg_changed = _pack_segment(seg, style=style)
        out_segments.append(new_seg)
        changed = changed or seg_changed
    return "".join(out_segments), changed


def _pack_segment(text: str, style: str = "json") -> tuple[str, bool]:
    decoder = json.JSONDecoder()
    result: list[str] = []
    pos = 0
    changed = False
    while pos < len(text):
        idx = text.find("[", pos)
        if idx == -1:
            result.append(text[pos:])
            break
        result.append(text[pos:idx])
        try:
            obj, end = decoder.raw_decode(text, idx)
        except (json.JSONDecodeError, ValueError):
            result.append("[")
            pos = idx + 1
            continue
        packed = _pack_array(obj, style=style) if isinstance(obj, list) else None
        if packed is not None:
            minified = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
            if _estimate_tokens_str(packed) < _estimate_tokens_str(minified):
                result.append(packed)
                changed = True
            else:
                result.append(text[idx:end])
        else:
            result.append(text[idx:end])
        pos = end
    return "".join(result), changed


_SAFE_TRANSFORMS = [
    ("system_prompt_dedup", lambda msgs, **_: _dedup_system_prompts(msgs)),
    ("tool_schema_dedup", lambda msgs, **_: _dedup_tool_schemas(msgs)),
]

# Content-level transforms (operate on individual message content strings)
_SAFE_CONTENT_TRANSFORMS = [
    ("json_minify", _minify_json_in_content),
    ("whitespace_normalize", _normalize_whitespace),
]


def optimize_messages(
    messages: list[dict],
    mode: str = "off",
    max_turns: int = 40,
    *,
    allow_offload: bool = False,
) -> OptimizeResult:
    """Optimize a list of message dicts for token reduction.

    Parameters
    ----------
    messages
        List of ``{"role": "...", "content": "..."}`` dicts.
    mode
        - ``"off"``        — no processing.
        - ``"safe"``       — strong in-prompt compression: structural transforms,
          columnar JSON-array packing (type-exact reversible), and semantic
          deduplication. Data stays in the prompt; no retrieval needed.
        - ``"aggressive"`` — same pipeline but homogeneous arrays are packed in the
          tighter CSV columnar form (~5-7% smaller, fully model-readable). Data
          still stays IN the prompt, so it works for data-dependent queries with no
          retrieval round-trip.
    max_turns
        Maximum conversation turns to keep when trimming history.
    allow_offload
        Deprecated / no-op. Token offload was removed because it is a net loss
        whenever the model needs the data back (confirmed on real provider tokens).
        Kept only for call-site compatibility.

    Returns
    -------
    OptimizeResult
        Optimized messages and savings metrics.
    """
    original_tokens = _estimate_tokens_messages(messages)

    if mode == "off":
        return OptimizeResult(
            messages=messages,
            original_tokens=original_tokens,
            optimized_tokens=original_tokens,
            tokens_saved=0,
            mode="off",
        )

    applied: list[str] = []

    # Deep copy messages to avoid mutating input
    msgs = [{**m} for m in messages]

    # --- Message-level transforms (safe) ---
    for name, fn in _SAFE_TRANSFORMS:
        msgs, did_change = fn(msgs)
        if did_change:
            applied.append(name)

    # --- Content-level transforms (safe) ---
    for name, fn in _SAFE_CONTENT_TRANSFORMS:
        content_changed = False
        for i, m in enumerate(msgs):
            content = m.get("content")
            if not isinstance(content, str) or len(content) < 10:
                continue
            new_content, changed = fn(content)
            if changed:
                msgs[i] = {**m, "content": new_content}
                content_changed = True
        if content_changed:
            applied.append(name)

    # --- Strong in-prompt compression (BOTH safe and aggressive) ---
    # The data stays IN the prompt, so this works for data-dependent queries with
    # NO retrieval round-trip. safe packs homogeneous arrays as JSON value-arrays
    # (type-exact reversible); aggressive uses the tighter CSV columnar form
    # (~5-7% smaller, fully model-readable). (Token offload was removed: it is a
    # net loss whenever the model needs the data back — confirmed on real tokens.)
    offload_captured: dict = {}
    if mode in ("safe", "aggressive"):
        pack_style = "csv" if mode == "aggressive" else "json"
        content_changed = False
        for i, m in enumerate(msgs):
            content = m.get("content")
            if not isinstance(content, str) or len(content) < 10:
                continue
            new_content, changed = _pack_homogeneous_arrays(content, style=pack_style)
            if changed:
                msgs[i] = {**m, "content": new_content}
                content_changed = True
        if content_changed:
            applied.append("csv_table_pack" if pack_style == "csv" else "json_array_pack")

        msgs, did_semantic = _semantic_dedup(msgs)
        if did_semantic:
            applied.append("semantic_dedup")

    # --- Chat history trimming ---
    msgs, did_trim = _trim_chat_history(msgs, max_turns=max_turns)
    if did_trim:
        applied.append("chat_history_trim")

    optimized_tokens = _estimate_tokens_messages(msgs)

    return OptimizeResult(
        messages=msgs,
        original_tokens=original_tokens,
        optimized_tokens=optimized_tokens,
        tokens_saved=max(0, original_tokens - optimized_tokens),
        mode=mode,
        offload_captured=offload_captured,
        optimizations_applied=applied,
    )
