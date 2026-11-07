"""Layer 0 file storage. The caller owns the transaction and write lock."""

import csv
from hashlib import sha256
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kira.config import settings
from kira.core import parsing
from kira.core.pdf import pdf_tables
from kira.db import current_client, engine_for
from kira.models import RawFile
from kira.services import state
from kira.services.clients import DEMO_CLIENTS

SAMPLES = Path(__file__).resolve().parents[3] / "data" / "with-exceptions"


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
    """Preserve original bytes, with one raw record per CSV, Excel sheet or PDF table."""
    _check_type(type_)
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    if not name or len(name) > 300 or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError("File name must contain 1–300 printable characters")
    extension = Path(name).suffix.lower()
    if extension not in {".csv", ".txt", ".xlsx", ".xlsm", ".pdf"}:
        raise ValueError("Upload CSV, TXT, XLSX, XLSM or text PDF files")
    if len(folder) > 300:
        raise ValueError("Folder name must be at most 300 characters")
    if not content:
        raise ValueError("The uploaded file is empty")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ValueError(f"File exceeds the {settings.max_upload_mb} MB upload limit")
    digest = sha256(content).hexdigest()
    try:
        if extension in {".xlsx", ".xlsm"}:
            parts = parsing.excel_sheets(content)
            if not parts:
                raise ValueError("The workbook has no sheets with at least two filled columns")
        elif extension == ".pdf":
            parts = pdf_tables(content)
            if not parts:
                raise ValueError(
                    "No text tables found. Scanned/image PDFs need OCR, which is not supported"
                )
        else:
            parts = [{"sheet": None, "csv": content.decode("utf-8-sig"), "skipped": 0}]
    except UnicodeDecodeError as exc:
        raise ValueError("CSV and TXT files must use UTF-8 encoding") from exc
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            f"Cannot read {extension} file: malformed, encrypted or unsupported document"
        ) from exc
    ids, added, row_count = [], 0, 0
    for index, part in enumerate(parts):
        fingerprint = digest if part["sheet"] is None else f"{digest}:{index}"
        existing = s.scalar(select(RawFile).where(RawFile.sha256 == fingerprint))
        if existing is not None:
            ids.append(existing.id)
            continue
        text = part["csv"]
        if "\x00" in text:
            raise ValueError("File tables cannot contain NUL bytes")
        try:
            prof = parsing.profile(type_, [text])
        except (csv.Error, ValueError) as exc:
            raise ValueError(f"Invalid table: {exc}") from exc
        if not prof["headers"]:
            raise ValueError("The uploaded file has no table header")
        record = RawFile(
            type=type_,
            name=name,
            folder=folder,
            sheet=part["sheet"],
            sha256=fingerprint,
            size=len(content),
            content=content,
            text=text,
            looks_like=parsing.looks_like(text),
            uploaded_by=actor,
        )
        s.add(record)
        s.flush()
        ids.append(record.id)
        added += 1
        row_count += len(prof["rows"])
    if added:
        _mark_stale(s)
        state.audit(
            s,
            actor,
            "Upload file",
            name,
            f"{type_}; {added} tables; {row_count} rows; {len(content)} bytes",
        )
    return {"name": name, "status": "added" if added else "duplicate", "ids": ids}


def add_samples(s: Session, actor: str, day: int = 1) -> list[dict]:
    """Load one complete bundled Zestly day into the selected demo workspace."""
    client = current_client.get()
    if client not in DEMO_CLIENTS:
        raise state.WorkflowError("Sample files are available only for the Zestly demo workspaces")
    if s.get_bind() is not engine_for(client):
        raise state.WorkflowError("Sample files must use the selected client database")
    if type(day) is not int or day not in range(1, 9):
        raise ValueError("Sample day must be from 1 to 8")
    unavailable = f"The sample files for day {day} are not installed for all three areas"
    try:
        root = SAMPLES.resolve()
        folders = list(root.glob(f"day-{day:02}-*"))
        if len(folders) != 1:
            raise state.WorkflowError(unavailable)
        folder = folders[0]
        resolved = folder.resolve()
        if not folder.is_dir() or not resolved.is_relative_to(root):
            raise state.WorkflowError(unavailable)
        paths = []
        for type_, prefix in (("pos", "POS"), ("settlement", "SET"), ("bank", "STA")):
            candidates = list(folder.glob(f"{prefix}_*.csv"))
            if len(candidates) != 1:
                raise state.WorkflowError(unavailable)
            path = candidates[0]
            if not path.is_file() or not path.resolve().is_relative_to(resolved):
                raise state.WorkflowError(unavailable)
            paths.append((type_, path))
        # Validate and read the complete day before starting the shared upload path.
        sources = [(type_, path, path.read_bytes()) for type_, path in paths]
    except OSError as exc:
        raise state.WorkflowError(unavailable) from exc
    return [
        add_file(s, type_, path.name, content, actor, folder.name)
        for type_, path, content in sources
    ]


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
