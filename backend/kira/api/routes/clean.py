"""Step 3 cleaning recommendations, saved rules and Layer 1/2 previews."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from kira.api.deps import actor, db
from kira.services import clean, state

router = APIRouter(tags=["Clean"])


@router.get("/cleaning")
def cleaning(s=Depends(db, scope="function")):
    return {
        "standard": clean.standard(s),
        "rules": clean.current_rules(s),
        "recommendations": clean.recommendations(s),
    }


class RecDecision(BaseModel):
    decision: Literal["accept", "reject"] | None
    mapping: dict[str, str] | None = None
    exclude: dict[str, bool] | None = None


@router.post("/cleaning/recommendations/{rec_id}")
def decide(rec_id: str, body: RecDecision, s=Depends(db, scope="function"), who=Depends(actor)):
    try:
        return clean.decide(s, rec_id, body.decision, body.mapping, body.exclude, actor=who)
    except state.WorkflowError:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/cleaning/save")
def save(s=Depends(db, scope="function"), who=Depends(actor)):
    return clean.save(s, who)


@router.get("/tables/{layer}/{type_}")
def table(
    layer: Literal["parsed", "clean"],
    type_: str,
    limit: int = Query(100, ge=0, le=1000),
    offset: int = Query(0, ge=0),
    s=Depends(db, scope="function"),
):
    try:
        return clean.table(s, layer, type_, limit, offset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
