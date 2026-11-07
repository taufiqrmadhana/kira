"""Evidence, rates and money differences over the latest complete matching run."""

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import date, timedelta

from kira.core.matching import (
    day,
    is_sale,
    is_withdrawal,
    num,
    payout_gaps,
    sale_difference,
    text_id,
    ts,
)

STATUS_KEY = {"Matched": "matched", "Needs review": "review", "Mismatched": "mismatched"}
STATUSES = list(STATUS_KEY)
STAGE_TABLES = {"l1": ("pos", "settlement"), "l2": ("settlement", "bank")}
SIDE_STATUSES = ("Linked", "Review", "Not found")
RATE_SUMS = (
    "pos",
    "pos_linked",
    "full",
    "stl",
    "stl_pos",
    "stl_bank",
    "bank",
    "bank_linked",
    "pos_amount",
    "pos_nett",
    "stl_gross",
    "stl_mdr",
    "stl_nett",
    "bank_credit",
)
RATES = {
    "r_pos_stl": ("pos_linked", "pos"),
    "r_stl_pos": ("stl_pos", "stl"),
    "r_stl_bank": ("stl_bank", "stl"),
    "r_bank_stl": ("bank_linked", "bank"),
    "r_full": ("full", "pos"),
}
GAP_KINDS = {
    "rounding": ("Bank credit rounded to the nearest Rp 1.000", True),
    "fee": ("Withdrawal or handling fee taken from the payout", True),
    "promo": ("Sale and settlement differ by the promo amount", True),
    "payout_diff": ("Payout amounts differ", False),
    "accepted_payout_diff": ("Payout difference accepted by force match", True),
    "sale_diff": ("Sale and settlement amounts differ", False),
    "not_in_bank": ("Settlement without an approved bank link", False),
    "credit_no_settlement": ("Bank credit with no settlement", False),
    "pos_no_settlement": ("POS sale with no settlement", False),
    "stl_no_pos": ("Settlement with no POS sale", False),
}


def row_print(row):
    values = {k: v for k, v in row.items() if not k.startswith("__")}
    return hashlib.sha256(
        json.dumps(values, sort_keys=True, ensure_ascii=False, default=str).encode()
    ).hexdigest()


def record_id(pos, stl, bank):
    if pos is not None:
        return "pos:" + str(pos.get("sales_number") or pos.get("id") or row_print(pos))
    if stl is not None:
        return "stl:" + str(stl.get("reference") or stl.get("id") or row_print(stl))
    return "bank:" + row_print(bank or {})


def source(rec, T, name):
    i = rec.get("stl" if name == "settlement" else name)
    return T[name]["rows"][i] if i is not None else None


def records(T, F):
    output = []
    for g, group in enumerate(F["groups"]):
        nett = sum(
            num(T["settlement"]["rows"][r["stl"]].get("nett_amount"))
            for r in group["rows"]
            if r["stl"] is not None
        )
        for row in group["rows"]:
            r = {**row, "bank": group["bank"]}
            pos, stl, bank = (source(r, T, area) for area in ("pos", "settlement", "bank"))
            p, s, b = pos or {}, stl or {}, bank or {}
            key = (
                p.get("sales_number")
                or p.get("id")
                or s.get("reference")
                or s.get("id")
                or b.get("id")
                or row_print(b)
            )
            output.append(
                {
                    **r,
                    "i": len(output),
                    "g": g,
                    "via": group.get("via"),
                    "force_match": group.get("force_match"),
                    "label": group["label"],
                    "group_size": len(group["rows"]),
                    "group_nett": nett if group["bank"] is not None else None,
                    "key": str(key),
                    "rid": record_id(pos, stl, bank),
                    "day": day(
                        p.get("sales_datetime_out")
                        or p.get("sales_date")
                        or s.get("transaction_date")
                        or s.get("settled_date")
                        or b.get("tanggal_transaksi")
                    ),
                    "outlet": p.get("branch") or s.get("branch") or "",
                    "provider": p.get("payment_method_ori")
                    or p.get("payment_method")
                    or s.get("payment_method")
                    or "",
                    "amount": num(
                        p.get("payment_amount")
                        if pos is not None
                        else s.get("gross_amount")
                        if stl is not None
                        else b.get("kredit")
                    ),
                }
            )
    return output


