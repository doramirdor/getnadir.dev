"""
Classifier analytics API endpoints.

Provides endpoints for viewing classifier performance, distribution,
confidence histograms, misclassifications, latency trends, and
submitting feedback on classification accuracy.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.supabase_auth import validate_api_key, UserSession, supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/classifier", tags=["Classifier Analytics"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ClassifierStats(BaseModel):
    total_classifications: int = 0
    tier_distribution: Dict[str, int] = Field(default_factory=dict)
    avg_confidence: float = 0.0
    avg_latency_ms: float = 0.0
    accuracy_rate: Optional[float] = None


class DailyDistribution(BaseModel):
    date: str
    simple: int = 0
    medium: int = 0
    complex: int = 0


class ConfidenceBucket(BaseModel):
    bucket: str
    count: int = 0


class MisclassificationEntry(BaseModel):
    request_id: str
    date: str
    prompt: Optional[str] = None
    predicted_tier: str
    confidence: float
    recommended_model: Optional[str] = None
    used_model: Optional[str] = None


class LatencyPoint(BaseModel):
    date: str
    avg_latency_ms: float


class FeedbackRequest(BaseModel):
    request_id: str = Field(..., description="Request ID of the classification")
    correct_tier: Optional[str] = Field(None, description="Correct tier: simple/medium/complex")
    is_correct: bool = Field(..., description="Whether the classification was correct")
    notes: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: str
    status: str = "recorded"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_range(range_str: str) -> datetime:
    """Convert range string like '7d', '30d', '90d' to a start datetime."""
    days_map = {"1d": 1, "7d": 7, "14d": 14, "30d": 30, "90d": 90}
    days = days_map.get(range_str, 7)
    return datetime.now(timezone.utc) - timedelta(days=days)


def _get_classifier_events(user_id: str, start: datetime, limit: int = 5000) -> List[Dict]:
    """Fetch usage_events where analyzer_type is binary for the given user."""
    try:
        response = (
            supabase.table("usage_events")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", start.isoformat())
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        events = response.data or []
        # Filter to binary classifier events
        return [
            e for e in events
            if (e.get("metadata") or {}).get("analyzer_type") == "binary"
        ]
    except Exception as e:
        logger.error("Error fetching classifier events: %s", e)
        return []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=ClassifierStats)
async def get_classifier_stats(
    range: str = Query("7d", description="Time range: 1d, 7d, 14d, 30d, 90d"),
    current_user: UserSession = Depends(validate_api_key),
):
    """Get summary statistics for classifier performance."""
    start = _parse_range(range)
    events = _get_classifier_events(str(current_user.id), start)

    if not events:
        return ClassifierStats()

    tier_dist: Dict[str, int] = {"simple": 0, "medium": 0, "complex": 0}
    confidences = []
    latencies = []

    for e in events:
        meta = e.get("metadata") or {}
        tier = meta.get("classifier_tier") or meta.get("complexity_name", "complex")
        tier_dist[tier] = tier_dist.get(tier, 0) + 1
        if meta.get("confidence") is not None:
            confidences.append(float(meta["confidence"]))
        latency = meta.get("analyzer_latency_ms")
        if latency is not None:
            latencies.append(float(latency))

    # Check feedback for accuracy
    accuracy = None
    try:
        fb_resp = (
            supabase.table("classifier_feedback")
            .select("*")
            .eq("user_id", str(current_user.id))
            .gte("created_at", start.isoformat())
            .execute()
        )
        feedback = fb_resp.data or []
        if feedback:
            correct = sum(1 for f in feedback if f.get("is_correct"))
            accuracy = correct / len(feedback) if feedback else None
    except Exception:
        pass  # Table might not exist yet

    return ClassifierStats(
        total_classifications=len(events),
        tier_distribution=tier_dist,
        avg_confidence=sum(confidences) / len(confidences) if confidences else 0.0,
        avg_latency_ms=sum(latencies) / len(latencies) if latencies else 0.0,
        accuracy_rate=accuracy,
    )


@router.get("/distribution", response_model=List[DailyDistribution])
async def get_classifier_distribution(
    range: str = Query("7d"),
    current_user: UserSession = Depends(validate_api_key),
):
    """Get daily tier distribution for stacked bar chart."""
    start = _parse_range(range)
    events = _get_classifier_events(str(current_user.id), start)

    daily: Dict[str, Dict[str, int]] = {}
    for e in events:
        date_str = (e.get("created_at") or "")[:10]
        if not date_str:
            continue
        if date_str not in daily:
            daily[date_str] = {"simple": 0, "medium": 0, "complex": 0}
        meta = e.get("metadata") or {}
        tier = meta.get("classifier_tier") or meta.get("complexity_name", "complex")
        daily[date_str][tier] = daily[date_str].get(tier, 0) + 1

    result = [
        DailyDistribution(date=d, **counts)
        for d, counts in sorted(daily.items())
    ]
    return result


@router.get("/confidence-histogram", response_model=List[ConfidenceBucket])
async def get_confidence_histogram(
    range: str = Query("7d"),
    current_user: UserSession = Depends(validate_api_key),
):
    """Get confidence values bucketed into histogram bins."""
    start = _parse_range(range)
    events = _get_classifier_events(str(current_user.id), start)

    buckets = {f"{i/10:.1f}-{(i+1)/10:.1f}": 0 for i in range(10)}
    for e in events:
        meta = e.get("metadata") or {}
        conf = meta.get("confidence")
        if conf is None:
            continue
        conf = float(conf)
        idx = min(int(conf * 10), 9)
        key = f"{idx/10:.1f}-{(idx+1)/10:.1f}"
        buckets[key] += 1

    return [ConfidenceBucket(bucket=k, count=v) for k, v in buckets.items()]


@router.get("/misclassifications", response_model=List[MisclassificationEntry])
async def get_misclassifications(
    range: str = Query("7d"),
    current_user: UserSession = Depends(validate_api_key),
):
    """Get cases where user overrode the recommended model (proxy for misclassification)."""
    start = _parse_range(range)
    events = _get_classifier_events(str(current_user.id), start)

    misclassifications = []
    for e in events:
        meta = e.get("metadata") or {}
        if not meta.get("model_was_overridden") and meta.get("recommended_model") == meta.get("selected_model"):
            continue

        misclassifications.append(MisclassificationEntry(
            request_id=e.get("request_id", ""),
            date=(e.get("created_at") or "")[:19],
            prompt=(e.get("prompt") or "")[:200],
            predicted_tier=meta.get("classifier_tier") or meta.get("complexity_name", "unknown"),
            confidence=float(meta.get("confidence", 0)),
            recommended_model=meta.get("recommended_model"),
            used_model=meta.get("selected_model") or e.get("model_name"),
        ))

    return misclassifications[:100]


@router.get("/latency-trend", response_model=List[LatencyPoint])
async def get_latency_trend(
    range: str = Query("7d"),
    current_user: UserSession = Depends(validate_api_key),
):
    """Get daily average classifier latency trend."""
    start = _parse_range(range)
    events = _get_classifier_events(str(current_user.id), start)

    daily_latencies: Dict[str, List[float]] = {}
    for e in events:
        date_str = (e.get("created_at") or "")[:10]
        meta = e.get("metadata") or {}
        latency = meta.get("analyzer_latency_ms")
        if not date_str or latency is None:
            continue
        daily_latencies.setdefault(date_str, []).append(float(latency))

    return [
        LatencyPoint(
            date=d,
            avg_latency_ms=sum(lats) / len(lats),
        )
        for d, lats in sorted(daily_latencies.items())
    ]


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    request: FeedbackRequest,
    current_user: UserSession = Depends(validate_api_key),
):
    """Submit feedback on a classification (correct/incorrect with optional correct tier)."""
    user_id = str(current_user.id)
    correct_tier = request.correct_tier if not request.is_correct else None

    try:
        result = (
            supabase.table("classifier_feedback")
            .insert({
                "request_id": request.request_id,
                "user_id": user_id,
                "is_correct": request.is_correct,
                "correct_tier": correct_tier,
                "notes": request.notes,
            })
            .execute()
        )
        feedback_id = result.data[0]["id"] if result.data else "unknown"
    except Exception as e:
        logger.error("Error saving classifier feedback: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save feedback")

    return FeedbackResponse(id=str(feedback_id))
