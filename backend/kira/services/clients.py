"""Client names are stored in the default workspace, independent of selection."""

import re
import unicodedata
from contextlib import contextmanager

from sqlalchemy.orm import Session

from kira.config import settings
from kira.db import client_id, current_client, session_scope
from kira.services import state

KEY = "clients"
DEMO_CLIENTS = frozenset({"zestly-demo", "zestly-demo-latihan"})


@contextmanager
def _default_session(write: bool, session: Session | None):
    if session is not None:
        yield session
        return
    token = current_client.set("")
    try:
        with session_scope(write=write) as s:
            yield s
    finally:
        current_client.reset(token)


def _load(s: Session) -> list[dict]:
    saved = state.get(s, KEY, [])
    default = next((c for c in saved if c["id"] == ""), {"id": "", "name": settings.client_name})
    return [default, *(c for c in saved if c["id"] != "")]


def list_clients(*, session: Session | None = None) -> list[dict]:
    with _default_session(False, session) as s:
        return _load(s)


def save_client(name: str, cid: str | None = None, *, session: Session | None = None) -> dict:
    name = name.strip()
    if not name or len(name) > 100:
        raise state.WorkflowError("Client name must contain 1 to 100 characters")
    if cid is not None and cid != "" and client_id(cid) != cid:
        raise state.WorkflowError(
            "Client id must use lowercase letters, digits and dashes (at most 40)"
        )
    with _default_session(True, session) as s:
        saved = _load(s)
        if cid is None:
            ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
            stem = (
                re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:40].rstrip("-")
                or "client"
            )
            cid = stem
            existing = {c["id"] for c in saved}
            suffix = 2
            while cid in existing:
                ending = f"-{suffix}"
                cid = stem[: 40 - len(ending)].rstrip("-") + ending
                suffix += 1
        result = {"id": cid, "name": name}
        saved = [result if c["id"] == cid else c for c in saved]
        if not any(c["id"] == cid for c in saved):
            saved.append(result)
        state.put(s, KEY, saved)
        return result
