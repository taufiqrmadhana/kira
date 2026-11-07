"""Matching endpoints from docs/02; writes commit before their response."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from kira.api.deps import actor, db
from kira.api.progress import stream_write
from kira.services import match

router = APIRouter(prefix="/matching", tags=["Match"])


class NewRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = "composite"
    params: dict = Field(default_factory=dict)
    name: str = ""
    exclude: str | None = None


class RuleSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule_ids: list[str] | None = None


class RuleOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule_ids: list[str]


@router.get("/rules")
def rules(s=Depends(db, scope="function")):
    return match.list_rules(s)


@router.get("/results")
def results(rows: bool = False, s=Depends(db, scope="function")):
    return match.results(s, with_rows=rows)


@router.get("/export")
def export(s=Depends(db, scope="function"), user=Depends(actor)):
    return Response(
        match.export(s, user),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="kira-results.csv"'},
    )


@router.get("/export.xlsx")
def export_xlsx(s=Depends(db, scope="function"), user=Depends(actor)):
    return Response(
        match.export_xlsx(s, user),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="kira-results.xlsx"'},
    )


@router.patch("/rules/{rule_id}")
def edit(rule_id: str, body: NewRule, s=Depends(db, scope="function"), user=Depends(actor)):
    return match.edit_rule(s, rule_id, body.kind, body.params, user, body.name)


@router.delete("/rules/{rule_id}")
def delete(rule_id: str, s=Depends(db, scope="function"), user=Depends(actor)):
    match.delete_rule(s, rule_id, user)
    return {"ok": True}


@router.get("/{stage}/suggestions")
def suggestions(stage: str, s=Depends(db, scope="function")):
    return match.suggest(s, stage)


@router.post("/{stage}/rules")
def save(stage: str, body: NewRule, s=Depends(db, scope="function"), user=Depends(actor)):
    return match.save_rule(s, stage, body.kind, body.params, user, body.name)


@router.post("/{stage}/preview")
def preview(stage: str, body: NewRule, s=Depends(db, scope="function")):
    return match.preview(s, stage, body.kind, body.params, body.exclude)


@router.post("/{stage}/order")
def order(stage: str, body: RuleOrder, s=Depends(db, scope="function"), user=Depends(actor)):
    return match.order_rules(s, stage, body.rule_ids, user)


@router.post("/{stage}/test")
def test(stage: str, body: RuleSet, s=Depends(db, scope="function")):
    return match.test(s, stage, body.rule_ids)


@router.post("/{stage}/run")
def run(stage: str, body: RuleSet, s=Depends(db, scope="function"), user=Depends(actor)):
    return match.run(s, stage, user, body.rule_ids)


@router.post("/{stage}/run/stream")
def stream_run(stage: str, body: RuleSet, user=Depends(actor)):
    return stream_write(
        lambda s, progress: match.run(s, stage, user, body.rule_ids, progress=progress)
    )
