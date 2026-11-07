"""Per-client database sessions; business writes share a single process lock."""

import re
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from threading import Lock

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import StaticPool

from kira.config import settings


class Base(DeclarativeBase):
    pass


class Busy(RuntimeError):
    """Another change is still running."""


current_client: ContextVar[str] = ContextVar("kira_client", default="")
_engines: dict[tuple[str, str], Engine] = {}
_engines_lock = Lock()
_write_lock = Lock()


def client_id(raw: str | None) -> str:
    """Return a safe ID, or the default workspace for an invalid header."""
    return raw if raw and re.fullmatch(r"[a-z0-9-]{1,40}", raw) else ""


def engine_for(client: str) -> Engine:
    cid = client_id(client)
    cache_key = (settings.database_url, cid)
    with _engines_lock:
        if cache_key not in _engines:
            url = make_url(settings.database_url)
            kwargs = {}
            if url.get_backend_name() == "sqlite":
                kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
                if url.database in (None, "", ":memory:"):
                    kwargs["poolclass"] = StaticPool
                else:
                    path = Path(url.database).expanduser().resolve()
                    if cid:
                        path = path.with_name(f"{path.stem}-{cid}{path.suffix}")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    url = url.set(database=str(path))
            elif cid:
                raise ValueError("Separate clients require a SQLite database URL")
            engine = create_engine(url, **kwargs)
            if url.get_backend_name() == "sqlite":

                @event.listens_for(engine, "connect")
                def configure_sqlite(connection, _record):
                    connection.execute("PRAGMA foreign_keys=ON")
                    connection.execute("PRAGMA journal_mode=WAL")

            init_db(engine)
            _engines[cache_key] = engine
        return _engines[cache_key]


def init_db(bind: Engine | None = None) -> None:
    from kira import models  # noqa: F401 -- register tables before create_all

    if bind is None:
        engine_for(current_client.get())
    else:
        Base.metadata.create_all(bind)


def dispose_engines() -> None:
    """Release pooled connections (also useful when replacing settings in tests)."""
    with _engines_lock:
        for engine in _engines.values():
            engine.dispose()
        _engines.clear()


@contextmanager
def session_scope(write: bool = True, wait: float | None = None):
    """Commit writes before returning; roll back reads and every failed transaction."""
    acquired = False
    if write:
        acquired = (
            _write_lock.acquire() if wait is None else _write_lock.acquire(timeout=max(0, wait))
        )
        if not acquired:
            raise Busy("KIRA is busy finishing another change")
    try:
        with Session(engine_for(current_client.get()), expire_on_commit=False) as s:
            try:
                yield s
                if write:
                    s.commit()
                else:
                    s.rollback()
            except BaseException:
                s.rollback()
                raise
    finally:
        if acquired:
            _write_lock.release()
