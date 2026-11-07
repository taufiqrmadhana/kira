"""Guide directives are read-only; changes always require approval and no active tour."""

import asyncio
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from kira.agent import tools
from kira.db import current_client


def context(*, confirmed=True, tutorial=False):
    return SimpleNamespace(
        state={"user": "Taufiq", "tutorial_active": tutorial},
        tool_confirmation=SimpleNamespace(confirmed=confirmed),
    )


@pytest.fixture
def calls(monkeypatch):
    seen = []

    @contextmanager
    def session(**kwargs):
        seen.append(("session", kwargs))
        yield object()

    monkeypatch.setattr(tools, "session_scope", session)
    monkeypatch.setattr(
        tools,
        "_service",
        lambda module, name: (
            lambda *args, **kwargs: seen.append((module, name, args[1:], kwargs)) or {"done": True}
        ),
    )
    return seen


@pytest.mark.parametrize(
    "tour",
    [
        "welcome",
        "guided",
        "upload",
        "convert",
        "clean",
        "match",
        "results",
        "analysis",
        "insights",
        "kira",
        "landing",
        "guided-close",
        "tour",
        "full",
        "clients",
    ],
)
def test_start_tour_returns_only_a_directive_and_marks_the_session_read_only(calls, tour):
    ctx = context()
    result = asyncio.run(tools.start_tour(tour, ctx))
    assert result == {"status": "ok", "result": {"tour": tour}}
    assert ctx.state["tutorial_active"] is True
    assert calls == []


def test_guide_and_file_slot_directives_do_not_read_or_write_database(calls):
    assert asyncio.run(tools.start_guided_close()) == {"status": "ok", "result": {"guided": True}}
    for area in ("pos", "settlement", "bank"):
        assert asyncio.run(tools.request_files(area, "Choose today's files")) == {
            "status": "ok",
            "result": {"area": area, "note": "Choose today's files"},
        }
    assert len(asyncio.run(tools.request_files("pos", "x" * 600))["result"]["note"]) == 500
    assert asyncio.run(tools.request_files("other"))["status"] == "error"
    assert asyncio.run(tools.start_tour("../../other", context()))["status"] == "error"
    assert calls == []


CHANGE_ARGS = {
    "convert_files": {},
    "save_upload_rule": {"table": "pos", "choice": "create"},
    "save_cleaning": {"accept": [], "reject": []},
    "save_matching_rule": {"stage": "l1", "kind": "id", "params": {}},
    "run_matching": {"stage": "l1"},
    "save_follow_ups": {"note": "Check", "keys": ["P1"]},
    "export_results": {"scope": {}},
    "add_sample_files": {"day": 1},
}


@pytest.mark.parametrize("name", CHANGE_ARGS)
@pytest.mark.parametrize("guard", ["unapproved", "tutorial"])
def test_every_change_tool_is_guarded_even_when_called_directly(calls, name, guard):
    ctx = context(confirmed=guard != "unapproved", tutorial=guard == "tutorial")
    result = asyncio.run(getattr(tools, name)(tool_context=ctx, **CHANGE_ARGS[name]))
    assert result["status"] == "error"
    assert "approval" in result["message"] or "tutorial" in result["message"].lower()
    assert calls == []


def test_new_change_tools_call_existing_services_in_the_selected_workspace(calls):
    token = current_client.set("zestly-demo-latihan")
    try:
        assert asyncio.run(tools.add_sample_files(8, context()))["status"] == "ok"
        assert (
            asyncio.run(tools.export_results(context(), {"provider": "DANA", "pos_only": True}))[
                "status"
            ]
            == "ok"
        )
    finally:
        current_client.reset(token)
    assert calls == [
        ("session", {"write": True, "wait": 2}),
        ("files", "add_samples", ("Kira (approved by Taufiq)", 8), {}),
        ("session", {"write": True, "wait": 2}),
        (
            "agent_actions",
            "export_results",
            ({"provider": "DANA", "pos_only": True}, "Kira (approved by Taufiq)"),
            {},
        ),
    ]


@pytest.mark.parametrize("client_id", ["", "demo", "merchant", "zestly-demo-copy"])
def test_sample_tool_refuses_non_demo_clients_before_opening_session(calls, client_id):
    token = current_client.set(client_id)
    try:
        result = asyncio.run(tools.add_sample_files(1, context()))
    finally:
        current_client.reset(token)
    assert result["status"] == "error" and "demo" in result["message"].lower()
    assert calls == []


@pytest.mark.parametrize("day", [0, 9, True, 1.5, "1"])
def test_sample_tool_validates_the_bundled_day(calls, day):
    token = current_client.set("zestly-demo")
    try:
        result = asyncio.run(tools.add_sample_files(day, context()))
    finally:
        current_client.reset(token)
    assert result["status"] == "error"
    assert calls == []


def test_registered_changes_require_adk_confirmation():
    from google.adk.tools import FunctionTool

    from kira.agent.agent import TOOLS

    names = {
        tool.func.__name__
        for tool in TOOLS
        if isinstance(tool, FunctionTool) and tool._require_confirmation is True
    }
    assert names == set(CHANGE_ARGS)
    assert {"start_tour", "start_guided_close", "request_files"} <= {
        tool.__name__ for tool in tools.READ_TOOLS
    }
    for tool in TOOLS:
        wrapped = tool if isinstance(tool, FunctionTool) else FunctionTool(tool)
        declaration = wrapped._get_declaration()
        assert "tool_context" not in (
            declaration.parameters.properties if declaration.parameters else {}
        )
