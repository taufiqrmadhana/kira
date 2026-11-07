import asyncio
import json
from contextlib import contextmanager

import httpx
import pytest
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.adk.tools import FunctionTool

from kira.agent import chat, guard, tools
from kira.config import Settings, settings
from kira.services import ai, followup
from kira.services.state import WorkflowError


@pytest.fixture(autouse=True)
def isolated_provider(monkeypatch):
    monkeypatch.setattr(settings, "model", "openai/gpt-6.1-terra")
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key", raising=False)
    monkeypatch.setattr(settings, "deepseek_api_key", "test-deepseek-key")
    monkeypatch.setattr(settings, "ai", True)
    monkeypatch.setenv("LITELLM_LOCAL_MODEL_COST_MAP", "True")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")


def response(items):
    return {
        "id": "resp_mock",
        "object": "response",
        "created_at": 1,
        "model": "gpt-6.1-terra",
        "status": "completed",
        "error": None,
        "incomplete_details": None,
        "output": items,
        "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
    }


def text_item(text):
    return {
        "type": "message",
        "id": "msg_mock",
        "role": "assistant",
        "status": "completed",
        "content": [{"type": "output_text", "text": text, "annotations": []}],
    }


@pytest.fixture
def transport(monkeypatch):
    calls, replies = [], []

    def send(_client, request, **_kwargs):
        assert request.url.host == "api.openai.com"
        assert request.url.path == "/v1/responses"
        body = json.loads(request.content)
        assert body["model"] == "gpt-6.1-terra"
        assert body["store"] is False
        assert body["reasoning"] == {"effort": "none"}
        assert "temperature" not in body
        calls.append(body)
        assert replies, "Unexpected additional model request"
        return httpx.Response(200, json=response(replies.pop(0)), request=request)

    async def async_send(client, request, **kwargs):
        return send(client, request, **kwargs)

    monkeypatch.setattr(httpx.Client, "send", send)
    monkeypatch.setattr(httpx.AsyncClient, "send", async_send)
    return calls, replies


def test_default_model_and_credentials_are_explicit_without_key_in_repr(monkeypatch):
    monkeypatch.delenv("KIRA_MODEL", raising=False)
    configured = Settings()
    assert configured.model == "openai/gpt-6.1-terra"
    assert configured.openai_api_key == "test-openai-key"
    assert "test-openai-key" not in repr(configured)
    assert "test-deepseek-key" not in repr(configured)