def clean_filters(f):
    return {k: v for k, v in (f or {}).items() if v is not None and v != ""}


def split(value):
    return {
        str(v).strip()
        for v in (value.split(",") if isinstance(value, str) else value or [])
        if str(v).strip()
    }


def has_key(rec, keys, T):
    p, s = source(rec, T, "pos") or {}, source(rec, T, "settlement") or {}
    return bool(
        set(keys)
        & {
            str(v)
            for v in (
                rec["key"],
                rec["rid"],
                p.get("sales_number"),
                p.get("trace_number"),
                s.get("reference"),
                s.get("external_reference_id"),
            )
            if v
        }
    )


def matches(rec, f, T):
    if (
        f.get("date_from")
        and rec["day"] < f["date_from"]
        or f.get("date_to")
        and rec["day"] > f["date_to"]
    ):
        return False
    for key in ("outlet", "provider", "reason"):
        expected = f.get(key)
        if key == "reason" and expected == "Not in bank yet":
            expected = "No approved bank link"
        if expected and rec[key] != expected:
            return False
    statuses = split(f.get("status"))
    if (
        statuses
        and rec["status"] not in statuses
        and not ("open" in statuses and rec["status"] != "Matched")
    ):
        return False
    if (
        f.get("amount_min") is not None
        and rec["amount"] < f["amount_min"]
        or f.get("amount_max") is not None
        and rec["amount"] > f["amount_max"]
    ):
        return False
    if f.get("keys") and not has_key(rec, split(f["keys"]), T):
        return False
    if f.get("ids") and not ({str(rec["i"]), rec["rid"]} & split(f["ids"])):
        return False
    if f.get("q"):
        blob = json.dumps(
            [rec, *(source(rec, T, a) for a in ("pos", "settlement", "bank"))], ensure_ascii=False
        ).casefold()
        if str(f["q"]).casefold() not in blob:
            return False
    return True


def select_records(recs, f, T):
    f = clean_filters(f)
    return [r for r in recs if matches(r, f, T)]


def bank_only(r):
    return r["pos"] is None and r["stl"] is None and r["bank"] is not None


def unassigned(recs, T):
    indices = {r["bank"] for r in recs if bank_only(r)}
    return {
        "credits": len(indices),
        "amount": sum(num(T["bank"]["rows"][i].get("kredit")) for i in indices),
    }


def _bucket(recs):
    p = [r for r in recs if r["pos"] is not None]
    return {
        "pos": len(p),
        **{key: sum(r["status"] == status for r in p) for status, key in STATUS_KEY.items()},
        "amount": sum(r["amount"] for r in p),
        "matched_amount": sum(r["amount"] for r in p if r["status"] == "Matched"),
        "open": sum(r["pos"] is None for r in recs),
    }


def aggregate(recs, T):
    assigned = [r for r in recs if not bank_only(r)]
    outlets = sorted({r["outlet"] for r in assigned})
    days = sorted({r["day"] for r in assigned})
    credits = {r["bank"] for r in recs if r["bank"] is not None and r["stl"] is not None}
    total = {
        **_bucket(recs),
        "records": len(recs),
        "by_status": dict.fromkeys(STATUSES, 0) | dict(Counter(r["status"] for r in recs)),
        "stl": sum(r["stl"] is not None for r in recs),
        "stl_to_bank": sum(r["stl"] is not None and r["bank"] is not None for r in recs),
        "credits_linked": len(credits),
        "cash": sum(num(T["bank"]["rows"][b].get("kredit")) for b in credits),
    }
    return {
        "totals": total,
        "outlets_total": _bucket(assigned),
        "unassigned": unassigned(recs, T),
        "by_day": {d: _bucket([r for r in assigned if r["day"] == d]) for d in days},
        "by_outlet": {o: _bucket([r for r in assigned if r["outlet"] == o]) for o in outlets},
        "cells": {
            o: {
                d: _bucket([r for r in assigned if r["outlet"] == o and r["day"] == d])
                for d in days
            }
            for o in outlets
        },
        "days": days,
        "outlets": outlets,
    }


