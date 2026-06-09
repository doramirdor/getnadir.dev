"""
One-off card validity check for May 2026 signups.

Runs a $0 SetupIntent (off_session, confirm=true) against each customer's
default payment method. No charge is created. Results are printed and
written to a CSV for manual review. Never auto-blocks.

Usage:
    python backend/scripts/verify_may_cards.py            # dry run (no API calls)
    python backend/scripts/verify_may_cards.py --yes      # actually hit Stripe

Cohort is hardcoded from the Supabase query run on 2026-05-27. Re-scope
by hand if re-running later.
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
    # New signups 2026-06-05 → 2026-06-07 (scoped by hand from Stripe customer list).
    "jun7": [
        ("jtuplg@indogmail.com", "cus_UeHYECCDONyotZ"),            # Ishita Joshi, Jun 5
        ("very-roamer-seldom@duck.com", "cus_UerXMW7ipeQn2U"),     # jame, Jun 6
        ("hollymadden8429@outlook.com", "cus_Uf4NI3MIK9oi2p"),     # Praju Timur, Jun 7
        ("butterfly.sylvia876+badvq@outlook.com", "cus_UetZnCfVYr9kpF"),  # JOSHUA MILLS, Jun 7
        ("ambervaughn5471@outlook.com", "cus_Uf4qSBMTlYpBtt"),     # SAMA, Jun 7
        ("ditian923@gmail.com", "cus_Uf4uqXtl7Ij2mr"),            # fdsa, Jun 7
    ],
    "jun": [
        ("mib200@gmail.com", "cus_Udp8lcsxHjZkvp"),
        ("sam@fastino.ai", "cus_Udxu3fgmZut1Qx"),
        ("xboss182@gmail.com", "cus_Ue6WgA5nVLExsf"),
    ],
    "may": [
        ("jamesriyo9940@gmail.com", "cus_UT6pI7xyrz90di"),
        ("kbxy2365806687@gmail.com", "cus_UZfliHnYBiG3wJ"),
        ("2365806687@qq.com", "cus_UZfzDMKiu3o1sT"),
        ("alptekin.egeksl@gmail.com", "cus_UZqBdFtkaSJHle"),
        ("hd6c6a2@push.tg", "cus_UaQ46gDts1DCaw"),
    ],
    "pre_may": [
        ("felipe.truman@outlook.com", "cus_UKkUETgurq0MTH"),
        ("jerickogarcia0@gmail.com", "cus_UPgCWPbv39vY2B"),
        ("sqaroo@indogmail.com", "cus_UPgMVnShm1UUnP"),
        ("zahra.sh2058@gmail.com", "cus_UPgZMv0XgfWBrc"),
        ("h4k3rit@gmail.com", "cus_UPgYKGdSLmtUpP"),
        ("zouabilouay4@gmail.com", "cus_UPgbF9GE4tqJNm"),
        ("sufian012al@gmail.com", "cus_UPhY17TsDGL5kX"),
    ],
}


def resolve_default_pm(customer_id: str) -> str | None:
    cust = stripe.Customer.retrieve(customer_id, expand=["invoice_settings.default_payment_method"])
    pm = (cust.get("invoice_settings") or {}).get("default_payment_method")
    if isinstance(pm, dict):
        return pm["id"]
    if isinstance(pm, str):
        return pm
    pms = stripe.PaymentMethod.list(customer=customer_id, type="card", limit=1).data
    if pms:
        return pms[0].id
    # Fall back to the subscription's default PM (e.g. Stripe Link, which is not
    # returned by PaymentMethod.list(type="card") and is not on invoice_settings).
    for sub in stripe.Subscription.list(customer=customer_id, status="all", limit=10).data:
        spm = sub.get("default_payment_method")
        if isinstance(spm, str):
            return spm
        if isinstance(spm, dict):
            return spm["id"]
    return None


def verify_one(email: str, customer_id: str, live: bool) -> dict:
    row = {
        "email": email,
        "customer_id": customer_id,
        "payment_method_id": None,
        "card_brand": None,
        "card_last4": None,
        "card_exp": None,
        "setup_intent_id": None,
        "status": None,
        "error_code": None,
        "decline_code": None,
        "error_message": None,
    }
    try:
        pm_id = resolve_default_pm(customer_id)
        if not pm_id:
            row["status"] = "no_payment_method"
            return row
        row["payment_method_id"] = pm_id
        pm = stripe.PaymentMethod.retrieve(pm_id)
        pm_type = pm.get("type")
        row["card_brand"] = pm_type  # store PM type here (e.g. "card", "link")
        card = pm.get("card") or {}
        row["card_last4"] = card.get("last4")
        if card.get("exp_month") and card.get("exp_year"):
            row["card_exp"] = f"{card['exp_month']:02d}/{card['exp_year']}"
        if not live:
            row["status"] = "dry_run"
            return row
        # Allow whatever type the PM actually is (Link-backed subs use type="link").
        pm_types = ["card"] if pm_type == "card" else ["card", pm_type]
        params = dict(
            customer=customer_id,
            payment_method=pm_id,
            confirm=True,
            usage="off_session",
            payment_method_types=pm_types,
            metadata={"purpose": "jun2026_card_validity_check", "ran_at": datetime.now(timezone.utc).isoformat()},
        )
        # Non-card PMs (Link, etc.) require a mandate for off-session confirmation.
        if pm_type != "card":
            params["mandate_data"] = {"customer_acceptance": {"type": "offline"}}
        si = stripe.SetupIntent.create(**params)
        row["setup_intent_id"] = si.id
        row["status"] = si.status
        err = si.get("last_setup_error") or {}
        row["error_code"] = err.get("code")
        row["decline_code"] = err.get("decline_code")
        row["error_message"] = err.get("message")
    except stripe.error.CardError as e:
        row["status"] = "card_error"
        row["error_code"] = e.code
        row["decline_code"] = getattr(e, "decline_code", None)
        row["error_message"] = e.user_message or str(e)
    except stripe.error.StripeError as e:
        row["status"] = "stripe_error"
        row["error_message"] = str(e)
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="actually call Stripe (default: dry run)")
    parser.add_argument("--cohort", choices=list(COHORTS), default="may")
    args = parser.parse_args()
    cohort = COHORTS[args.cohort]

    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        print("ERROR: STRIPE_SECRET_KEY not set", file=sys.stderr)
        return 1
    stripe.api_key = key
    mode = "LIVE" if key.startswith("sk_live_") else "TEST"
    live = args.yes
    print(f"Stripe mode: {mode}    Action: {'EXECUTE' if live else 'DRY RUN'}    Cohort: {args.cohort} ({len(cohort)})")
    if live and mode == "LIVE":
        print("Hitting LIVE Stripe with SetupIntents. No charges will be made.\n")

    rows = [verify_one(email, cid, live) for email, cid in cohort]

    cols = ["email", "customer_id", "payment_method_id", "card_brand", "card_last4", "card_exp", "status", "error_code", "decline_code", "error_message", "setup_intent_id"]
    widths = {c: max(len(c), *(len(str(r.get(c) or "")) for r in rows)) for c in cols}
    print(" | ".join(c.ljust(widths[c]) for c in cols))
    print("-+-".join("-" * widths[c] for c in cols))
    for r in rows:
        print(" | ".join(str(r.get(c) or "").ljust(widths[c]) for c in cols))

    out = Path(__file__).resolve().parent / f"card_check_{args.cohort}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {out}")

    failed = [r for r in rows if r["status"] not in {"succeeded", "dry_run", "no_payment_method"}]
    if failed:
        print(f"\n{len(failed)} card(s) flagged for review. Decide manually whether to block.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
