"""
Support ticket API endpoints for the Nadir SaaS platform.

Provides CRUD for support tickets and ticket messages.
"""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.supabase_auth import supabase, validate_api_key, UserSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/support", tags=["support"])


# ── Request / Response schemas ──────────────────────────────────────────


class CreateTicketRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=5000)
    category: str = Field(default="other")
    priority: str = Field(default="medium")


class TicketMessageResponse(BaseModel):
    id: str
    ticket_id: str
    user_id: str
    message: str
    is_staff: bool
    created_at: str


class TicketResponse(BaseModel):
    id: str
    user_id: str
    subject: str
    description: str
    category: str
    status: str
    priority: str
    created_at: str
    updated_at: str


class TicketDetailResponse(TicketResponse):
    messages: List[TicketMessageResponse] = []


class CreateMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


# ── Endpoints ───────────────────────────────────────────────────────────


@router.post("/tickets", response_model=TicketResponse, status_code=201)
async def create_ticket(
    req: CreateTicketRequest,
    user: UserSession = Depends(validate_api_key),
):
    """Create a new support ticket."""
    if req.category not in ("billing", "technical", "feature_request", "other"):
        raise HTTPException(status_code=400, detail="Invalid category")
    if req.priority not in ("low", "medium", "high"):
        raise HTTPException(status_code=400, detail="Invalid priority")

    try:
        result = supabase.table("support_tickets").insert({
            "user_id": user.user_id,
            "subject": req.subject,
            "description": req.description,
            "category": req.category,
            "priority": req.priority,
        }).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create ticket")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create support ticket: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create ticket")


@router.get("/tickets", response_model=List[TicketResponse])
async def list_tickets(
    status_filter: Optional[str] = None,
    user: UserSession = Depends(validate_api_key),
):
    """List all tickets for the authenticated user."""
    try:
        query = (
            supabase.table("support_tickets")
            .select("*")
            .eq("user_id", user.user_id)
            .order("created_at", desc=True)
        )

        if status_filter and status_filter in ("open", "in_progress", "resolved", "closed"):
            query = query.eq("status", status_filter)

        result = query.execute()
        return result.data or []
    except Exception as e:
        logger.error("Failed to list support tickets: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list tickets")


@router.get("/tickets/{ticket_id}", response_model=TicketDetailResponse)
async def get_ticket(
    ticket_id: UUID,
    user: UserSession = Depends(validate_api_key),
):
    """Get a ticket with its messages."""
    try:
        # Fetch ticket
        ticket_result = (
            supabase.table("support_tickets")
            .select("*")
            .eq("id", str(ticket_id))
            .eq("user_id", user.user_id)
            .execute()
        )

        if not ticket_result.data:
            raise HTTPException(status_code=404, detail="Ticket not found")

        ticket = ticket_result.data[0]

        # Fetch messages
        messages_result = (
            supabase.table("ticket_messages")
            .select("*")
            .eq("ticket_id", str(ticket_id))
            .order("created_at", desc=False)
            .execute()
        )

        ticket["messages"] = messages_result.data or []
        return ticket
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get support ticket: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get ticket")


@router.post("/tickets/{ticket_id}/messages", response_model=TicketMessageResponse, status_code=201)
async def add_message(
    ticket_id: UUID,
    req: CreateMessageRequest,
    user: UserSession = Depends(validate_api_key),
):
    """Add a message to an existing ticket."""
    try:
        # Verify ticket belongs to user
        ticket_result = (
            supabase.table("support_tickets")
            .select("id")
            .eq("id", str(ticket_id))
            .eq("user_id", user.user_id)
            .execute()
        )

        if not ticket_result.data:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # Insert message
        result = (
            supabase.table("ticket_messages")
            .insert({
                "ticket_id": str(ticket_id),
                "user_id": user.user_id,
                "message": req.message,
                "is_staff": False,
            })
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to add message")

        # Touch updated_at on the ticket
        supabase.table("support_tickets").update({
            "updated_at": "now()",
        }).eq("id", str(ticket_id)).execute()

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to add ticket message: %s", e)
        raise HTTPException(status_code=500, detail="Failed to add message")