def facets(recs):
    return {
        "days": sorted({r["day"] for r in recs if r["day"]}),
        "outlets": sorted({r["outlet"] for r in recs if r["outlet"]}),
        "providers": sorted({r["provider"] for r in recs if r["provider"]}),
        "reasons": dict(Counter(r["reason"] for r in recs if r["reason"])),
    }


def sort_rows(rows, field, desc=False, value=None):
    if not field:
        return list(rows)
    value = value or (lambda row: row.get(field))
    filled = [r for r in rows if value(r) is not None and value(r) != ""]
    empty = [r for r in rows if value(r) is None or value(r) == ""]

    def key(r):
        v = value(r)
        return (0, v) if isinstance(v, (int, float)) else (1, str(v).casefold())

    return sorted(filled, key=key, reverse=desc) + empty


def sort_records(recs, field, desc, T):
    def value(r):
        if field and "." in field:
            area, col = field.split(".", 1)
            area = {"stl": "settlement", "mutation": "bank"}.get(area, area)
            return (source(r, T, area) or {}).get(col) if area in T else None
        return r.get(field)

    return sort_rows(recs, field, desc, value)


def public(rec, T):
    return {
        **{k: v for k, v in rec.items() if k not in ("bank", "via")},
        "pos": source(rec, T, "pos"),
        "stl": source(rec, T, "settlement"),
        "bank_i": rec["bank"],
    }


def allocate(recs, T):
    groups = defaultdict(list)
    for r in recs:
        if r["bank"] is not None and r["stl"] is not None:
            groups[r["bank"]].append(r)
    alloc = {}
    for b, group in groups.items():
        total = sum(num(source(r, T, "settlement").get("nett_amount")) for r in group)
        credit = num(T["bank"]["rows"][b].get("kredit"))
        used = 0
        for i, r in enumerate(group):
            share = (
                credit * num(source(r, T, "settlement").get("nett_amount")) / total
                if total
                else credit / len(group)
            )
            alloc[r["i"]] = credit - used if i == len(group) - 1 else share
            used += alloc[r["i"]]
    return alloc


def period_of(value, by):
    if by == "all":
        return ""
    if by == "month":
        return value[:7]
    if by == "week" and value:
        parsed = date.fromisoformat(value)
        return (parsed - timedelta(days=parsed.weekday())).isoformat()
    return value


def _finish(x):
    x.update({key: x[a] / x[b] * 100 if x[b] else None for key, (a, b) in RATES.items()})
    x.update(gap_sale=x["pos_amount"] - x["stl_gross"], gap_payout=x["stl_nett"] - x["bank_credit"])
    return x


def _rate(recs, T, alloc):
    x = dict.fromkeys(RATE_SUMS, 0)
    banks = set()
    for r in recs:
        p, s = source(r, T, "pos"), source(r, T, "settlement")
        if p is not None:
            x["pos"] += 1
            x["pos_linked"] += s is not None
            x["full"] += r["status"] == "Matched"
            x["pos_amount"] += num(p.get("payment_amount"))
            x["pos_nett"] += num(
                p.get("nett_after_mdr")
                if p.get("nett_after_mdr") is not None
                else num(p.get("payment_amount")) - num(p.get("mdr"))
            )
        if s is not None:
            x["stl"] += 1
            x["stl_pos"] += p is not None
            x["stl_bank"] += r["bank"] is not None
            x["stl_gross"] += num(s.get("gross_amount"))
            x["stl_mdr"] += num(s.get("mdr_amount", s.get("fee_mdr")))
            x["stl_nett"] += num(s.get("nett_amount"))
            x["bank_credit"] += alloc.get(r["i"], 0)
            if r["bank"] is not None:
                banks.add(r["bank"])
    x["bank"] = x["bank_linked"] = len(banks)
    return _finish(x)


def rate_rows(recs, T, alloc, period="day", outlet=True, provider=False):
    groups = defaultdict(list)
    assigned = [r for r in recs if not bank_only(r)]
    for r in assigned:
        groups[
            (
                period_of(r["day"], period),
                r["outlet"] if outlet else "",
                r["provider"] if provider else "",
            )
        ].append(r)
    rows = [
        {"period": p, "outlet": o, "provider": v, **_rate(group, T, alloc)}
        for (p, o, v), group in groups.items()
    ]
    rows.sort(key=lambda r: (r["outlet"], r["provider"]))
    rows.sort(key=lambda r: r["period"], reverse=True)
    return rows, _rate(assigned, T, alloc)


