"""
Charge+refund validation. For each customer in the cohort:
  1. Create a $1 PaymentIntent off_session against the default PM.
  2. If status='succeeded', refund it in full immediately.
  3. Record outcome.

Purpose: empirically confirm whether real $1 charges correctly identify
cards Stripe has already flagged as failing (past_due subs).

Usage:
    python backend/scripts/validate_charge_refund.py            # dry run
    python backend/scripts/validate_charge_refund.py --yes      # execute on LIVE Stripe

WARNING: when --yes is passed on a LIVE key, this creates real PaymentIntents.
Successful ones DO post a pending charge to the customer's statement before
being refunded. Refund clearance: typically 5-10 business days back to the
cardholder. For declined cards (the past_due cohort target), no charge posts.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import stripe

COHORTS = {
    "past_due": [
        ("felipe.truman@outlook.com", "cus_UKkUETgurq0MTH"),
        ("jerickogarcia0@gmail.com", "cus_UPgCWPbv39vY2B"),
        ("sqaroo@indogmail.com", "cus_UPgMVnShm1UUnP"),
        ("zahra.sh2058@gmail.com", "cus_UPgZMv0XgfWBrc"),
        ("h4k3rit@gmail.com", "cus_UPgYKGdSLmtUpP"),
        ("zouabilouay4@gmail.com", "cus_UPgbF9GE4tqJNm"),
        ("sufian012al@gmail.com", "cus_UPhY17TsDGL5kX"),
    ],
    "may": [
        ("jamesriyo9940@gmail.com", "cus_UT6pI7xyrz90di"),
        ("kbxy2365806687@gmail.com", "cus_UZfliHnYBiG3wJ"),
        ("2365806687@qq.com", "cus_UZfzDMKiu3o1sT"),
        ("alptekin.egeksl@gmail.com", "cus_UZqBdFtkaSJHle"),
        ("hd6c6a2@push.tg", "cus_UaQ46gDts1DCaw"),
    ],
}

AMOUNT_CENTS = 100  # $1.00


def resolve_default_pm(customer_id: str) -> str | None:
    cust = stripe.Customer.retrieve(customer_id, expand=["invoice_settings.default_payment_method"])
    pm = (cust.get("invoice_settings") or {}).get("default_payment_method")
    if isinstance(pm, dict):
        return pm["id"]
    if isinstance(pm, str):
        return pm
    pms = stripe.PaymentMethod.list(customer=customer_id, type="card", limit=1).data
    return pms[0].id if pms else None


def charge_and_refund(email: str, customer_id: str, live: bool) -> dict:
    row = {
        "email": email,
        "customer_id": customer_id,
        "payment_method_id": None,
        "payment_intent_id": None,
        "pi_status": None,
        "charge_id": None,
        "decline_code": None,
        "error_code": None,
        "error_message": None,
        "refund_id": None,
        "refund_status": None,
        "verdict": None,
    }
    try:
        pm_id = resolve_default_pm(customer_id)
        if not pm_id:
            row["verdict"] = "no_payment_method"
            return row
        row["payment_method_id"] = pm_id
        if not live:
            row["verdict"] = "dry_run"
            return row
        try:
            pi = stripe.PaymentIntent.create(
                amount=AMOUNT_CENTS,
                currency="usd",
                customer=customer_id,
                payment_method=pm_id,
                confirm=True,
                off_session=True,
                payment_method_types=["card"],
                description="Card validity test (refunded immediately)",
                metadata={
                    "purpose": "card_validity_charge_refund_test",
                    "ran_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            row["payment_intent_id"] = pi.id
            row["pi_status"] = pi.status
            row["charge_id"] = pi.latest_charge
        except stripe.error.CardError as e:
            err_obj = ((e.json_body or {}).get("error") or {}) if hasattr(e, "json_body") else {}
            pi_data = err_obj.get("payment_intent") or {}
            row["payment_intent_id"] = pi_data.get("id")
            row["pi_status"] = pi_data.get("status") or "failed"
            row["error_code"] = e.code
            row["decline_code"] = getattr(e, "decline_code", None) or err_obj.get("decline_code")
            row["error_message"] = (e.user_message or str(e))[:120]
            row["verdict"] = "declined"
            return row
        if pi.status == "succeeded" and pi.latest_charge:
            refund = stripe.Refund.create(charge=pi.latest_charge, reason="requested_by_customer")
            row["refund_id"] = refund.id
            row["refund_status"] = refund.status
            row["verdict"] = "valid_refunded"
        else:
            row["verdict"] = f"unexpected_status:{pi.status}"
    except stripe.error.StripeError as e:
        row["verdict"] = "stripe_error"
        row["error_message"] = str(e)[:120]
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--cohort", choices=list(COHORTS), default="past_due")
    args = parser.parse_args()
    cohort = COHORTS[args.cohort]

    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        print("ERROR: STRIPE_SECRET_KEY not set", file=sys.stderr)
        return 1
    stripe.api_key = key
    mode = "LIVE" if key.startswith("sk_live_") else "TEST"
    live = args.yes
    print(f"Stripe mode: {mode}    Action: {'EXECUTE' if live else 'DRY RUN'}    Cohort: {args.cohort} ({len(cohort)})    Amount: ${AMOUNT_CENTS/100:.2f}")
    if live and mode == "LIVE":
        print("Hitting LIVE Stripe with $1 PaymentIntents. Successful ones will be refunded immediately.\n")

    rows = [charge_and_refund(email, cid, live) for email, cid in cohort]

    cols = ["email", "customer_id", "verdict", "pi_status", "decline_code", "error_code", "error_message", "refund_id", "refund_status", "payment_intent_id"]
    widths = {c: max(len(c), *(len(str(r.get(c) or "")) for r in rows)) for c in cols}
    print(" | ".join(c.ljust(widths[c]) for c in cols))
    print("-+-".join("-" * widths[c] for c in cols))
    for r in rows:
        print(" | ".join(str(r.get(c) or "").ljust(widths[c]) for c in cols))

    out = Path(__file__).resolve().parent / f"charge_refund_{args.cohort}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.csv"
    full_cols = list(rows[0].keys()) if rows else cols
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=full_cols)
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {out}")
    declined = sum(1 for r in rows if r["verdict"] == "declined")
    valid = sum(1 for r in rows if r["verdict"] == "valid_refunded")
    print(f"Result: {declined} declined, {valid} valid+refunded, {len(rows) - declined - valid} other")
    return 0


if __name__ == "__main__":
    sys.exit(main())
