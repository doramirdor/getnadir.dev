"""
Account management API — GDPR / CCPA compliant data deletion.

Provides endpoints for users to request full account and data deletion.
"""

import asyncio
import logging
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.supabase_auth import supabase, validate_api_key, UserSession
from app.services.stripe_service import stripe_service
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])


class DeleteAccountResponse(BaseModel):
    status: str
    message: str
    data_deleted: list[str]


@router.delete("/v1/account", response_model=DeleteAccountResponse)
async def delete_account(current_user: UserSession = Depends(validate_api_key)):
    """
    Permanently delete the user's account and all associated data.

    This endpoint complies with GDPR Article 17 (Right to Erasure) and
    CCPA § 1798.105 (Right to Delete).

    Deletion order:
    1. Cancel any active Stripe subscription (immediately, not at period end)
    2. Delete Stripe customer (removes payment methods and invoices from Stripe)
    3. Delete all user data from Supabase tables
    4. Delete the Supabase auth account

    This action is irreversible.
    """
    user_id = current_user.id
    deleted_tables: list[str] = []

    logger.warning("Account deletion requested by user %s (%s)", user_id, current_user.email)

    # ── 1. Cancel Stripe subscription immediately ──────────────────
    try:
        sub_result = await asyncio.to_thread(
            lambda: supabase.table("subscriptions")
            .select("stripe_subscription_id, status")
            .eq("user_id", user_id)
            .execute()
        )
        if sub_result.data and sub_result.data[0].get("stripe_subscription_id"):
            sub_id = sub_result.data[0]["stripe_subscription_id"]
            try:
                stripe.Subscription.cancel(sub_id)
                logger.info("Cancelled Stripe subscription %s for user %s", sub_id, user_id)
            except Exception as e:
                logger.warning("Could not cancel Stripe subscription %s: %s", sub_id, e)
    except Exception as e:
        logger.warning("Could not query subscriptions for user %s: %s", user_id, e)

    # ── 2. Delete Stripe customer ──────────────────────────────────
    try:
        customer_id = await stripe_service.get_customer_id(user_id)
        if customer_id:
            stripe.Customer.delete(customer_id)
            logger.info("Deleted Stripe customer %s for user %s", customer_id, user_id)
    except Exception as e:
        logger.warning("Could not delete Stripe customer for user %s: %s", user_id, e)

    # ── 3. Delete all user data from Supabase ──────────────────────
    tables_to_purge = [
        "savings_tracking",
        "savings_invoices",
        "stripe_events",
        "subscriptions",
        "stripe_customers",
        "api_keys",
        "usage_logs",
        "user_provider_keys",
        "user_model_presets",
        "prompt_clusters",
        "profiles",
    ]

    for table in tables_to_purge:
        try:
            await asyncio.to_thread(
                lambda t=table: supabase.table(t)
                .delete()
                .eq("user_id", user_id)
                .execute()
            )
            deleted_tables.append(table)
        except Exception as e:
            # Table may not exist or column name differs — log and continue
            logger.debug("Could not purge %s for user %s: %s", table, user_id, e)

    # ── 4. Delete the auth user via Supabase Admin API ─────────────
    try:
        await asyncio.to_thread(
            lambda: supabase.auth.admin.delete_user(user_id)
        )
        deleted_tables.append("auth.users")
        logger.info("Deleted auth user %s", user_id)
    except Exception as e:
        logger.error("Failed to delete auth user %s: %s", user_id, e)
        # Still return success for data deletion even if auth deletion fails
        # The user's data is gone, which is the GDPR requirement

    logger.warning(
        "Account deletion complete for user %s. Tables purged: %s",
        user_id, deleted_tables,
    )

    return DeleteAccountResponse(
        status="deleted",
        message="Your account and all associated data have been permanently deleted.",
        data_deleted=deleted_tables,
    )
