"""
Referral API endpoints.

Used by the dashboard Referrals page and the signup flow.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.supabase_auth import UserSession, validate_jwt
from app.services import referral_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["referrals"])


class ReferralSummaryResponse(BaseModel):
    code: Optional[str]
    total: int
    signed_up: int
    subscribed: int
    rewarded: int
    months_earned: int
    recent: list


class RedeemRequest(BaseModel):
    code: str


class RedeemResponse(BaseModel):
    accepted: bool
    reason: Optional[str] = None


@router.get("/v1/referrals/me", response_model=ReferralSummaryResponse)
async def get_my_referrals(current_user: UserSession = Depends(validate_jwt)):
    """Return the user's referral code and aggregate stats."""
    summary = await referral_service.get_referrer_summary(current_user.id)
    return ReferralSummaryResponse(**summary)


@router.post("/v1/referrals/redeem", response_model=RedeemResponse)
async def redeem_referral(
    req: RedeemRequest,
    current_user: UserSession = Depends(validate_jwt),
):
    """
    Called once by the frontend right after signup, with the `ref` code
    captured from the landing-page URL. Idempotent.
    """
    code = (req.code or "").strip().upper()
    if not code:
        return RedeemResponse(accepted=False, reason="empty_code")

    referral = await referral_service.record_referral(
        code=code, referee_user_id=current_user.id
    )
    if not referral:
        return RedeemResponse(accepted=False, reason="invalid_code")
    if referral.get("status") == "rejected":
        return RedeemResponse(
            accepted=False,
            reason=referral.get("rejected_reason") or "rejected",
        )
    return RedeemResponse(accepted=True)
