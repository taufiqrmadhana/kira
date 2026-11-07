"""NDJSON progress for a write owned entirely by one worker and transaction."""

import asyncio
import json
import logging
from collections.abc import Callable
from threading import Event

from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from kira.db import Busy, current_client, session_scope
from kira.services.state import WorkflowError

logger = logging.getLogger(__name__)


class _Disconnected(Exception):
    pass


def _line(event: dict) -> bytes:
    return (
        json.dumps(jsonable_encoder(event), ensure_ascii=False, allow_nan=False) + "\n"
    ).encode()


def stream_write(operation: Callable[[Session, Callable[[dict], None]], dict]) -> StreamingResponse:
    """Capture the authenticated request's workspace, never its dependency session.

    Progress is provisional. A terminal complete is queued only after commit. A
    disconnected consumer asks the worker to roll back at its next checkpoint;
    a disconnect racing a completed commit cannot undo that completed write.
    """
    client = current_client.get()

    async def events():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[tuple[bytes, bool]] = asyncio.Queue()
        stopped = Event()

        def enqueue(event: dict | bytes, terminal: bool = False):
            if stopped.is_set():
                raise _Disconnected()
            line = event if isinstance(event, bytes) else _line(event)
            try:
                loop.call_soon_threadsafe(queue.put_nowait, (line, terminal))
            except RuntimeError as exc:
                raise _Disconnected() from exc

        def progress(event: dict):
            enqueue({**event, "type": "progress"})

        def worker():
            token = current_client.set(client)
            try:
                with session_scope(write=True, wait=0) as session:
                    result = operation(session, progress)
                    if stopped.is_set():
                        raise _Disconnected()
                    # Validate/serialize before committing too: a serialization
                    # failure must not leave a successful but unreportable write.
                    complete = _line({"type": "complete", "result": result})
                enqueue(complete, terminal=True)
            except _Disconnected:
                pass
            except Exception as exc:
                if isinstance(exc, (WorkflowError, Busy)):
                    detail, status = str(exc), 409
                elif isinstance(exc, ValueError):
                    detail, status = str(exc), 400
                else:
                    logger.exception("Progress operation failed")
                    detail, status = "Operation failed. No changes were saved.", 500
                try:
                    enqueue({"type": "error", "detail": detail, "status": status}, terminal=True)
                except _Disconnected:
                    pass
            finally:
                current_client.reset(token)

        task = asyncio.create_task(asyncio.to_thread(worker))
        try:
            while True:
                try:
                    line, terminal = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield _line({"type": "heartbeat"})
                    continue
                yield line
                if terminal:
                    await task
                    break
        finally:
            stopped.set()
            # Cancelling an asyncio task cannot stop its thread. Leave the worker
            # responsible for rolling back and releasing its own session/lock.

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
