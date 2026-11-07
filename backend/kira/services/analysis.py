"""Scoped analysis of persisted runs and durable, audited follow-up notes."""

from collections import Counter
from datetime import date

from sqlalchemy import select

from kira.core import analysis as core
from kira.core import matching
from kira.models import CleanRow, FollowUp, now
from kira.services import manual, match, state, status
from kira.services.state import WorkflowError

FOLLOW_STATUSES = ("open", "investigating", "resolved")


def _tables(s):
    tables = state.clean_tables(s)
    for area, table in tables.items():
        for row, stored in zip(
            table["rows"],
            s.scalars(select(CleanRow).where(CleanRow.type == area).order_by(CleanRow.row_no)),
        ):
            if stored.was:
                row["__was"] = stored.was
        if not table["columns"]:
            keys = dict.fromkeys(k for row in table["rows"] for k in row if not k.startswith("__"))
            table["columns"] = [
                {
                    "name": k,
                    "type": "number"
                    if any(
                        isinstance(row.get(k), (int, float)) and not isinstance(row.get(k), bool)
                        for row in table["rows"]
                    )
                    else "text",
                }
                for k in keys
            ]
    return tables


def load(s):
    runs = [match._current_run(s, stage) for stage in ("l1", "l2")]
    if not all(runs):
        return None
    key = (tuple(r.id for r in runs), manual.version(s))
    cached = s.info.get("analysis")
    if cached and cached[0] == key:
        return cached[1]
    T = _tables(s)
    _, a, b = match._links(s, T)
    manual.apply(s, T, a, b)
    final = matching.final_result(T, a, b)
    result = T, final, core.records(T, final)
    s.info["analysis"] = key, result
    return result


def _need(s):
    loaded = load(s)
    if loaded is None:
        raise WorkflowError("Run both matching stages before opening analysis")
    return loaded


def scope_of(f):
    f = core.clean_filters(f)
    for field in ("date_from", "date_to"):
        if field in f:
            try:
                date.fromisoformat(f[field])
            except (TypeError, ValueError):
                raise WorkflowError(f"{field} must be YYYY-MM-DD") from None
    if f.get("date_from") and f.get("date_to") and f["date_from"] > f["date_to"]:
        raise WorkflowError("Start date must not be after end date")
    if f.get("status") and core.split(f["status"]) - set(core.STATUSES) - {"open"}:
        raise WorkflowError("Choose Matched, Needs review or Mismatched")
    if "amount_min" in f and "amount_max" in f and f["amount_min"] > f["amount_max"]:
        raise WorkflowError("Minimum amount must not exceed maximum amount")
    return f


def _page(offset, limit, maximum=1000):
    if offset < 0 or not 0 <= limit <= maximum:
        raise WorkflowError(f"Offset must be non-negative and limit at most {maximum}")


def _banks(recs, T):
    return {str(r["bank"]): T["bank"]["rows"][r["bank"]] for r in recs if r["bank"] is not None}


def summary(s, f=None):
    T, _, recs = _need(s)
    scope = scope_of(f)
    return {
        "scope": scope,
        **core.aggregate(core.select_records(recs, scope, T), T),
        "facets": core.facets(recs),
    }


def records(s, f=None, sort=None, desc=False, offset=0, limit=100):
    _page(offset, limit)
    T, _, recs = _need(s)
    f = scope_of(f)
    without_status = {k: v for k, v in f.items() if k != "status"}
    counts = dict.fromkeys(core.STATUSES, 0) | dict(
        Counter(r["status"] for r in core.select_records(recs, without_status, T))
    )
    selected = core.sort_records(core.select_records(recs, f, T), sort, desc, T)
    page = selected[offset : offset + limit]
    return {
        "total": len(selected),
        "offset": offset,
        "limit": limit,
        "status_counts": counts,
        "columns": {a: t["columns"] for a, t in T.items()},
        "records": [core.public(r, T) for r in page],
        "banks": _banks(page, T),
    }