def rate_total(rows, recs, T, alloc, period, outlet, provider):
    keys = {(r["period"], r["outlet"], r["provider"]) for r in rows}
    return _rate(
        [
            r
            for r in recs
            if not bank_only(r)
            and (
                period_of(r["day"], period),
                r["outlet"] if outlet else "",
                r["provider"] if provider else "",
            )
            in keys
        ],
        T,
        alloc,
    )


def below_100(row):
    return any(row[k] is not None and row[k] < 100 for k in RATES)


def side_rows(recs, table, stage):
    output, seen = [], set()
    key = "stl" if table == "settlement" else table
    for r in recs:
        n = r[key]
        if n is None or n in seen:
            continue
        seen.add(n)
        linked = (
            r["pos"] is not None and r["stl"] is not None
            if stage == "l1"
            else r["stl"] is not None and r["bank"] is not None
        )
        rule = r["r1"] if stage == "l1" else r["r2"]
        link = (
            f"M1-{r['pos'] + 1:04d}"
            if stage == "l1" and linked
            else f"M2-{r['bank'] + 1:04d}"
            if linked
            else ""
        )
        row = {
            "n": n,
            "rec": r["i"],
            "key": r["key"],
            "day": r["day"],
            "outlet": r["outlet"],
            "rule": rule,
            "link": link,
            "status": "Review"
            if linked and r["status"] == "Needs review"
            else "Linked"
            if linked
            else "Not found",
        }
        if table == "bank":
            row["pays"] = r["group_size"] if linked else 0
        output.append(row)
    return output


def side_aggregates(rows, T, table):
    output = {}
    for col in T[table].get("columns", []):
        if not isinstance(col, dict) or col.get("type") != "number":
            continue
        name = col["name"]
        values = [T[table]["rows"][r["n"]].get(name) for r in rows]
        values = [num(v) for v in values if v not in (None, "")]
        output[name] = {
            "sum": sum(values),
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "count": len(values),
        }
    return output


def _evidence_amount(value):
    try:
        amount = float(value)
        return amount if math.isfinite(amount) and not isinstance(value, bool) else None
    except (ValueError, TypeError):
        return None


