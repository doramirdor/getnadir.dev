"""Columnar JSON-array packing in the production optimizer (context_optimizer).

Mirrors the NadirClaw test: aggressive-mode packing must be information-lossless
(deterministically reversible), must never run in safe mode, and must skip
arrays it cannot pack unambiguously.
"""
import json

from app.services.context_optimizer import (
    _pack_array,
    _pack_homogeneous_arrays,
    _unpack_table,
    optimize_messages,
)


def _roundtrip(arr):
    packed = _pack_array(arr)
    assert packed is not None
    return _unpack_table(packed)


def test_roundtrip_scalars():
    arr = [{"id": i, "name": f"u{i}", "active": bool(i % 2), "score": i / 3} for i in range(8)]
    assert _roundtrip(arr) == arr


def test_roundtrip_nested_null_and_tricky_strings():
    arr = [
        {"id": 1, "meta": {"a": [1, 2], "b": None}, "note": 'has "quotes", commas, [brackets]'},
        {"id": 2, "meta": {"a": [], "b": 5}, "note": "tab\tand\nnewline"},
        {"id": 3, "meta": {"a": [9], "b": None}, "note": "unicode ✓ é 中"},
        {"id": 4, "meta": {"a": [1], "b": 0}, "note": ""},
        {"id": 5, "meta": {"a": [2, 3], "b": 1}, "note": "⟦cols= looks like a marker"},
    ]
    assert _roundtrip(arr) == arr


def test_skip_too_few_rows():
    assert _pack_array([{"a": 1, "b": 2}] * 4) is None


def test_skip_non_homogeneous():
    assert _pack_array([{"a": 1, "b": 2}, {"a": 1}, {"c": 3}] * 3) is None


def test_skip_single_column():
    assert _pack_array([{"a": i} for i in range(10)]) is None


def _msgs():
    rows = [{"id": 1000 + i, "user": f"user{i}", "status": "active" if i % 3 else "inactive",
             "plan": "pro" if i % 5 == 0 else "free"} for i in range(40)]
    return [{"role": "user", "content": "list users"},
            {"role": "tool", "content": "result:\n" + json.dumps(rows, indent=2)}]


def test_aggressive_packs_and_saves():
    r = optimize_messages(_msgs(), mode="aggressive")
    assert "csv_table_pack" in r.optimizations_applied  # aggressive uses tighter CSV columnar
    assert r.tokens_saved > 0


def test_safe_mode_now_packs():
    # Semantics changed: safe is now the strong lossless tier and DOES pack
    # homogeneous arrays (columnar packing is information-lossless + reversible).
    r = optimize_messages(_msgs(), mode="safe")
    assert "json_array_pack" in r.optimizations_applied
    assert "⟦cols=" in r.messages[1]["content"]


def test_off_mode_never_packs():
    r = optimize_messages(_msgs(), mode="off")
    assert "json_array_pack" not in r.optimizations_applied


def test_fenced_code_left_untouched():
    arr = [{"id": i, "v": i * 2} for i in range(10)]
    content = "```json\n" + json.dumps(arr, indent=2) + "\n```"
    out, changed = _pack_homogeneous_arrays(content)
    assert not changed and out == content