def rates(
    s,
    f=None,
    period="day",
    outlet=True,
    provider=False,
    below=False,
    q="",
    sort=None,
    desc=False,
    offset=0,
    limit=100,
):
    _page(offset, limit)
    if period not in ("day", "week", "month", "all"):
        raise WorkflowError("Period must be day, week, month or all")
    T, _, recs = _need(s)
    scoped = core.select_records(recs, scope_of(f), T)
    allocation = core.allocate(recs, T)
    rows, _ = core.rate_rows(scoped, T, allocation, period, outlet, provider)
    rows = [
        r
        for r in rows
        if (not below or core.below_100(r))
        and (
            not q
            or q.casefold()
            in " ".join(str(r[k]) for k in ("period", "outlet", "provider")).casefold()
        )
    ]
    if sort:
        rows = core.sort_rows(rows, sort, desc)
    total = core.rate_total(rows, scoped, T, allocation, period, outlet, provider)
    return {
        "total": len(rows),
        "offset": offset,
        "limit": limit,
        "totals": total,
        "unassigned": core.unassigned(scoped, T),
        "rows": rows[offset : offset + limit],
    }


def gaps(s, f=None):
    T, _, recs = _need(s)
    return core.gaps(core.select_records(recs, scope_of(f), T), recs, T)


def side(
    s, table, stage, f=None, status="", links="", q="", sort=None, desc=False, offset=0, limit=100
):
    _page(offset, limit)
    if stage not in core.STAGE_TABLES or table not in core.STAGE_TABLES[stage]:
        raise WorkflowError("Choose a table belonging to the matching stage")
    statuses = core.split(status)
    if statuses - set(core.SIDE_STATUSES):
        raise WorkflowError("Choose Linked, Review or Not found")
    T, _, recs = _need(s)
    rows = core.side_rows(core.select_records(recs, scope_of(f), T), table, stage)
    counts = dict.fromkeys(core.SIDE_STATUSES, 0) | dict(Counter(r["status"] for r in rows))
    selected_links = core.split(links)
    rows = [
        r
        for r in rows
        if (not statuses or r["status"] in statuses)
        and (not selected_links or r["link"] in selected_links)
        and (not q or q.casefold() in str(T[table]["rows"][r["n"]]).casefold())
    ]
    rows = core.sort_rows(
        rows,
        sort,
        desc,
        lambda r: (
            r.get(sort)
            if sort in {"link", "status", "outlet", "day"}
            else T[table]["rows"][r["n"]].get(sort)
        ),
    )
    return {
        "total": len(rows),
        "offset": offset,
        "limit": limit,
        "counts": counts,
        "columns": T[table]["columns"],
        "aggregates": core.side_aggregates(rows, T, table),
        "rows": [{**r, "row": T[table]["rows"][r["n"]]} for r in rows[offset : offset + limit]],
    }


def match_map(s, outlet="", day="", status="open", limit=20):
    T, _, recs = _need(s)
    scope = scope_of({"outlet": outlet, "date_from": day, "date_to": day, "status": status})
    selected = core.select_records(recs, scope, T)
    return {
        "total": len(selected),
        "records": [
            {
                **core.public(r, T),
                "bank": core.source(r, T, "bank"),
                "compare": core.compare(r, T),
                "issues": core.issues(r, T),
            }
            for r in selected[: max(0, min(limit, 1000))]
        ],
    }


def find_keys(s, keys):
    T, _, recs = _need(s)
    selected = set(keys)
    return list(dict.fromkeys(r["key"] for r in recs if core.has_key(r, selected, T)))


def export(s, f, actor):
    T, final, recs = _need(s)
    selected = {r["i"] for r in core.select_records(recs, scope_of(f), T)}
    groups, i = [], 0
    for group in final["groups"]:
        rows = []
        for row in group["rows"]:
            if i in selected:
                rows.append(row)
            i += 1
        if rows:
            groups.append({**group, "rows": rows})
    return matching.export_csv(T, {"groups": groups})