def payout_comparison(scoped, everything, T, min_days=0, max_days=3):
    """Show possible payout evidence without creating or changing a bank link."""
    settlements = T["settlement"]["rows"]
    selected = {r["stl"] for r in scoped if r["stl"] is not None}
    groups, withdrawals = defaultdict(list), defaultdict(list)
    stores = defaultdict(set)
    for n, row in enumerate(settlements):
        entity, payout_day = text_id(row.get("entity_id")), day(row.get("transaction_date"))
        key = (entity, payout_day, "" if entity else text_id(row.get("branch")) or str(n))
        if is_sale(row):
            groups[key].append(n)
            if entity:
                stores[entity[-5:].casefold()].add(entity.casefold())
        elif is_withdrawal(row):
            amount = _evidence_amount(
                row.get("nett_amount")
                if row.get("nett_amount") not in (None, "")
                else row.get("gross_amount")
            )
            withdrawals[key].append(
                {"n": n, "amount": abs(amount) if amount else None, "day": payout_day, "row": row}
            )
    used_banks = {r["bank"] for r in everything if r["stl"] is not None and r["bank"] is not None}
    used_settlements = {r["stl"] for r in everything if r["bank"] is not None}
    output = []
    for key, indices in groups.items():
        selected_count = len(selected.intersection(indices))
        if not selected_count:
            continue
        entity, payout_day, _ = key
        warnings = []
        amounts = [_evidence_amount(settlements[n].get("nett_amount")) for n in indices]
        net = sum(amounts) if all(value is not None for value in amounts) else None
        if net is None:
            warnings.append("Some settlement amounts are missing or invalid")
        withdrawal_rows = withdrawals[key]
        if not withdrawal_rows:
            warnings.append("No withdrawal row found; the bank shortage cannot be calculated")
        elif len(withdrawal_rows) > 1:
            warnings.append("Several withdrawals found; choose the payout to compare")
        if any(row["amount"] is None for row in withdrawal_rows):
            warnings.append("Some withdrawal amounts are missing or invalid")
        payout_time = ts(payout_day)
        candidates = []
        if not entity or payout_time is None:
            warnings.append("A valid entity ID and payout date are needed to find bank candidates")
        else:
            store = entity[-5:].casefold()
            # A shared suffix needs the complete ID to avoid suggesting another merchant's cash.
            needle = entity.casefold() if len(stores[store]) > 1 else store
            if len(stores[store]) > 1:
                warnings.append(
                    "Store ID suffix is shared; bank search uses the complete entity ID"
                )
            identity = re.compile(rf"(?<!\d){re.escape(needle)}(?!\d)", re.IGNORECASE)
            for bank_n, bank in enumerate(T["bank"]["rows"]):
                credit = _evidence_amount(bank.get("kredit"))
                bank_day = day(bank.get("tanggal_transaksi"))
                bank_time = ts(bank_day)
                if (
                    credit is None
                    or credit <= 0
                    or bank_time is None
                    or not identity.search(str(bank.get("keterangan", "")))
                ):
                    continue
                delay = int((bank_time - payout_time) / 86400)
                if not min_days <= delay <= max_days:
                    continue
                linked = bank_n in used_banks
                candidates.append(
                    {
                        "bank_n": bank_n,
                        "bank_credit": credit,
                        "day": bank_day,
                        "delay_days": delay,
                        "linked": linked,
                        "link": f"M2-{bank_n + 1:04d}" if linked else "",
                        "row": bank,
                        "evidence_token": row_print(
                            {
                                "settlements": [settlements[n] for n in indices],
                                "withdrawals": withdrawal_rows,
                                "bank": bank,
                            }
                        ),
                    }
                )
        output.append(
            {
                "id": "payout:" + hashlib.sha256(json.dumps(key).encode()).hexdigest()[:16],
                "entity_id": entity,
                "outlet": ", ".join(
                    sorted({text_id(settlements[n].get("branch")) for n in indices} - {""})
                ),
                "day": payout_day,
                "selected_count": selected_count,
                "group_count": len(indices),
                "settlement_indices": indices,
                "force_match_eligible": (
                    not used_settlements.intersection(indices)
                    and net is not None
                    and len(withdrawal_rows) == 1
                    and withdrawal_rows[0]["amount"] is not None
                ),
                "net_settled": net,
                "withdrawals": withdrawal_rows,
                "candidates": candidates,
                **({"warning": ". ".join(warnings) + "."} if warnings else {}),
            }
        )
    return sorted(output, key=lambda group: (group["day"], group["outlet"], group["id"]))


def _gap_events(scoped, everything, T):
    """Complete evidence before sampling, shared by aggregate and daily views."""
    events = []
    latest = max((day(r.get("tanggal_transaksi")) for r in T["bank"]["rows"]), default="")

    def add(kind, amount, r, note=""):
        if abs(amount) >= 0.5:
            events.append((kind, amount, r, note))

    by_bank = defaultdict(list)
    for r in everything:
        if r["bank"] is not None and r["stl"] is not None:
            by_bank[r["bank"]].append(r)
    checked = set()
    for r in scoped:
        p, s, b = (source(r, T, a) for a in ("pos", "settlement", "bank"))
        if s is not None and b is not None and r["bank"] not in checked:
            checked.add(r["bank"])
            group = by_bank[r["bank"]]
            for kind, difference in payout_gaps(
                T, [x["stl"] for x in group], r["bank"], r.get("via")
            ):
                approval = r.get("force_match")
                accepted = kind == "payout_diff" and approval and approval["accept_difference"]
                add(
                    "accepted_payout_diff" if accepted else kind,
                    difference,
                    r,
                    approval["note"] if accepted else "",
                )
        if s is not None and b is None:
            start, end = ts(day(s.get("settled_date") or s.get("transaction_date"))), ts(latest)
            wait = int((end - start) / 86400) if start is not None and end is not None else None
            add(
                "not_in_bank",
                num(s.get("nett_amount")),
                r,
                f"{wait} days before the latest bank date"
                if wait is not None
                else "Bank date unavailable",
            )
        if bank_only(r):
            add("credit_no_settlement", -num(b.get("kredit")), r)
        if p is not None and s is None:
            add("pos_no_settlement", num(p.get("payment_amount")), r)
        if s is not None and p is None:
            add("stl_no_pos", num(s.get("gross_amount")), r)
        if p is not None and s is not None:
            kind, difference = sale_difference(p, s)
            add(kind, difference, r)
    return events, latest


