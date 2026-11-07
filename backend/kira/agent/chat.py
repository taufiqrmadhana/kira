"""Durable, client-isolated ADK conversations and explicit approval responses."""

import asyncio
import hashlib
import json
import re
from pathlib import Path
from uuid import uuid4
from weakref import WeakValueDictionary

from google.adk.agents.run_config import RunConfig
from google.adk.events import Event
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types
from sqlalchemy.engine import make_url

from kira.config import settings
from kira.db import current_client
from kira.llm import credentials_error
from kira.services.state import WorkflowError

from . import guard

APP = "kira"
CONFIRM = "adk_request_confirmation"
NUDGE = (
    "(Answer my last question in words now, using the tool results you just got. Keep it short.)"
)
SCREEN = re.compile(r"\n\[Screen: .*\]\s*$", re.S)
_services = {}
_locks = WeakValueDictionary()


def _sessions():
    database = make_url(settings.database_url)
    if database.drivername.startswith("sqlite") and database.database not in (None, "", ":memory:"):
        path = Path(database.database).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        url = f"sqlite+aiosqlite:///{path.with_name(path.stem + '_chat.db')}"
    else:
        url = "sqlite+aiosqlite:///:memory:"
    if url not in _services:
        _services[url] = DatabaseSessionService(db_url=url)
    return _services[url]


def _identity(session_id: str, user: str):
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,128}", session_id):
        raise WorkflowError(
            "Choose a valid chat session id (1–128 letters, numbers, dots, dashes or underscores)."
        )
    # A browser's UUID can be reused by another client/user without exposing its events or approvals.
    owner = hashlib.sha256(
        json.dumps([current_client.get(), user], ensure_ascii=False).encode()
    ).hexdigest()
    return owner, session_id


def _lock(session_id, user):
    owner, sid = _identity(session_id, user)
    key = (settings.database_url, owner, sid)
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


async def _session(session_id: str, user: str, create=True):
    owner, sid = _identity(session_id, user)
    service = _sessions()
    session = await service.get_session(app_name=APP, user_id=owner, session_id=sid)
    if session is None and create:
        session = await service.create_session(
            app_name=APP, user_id=owner, session_id=sid, state={"user": user}
        )
    return session


def _runner():
    from .agent import root_agent

    return Runner(app_name=APP, agent=root_agent, session_service=_sessions())


def _check_model():
    message = credentials_error()
    if message:
        raise WorkflowError(message)


def _parts(event):
    return event.content.parts or [] if event.content else []


def _pending(events):
    pending = {}
    for event in events:
        for part in _parts(event):
            call = part.function_call
            if call and call.name == CONFIRM and call.id:
                original = (call.args or {}).get("originalFunctionCall", {})
                if original.get("name"):
                    pending[call.id] = {
                        "id": call.id,
                        "tool": original["name"],
                        "args": original.get("args", {}),
                    }
            response = part.function_response
            if event.author == "user" and response and response.name == CONFIRM:
                pending.pop(response.id, None)
    return list(pending.values())


def _reply(texts: list[tuple[int, str]], last_tool: int) -> str:
    seen = set()
    paragraphs = []
    for index, text in texts:
        if index < last_tool:
            continue
        for paragraph in re.split(r"\n\s*\n", text.strip()):
            key = " ".join(paragraph.split())
            if key and key not in seen:
                seen.add(key)
                paragraphs.append(paragraph)
    return "\n\n".join(paragraphs)


def _collect(events):
    calls = {}
    traces = []
    texts = []
    last_tool = -1
    for index, event in enumerate(events):
        if event.partial:
            continue
        for part in _parts(event):
            call = part.function_call
            if call and call.name != CONFIRM:
                calls[call.id or call.name] = call
            response = part.function_response
            if response and response.name != CONFIRM:
                last_tool = index
                result = response.response or {}
                if "requires confirmation" in str(result.get("error", "")).lower():
                    continue
                call = calls.get(response.id or response.name)
                if call is None:
                    call = next(
                        (c for c in reversed(list(calls.values())) if c.name == response.name), None
                    )
                traces.append(
                    {
                        "tool": response.name,
                        "args": call.args or {} if call else {},
                        "result": result,
                    }
                )
            if event.author not in ("user", "system") and part.text and not part.thought:
                texts.append((index, part.text))
    return {"reply": _reply(texts, last_tool), "pending": _pending(events), "tool_calls": traces}


