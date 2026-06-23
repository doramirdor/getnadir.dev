"""
Regression tests for app/services/payment_health.py.

Guards the customer-facing bug where an internal/transient failure (a Stripe
lookup raising, the PaymentMethod attach racing the subscription.created
webhook, a non-card Stripe error) was recorded as a *dead card* and emailed
the user a "your card isn't going through" dunning notice moments after a
successful signup — with a perfectly good card on file.

The module is loaded in isolation with stubbed ``stripe`` / Supabase / email
dependencies, so these tests run without those packages installed and without
touching the heavy ``app.services`` package __init__.
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
import types

import pytest

PH_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "app", "services", "payment_health.py",
)


# --------------------------------------------------------------------------
# Stubs + isolated module loader
# --------------------------------------------------------------------------
class _StripeError(Exception):
    def __init__(self, msg="", user_message=None):
        super().__init__(msg)
        self.user_message = user_message


class _CardError(_StripeError):
    pass


class _FakeQuery:
    def __init__(self, table, state):
        self.table = table
        self.state = state
        self._update = None

    def select(self, *a, **k):
        return self

    def update(self, row):
        self._update = row
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self._update is not None:
            self.state["updates"].append((self.table, dict(self._update)))
            return types.SimpleNamespace(data=[self._update])
        if self.table == "stripe_customers":
            if self.state["customer_id"] is None:
                return types.SimpleNamespace(data=[])
            return types.SimpleNamespace(
                data=[{"stripe_customer_id": self.state["customer_id"], "email": self.state["email"]}]
            )
        if self.table == "user_subscriptions":
            return types.SimpleNamespace(data=[{"payment_method_health": self.state["current_health"]}])
        return types.SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, state):
        self.state = state

    def table(self, name):
        return _FakeQuery(name, self.state)


def _load_module(state, emails):
    stripe_mod = types.ModuleType("stripe")
    err = types.ModuleType("stripe.error")
    err.StripeError = _StripeError
    err.CardError = _CardError
    stripe_mod.error = err
    stripe_mod.Customer = types.SimpleNamespace(retrieve=lambda *a, **k: None)
    stripe_mod.PaymentMethod = types.SimpleNamespace(list=lambda *a, **k: types.SimpleNamespace(data=[]))
    stripe_mod.SetupIntent = types.SimpleNamespace(create=lambda *a, **k: None)
    sys.modules["stripe"] = stripe_mod

    for name in ("app", "app.auth", "app.services"):
        m = sys.modules.get(name) or types.ModuleType(name)
        m.__path__ = []
        sys.modules[name] = m
    auth = types.ModuleType("app.auth.supabase_auth")
    auth.supabase = _FakeSupabase(state)
    sys.modules["app.auth.supabase_auth"] = auth

    email_mod = types.ModuleType("app.services.email_service")

    class EmailServiceError(Exception):
        pass

    async def send_email(*, to, subject, html, text=None, from_address=None):
        emails.append({"to": to, "subject": subject})
        return "msg_fake"

    email_mod.EmailServiceError = EmailServiceError
    email_mod.send_email = send_email
    sys.modules["app.services.email_service"] = email_mod

    spec = importlib.util.spec_from_file_location("payment_health_under_test", PH_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, stripe_mod


@pytest.fixture()
def ph():
    state = {"customer_id": "cus_x", "email": "user@example.com", "current_health": "unchecked", "updates": []}
    emails: list[dict] = []
    mod, stripe_mod = _load_module(state, emails)

    def last_health():
        for _table, row in reversed(state["updates"]):
            if "payment_method_health" in row:
                return row["payment_method_health"]
        return None

    def call(user_id="u"):
        return asyncio.new_event_loop().run_until_complete(mod.validate_payment_method(user_id))

    return types.SimpleNamespace(
        mod=mod, stripe=stripe_mod, state=state, emails=emails,
        last_health=last_health, call=call,
    )


def _raise(exc):
    def _f(*a, **k):
        raise exc
    return _f


# --------------------------------------------------------------------------
# The reported bug + its siblings: internal/transient → unknown, never email
# --------------------------------------------------------------------------
def test_internal_lookup_error_marks_unknown_and_does_not_email(ph):
    # Exactly the production incident: AttributeError("get") -> "pm_lookup_failed: get".
    ph.mod._resolve_default_payment_method_resilient = _raise(AttributeError("get"))
    assert ph.call() is False
    assert ph.last_health() == "unknown"
    assert ph.emails == []


def test_no_payment_method_resolved_marks_unknown_and_does_not_email(ph):
    ph.mod._resolve_default_payment_method_resilient = lambda cid: None
    ph.call()
    assert ph.last_health() == "unknown"
    assert ph.emails == []


def test_non_card_stripe_error_marks_unknown_and_does_not_email(ph):
    ph.mod._resolve_default_payment_method_resilient = lambda cid: "pm_x"
    ph.stripe.SetupIntent.create = _raise(_StripeError("api connection error"))
    ph.call()
    assert ph.last_health() == "unknown"
    assert ph.emails == []


def test_missing_customer_record_marks_unknown_not_failing(ph):
    ph.state["customer_id"] = None
    ph.call()
    assert ph.last_health() == "unknown"
    assert ph.emails == []


# --------------------------------------------------------------------------
# Genuine card problems still mark failing + email
# --------------------------------------------------------------------------
def test_card_error_marks_failing_and_emails(ph):
    ph.mod._resolve_default_payment_method_resilient = lambda cid: "pm_bad"
    ph.stripe.SetupIntent.create = _raise(_CardError("declined", user_message="Your card was declined."))
    assert ph.call() is False
    assert ph.last_health() == "failing"
    assert len(ph.emails) == 1


def test_requires_action_marks_failing_and_emails(ph):
    ph.mod._resolve_default_payment_method_resilient = lambda cid: "pm_x"
    ph.stripe.SetupIntent.create = lambda *a, **k: types.SimpleNamespace(id="seti", status="requires_action")
    ph.call()
    assert ph.last_health() == "failing"
    assert len(ph.emails) == 1


def test_succeeded_marks_healthy_no_email(ph):
    ph.mod._resolve_default_payment_method_resilient = lambda cid: "pm_good"
    ph.stripe.SetupIntent.create = lambda *a, **k: types.SimpleNamespace(id="seti", status="succeeded")
    assert ph.call() is True
    assert ph.last_health() == "healthy"
    assert ph.emails == []


# --------------------------------------------------------------------------
# A transient blip must never clear an existing definitive verdict
# --------------------------------------------------------------------------
def test_transient_does_not_overwrite_existing_failing_verdict(ph):
    ph.state["current_health"] = "failing"
    ph.mod._resolve_default_payment_method_resilient = _raise(AttributeError("get"))
    ph.call()
    # No health write at all → the legitimate red banner survives.
    assert ph.last_health() is None
    assert ph.emails == []
