"""
Full block on the 11 confirmed-fraud accounts:

  1. Set api_keys.is_active = False        (kills API auth immediately)
  2. Supabase auth.admin ban_until = 2099  (kills dashboard login)
  3. stripe.Customer.delete                (removes from Stripe, permanent)

The first two are reversible. Stripe delete is NOT — historical
charges/refunds remain in Stripe for compliance, but the customer
object and any attached PMs are gone forever.

Subscriptions for these users are already canceled (see
cancel_past_due_*.csv and cancel_may_fraud_*.csv).

Usage:
    python backend/scripts/block_fraudsters.py            # dry run
    python backend/scripts/block_fraudsters.py --yes      # execute
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
from supabase import create_client

BAN_UNTIL = "2099-12-31T23:59:59Z"

TARGETS = [
    ("2365806687@qq.com", "b60a5632-a06d-49b5-9d11-49230f856c76", "cus_UZfzDMKiu3o1sT"),
    ("felipe.truman@outlook.com", "32e5574c-47b7-49d5-8862-e95f9d221f24", "cus_UKkUETgurq0MTH"),
    ("h4k3rit@gmail.com", "f94d8910-bc07-46a7-8d05-44890c8b8c3f", "cus_UPgYKGdSLmtUpP"),
    ("hd6c6a2@push.tg", "7170ed20-bf7f-4810-9b2c-94e49f9c0f2e", "cus_UaQ46gDts1DCaw"),
    ("jamesriyo9940@gmail.com", "03e28a66-6927-4ad8-9ef6-77420c2ab252", "cus_UT6pI7xyrz90di"),
    ("jerickogarcia0@gmail.com", "c575eaf3-a34b-4536-95ae-4f686177ebc7", "cus_UPgCWPbv39vY2B"),
    ("kbxy2365806687@gmail.com", "3a48fd65-5bdd-45e3-a992-db77baea1f5f", "cus_UZfliHnYBiG3wJ"),
    ("sqaroo@indogmail.com", "d6942249-1e01-4e94-ab97-3d726c3c5cef", "cus_UPgMVnShm1UUnP"),
    ("sufian012al@gmail.com", "2e2bbe46-1149-42d6-885c-3b14cb294293", "cus_UPhY17TsDGL5kX"),
    ("zahra.sh2058@gmail.com", "8f32985c-dab6-41e2-93ac-2dba5ea148a2", "cus_UPgZMv0XgfWBrc"),
    ("zouabilouay4@gmail.com", "116665cb-dcc9-4658-8311-5e7880e7f29e", "cus_UPgbF9GE4tqJNm"),
]


def block_one(email: str, user_id: str, customer_id: str, live: bool, sb) -> dict:
    row = {
        "email": email,
        "user_id": user_id,
        "customer_id": customer_id,
        "api_keys_deactivated": 0,
        "auth_banned": False,
        "stripe_deleted": False,
        "error": None,
    }
    if not live:
        row["error"] = "dry_run"
        return row

    # 1. Deactivate API keys
    try:
        res = (
            sb.table("api_keys")
            .update({"is_active": False})
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
        row["api_keys_deactivated"] = len(res.data or [])
    except Exception as e:
        row["error"] = f"api_keys: {e}"[:160]
        return row

    # 2. Ban via Supabase Auth admin
    try:
        sb.auth.admin.update_user_by_id(user_id, {"ban_duration": "876000h"})  # 100 years
        row["auth_banned"] = True
    except Exception as e:
        row["error"] = f"auth_ban: {e}"[:160]
        return row

    # 3. Delete Stripe customer (permanent)
    try:
        stripe.Customer.delete(customer_id)
        row["stripe_deleted"] = True
    except stripe.error.InvalidRequestError as e:
        if "No such customer" in str(e):
            row["stripe_deleted"] = True  # already gone, treat as success
        else:
            row["error"] = f"stripe: {e}"[:160]
    except stripe.error.StripeError as e:
        row["error"] = f"stripe: {e}"[:160]
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    sk = os.environ.get("STRIPE_SECRET_KEY")
    sb_url = os.environ.get("SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not (sk and sb_url and sb_key):
        print("ERROR: missing STRIPE_SECRET_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY", file=sys.stderr)
        return 1
    stripe.api_key = sk
    sb = create_client(sb_url, sb_key)
    mode = "LIVE" if sk.startswith("sk_live_") else "TEST"
    live = args.yes
    print(f"Stripe mode: {mode}    Action: {'EXECUTE' if live else 'DRY RUN'}    Targets: {len(TARGETS)}")
    if live:
        print("Steps per user: deactivate api_keys, ban Supabase auth user (100y), DELETE Stripe customer (PERMANENT).\n")

    rows = [block_one(email, uid, cid, live, sb) for email, uid, cid in TARGETS]

    cols = ["email", "api_keys_deactivated", "auth_banned", "stripe_deleted", "error"]
    def cell(v):
        return "" if v is None else str(v)
    widths = {c: max(len(c), *(len(cell(r.get(c))) for r in rows)) for c in cols}
    print(" | ".join(c.ljust(widths[c]) for c in cols))
    print("-+-".join("-" * widths[c] for c in cols))
    for r in rows:
        print(" | ".join(cell(r.get(c)).ljust(widths[c]) for c in cols))

    out = Path(__file__).resolve().parent / f"block_fraudsters_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {out}")
    errs = [r for r in rows if r["error"] and r["error"] != "dry_run"]
    if errs:
        print(f"\n{len(errs)} error(s). Re-run after fixing; the script is per-user idempotent on api_keys/auth/Stripe.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