def _fu(x):
    return {
        "status": x.status,
        "note": x.note,
        "assignee": x.assignee,
        "by": x.updated_by,
        "at": x.updated_at.isoformat(),
    }


def _followups(s, rids=None):
    query = select(FollowUp)
    if rids is not None:
        query = query.where(FollowUp.rid.in_(rids))
    return {x.rid: _fu(x) for x in s.scalars(query)}


def follow_ups(s, f=None, status="", q="", offset=0, limit=100):
    # Kira requests 1,001 to detect overflow before its 1,000-record write limit.
    _page(offset, limit, maximum=2000)
    if status and status not in FOLLOW_STATUSES:
        raise WorkflowError("Choose open, investigating or resolved")
    T, _, recs = _need(s)
    notes = _followups(s)
    selected = [
        r
        for r in core.select_records(recs, scope_of(f), T)
        if r["status"] != "Matched" or r["rid"] in notes
    ]
    counts = dict.fromkeys(FOLLOW_STATUSES, 0) | dict(
        Counter(notes.get(r["rid"], {}).get("status", "open") for r in selected)
    )
    selected = [
        r
        for r in selected
        if (not status or notes.get(r["rid"], {}).get("status", "open") == status)
        and (not q or q.casefold() in str([r, notes.get(r["rid"], {})]).casefold())
    ]
    page = selected[offset : offset + limit]
    return {
        "total": len(selected),
        "offset": offset,
        "counts": counts,
        "banks": _banks(page, T),
        "records": [
            {
                **core.public(r, T),
                "follow_up": notes.get(
                    r["rid"], {"status": "open", "note": "", "assignee": "", "by": "", "at": None}
                ),
            }
            for r in page
        ],
    }


def set_follow_up(s, rid, status, note, assignee, actor):
    _, _, recs = _need(s)
    if status not in FOLLOW_STATUSES or rid not in {r["rid"] for r in recs}:
        raise WorkflowError("Choose a current record and a valid follow-up status")
    if len(note) > 10000 or len(assignee) > 100:
        raise WorkflowError("Follow-up note or assignee is too long")
    entry = s.scalar(select(FollowUp).where(FollowUp.rid == rid))
    if entry is None:
        entry = FollowUp(rid=rid)
        s.add(entry)
    entry.status, entry.note, entry.assignee = status, note, assignee
    entry.updated_by, entry.updated_at = actor, now()
    s.flush()
    state.audit(s, actor, "Saved follow-up", rid, status)
    return _fu(entry)


def save_bulk(s, items, actor):
    if not items or len(items) > 2000 or len({x["rid"] for x in items}) != len(items):
        raise WorkflowError("Save between 1 and 2,000 distinct records")
    _, _, recs = _need(s)
    valid = {r["rid"] for r in recs}
    if any(x["rid"] not in valid or x.get("status", "open") not in FOLLOW_STATUSES for x in items):
        raise WorkflowError("Every follow-up must name a current record and valid status")
    notes = {
        x["rid"]: set_follow_up(
            s, x["rid"], x.get("status", "open"), x.get("note", ""), x.get("assignee", ""), actor
        )
        for x in items
    }
    return {"saved": len(notes), "follow_ups": notes}


def overview(s, open_items=6):
    loaded = load(s)
    if loaded is None:
        return {"status": status.status(s), "results": None}
    T, final, recs = loaded
    open_rows = [r for r in recs if r["status"] != "Matched"][:open_items]
    return {
        "status": status.status(s),
        "results": {
            "totals": final["totals"],
            "by_day": match.by_day(T, final),
            "open_items": [
                {
                    "status": r["status"],
                    "reason": r["reason"],
                    "pos": core.source(r, T, "pos"),
                    "stl": core.source(r, T, "settlement"),
                    "bank": core.source(r, T, "bank"),
                }
                for r in open_rows
            ],
            "run_at": match._current_run(s, "l2").run_at.isoformat(),
        },
    }
