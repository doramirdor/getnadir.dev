"""Generic, data-driven cascade rule engine.

This package implements the configurable per-workload routing policy that
sits in front of `cascade_router.CascadeRouter`. The engine matches the
incoming prompt against a list of declarative rules and emits a
`RuleDecision` that the cascade honors before falling through to its
default verifier-gated path.

The full architecture is documented in `docs/cascade_rules.md`. The
schema of a single rule is documented inline in `engine.py`.

Public surface:
    - `CascadeRuleEngine`  — the evaluator
    - `Rule`               — a single rule (parsed)
    - `RuleDecision`       — the engine's output
    - `load_profile(name)` — load a named YAML profile (cached, hot-reloadable)
    - `load_inline(rules)` — load a list of rule dicts (per-tenant override)
"""

from .engine import (  # noqa: F401
    CascadeRuleEngine,
    Rule,
    RuleDecision,
    load_profile,
    load_inline,
    PROFILES_DIR,
)
