"""Tutorial state survives pending approval and can be cleared only by fresh UI context."""

import asyncio
from contextlib import contextmanager

import pytest
from google.adk.agents import Agent
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.adk.tools import FunctionTool
from google.genai import types
from test_agent_chat import ScriptedModel, reply
from test_agent_chat import runtime as runtime

from kira.agent import chat, tools
from kira.services.state import WorkflowError


def test_tutorial_confirmation_cannot_write_until_tour_is_stopped(runtime, monkeypatch):
    url, _ = runtime
    writes = []

    @contextmanager
    def session(**kwargs):
        yield object()

    monkeypatch.setattr(tools, "session_scope", session)
    monkeypatch.setattr(
        tools, "_service", lambda *args: lambda s, actor: writes.append(actor) or {"converted": 3}
    )
    model = ScriptedModel(
        model="test",
        responses=[
            LlmResponse(
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(
                            function_call=types.FunctionCall(
                                name="convert_files", args={}, id="tour-convert"
                            )
                        )
                    ],
                )
            ),
            reply("Converted 3 files."),
        ],
    )
    agent = Agent(
        name="kira",
        model=model,
        tools=[FunctionTool(tools.convert_files, require_confirmation=True)],
    )
    monkeypatch.setattr(
        chat,
        "_runner",
        lambda: Runner(app_name="kira", agent=agent, session_service=chat._sessions()),
    )

    async def exercise():
        result = await chat.send(
            "tour-approval",
            "Taufiq",
            "Explain this conversion",
            {"tutorial": "Convert, step 1: Convert the files"},
        )
        answer = {result["pending"][0]["id"]: True}
        assert not writes
        monkeypatch.setattr(chat, "_sessions", lambda: DatabaseSessionService(db_url=url))
        with pytest.raises(WorkflowError, match="tutorial"):
            await chat.confirm("tour-approval", "Taufiq", answer)
        assert not writes
        assert (await chat.history("tour-approval", "Taufiq"))[-1]["tools"][0]["result"][
            "status"
        ] == "pending"
        done = await chat.confirm("tour-approval", "Taufiq", answer, {"tutorial": None})
        assert done["reply"] == "Converted 3 files."
        assert writes == ["Kira (approved by Taufiq)"]

    asyncio.run(exercise())


def test_ordinary_chat_clears_tutorial_state_and_preserves_structured_context(runtime, monkeypatch):
    model = ScriptedModel(
        model="test", responses=[reply("This explains cleaning."), reply("Ready for the close.")]
    )
    agent = Agent(name="kira", model=model)
    monkeypatch.setattr(
        chat,
        "_runner",
        lambda: Runner(app_name="kira", agent=agent, session_service=chat._sessions()),
    )

    async def exercise():
        context = {
            "page": "Match analysis",
            "selected_keys": ["P1", "P2"],
            "tutorial": "Clean, step 2",
            "guided_step": 7,
        }
        await chat.send("tour-read", "Taufiq", "Explain", context)
        session = await chat._session("tour-read", "Taufiq")
        assert session.state["tutorial_active"] is True
        message = next(
            event.content.parts[0].text for event in session.events if event.author == "user"
        )
        assert '"selected_keys": ["P1", "P2"]' in message
        await chat.send(
            "tour-read", "Taufiq", "Do today's close", {"page": "Overview", "tutorial": None}
        )
        assert (await chat._session("tour-read", "Taufiq")).state["tutorial_active"] is False
        assert len(await chat.history("tour-read", "Taufiq")) == 4

    asyncio.run(exercise())


def test_real_tour_tool_persists_guard_and_returns_only_navigation(runtime, monkeypatch):
    model = ScriptedModel(
        model="test",
        responses=[
            LlmResponse(
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(
                            function_call=types.FunctionCall(
                                name="start_tour", args={"tour": "upload"}, id="tour-1"
                            )
                        )
                    ],
                )
            ),
            reply("The upload tutorial is open."),
        ],
    )
    agent = Agent(name="kira", model=model, tools=[tools.start_tour])
    monkeypatch.setattr(
        chat,
        "_runner",
        lambda: Runner(app_name="kira", agent=agent, session_service=chat._sessions()),
    )
    monkeypatch.setattr(
        tools, "session_scope", lambda **kwargs: pytest.fail("A tour must not open a data session")
    )

    async def exercise():
        result = await chat.send("tour-directive", "Taufiq", "How do I upload?")
        assert result["pending"] == []
        assert result["tool_calls"][0]["result"] == {"status": "ok", "result": {"tour": "upload"}}
        assert (await chat._session("tour-directive", "Taufiq")).state["tutorial_active"] is True
        assert (await chat._session("tour-directive", "Andrew")).state.get(
            "tutorial_active"
        ) is None

    asyncio.run(exercise())
