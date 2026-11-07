"""Scoped analysis of persisted runs and durable, audited follow-up notes."""

import inspect
import logging
from collections import Counter, OrderedDict
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from threading import RLock, Thread
from weakref import WeakKeyDictionary

from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from kira.core import analysis as core
from kira.core import matching
from kira.db import Base
from kira.models import (
    AuditLog,
    CleaningRules,
    CleanRow,
    FollowUp,
    ManualLink,
    MatchRun,
    RawFile,
    UploadRule,
    now,
)
from kira.services import manual, match, state, status
from kira.services.state import WorkflowError

FOLLOW_STATUSES = ("open", "investigating", "resolved")


# One bounded cache across requests. Keys include the database identity (never the
# request's mutable client ContextVar), both completed runs and rule versions.
_CACHE_LIMIT = 32
_cache = OrderedDict()
_cache_lock = RLock()
_generation = WeakKeyDictionary()
_client_locks = WeakKeyDictionary()
_hits = _misses = 0
_warming = set()
_log = logging.getLogger(__name__)


def _engine(s):
    bind = s.get_bind()
    return getattr(bind, "engine", bind)


def clear_cache(engine=None):
    """Evict one client's evidence, or all evidence during process teardown."""
    global _hits, _misses
    with _cache_lock:
        if engine is None:
            _cache.clear()
            _hits = _misses = 0
            for item in list(_generation):
                _generation[item] += 1
        else:
            _generation[engine] = _generation.get(engine, 0) + 1
            for key in list(_cache):
                if key[0] is engine:
                    del _cache[key]


def cache_info():
    with _cache_lock:
        return {"size": len(_cache), "limit": _CACHE_LIMIT, "hits": _hits, "misses": _misses}


def invalidate(s, *, evidence=True):
    """A writer cannot publish into the shared cache until its commit is visible."""
    s.info["analysis_cache_dirty"] = True
    if evidence:
        s.info.pop("analysis", None)
    clear_cache(_engine(s))


@event.listens_for(Session, "before_flush")
def _invalidate_rows(s, _context, _instances):
    # This also catches direct service writes, profile edits and future reset
    # implementations. The agent's conversation tables have their own Base.
    changed = list(s.new) + list(s.dirty) + list(s.deleted)
    if any(isinstance(row, Base) for row in changed):
        evidence = any(
            isinstance(row, (CleanRow, MatchRun, ManualLink, CleaningRules, UploadRule, RawFile))
            for row in changed
        )
        invalidate(s, evidence=evidence)


@event.listens_for(Session, "do_orm_execute")
def _invalidate_bulk(execution):
    if execution.is_insert or execution.is_update or execution.is_delete:
        invalidate(execution.session)


@event.listens_for(Session, "after_commit")
def _committed(s):
    if s.info.pop("analysis_cache_dirty", False):
        clear_cache(_engine(s))  # Evict any concurrent read of the pre-commit state.
    s.info.pop("analysis", None)
    if s.info.pop("analysis_warm", False):
        schedule_warm(_engine(s))


@event.listens_for(Session, "after_rollback")
def _rolled_back(s):
    if s.info.pop("analysis_cache_dirty", False):
        clear_cache(_engine(s))
    s.info.pop("analysis", None)
    s.info.pop("analysis_warm", None)


def _version(s):
    # Synchronous runs use run_at as their completion identity; there is no
    # separate finished_at column. Uncommitted runs bypass the shared cache.
    runs = tuple(
        s.execute(
            select(MatchRun.stage, MatchRun.id, MatchRun.run_at)
            .where(MatchRun.current.is_(True))
            .order_by(MatchRun.stage, MatchRun.id)
        ).all()
    )
    cleaning = s.scalar(select(func.max(CleaningRules.version)))
    # Audit revision covers learning, follow-ups, profiles and saved-rule counts.
    revision = s.scalar(select(func.max(AuditLog.id)))
    return runs, cleaning, manual.version(s), revision


def _freeze(value):
    if isinstance(value, dict):
        return tuple(sorted((k, _freeze(v)) for k, v in value.items()))
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(v) for v in value)
    if isinstance(value, set):
        return tuple(sorted(value))
    return value