async def _run(session_id: str, user: str, content: types.Content) -> dict:
    owner, sid = _identity(session_id, user)
    runner = _runner()
    events = []

    async def consume(message):
        async for event in runner.run_async(
            user_id=owner,
            session_id=sid,
            new_message=message,
            run_config=RunConfig(max_llm_calls=12),
        ):
            events.append(event)

    try:
        async with asyncio.timeout(85):
            await consume(content)
            result = _collect(events)
            if not result["reply"] and result["tool_calls"] and not result["pending"]:
                await consume(types.Content(role="user", parts=[types.Part(text=NUDGE)]))
                result = _collect(events)
    except TimeoutError as exc:
        raise WorkflowError(
            "Kira took too long. Reopen the chat to check completed actions before trying again."
        ) from exc
    except WorkflowError:
        raise
    except Exception as exc:
        # Provider exceptions can include credentials, prompts and raw data: keep them out of HTTP detail.
        raise WorkflowError(
            "Kira could not finish the request. Reopen the chat to check completed actions, then try again."
        ) from exc
    if not result["reply"]:
        result["reply"] = (
            "Please review and approve or reject the proposed changes."
            if result["pending"]
            else "I couldn't produce a summary. Check the tool results below before continuing."
        )
    return guard.scrub_value(result)


async def _guarded(session, message, reply):
    service = _sessions()
    invocation = "guard-" + uuid4().hex
    for author, role, text in (("user", "user", message), ("kira", "model", reply)):
        await service.append_event(
            session=session,
            event=Event(
                invocation_id=invocation,
                author=author,
                content=types.Content(role=role, parts=[types.Part(text=text)]),
            ),
        )
    return guard.scrub_value({"reply": reply, "pending": [], "tool_calls": [], "guarded": True})


async def send(session_id: str, user: str, message: str, context: dict | None = None) -> dict:
    if not message.strip():
        raise WorkflowError("Write a message for Kira first.")
    async with _lock(session_id, user):
        session = await _session(session_id, user)
        if _pending(session.events):
            raise WorkflowError(
                "Approve or reject the pending changes before sending another message."
            )
        refusal = guard.check_message(message)
        if refusal:
            return await _guarded(session, message, refusal)
        _check_model()
        if context:
            screen = json.dumps(guard.untrusted(context), ensure_ascii=False, default=str)[:1500]
            message += "\n[Screen: " + screen + "]"
        return await _run(
            session_id, user, types.Content(role="user", parts=[types.Part(text=message)])
        )


async def confirm(session_id: str, user: str, answers: dict[str, bool]) -> dict:
    async with _lock(session_id, user):
        session = await _session(session_id, user, create=False)
        pending = _pending(session.events) if session else []
        ids = {item["id"] for item in pending}
        if (
            not ids
            or set(answers) != ids
            or any(type(answer) is not bool for answer in answers.values())
        ):
            raise WorkflowError(
                "Answer every current approval together. These approvals may be stale or already answered."
            )
        _check_model()
        content = types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        id=item["id"], name=CONFIRM, response={"confirmed": answers[item["id"]]}
                    )
                )
                for item in pending
            ],
        )
        return await _run(session_id, user, content)


async def history(session_id: str, user: str, limit: int = 60) -> list[dict]:
    session = await _session(session_id, user, create=False)
    if session is None:
        return []
    rows = []
    turn = []

    def flush():
        if not turn:
            return
        result = _collect(turn)
        pending_traces = [
            {
                "tool": item["tool"],
                "args": item["args"],
                "result": {"status": "pending", "confirmation_id": item["id"]},
            }
            for item in result["pending"]
        ]
        if result["reply"] or result["tool_calls"] or pending_traces:
            rows.append(
                {
                    "who": "kira",
                    "text": result["reply"]
                    or ("Please review the proposed changes." if pending_traces else ""),
                    "tools": result["tool_calls"] + pending_traces,
                }
            )
        turn.clear()

    for event in session.events:
        user_text = (
            "".join(part.text or "" for part in _parts(event)) if event.author == "user" else ""
        )
        if user_text and user_text != NUDGE:
            flush()
            rows.append({"who": "user", "text": SCREEN.sub("", user_text), "tools": []})
        else:
            turn.append(event)
    flush()
    return guard.scrub_value(rows[-max(1, min(limit, 200)) :])
