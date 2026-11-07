"""Analysis reads, exports and explicit follow-up/manual-link writes."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict

from kira.api.deps import actor, db
from kira.db import session_scope
from kira.services import analysis, followup, manual

router = APIRouter(prefix="/analysis", tags=["Analysis"])


def filters(
    date_from: str = "",
    date_to: str = "",
    outlet: str = "",
    provider: str = "",
    status: str = "",
    reason: str = "",
    q: str = "",
    amount_min: float | None = Query(None, allow_inf_nan=False),
    amount_max: float | None = Query(None, allow_inf_nan=False),
    keys: str = "",
    ids: str = "",
):
    return analysis.scope_of(
        {
            "date_from": date_from,
            "date_to": date_to,
            "outlet": outlet,
            "provider": provider,
            "status": status,
            "reason": reason,
            "q": q,
            "amount_min": amount_min,
            "amount_max": amount_max,
            "keys": keys,
            "ids": ids,
        }
    )


def read_db():
    with session_scope(write=False) as s:
        yield s


class FollowUpIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rid: str
    status: str = "open"
    note: str = ""
    assignee: str = ""


class BulkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[FollowUpIn]


class DraftIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rids: list[str] | None = None
    keys: list[str] | None = None
    only_empty: bool = True
    lang: str = "en"


class ManualIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage: str
    left: list[int]
    right: list[int]
    note: str


@router.get("/summary")
def summary(f=Depends(filters), s=Depends(db, scope="function")):
    return analysis.summary(s, f)


@router.get("/records")
def records(
    f=Depends(filters),
    sort: str = "",
    desc: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=0, le=1000),
    s=Depends(db, scope="function"),
):
    return analysis.records(s, f, sort, desc, offset, limit)


@router.get("/rates")
def rates(
    f=Depends(filters),
    period: str = "day",
    by_outlet: bool = True,
    by_provider: bool = False,
    below: bool = False,
    search: str = "",
    sort: str = "",
    desc: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=0, le=1000),
    s=Depends(db, scope="function"),
):
    return analysis.rates(
        s, f, period, by_outlet, by_provider, below, search, sort, desc, offset, limit
    )


@router.get("/side/{stage}/{table}")
def side(
    stage: str,
    table: str,
    f=Depends(filters),
    link_status: str = "",
    links: str = "",
    search: str = "",
    sort: str = "",
    desc: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=0, le=1000),
    s=Depends(db, scope="function"),
):
    return analysis.side(s, table, stage, f, link_status, links, search, sort, desc, offset, limit)


@router.get("/gaps")
def gaps(f=Depends(filters), by_day: bool = False, s=Depends(db, scope="function")):
    return analysis.gaps(s, f, by_day=by_day)


@router.get("/export")
def export(f=Depends(filters), s=Depends(db, scope="function"), user=Depends(actor)):
    return Response(
        analysis.export(s, f, user),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="kira-analysis.csv"'},
    )


@router.get("/follow-ups")
def follow_ups(
    f=Depends(filters),
    follow: str = "",
    search: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=0, le=1000),
    s=Depends(db, scope="function"),
):
    return analysis.follow_ups(s, f, follow, search, offset, limit)


@router.post("/follow-ups")
def set_follow_up(body: FollowUpIn, s=Depends(db, scope="function"), user=Depends(actor)):
    return analysis.set_follow_up(s, body.rid, body.status, body.note, body.assignee, user)


@router.post("/follow-ups/draft")
def draft(body: DraftIn, f=Depends(filters), s=Depends(read_db, scope="function")):
    return followup.draft(
        s, rids=body.rids, keys=body.keys, f=f, lang=body.lang, only_empty=body.only_empty
    )


@router.post("/follow-ups/bulk")
def bulk(body: BulkIn, s=Depends(db, scope="function"), user=Depends(actor)):
    return analysis.save_bulk(s, [x.model_dump() for x in body.items], user)


@router.get("/manual-links")
def manual_links(s=Depends(db, scope="function")):
    return manual.list_links(s)


@router.post("/manual-links")
def create_link(body: ManualIn, s=Depends(db, scope="function"), user=Depends(actor)):
    return manual.create(s, body.stage, body.left, body.right, body.note, user)


@router.delete("/manual-links/{link_id}")
def delete_link(link_id: int, s=Depends(db, scope="function"), user=Depends(actor)):
    manual.delete(s, link_id, user)
    return {"ok": True}
