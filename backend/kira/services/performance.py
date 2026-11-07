"""Outlet views of completed analysis; only outlet profile metadata is written."""

import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median

from sqlalchemy import select

from kira.core import analysis as reconciliation
from kira.core import performance as core
from kira.models import now
from kira.models_insights import OutletProfile
from kira.services import analysis, state
from kira.services.state import WorkflowError

NEED_MATCHING = "Run matching first: insights use the reconciled results"
BANK_GAPS = {"fee", "rounding", "payout_diff"}
SUM_FIELDS = (
    "orders",
    "gross_sales",
    "provider_gross",
    "mdr",
    "fees",
    "nett_settled",
    "bank_received",
    "pending_bank",
    "to_check",
    "expected_diff",
    "deduction",
)


def _today():
    # Jakarta has a fixed UTC+7 offset and no daylight-saving transition.
    return datetime.now(timezone(timedelta(hours=7), "Asia/Jakarta")).date()


def _need(s):
    loaded = analysis.load(s)
    if loaded is None:
        raise WorkflowError(NEED_MATCHING)
    return loaded


def _profile(p):
    return {
        "outlet": p.outlet,
        "city": p.city,
        "region": p.region,
        "updated_by": p.updated_by,
        "updated_at": p.updated_at.isoformat(),
    }


def profiles(s, *, persist=True):
    _, _, records = _need(s)
    outlets = {r["outlet"] for r in records if r["outlet"]}
    existing = {p.outlet: p for p in s.scalars(select(OutletProfile))}
    for outlet in sorted(outlets - existing.keys()):
        p = OutletProfile(
            outlet=outlet,
            city=core.seed_city(outlet),
            region="",
            updated_by="system",
            updated_at=now(),
        )
        if persist:
            s.add(p)
        existing[outlet] = p
    if persist:
        s.flush()
    return {"profiles": [_profile(existing[o]) for o in sorted(outlets)]}


def save_profiles(s, items, actor):
    current = {p["outlet"] for p in profiles(s)["profiles"]}
    if len({x["outlet"] for x in items}) != len(items):
        raise WorkflowError("Choose each outlet only once")
    if any(x["outlet"] not in current for x in items):
        raise WorkflowError("Unknown outlet: choose an outlet from the reconciled results")
    if any(len(x.get("city", "")) > 100 or len(x.get("region", "")) > 100 for x in items):
        raise WorkflowError("City and region must be at most 100 characters")
    for item in items:
        p = s.get(OutletProfile, item["outlet"])
        p.city, p.region = item.get("city", "").strip(), item.get("region", "").strip()
        p.updated_by, p.updated_at = actor, now()
        state.audit(
            s,
            actor,
            "Saved outlet profile",
            p.outlet,
            json.dumps({"city": p.city, "region": p.region}, ensure_ascii=False),
        )
    s.flush()
    return profiles(s)


def _all_rates(s, scope):
    first = analysis.rates(s, scope, period="all", outlet=True, limit=1000)
    rows = list(first["rows"])
    while len(rows) < first["total"]:
        rows.extend(
            analysis.rates(s, scope, period="all", outlet=True, offset=len(rows), limit=1000)[
                "rows"
            ]
        )
    return rows, first["unassigned"]


def _period(f, data_dates, available_dates=None):
    name = f.get("period", "")
    if name and (f.get("date_from") or f.get("date_to")):
        raise WorkflowError("Choose a relative period or explicit dates, not both")
    if name:
        try:
            period = core.resolve_period(name, _today(), data_dates)
        except ValueError as exc:
            raise WorkflowError(str(exc)) from exc
    else:
        available_dates = available_dates or data_dates
        start = f.get("date_from") or (
            min(available_dates) if available_dates else f.get("date_to")
        )
        end = f.get("date_to") or (max(available_dates) if available_dates else start)
        # A future/lapsed open-ended filter has no data; retain the selected bound.
        if start and end and start > end:
            if f.get("date_from") and not f.get("date_to"):
                end = start
            elif f.get("date_to") and not f.get("date_from"):
                start = end
        analysis.scope_of({"date_from": start, "date_to": end})
        period = {
            "from": start,
            "to": end,
            "label": "Selected dates" if f.get("date_from") or f.get("date_to") else "All dates",
        }
    start, end = period["from"], period["to"]
    covered = sorted(
        d for d in set(data_dates) if (not start or d >= start) and (not end or d <= end)
    )
    days = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1 if start and end else 0
    return {
        **period,
        "days": days,
        "coverage": len(covered) / days if days else 0,
        "data_from": covered[0] if covered else None,
        "data_to": covered[-1] if covered else None,
        "data_dates": covered,
    }


