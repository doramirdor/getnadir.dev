"""
Immediately cancel the 7 past_due Stripe subscriptions from the
2026-04-27 fraud-pattern cohort. Cards were empirically confirmed
declined (see charge_refund_past_due_*.csv).

Stripe-side: stripe.Subscription.cancel(sub_id) - immediate cancellation,
no proration invoice, no final charge attempt.

Supabase-side: defensive write to user_subscriptions.status = 'canceled'.
The customer.subscription.deleted webhook should land soon after and
write the same thing, but this avoids a UI lag window.

Usage:
    python backend/scripts/cancel_past_due.py            # dry run
    python backend/scripts/cancel_past_due.py --yes      # execute
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

TARGETS = {
    "past_due": [
        ("felipe.truman@outlook.com", "cus_UKkUETgurq0MTH", "sub_1TM530E5pNFif9nQjFfkZJvE"),
        ("jerickogarcia0@gmail.com", "cus_UPgCWPbv39vY2B", "sub_1TQquiE5pNFif9nQ9hTObZ7a"),
        ("sqaroo@indogmail.com", "cus_UPgMVnShm1UUnP", "sub_1TQr1bE5pNFif9nQqBtheBcH"),
        ("zahra.sh2058@gmail.com", "cus_UPgZMv0XgfWBrc", "sub_1TQrChE5pNFif9nQkoeto4FF"),
        ("h4k3rit@gmail.com", "cus_UPgYKGdSLmtUpP", "sub_1TQrCdE5pNFif9nQbZYVZZ8U"),
        ("zouabilouay4@gmail.com", "cus_UPgbF9GE4tqJNm", "sub_1TQrF6E5pNFif9nQq7t6VkuH"),
        ("sufian012al@gmail.com", "cus_UPhY17TsDGL5kX", "sub_1TQs9zE5pNFif9nQXhzvufh8"),
    ],
    "may_fraud": [
        ("jamesriyo9940@gmail.com", "cus_UT6pI7xyrz90di", "sub_1TUAgoE5pNFif9nQW3mKl5l5"),
        ("kbxy2365806687@gmail.com", "cus_UZfliHnYBiG3wJ", "sub_1TaWQAE5pNFif9nQLzmvawms"),
        ("2365806687@qq.com", "cus_UZfzDMKiu3o1sT", "sub_1TaWhOE5pNFif9nQKDZHAzIl"),
        ("hd6c6a2@push.tg", "cus_UaQ46gDts1DCaw", "sub_1TbFF7E5pNFif9nQsvFwS0UE"),
    ],
}


def cancel_one(email: str, cid: str, sid: str, live: bool, sb) -> dict:
    row = {
        "email": email,
        "customer_id": cid,
        "subscription_id": sid,
        "stripe_status": None,
        "supabase_updated": False,
        "error": None,
    }
    if not live:
        row["stripe_status"] = "dry_run"
        return row
    try:
        sub = stripe.Subscription.cancel(sid)
        row["stripe_status"] = sub.status
    except stripe.error.StripeError as e:
        row["error"] = f"stripe: {e}"[:160]
        return row
    try:
        res = (
            sb.table("user_subscriptions")
            .update({"status": "canceled", "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("stripe_subscription_id", sid)
            .execute()
        )
        row["supabase_updated"] = bool(res.data)
    except Exception as e:
        row["error"] = f"supabase: {e}"[:160]
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--cohort", choices=list(TARGETS), default="past_due")
    args = parser.parse_args()
    targets = TARGETS[args.cohort]

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
    print(f"Stripe mode: {mode}    Action: {'EXECUTE' if live else 'DRY RUN'}    Cohort: {args.cohort} ({len(targets)})\n")

    rows = [cancel_one(email, cid, sid, live, sb) for email, cid, sid in targets]

    cols = ["email", "subscription_id", "stripe_status", "supabase_updated", "error"]
    widths = {c: max(len(c), *(len(str(r.get(c) or "")) for r in rows)) for c in cols}
    print(" | ".join(c.ljust(widths[c]) for c in cols))
    print("-+-".join("-" * widths[c] for c in cols))
    for r in rows:
        print(" | ".join(str(r.get(c) or "").ljust(widths[c]) for c in cols))

    out = Path(__file__).resolve().parent / f"cancel_{args.cohort}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
