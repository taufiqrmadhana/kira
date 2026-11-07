"""Step 2 conversion and upload rule decisions."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from kira.api.deps import actor, db
from kira.api.progress import stream_write
from kira.services import convert, state

router = APIRouter(tags=["Convert"])


@router.post("/convert")
def run_convert(s=Depends(db, scope="function"), who=Depends(actor)):
    return convert.convert(s, who)


@router.post("/convert/stream")
def stream_convert(who=Depends(actor)):
    return stream_write(lambda s, progress: convert.convert(s, who, progress=progress))


@router.get("/convert")
def conversion(s=Depends(db, scope="function")):
    return state.get(s, "conversion")


@router.get("/upload-rules")
def upload_rules(s=Depends(db, scope="function")):
    return {
        "current": {type_: convert.current_rule(s, type_) for type_ in state.TYPES},
        "pending": convert.pending_rules(s),
    }


class Column(BaseModel):
    name: str
    type: Literal["text", "number", "date", "datetime", "bool"] | None = None
    keep: bool | None = None


class Decision(BaseModel):
    choice: Literal["create", "update", "keep"]
    columns: list[Column] | None = None
    rename: dict[str, str] | None = None


@router.post("/upload-rules/{type_}")
def decide(type_: str, body: Decision, s=Depends(db, scope="function"), who=Depends(actor)):
    try:
        return convert.decide_upload_rule(
            s,
            type_,
            body.choice,
            who,
            columns=[c.model_dump(exclude_none=True) for c in body.columns]
            if body.columns is not None
            else None,
            rename=body.rename,
        )
    except state.WorkflowError:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
