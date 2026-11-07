import asyncio
import inspect
import threading
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from kira.agent import tools
from kira.db import current_client


@pytest.fixture
def session(monkeypatch):
    opened = []

    @contextmanager
    def scope(**kwargs):
        opened.append(kwargs)
        yield object()

    monkeypatch.setattr(tools, "session_scope", scope)
    return opened


def test_threaded_tool_preserves_signature_context_and_does_not_take_read_lock(
    monkeypatch, session
):
    main_thread = threading.get_ident()

    def status(s):
        return {"client": current_client.get(), "thread": threading.get_ident()}

    monkeypatch.setattr(tools, "_service", lambda module, name: status)
    token = current_client.set("demo")
    try:
        result = asyncio.run(tools.get_workflow_status())
    finally:
        current_client.reset(token)
    assert result["status"] == "ok"
    assert result["result"]["client"] == "demo"
    assert result["result"]["thread"] != main_thread
    assert session == [{"write": False, "wait": None}]
    assert list(inspect.signature(tools.save_upload_rule).parameters) == [
        "table",
        "choice",
        "tool_context",
    ]


def test_change_tool_rejects_unapproved_direct_execution(monkeypatch, session):
    called = []
    monkeypatch.setattr(tools, "_service", lambda *args: lambda *a, **kw: called.append(a))
    result = asyncio.run(
        tools.convert_files(SimpleNamespace(state={"user": "Taufiq"}, tool_confirmation=None))
    )
    assert result["status"] == "error"
    assert not called
    assert not session


def test_approved_write_waits_two_seconds_and_identifies_actor(monkeypatch, session):
    calls = []
    monkeypatch.setattr(
        tools, "_service", lambda *args: lambda s, actor: calls.append(actor) or {"converted": True}
    )
    ctx = SimpleNamespace(
        state={"user": "Taufiq"}, tool_confirmation=SimpleNamespace(confirmed=True)
    )
    assert asyncio.run(tools.convert_files(ctx))["status"] == "ok"
    assert calls == ["Kira (approved by Taufiq)"]
    assert session == [{"write": True, "wait": 2}]


def test_followup_save_refuses_unbounded_selection(session):
    ctx = SimpleNamespace(
        state={"user": "Taufiq"}, tool_confirmation=SimpleNamespace(confirmed=True)
    )
    assert asyncio.run(tools.save_follow_ups("Check payout", ctx))["status"] == "error"
    assert (
        asyncio.run(tools.save_follow_ups("Check payout", ctx, outlet="Harbor Square"))["status"]
        == "error"
    )


def test_cleaning_requires_every_open_recommendation(monkeypatch, session):
    calls = []

    def service(module, name):
        if name == "recommendations":
            return lambda s: [
                {"id": "branch", "decision": None},
                {"id": "bank.exclude", "decision": None},
            ]
        return lambda *args: calls.append(args)

    monkeypatch.setattr(tools, "_service", service)
    ctx = SimpleNamespace(
        state={"user": "Taufiq"}, tool_confirmation=SimpleNamespace(confirmed=True)
    )
    result = asyncio.run(tools.save_cleaning(["branch"], [], ctx))
    assert result["status"] == "error"
    assert not calls


def test_followup_save_preserves_full_note_assignee_and_audit(monkeypatch, session):
    calls = []

    def service(module, name):
        if name == "find_keys":
            return lambda s, keys: keys
        if name == "follow_ups":
            return lambda s, f, limit: {
                "total": 2,
                "records": [{"rid": "pos:one"}, {"rid": "pos:two"}],
            }
        if name == "set_follow_up":
            return lambda s, rid, status, note, assignee, actor: (
                calls.append((rid, status, note, assignee, actor)) or {"note": note}
            )
        raise AssertionError(name)

    monkeypatch.setattr(tools, "_service", service)
    ctx = SimpleNamespace(
        state={"user": "Taufiq"}, tool_confirmation=SimpleNamespace(confirmed=True)
    )
    note = "142 settlements, Rp 9.031.421, are not in the bank. Ask the provider for payout status."
    result = asyncio.run(tools.save_follow_ups(note, ctx, keys=["one", "two"], assignee="Andrew"))
    assert result["result"]["saved"] == 2
    assert all(call[2:] == (note, "Andrew", "Kira (approved by Taufiq)") for call in calls)


def test_followup_over_limit_saves_nothing(monkeypatch, session):
    calls = []

    def service(module, name):
        if name == "follow_ups":
            return lambda s, f, limit: {"total": 1001, "records": [{"rid": "pos:one"}]}
        return lambda *args: calls.append(args)

    monkeypatch.setattr(tools, "_service", service)
    ctx = SimpleNamespace(
        state={"user": "Taufiq"}, tool_confirmation=SimpleNamespace(confirmed=True)
    )
    result = asyncio.run(
        tools.save_follow_ups(
            "Check payout", ctx, outlet="Harbor Square", day="2026-10-24", reason="Not in bank yet"
        )
    )
    assert result["status"] == "error"
    assert not calls