def _cached(s, name, args, compute, *, copy=True):
    global _hits, _misses
    version = _version(s)  # Flush first, so pending writes cannot hit stale data.
    engine = _engine(s)
    if s.info.get("analysis_cache_dirty"):
        return deepcopy(compute()) if copy else compute()
    with _cache_lock:
        generation = _generation.get(engine, 0)
        key = (engine, generation, version, name, args)
        lock = _client_locks.setdefault(engine, RLock())
        if key in _cache:
            _hits += 1
            _cache.move_to_end(key)
            value = _cache[key]
            return deepcopy(value) if copy else value
    # Cold reads deduplicate within a client; unrelated clients, warm hits and
    # commit invalidation never wait for an expensive calculation to finish.
    with lock:
        with _cache_lock:
            if key in _cache:
                _hits += 1
                _cache.move_to_end(key)
                value = _cache[key]
                return deepcopy(value) if copy else value
            _misses += 1
        value = compute()
        with _cache_lock:
            if not s.info.get("analysis_cache_dirty") and _generation.get(engine, 0) == generation:
                _cache[key] = deepcopy(value) if copy else value
                _cache.move_to_end(key)
                while len(_cache) > _CACHE_LIMIT:
                    _cache.popitem(last=False)
        return deepcopy(value) if copy else value


def cached(function):
    """Cache a read service with canonical defaults and normalised scope."""
    signature = inspect.signature(function)

    @wraps(function)
    def read(s, *args, **kwargs):
        bound = signature.bind(s, *args, **kwargs)
        bound.apply_defaults()
        values = dict(bound.arguments)
        values.pop("s")
        if "f" in values:
            values["f"] = core.clean_filters(values["f"])
        if "sort" in values:
            values["sort"] = values["sort"] or None
        # Relative Insights periods must change at Jakarta midnight.
        if function.__module__.endswith("performance"):
            values["today"] = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
        return _cached(
            s,
            f"{function.__module__}.{function.__name__}",
            _freeze(values),
            lambda: function(s, *args, **kwargs),
        )

    return read


def warm_cache(engine):
    """Read common views using fresh sessions bound to the committed client DB."""
    from kira.services import clean, learning, performance

    with Session(engine) as s:
        status.status(s)
        status.workflow(s, rows=5)
        clean.standard(s)
        clean.table(s, "clean", "pos", limit=50)
        if load(s) is None:
            return
        summary(s)
        rates(s)
        rates(s, limit=1000)
        gaps(s)
        gaps(s, by_day=True)
        overview(s)
        learning.summary(s)
        performance.outlets(s)
        performance.anomalies(s)


def schedule_warm(engine):
    """One daemon per pending client; never hold up a completed write response."""
    if engine.url.database in (None, "", ":memory:"):
        return  # In-memory SQLite cannot safely share a connection across threads.
    with _cache_lock:
        if engine in _warming:
            return
        _warming.add(engine)

    def work():
        try:
            warm_cache(engine)
        except Exception:
            _log.exception("Could not warm reconciliation analysis")
        finally:
            with _cache_lock:
                _warming.discard(engine)

    thread = Thread(target=work, name="kira-analysis-warm", daemon=True)
    thread.start()
    return thread


def warm_startup():
    from kira.db import engine_for
    from kira.services.clients import list_clients

    for client in list_clients():
        schedule_warm(engine_for(client["id"]))


def _tables(s):
    tables = state.clean_tables(s)
    for area, table in tables.items():
        for row, was in zip(
            table["rows"],
            s.scalars(select(CleanRow.was).where(CleanRow.type == area).order_by(CleanRow.row_no)),
        ):
            if was:
                row["__was"] = was
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
    def compute():
        runs = [match._current_run(s, stage) for stage in ("l1", "l2")]
        if not all(runs):
            return None
        key = _version(s)[:3]
        previous = s.info.get("analysis")
        if previous and previous[0] == key:
            return previous[1]
        tables = _tables(s)
        _, a, b = match._links(s, tables)
        manual.apply(s, tables, a, b)
        final = matching.final_result(tables, a, b)
        result = tables, final, core.records(tables, final)
        s.info["analysis"] = key, result
        return result

    # Internal read-only snapshot. Public read services copy their responses.
    return _cached(s, "load", (), compute, copy=False)


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


@cached
def summary(s, f=None):
    T, _, recs = _need(s)
    scope = scope_of(f)
    return {
        "scope": scope,
        **core.aggregate(core.select_records(recs, scope, T), T),
        "facets": core.facets(recs),
    }


@cached
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


@cached
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


@cached
def gaps(s, f=None, by_day=False):
    T, _, recs = _need(s)
    aggregate = core.day_gaps if by_day else core.gaps
    return aggregate(core.select_records(recs, scope_of(f), T), recs, T)


@cached
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


@cached
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


@cached
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


@cached
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


@cached
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
