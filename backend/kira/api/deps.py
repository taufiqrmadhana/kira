"""A committed session per request and the name used in the audit log."""

from contextlib import ExitStack

from fastapi import Header, Request

from kira.config import settings
from kira.db import current_client, session_scope


def db(request: Request):
    with session_scope(write=request.method not in {"GET", "HEAD", "OPTIONS"}) as s:
        yield s


def default_db(request: Request):
    # FastAPI may enter/exit a sync dependency in different worker contexts.
    # Resolve the default engine and restore the token before yielding.
    with ExitStack() as stack:
        token = current_client.set("")
        try:
            s = stack.enter_context(
                session_scope(write=request.method not in {"GET", "HEAD", "OPTIONS"})
            )
        finally:
            current_client.reset(token)
        yield s


def actor(x_kira_user: str | None = Header(default=None)) -> str:
    return (x_kira_user or settings.user).strip()[:100] or settings.user


def chat_user(request: Request, x_kira_user: str | None = Header(default=None)) -> str:
    from kira.api.auth import signed_in

    # A header can label audit entries but cannot select somebody else's signed-in chat.
    return signed_in(request) if settings.auth_password else actor(x_kira_user)