def gaps(scoped, everything, T, samples=5):
    output = {}
    events, latest = _gap_events(scoped, everything, T)
    for kind, amount, r, note in events:
        label, explained = GAP_KINDS[kind]
        bucket = output.setdefault(
            kind,
            {
                "kind": kind,
                "label": label,
                "explained": explained,
                "count": 0,
                "amount": 0,
                "net": 0,
                "samples": [],
            },
        )
        bucket["count"] += 1
        bucket["amount"] += abs(amount)
        bucket["net"] += amount
        if len(bucket["samples"]) < samples:
            bucket["samples"].append(
                {
                    "key": r["key"],
                    "outlet": r["outlet"],
                    "day": r["day"],
                    "amount": amount,
                    "note": note,
                }
            )

    kinds = list(output.values())
    return {
        "kinds": kinds,
        "explained": sum(x["amount"] for x in kinds if x["explained"]),
        "unexplained": sum(x["amount"] for x in kinds if not x["explained"]),
        "latest_bank_date": latest,
    }


def day_gaps(scoped, everything, T):
    """Money and review markers per outlet/day, without altering match verdicts.

    Payout differences belong to a whole bank group. Allocate their absolute
    amount across all linked settlements before applying filters, so selecting
    one day or outlet never repeats the whole payout difference. Unassigned
    credits retain an empty outlet instead of being attributed to a store.
    """
    days = {}
    selected = {r["i"] for r in scoped}
    for r in scoped:
        row = days.setdefault(
            (r["day"], r["outlet"]),
            {
                "day": r["day"],
                "outlet": r["outlet"],
                "to_check": 0,
                "not_in_bank": 0,
                "review": 0,
            },
        )
        row["review"] += r["status"] == "Needs review"
    banks = defaultdict(list)
    for r in everything:
        if r["bank"] is not None and r["stl"] is not None:
            banks[r["bank"]].append(r)
    events, _ = _gap_events(everything, everything, T)
    for kind, amount, r, _ in events:
        if GAP_KINDS[kind][1]:
            continue
        if kind == "payout_diff":
            group = banks[r["bank"]]
            weights = [abs(num(source(x, T, "settlement").get("nett_amount"))) for x in group]
            total = sum(weights)
            for member, weight in zip(group, weights):
                if member["i"] in selected:
                    share = weight / total if total else 1 / len(group)
                    days[member["day"], member["outlet"]]["to_check"] += abs(amount) * share
        elif r["i"] in selected:
            row = days[r["day"], r["outlet"]]
            row["to_check"] += abs(amount)
            if kind == "not_in_bank":
                row["not_in_bank"] += abs(amount)
    return {"days": [days[key] for key in sorted(days)]}


def compare(rec, T):
    p, s, b = (source(rec, T, a) or {} for a in ("pos", "settlement", "bank"))
    rows = [
        ("Outlet", p.get("branch"), s.get("branch"), None),
        ("Amount", p.get("payment_amount"), s.get("gross_amount"), None),
        ("Net settlement / bank", None, rec.get("group_nett"), b.get("kredit")),
        (
            "Date",
            day(p.get("sales_datetime_out")),
            day(s.get("transaction_date")),
            day(b.get("tanggal_transaksi")),
        ),
    ]
    result = []
    for label, pv, sv, bv in rows:
        values = [v for v in (pv, sv, bv) if v is not None and v != ""]
        result.append(
            {
                "label": label,
                "pos": pv,
                "stl": sv,
                "bank": bv,
                "status": "missing"
                if len(values) < 2
                else "info"
                if label == "Date"
                else "ok"
                if all(v == values[0] for v in values)
                else "diff",
            }
        )
    return result


def issues(rec, T):
    return ([rec["reason"]] if rec["reason"] else []) + [
        f"{x['label']} differs" for x in compare(rec, T) if x["status"] == "diff"
    ]
