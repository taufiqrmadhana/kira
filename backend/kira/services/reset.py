"""Back up and clear an explicitly confirmed demo workspace in one transaction."""

import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, func, select

from kira.db import Base, engine_for
from kira.models import now
from kira.services import analysis, state
from kira.services.clients import DEMO_CLIENTS
from kira.services.state import WorkflowError


def _backup(database: Path) -> Path:
    """SQLite's backup API includes committed WAL pages; copying the file does not."""
    stamp = now().strftime("%Y%m%d-%H%M%S-%f")
    target = database.with_name(f"{database.stem}.bak-reset-{stamp}-{uuid4().hex[:8]}.db")
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(target)) as destination:
                source.backup(destination)
                if destination.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                    raise sqlite3.DatabaseError("Backup integrity check failed")
    except BaseException:
        # Only our newly created incomplete backup is removed; the source is untouched.
        target.unlink(missing_ok=True)
        raise
    return target


def reset_demo(s, client: str, confirmation: str, actor: str):
    if client not in DEMO_CLIENTS:
        raise WorkflowError("Reset is available only for the Zestly demo workspaces")
    if confirmation != client:
        raise WorkflowError(f"Type {client} exactly to confirm resetting this demo")
    engine = s.get_bind()
    if engine is not engine_for(client):
        raise WorkflowError("Reset must use the selected client database")
    if engine.dialect.name != "sqlite" or engine.url.database in (None, "", ":memory:"):
        raise WorkflowError("Reset requires a file-backed SQLite demo database")
    if s.new or s.dirty or s.deleted or s.info.get("analysis_cache_dirty"):
        raise WorkflowError("Finish the current change before resetting the demo")
    database = Path(engine.url.database).resolve()
    if not database.is_file():
        raise WorkflowError("The selected client database is missing")
    # The route's normal write dependency already holds the application write lock.
    # No data is changed until a complete, checked backup exists.
    try:
        backup = _backup(database)
    except (OSError, sqlite3.Error) as exc:
        raise WorkflowError(
            "The demo backup could not be created. Nothing was reset; try again."
        ) from exc
    counts = {
        table.name: s.scalar(select(func.count()).select_from(table))
        for table in Base.metadata.sorted_tables
    }
    analysis.invalidate(s)
    # Keep the schema and the other clients' databases. Foreign-key children go first.
    for table in reversed(Base.metadata.sorted_tables):
        s.execute(delete(table))
    state.audit(
        s,
        actor,
        "Reset demo",
        client,
        json.dumps({"backup": backup.name, "removed": counts}, sort_keys=True),
    )
    s.flush()
    return {"ok": True, "backup": backup.name}
