"""Kompress adapter — ML/structural context compression via headroom-ai.

Wraps ``headroom.compress`` (the package whose compression pipeline includes
the "Kompress" transforms) behind a defensive, cache-safe interface:

- System messages are NEVER rewritten. Provider prompt caching bills cached
  prefix reads at ~10% of list price, so keeping the prefix byte-stable is
  worth more than any lossy compression of those same tokens.
- User messages are never rewritten and the most recent turns are protected,
  so the live question reaches the model verbatim.
- The compressed result is only accepted when it actually saves tokens and
  preserves the message structure.
- Degrades to a no-op when headroom-ai is not installed or raises — callers
  fall back to the deterministic "aggressive" transforms.

Like context_optimizer, this module depends only on the stdlib at import
time; headroom-ai is imported lazily on first use.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Below this estimated prompt size the compression latency isn't worth the
# token savings (headroom's own per-message floor is 250 tokens).
DEFAULT_MIN_PROMPT_TOKENS = 1_000

# Last N messages passed through untouched so the live exchange stays verbatim.
DEFAULT_PROTECT_RECENT = 4

# Token-counting fallback model when the router hasn't picked one yet.
_DEFAULT_COUNTING_MODEL = "claude-sonnet-4-5"

_compress_fn = None
_compress_config_cls = None
_load_failed = False


def _get_headroom():
    """Lazy-load headroom's compress() and CompressConfig once."""
    global _compress_fn, _compress_config_cls, _load_failed
    if _compress_fn is None and not _load_failed:
        try:
            from headroom import CompressConfig, compress
            _compress_fn = compress
            _compress_config_cls = CompressConfig
        except Exception as err:
            _load_failed = True
            logger.info(
                "headroom-ai not installed — kompress mode degrades to aggressive: %s", err
            )
    return _compress_fn, _compress_config_cls


def is_available() -> bool:
    """True when the headroom-ai package can be imported."""
    fn, _ = _get_headroom()
    return fn is not None


def _estimate_tokens(messages: list[dict]) -> int:
    """Cheap char//4 estimate — only used for the skip-small-prompts gate."""
    total = 0
    for m in messages:
        content = m.get("content")
        if isinstance(content, str):
            total += len(content) // 4
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    total += len(part["text"]) // 4
    return total


@dataclass
class KompressResult:
    """Outcome of a kompress pass. ``applied`` is False on any skip/fallback."""

    messages: list[dict]
    applied: bool
    tokens_before: int = 0
    tokens_after: int = 0
    transforms: list[str] = field(default_factory=list)
    skip_reason: str = ""


def kompress_messages(
    messages: list[dict],
    model: str | None = None,
    min_prompt_tokens: int = DEFAULT_MIN_PROMPT_TOKENS,
    protect_recent: int = DEFAULT_PROTECT_RECENT,
    target_ratio: float | None = None,
) -> KompressResult:
    """Compress bulky tool/assistant context via headroom, cache-safely.

    Returns the original messages with ``applied=False`` whenever headroom is
    unavailable, the prompt is too small, compression fails, or the result
    would not save tokens or would alter protected content.
    """
    compress, config_cls = _get_headroom()
    if compress is None:
        return KompressResult(messages, False, skip_reason="headroom_unavailable")

    estimated = _estimate_tokens(messages)
    if estimated < min_prompt_tokens:
        return KompressResult(messages, False, skip_reason="prompt_below_threshold")

    try:
        config = config_cls(
            compress_system_messages=False,  # cache-stable prefix — see module docstring
            compress_user_messages=False,
            protect_recent=protect_recent,
            target_ratio=target_ratio,
        )
        result = compress(messages, model=model or _DEFAULT_COUNTING_MODEL, config=config)

        compressed = result.messages
        if (
            not compressed
            or result.tokens_saved <= 0
            or len(compressed) != len(messages)
            or [m.get("role") for m in compressed] != [m.get("role") for m in messages]
        ):
            return KompressResult(messages, False, skip_reason="no_savings_or_structure_changed")

        # Hard cache-safety check: system and user content must be byte-stable.
        for original, new in zip(messages, compressed):
            if original.get("role") in ("system", "user") and new.get("content") != original.get("content"):
                return KompressResult(messages, False, skip_reason="protected_content_modified")

        return KompressResult(
            messages=compressed,
            applied=True,
            tokens_before=result.tokens_before,
            tokens_after=result.tokens_after,
            transforms=list(result.transforms_applied or []),
        )
    except Exception as err:
        logger.warning("kompress compression failed, using uncompressed messages: %s", err)
        return KompressResult(messages, False, skip_reason=f"error: {err}")