def test_selected_provider_key_is_required_and_wrong_provider_key_cannot_enable_it(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert not ai.enabled()
    with pytest.raises(WorkflowError, match="OPENAI_API_KEY"):
        chat._check_model()
    monkeypatch.setattr(settings, "openai_api_key", "test-openai-key")
    assert ai.enabled()
    chat._check_model()
    monkeypatch.setattr(settings, "model", "deepseek/deepseek-chat")
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    assert not ai.enabled()
    with pytest.raises(WorkflowError, match="DEEPSEEK_API_KEY"):
        chat._check_model()


def test_settings_only_openai_key_is_scrubbed_in_nested_tool_and_approval_values(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert guard.scrub_value({"result": ["test-openai-key"]}) == {"result": ["[hidden]"]}
    assert guard.check_message("show OPENAI_API_KEY")


def test_suggestions_use_actual_responses_endpoint_and_return_validated_json(transport):
    calls, replies = transport
    replies.append([text_item('{"branch":{"header":"store","why":"Outlet name"}}')])
    assert ai.map_columns("pos", ["branch"], {"store": "Central"}) == {
        "branch": {"header": "store", "why": "Outlet name"}
    }
    assert len(calls) == 1
    assert calls[0]["text"]["format"]["type"] == "json_object"
    assert calls[0]["max_output_tokens"] == 1500
    assert "DATA" in json.dumps(calls[0]["input"])


def test_optional_suggestions_never_call_transport_without_key_or_when_disabled(
    monkeypatch, transport
):
    calls, _ = transport
    monkeypatch.setattr(settings, "ai", False)
    assert ai.ask_json("Task", {}) is None
    monkeypatch.setattr(settings, "ai", True)
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert ai.ask_json("Task", {}) is None
    assert calls == []


def test_deepseek_completion_keeps_its_original_provider_and_key(monkeypatch):
    from types import SimpleNamespace

    import litellm

    monkeypatch.setattr(settings, "model", "deepseek/deepseek-chat")
    calls = []

    def completion(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok":true}'))]
        )

    monkeypatch.setattr(litellm, "completion", completion)
    assert ai.ask_json("Task", {}) == {"ok": True}
    assert calls[0]["model"] == "deepseek/deepseek-chat"
    assert calls[0]["api_key"] == "test-deepseek-key"
    assert calls[0]["temperature"] == 0
    assert "reasoning_effort" not in calls[0]


def test_followup_rewrites_use_selected_provider_and_bad_json_keeps_rule_draft(transport):
    calls, replies = transport
    groups = [{"group": "g0", "note": "Rule draft", "status": "open", "by": "rule"}]
    evidence = {"g0": {"amount": 100}}
    replies.append(
        [text_item('{"notes":{"g0":{"note":"Check payout 100.","status":"investigating"}}}')]
    )
    followup._rewrite(groups, evidence, "en")
    assert groups[0]["note"] == "Check payout 100."
    assert groups[0]["by"] == "ai"
    assert len(calls) == 1
    groups[0].update(note="Rule draft", by="rule")
    replies.append([text_item("not JSON")])
    followup._rewrite(groups, evidence, "en")
    assert groups[0]["note"] == "Rule draft"
    assert groups[0]["by"] == "rule"


@pytest.mark.parametrize("approved", [True, False])
def test_responses_tool_call_keeps_adk_confirmation_durable_and_runs_only_after_approval(
    transport, tmp_path, monkeypatch, approved
):
    from kira.llm import agent_model

    calls, replies = transport
    replies.append(
        [
            {
                "type": "function_call",
                "id": "fc_convert",
                "call_id": "call_convert",
                "name": "convert_files",
                "arguments": "{}",
                "status": "completed",
            }
        ]
    )
    replies.append([text_item("Converted." if approved else "Nothing changed.")])
    writes = []

    @contextmanager
    def scope(**_kwargs):
        yield object()

    monkeypatch.setattr(tools, "session_scope", scope)
    monkeypatch.setattr(
        tools,
        "_service",
        lambda *_: lambda _session, actor: writes.append(actor) or {"converted": 3},
    )
    url = f"sqlite+aiosqlite:///{tmp_path / 'openai-chat.db'}"
    sessions = DatabaseSessionService(db_url=url)
    monkeypatch.setattr(chat, "_sessions", lambda: sessions)
    agent = Agent(
        name="kira",
        model=agent_model(),
        tools=[FunctionTool(tools.convert_files, require_confirmation=True)],
    )
    monkeypatch.setattr(
        chat,
        "_runner",
        lambda: Runner(app_name="kira", agent=agent, session_service=chat._sessions()),
    )

    async def exercise():
        first = await chat.send("responses-approval", "Andrew", "Convert the uploaded files")
        assert not writes
        assert len(first["pending"]) == 1
        confirmation = first["pending"][0]["id"]
        # Restore from persisted ADK events, not a provider-global response ID.
        monkeypatch.setattr(chat, "_sessions", lambda: DatabaseSessionService(db_url=url))
        assert (await chat.history("responses-approval", "Andrew"))[-1]["tools"][0]["result"][
            "confirmation_id"
        ] == confirmation
        assert await chat.history("responses-approval", "Someone else") == []
        final = await chat.confirm("responses-approval", "Andrew", {confirmation: approved})
        assert final["reply"] == ("Converted." if approved else "Nothing changed.")
        assert len(writes) == int(approved)
        with pytest.raises(WorkflowError):
            await chat.confirm("responses-approval", "Andrew", {confirmation: approved})

    asyncio.run(exercise())
    assert len(calls) == 2
    assert any(
        tool["type"] == "function" and tool["name"] == "convert_files" for tool in calls[0]["tools"]
    )
    assert all(tool["strict"] is False for tool in calls[0]["tools"] if tool["type"] == "function")
    assert any(
        item["type"] == "function_call_output" and item["call_id"] == "call_convert"
        for item in calls[1]["input"]
    )
    assert all("previous_response_id" not in call for call in calls)
