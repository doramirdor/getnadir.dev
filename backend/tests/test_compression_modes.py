"""Compression mode semantics — in-prompt only (no offload).

The data always stays IN the prompt, so compression works for data-dependent
queries with no retrieval round-trip:
  - safe       = JSON columnar packing (type-exact reversible) + dedup
  - aggressive = tighter CSV columnar packing (model-readable) + dedup
Offload was removed: it is a net loss whenever the model needs the data back.
"""
import json
import re

import pytest

from app.services.context_optimizer import optimize_messages, _pack_array, _unpack_table


def _msgs():
    rows = [{"id": 1000 + i, "user": f"user{i}", "status": "active" if i % 4 else "suspended"} for i in range(50)]
    return [
        {"role": "system", "content": "You are a support assistant.\n" + json.dumps(rows, indent=2)},
        {"role": "user", "content": "how many suspended?"},
    ]


def test_safe_packs_json_columnar():
    r = optimize_messages(_msgs(), mode="safe")
    assert "json_array_pack" in r.optimizations_applied
    assert "⟦cols=" in r.messages[0]["content"]
    assert r.tokens_saved > 0


def test_aggressive_packs_csv_and_saves_more_than_safe():
    safe = optimize_messages(_msgs(), mode="safe")
    aggr = optimize_messages(_msgs(), mode="aggressive")
    assert "csv_table_pack" in aggr.optimizations_applied
    assert "⟦tbl⟧" in aggr.messages[0]["content"]
    assert aggr.optimized_tokens < safe.optimized_tokens   # CSV is tighter than JSON-array


def test_no_offload_field_set():
    # Offload removed — data stays in the prompt for every mode.
    for mode in ("safe", "aggressive"):
        r = optimize_messages(_msgs(), mode=mode)
        assert r.offload_captured == {}


def test_csv_pack_round_trip_information_complete():
    rows = [{"id": 1000 + i, "user": f"u{i}", "v": i / 3, "ok": bool(i % 2), "note": None,
             "msg": f'has,comma and "quote" {i}'} for i in range(10)]
    packed = _pack_array(rows, style="csv")
    back = _unpack_table(packed)
    # CSV is information-complete (string-valued): every value round-trips as text.
    for i in range(10):
        for k in rows[0]:
            expected = "" if rows[i][k] is None else str(rows[i][k])
            assert back[i][k] == expected


def test_json_pack_round_trip_is_type_exact():
    rows = [{"id": 1000 + i, "meta": {"a": [i]}, "v": i / 3, "ok": bool(i % 2)} for i in range(8)]
    packed = _pack_array(rows, style="json")
    assert _unpack_table(packed) == rows   # type-exact reversible


def test_csv_falls_back_to_json_for_nested():
    # Nested values can't be CSV-packed losslessly -> json style is used.
    rows = [{"id": i, "tags": ["a", "b"]} for i in range(6)]
    csv_packed = _pack_array(rows, style="csv")
    assert csv_packed is not None and csv_packed.startswith("⟦cols=")  # json fallback, not ⟦tbl⟧


def test_off_is_noop():
    msgs = _msgs()
    r = optimize_messages(msgs, mode="off")
    assert r.tokens_saved == 0 and r.optimizations_applied == []
