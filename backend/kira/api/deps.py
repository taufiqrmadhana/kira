"""A committed session per request and the name used in the audit log."""

from contextlib import ExitStack

from fastapi import Header, Request

from kira.config import settings
from kira.db import current_client, session_scope


def db(request: Request):
    # CSV downloads are explicit exports: their audit entry commits with the
    # response even though the established download contract uses GET.
    export = request.method == "GET" and request.url.path in {
        "/api/matching/export",
        "/api/analysis/export",
    }
    with session_scope(write=export or request.method not in {"GET", "HEAD", "OPTIONS"}) as s:
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


def actor(
    x_kira_user: str | None = Header(default=None),
    x_kira_origin: str | None = Header(default=None),
) -> str:
    user = (x_kira_user or settings.user).strip()[:100] or settings.user
    return f"via Kira, approved by {user}" if x_kira_origin == "guided" else user


def chat_user(request: Request, x_kira_user: str | None = Header(default=None)) -> str:
    from kira.api.auth import signed_in

    # A header can label audit entries but cannot select somebody else's signed-in chat.
    return signed_in(request) if settings.auth_password else actor(x_kira_user)
