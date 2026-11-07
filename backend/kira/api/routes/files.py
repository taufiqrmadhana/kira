"""R2 upload routes. Services own writes; request dependencies commit before replies."""

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from kira.api.deps import actor, db
from kira.config import settings
from kira.services import files
from kira.services.state import WorkflowError

router = APIRouter(tags=["Files"])


@router.get("/files")
def list_files(s=Depends(db, scope="function")):
    return files.list_files(s)


@router.post("/files/{type_}")
def upload(
    type_: str,
    uploads: list[UploadFile] = File(...),
    folder: str = Form(""),
    s=Depends(db, scope="function"),
    who=Depends(actor),
):
    # A sync route keeps file profiling and database work off the event loop.
    try:
        return [
            files.add_file(
                s,
                type_,
                item.filename or "",
                item.file.read(settings.max_upload_mb * 1024 * 1024 + 1),
                who,
                folder,
            )
            for item in uploads
        ]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        for item in uploads:
            item.file.close()


@router.get("/files/{file_id}/download")
def download(file_id: int, s=Depends(db, scope="function")):
    record = files.get_file(s, file_id)
    return Response(
        content=record.content,
        media_type={
            ".csv": "text/csv",
            ".txt": "text/plain",
            ".pdf": "application/pdf",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
        }.get(Path(record.name).suffix.lower(), "application/octet-stream"),
        headers={
            "Content-Disposition": "attachment; filename*=utf-8''" + quote(record.name, safe="")
        },
    )


class Move(BaseModel):
    to: str


@router.post("/files/{file_id}/move")
def move(file_id: int, body: Move, s=Depends(db, scope="function"), who=Depends(actor)):
    try:
        files.move_file(s, file_id, body.to, who)
    except WorkflowError:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.delete("/files/{file_id}")
def remove(file_id: int, s=Depends(db, scope="function"), who=Depends(actor)):
    files.remove_file(s, file_id, who)
    return {"ok": True}


@router.post("/files/samples/{day}")
def add_samples(day: int, s=Depends(db, scope="function"), who=Depends(actor)):
    try:
        return files.add_samples(s, who, day)
    except WorkflowError:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
