"""
One-off: verify + remediate the false "card failing" flag for jamesriyo9918.

Background
----------
User 0e8d3e96-3c2a-49fe-a515-0877e5905fd3 (jamesriyo9918@gmail.com) signed up
with a valid Mastercard (PM pm_1TjtbVE5pNFif9nQNZLJZqUH, ••0642 exp 10/2027).
The Checkout SetupIntent succeeded off_session. Yet
``user_subscriptions.payment_method_health`` was set to "failing" with
``payment_method_health_last_error = "pm_lookup_failed: get"`` ~1s after
subscription creation — the subscription.created webhook ran the health check
before the PaymentMethod attach settled, and the lookup raised
``AttributeError: get`` (stripe-python v15 StripeObject has no ``.get``). The
old code treated that internal error as a dead card and emailed the user.

The production fix is in app/services/payment_health.py. This script proves the
card is actually healthy by running the same $0 off_session SetupIntent confirm
the issuer would see for the renewal charge, and then (optionally) re-runs the
now-fixed ``validate_payment_method`` to overwrite the spurious "failing" row
with the correct verdict.

Usage
-----
    # 1) DRY RUN — no Stripe, no DB writes. Shows the current DB row only.
    python backend/scripts/fix_payment_health_false_failure.py

    # 2) VERIFY — hit Stripe with a $0 SetupIntent to confirm the card. No DB write.
    python backend/scripts/fix_payment_health_false_failure.py --yes

    # 3) REMEDIATE — verify, then re-run the fixed health check to correct the row.
    python backend/scripts/fix_payment_health_false_failure.py --yes --remediate

No charge is ever created (SetupIntent only). Run from the repo root with the
backend .env present (STRIPE_SECRET_KEY + SUPABASE_SERVICE_KEY).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

_BACKEND = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND / ".env")
# Make `app.*` importable regardless of the directory the script is run from.
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import stripe

USER_ID = "0e8d3e96-3c2a-49fe-a515-0877e5905fd3"
EMAIL = "jamesriyo9918@gmail.com"
EXPECTED_PM = "pm_1TjtbVE5pNFif9nQNZLJZqUH"


def resolve_default_pm(customer_id: str) -> str | None:
    """Same resolution logic as production, using attribute access (v15-safe)."""
    cust = stripe.Customer.retrieve(
        customer_id, expand=["invoice_settings.default_payment_method"]
    )
    inv = getattr(cust, "invoice_settings", None)
    pm = getattr(inv, "default_payment_method", None)
    if pm:
        return pm if isinstance(pm, str) else getattr(pm, "id", None)
    pms = stripe.PaymentMethod.list(customer=customer_id, type="card", limit=1).data
    if pms:
        return pms[0].id
    return None


def read_db_row():
    """Return the current user_subscriptions health columns (or None)."""
    from app.auth.supabase_auth import supabase

    res = (
        supabase.table("user_subscriptions")
        .select(
            "payment_method_health, payment_method_health_checked_at, "
            "payment_method_health_last_error"
        )
        .eq("user_id", USER_ID)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def get_customer_id() -> str | None:
    from app.auth.supabase_auth import supabase

    res = (
        supabase.table("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", USER_ID)
        .limit(1)
        .execute()
    )
    return res.data[0]["stripe_customer_id"] if res.data else None


def print_row(label: str, row: dict | None) -> None:
    print(f"\n{label}:")
    if not row:
        print("  (no user_subscriptions row found)")
        return
    for k, v in row.items():
        print(f"  {k} = {v}")


def verify_card(customer_id: str) -> str:
    """Run a $0 off_session SetupIntent confirm. Returns the resulting status."""
    pm_id = resolve_default_pm(customer_id)
    print(f"\nResolved default PaymentMethod: {pm_id}")
    if pm_id != EXPECTED_PM:
        print(f"  WARNING: expected {EXPECTED_PM}, got {pm_id}")
    if not pm_id:
        return "no_payment_method"

    pm = stripe.PaymentMethod.retrieve(pm_id)
    card = getattr(pm, "card", None)
    if card:
        brand = getattr(card, "brand", "?")
        last4 = getattr(card, "last4", "????")
        exp = f"{getattr(card, 'exp_month', 0):02d}/{getattr(card, 'exp_year', 0)}"
        print(f"  Card: {brand} ••{last4} exp {exp}")

    try:
        si = stripe.SetupIntent.create(
            customer=customer_id,
            payment_method=pm_id,
            usage="off_session",
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            metadata={
                "purpose": "false_failure_remediation_check",
                "nadir_user_id": USER_ID,
                "ran_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except stripe.error.CardError as e:
        print(f"  SetupIntent CardError: {e.user_message or e}")
        return "card_error"
    except stripe.error.StripeError as e:
        print(f"  SetupIntent StripeError: {e}")
        return "stripe_error"

    print(f"  SetupIntent {si.id} -> status={si.status}")
    return si.status


async def remediate() -> None:
    """Re-run the FIXED production health check, overwriting the bad verdict."""
    from app.services.payment_health import validate_payment_method

    print("\nRe-running validate_payment_method() (fixed production path)...")
    ok = await validate_payment_method(USER_ID)
    print(f"  validate_payment_method returned: {ok}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="actually hit Stripe ($0 SetupIntent)")
    parser.add_argument("--remediate", action="store_true", help="also rewrite the DB verdict via the fixed code path")
    args = parser.parse_args()

    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        print("ERROR: STRIPE_SECRET_KEY not set", file=sys.stderr)
        return 1
    stripe.api_key = key
    mode = "LIVE" if key.startswith("sk_live_") else "TEST"
    print(f"Stripe mode: {mode}   User: {EMAIL} ({USER_ID})")

    print_row("DB row BEFORE", read_db_row())

    if not args.yes:
        print("\nDRY RUN — pass --yes to run the $0 SetupIntent verification.")
        return 0

    customer_id = get_customer_id()
    if not customer_id:
        print("ERROR: no stripe_customers row for user", file=sys.stderr)
        return 1
    print(f"Customer: {customer_id}")

    status = verify_card(customer_id)
    healthy = status == "succeeded"
    print(f"\n==> Card verification: {'HEALTHY' if healthy else status.upper()}")

    if args.remediate:
        if not healthy:
            print("Card did not verify healthy — NOT auto-remediating. Inspect manually.")
            return 1
        asyncio.run(remediate())
        print_row("DB row AFTER", read_db_row())

    return 0


if __name__ == "__main__":
    sys.exit(main())
