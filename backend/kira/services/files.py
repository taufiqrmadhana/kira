"""Layer 0 file storage. The caller owns the transaction and write lock."""

import csv
from hashlib import sha256

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kira.config import settings
from kira.core import parsing
from kira.models import RawFile
from kira.services import state


def _check_type(type_: str) -> None:
    if type_ not in state.TYPES:
        raise ValueError("Upload area must be pos, settlement or bank")


def _mark_stale(s: Session) -> None:
    """Invalidate conversion and current matches while retaining historical evidence."""
    conversion = state.get(s, "conversion") or {"at": None, "proposals": {}, "decisions": {}}
    conversion["stale"] = True
    state.put(s, "conversion", conversion)
    state.clear_matching(s)


def add_file(
    s: Session, type_: str, name: str, content: bytes, actor: str, folder: str = ""
) -> dict:
    """Store an unchanged CSV/TXT upload, or report a duplicate without changing state."""
    _check_type(type_)
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    if not name or len(name) > 300 or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError("File name must contain 1–300 printable characters")
    if not name.lower().endswith((".csv", ".txt")):
        raise ValueError("Upload CSV or TXT files; Excel and PDF are not supported yet")
    if len(folder) > 300:
        raise ValueError("Folder name must be at most 300 characters")
    if not content:
        raise ValueError("The uploaded file is empty")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ValueError(f"File exceeds the {settings.max_upload_mb} MB upload limit")
    digest = sha256(content).hexdigest()
    existing = s.scalar(select(RawFile).where(RawFile.sha256 == digest))
    if existing is not None:
        return {"name": name, "status": "duplicate", "ids": [existing.id]}
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV and TXT files must use UTF-8 encoding") from exc
    if "\x00" in text:
        raise ValueError("CSV and TXT files cannot contain NUL bytes")
    try:
        prof = parsing.profile(type_, [text])
    except (csv.Error, ValueError) as exc:
        raise ValueError(f"Invalid CSV: {exc}") from exc
    if not prof["headers"]:
        raise ValueError("The uploaded file has no CSV header")
    record = RawFile(
        type=type_,
        name=name,
        folder=folder,
        sheet=None,
        sha256=digest,
        size=len(content),
        content=content,
        text=text,
        looks_like=parsing.looks_like(text),
        uploaded_by=actor,
    )
    s.add(record)
    s.flush()
    _mark_stale(s)
    state.audit(
        s, actor, "Upload file", name, f"{type_}; {len(prof['rows'])} rows; {len(content)} bytes"
    )
    return {"name": name, "status": "added", "ids": [record.id]}


def list_files(s: Session) -> list[dict]:
    """Return the file metadata shape in the API contract, ordered by upload ID."""
    return [
        {
            "id": record.id,
            "type": record.type,
            "name": record.name,
            "folder": record.folder,
            "sheet": record.sheet,
            "size": record.size,
            "rows": max(
                0, len(parsing.parse_csv(record.text, parsing.detect_delimiter(record.text))) - 1
            ),
            "looks_like": record.looks_like,
            "wrong_area": bool(record.looks_like and record.looks_like != record.type),
            "uploaded_by": record.uploaded_by,
            "uploaded_at": record.uploaded_at.isoformat(),
        }
        for record in s.scalars(select(RawFile).order_by(RawFile.id))
    ]


def get_file(s: Session, file_id: int) -> RawFile:
    """Find a file only within the caller's client database."""
    record = s.get(RawFile, file_id)
    if record is None:
        raise state.WorkflowError("File not found in this workspace")
    return record


def remove_file(s: Session, file_id: int, actor: str) -> None:
    """Delete one raw file and invalidate dependent results."""
    record = get_file(s, file_id)
    name, type_ = record.name, record.type
    s.delete(record)
    _mark_stale(s)
    state.audit(s, actor, "Delete file", name, type_)


def move_file(s: Session, file_id: int, to: str, actor: str) -> None:
    """Change the upload area without changing content, identity or duplicate detection."""
    _check_type(to)
    record = get_file(s, file_id)
    if record.type == to:
        return
    previous = record.type
    record.type = to
    _mark_stale(s)
    state.audit(s, actor, "Move file", record.name, f"{previous} to {to}")


def areas_filled(s: Session) -> dict[str, int]:
    """Count files in each of the three upload areas."""
    counts = dict(s.execute(select(RawFile.type, func.count()).group_by(RawFile.type)).all())
    return {type_: counts.get(type_, 0) for type_ in state.TYPES}