def _context(s, f):
    tables, _, internal = _need(s)
    f = {k: v for k, v in (f or {}).items() if v}
    analysis.scope_of({k: f[k] for k in ("date_from", "date_to", "outlet") if k in f})
    profile_rows = profiles(s, persist=False)["profiles"]
    allowed = {
        p["outlet"]
        for p in profile_rows
        if all(not f.get(k) or p[k] == f[k] for k in ("outlet", "city", "region"))
    }
    records = [reconciliation.public(r, tables) for r in internal]
    dates = {
        r["day"] for r in records if r["pos"] is not None and r["day"] and r["outlet"] in allowed
    }
    location_filter = any(f.get(k) for k in ("outlet", "city", "region"))
    available_dates = {
        r["day"]
        for r in records
        if r["day"] and (r["outlet"] in allowed or (not r["outlet"] and not location_filter))
    }
    period = _period(f, dates, available_dates)
    scope = {"date_from": period["from"], "date_to": period["to"], "outlet": f.get("outlet", "")}
    rates, unassigned = _all_rates(s, scope)
    rates = [r for r in rates if r["outlet"] in allowed]
    if location_filter:
        unassigned = {"credits": 0, "amount": 0}
    selected = [
        r
        for r in records
        if r["outlet"] in allowed
        and (not period["from"] or r["day"] >= period["from"])
        and (not period["to"] or r["day"] <= period["to"])
    ]
    promos = defaultdict(list)
    for r in selected:
        if r["stl"] is not None and r["stl"].get("promo_amount") not in (None, ""):
            promos[r["outlet"]].append(float(r["stl"]["promo_amount"]))
    for r in rates:
        r.update(
            period=period,
            date_from=period["from"],
            date_to=period["to"],
            promo_provider=sum(promos[r["outlet"]]) if r["outlet"] in promos else None,
        )
    events, _ = reconciliation._gap_events(internal, internal, tables)
    gaps = _gap_items(records, selected, events)
    rows = core.quadrants(core.outlet_rows(rates, gaps, profile_rows))
    return rows, gaps, period, unassigned, records, allowed


def _gap_items(everything, selected, events):
    """Aggregate complete evidence once, with no per-day database revalidation.

    Payout-level gaps occur once per bank credit. Allocate those over its full
    settlement group before selecting outlet/day. Affected rupiah use absolute
    nett weights so refunds cannot inflate a non-negative gap. Signed bank-money
    allocation stays in the existing rates service.
    """
    grouped = {(r["outlet"], r["day"]): {} for r in selected}
    banks = defaultdict(list)
    bank_events = {}
    selected_ids = {r["i"] for r in selected}
    for r in everything:
        if r["bank_i"] is not None and r["stl"] is not None:
            banks[r["bank_i"]].append(r)
    for kind, amount, r, note in events:
        if kind in BANK_GAPS:
            bank_events[r["bank"]] = (kind, abs(amount))
        elif kind != "credit_no_settlement" and r["i"] in selected_ids:
            bucket = grouped[r["outlet"], r["day"]].setdefault(
                kind,
                {
                    "kind": kind,
                    "outlet": r["outlet"],
                    "day": r["day"],
                    "amount": 0,
                    "explained": reconciliation.GAP_KINDS[kind][1],
                    "note": note,
                },
            )
            bucket["amount"] += abs(amount)
    items = [bucket for group in grouped.values() for bucket in group.values()]
    for bank, group in banks.items():
        event = bank_events.get(bank)
        if event is None:
            continue
        kind, amount = event
        included = [r for r in group if r["i"] in selected_ids]
        nett = sum(abs(float(r["stl"].get("nett_amount") or 0)) for r in group)
        weights = defaultdict(float)
        for r in included:
            weights[r["outlet"], r["day"]] += (
                abs(float(r["stl"].get("nett_amount") or 0)) if nett else 1
            )
        for (outlet, day), weight in weights.items():
            items.append(
                {
                    "kind": kind,
                    "outlet": outlet,
                    "day": day,
                    "amount": amount * weight / (nett or len(group)),
                    "explained": reconciliation.GAP_KINDS[kind][1],
                    "note": "",
                }
            )
    return items


@analysis.cached
def outlets(s, f=None):
    rows, _, period, unassigned, _, _ = _context(s, f)
    totals = {key: sum(r[key] for r in rows) for key in SUM_FIELDS}
    promos = [r["promo_provider"] for r in rows if r["promo_provider"] is not None]
    totals["promo_provider"] = sum(promos) if promos else None
    gross, orders = totals["gross_sales"], totals["orders"]
    totals.update(
        avg_ticket=gross / orders if orders else None,
        deduction_rate=totals["deduction"] / gross if gross else None,
        keep_rate=totals["bank_received"] / gross if gross else None,
        keep_rate_expected=(totals["nett_settled"] - totals["fees"]) / gross if gross else None,
        match_rate=sum((r["match_rate"] or 0) * r["orders"] for r in rows) / orders
        if orders
        else None,
    )
    medians = {
        k: median([r[k] for r in rows if r[k] is not None])
        if any(r[k] is not None for r in rows)
        else None
        for k in ("gross_sales", "keep_rate")
    }
    return {
        "period": period,
        "totals": totals,
        "medians": medians,
        "rows": sorted(
            rows, key=lambda r: (r["keep_rate"] is None, r["keep_rate"] or 0, r["outlet"])
        ),
        "unassigned": unassigned,
    }


@analysis.cached
def anomalies(s, f=None):
    rows, gaps, period, _, records, allowed = _context(s, f)
    counts = defaultdict(int)
    for r in records:
        if r["outlet"] in allowed and r["pos"] is not None and r["day"]:
            counts[r["outlet"], r["day"]] += 1
    daily = [
        {
            "outlet": outlet,
            "day": day,
            "orders": orders,
            "in_scope": (not period["from"] or day >= period["from"])
            and (not period["to"] or day <= period["to"]),
        }
        for (outlet, day), orders in counts.items()
    ]
    found, skipped = core.anomalies(rows, gaps, daily)
    return {"anomalies": found, "skipped": skipped}
