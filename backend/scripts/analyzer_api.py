"""Minimal FastAPI app exposing ComplexityAnalyzerFactory over HTTP.

Goes through the same factory + settings path the production app uses,
so this is a real end-to-end test of the newly-wired `wide_deep_asym`
analyzer type.

Run:
    COMPLEXITY_ANALYZER_TYPE=wide_deep_asym \
        venv/bin/python3 -m uvicorn scripts.analyzer_api:app --port 8766

Endpoints:
    GET  /info                      → which analyzer is active
    POST /analyze {"prompt": "..."} → tier, confidence, routed model
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any, Dict, Optional

from fastapi import FastAPI
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from app.complexity.analyzer_factory import (  # noqa: E402
    AnalyzerType,
    ComplexityAnalyzerFactory,
)

app = FastAPI(title="Nadir analyzer test harness")

_analyzer = None
_analyzer_type = os.environ.get("COMPLEXITY_ANALYZER_TYPE", "wide_deep_asym")


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        _analyzer = ComplexityAnalyzerFactory.create_analyzer(_analyzer_type)
    return _analyzer


class AnalyzeRequest(BaseModel):
    prompt: str
    system_message: Optional[str] = None


@app.on_event("startup")
async def _warm():
    # Force analyzer + encoder load at startup so the first request isn't slow.
    a = _get_analyzer()
    if hasattr(a, "analyze"):
        await a.analyze("warmup")


@app.get("/info")
def info() -> Dict[str, Any]:
    a = _get_analyzer()
    out: Dict[str, Any] = {
        "analyzer_type": _analyzer_type,
        "class": type(a).__name__,
    }
    if hasattr(a, "decision_rule"):
        out["decision_rule"] = a.decision_rule
    if hasattr(a, "cost_lambda"):
        out["cost_lambda"] = a.cost_lambda
    out["registered_types"] = ComplexityAnalyzerFactory.get_available_analyzers()
    return out


@app.post("/analyze")
async def analyze(req: AnalyzeRequest) -> Dict[str, Any]:
    a = _get_analyzer()
    t0 = time.time()
    result = await a.analyze(text=req.prompt, system_message=req.system_message or "")
    dt_ms = int((time.time() - t0) * 1000)
    # Slim the response for readability
    return {
        "tier_name": result.get("tier_name"),
        "tier": result.get("tier"),
        "confidence": result.get("confidence"),
        "tier_probabilities": result.get("tier_probabilities"),
        "recommended_model": result.get("recommended_model"),
        "recommended_provider": result.get("recommended_provider"),
        "analyzer_type": result.get("analyzer_type"),
        "reasoning": result.get("reasoning"),
        "latency_ms": dt_ms,
    }
