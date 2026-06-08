"""Regression: the production optimizer must not corrupt source code.

Whitespace normalization preserves leading indentation, so raw (unfenced) code
in file-read tool outputs stays syntactically valid even in safe mode.
"""
import ast
import textwrap

import pytest

from app.services.context_optimizer import optimize_messages

PY_SRC = textwrap.dedent('''\
    def process(record, config):
        result = {}
        for key, spec in config.items():
            value = record.get(key)
            if value is None:
                if spec.get("required"):
                    raise ValueError(key)
                continue
            result[key] = value
        return result
''')


@pytest.mark.parametrize("mode", ["safe", "aggressive"])
def test_raw_code_stays_valid(mode):
    out = optimize_messages([{"role": "tool", "content": PY_SRC}], mode=mode).messages[0]["content"]
    ast.parse(out)  # raises if indentation was flattened


@pytest.mark.parametrize("mode", ["safe", "aggressive"])
def test_indentation_preserved(mode):
    out = optimize_messages([{"role": "tool", "content": PY_SRC}], mode=mode).messages[0]["content"]
    line = next(ln for ln in out.split("\n") if "raise ValueError" in ln)
    assert line.startswith("                raise ValueError")
