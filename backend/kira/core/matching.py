"""Deterministic two-stage reconciliation of cleaned tables (docs/09, section 4)."""

import csv
import io
import math
import re
from bisect import bisect_left, bisect_right
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

STAGES = {
    "l1": {
        "title": "POS ↔ Settlement",
        "prefix": "PS",
        "left": "POS sales",
        "right": "settlement rows",
    },
    "l2": {
        "title": "Settlement ↔ Mutation",
        "prefix": "SM",
        "left": "settlement rows",
        "right": "bank credits",
    },
}
NOT_SALE = ("opening", "closing", "balance", "withdraw")


def num(value):
    try:
        result = float(value or 0)
        return result if math.isfinite(result) else 0
    except (TypeError, ValueError):
        return 0


def row_kind(row):
    return str(row.get("transaction_type") or row.get("row_type") or "").lower()


def is_sale(row):
    return not any(word in row_kind(row) for word in NOT_SALE)


def is_withdrawal(row):
    return "withdraw" in row_kind(row)


def ts(value):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone(timedelta(hours=7)))).timestamp()
    except (TypeError, ValueError):
        return None


def day(value):
    return str(value or "")[:10]


def norm_branch(value):
    return re.sub("[^a-z]", "", str(value or "").lower())


def text_id(value):
    return "" if value is None else str(value).strip()


def rule_name(rule):
    p, kind = rule["params"], rule["kind"]
    if kind == "id":
        return f"ID: {p['posCol']} = {p['stlCol']}"
    if kind == "withdrawal":
        return f"Withdrawal payout by {p.get('groupBy', 'entity_id')}"
    if kind == "composite":
        parts = (
            (["Outlet"] if p.get("outlet", True) else [])
            + (["method"] if p.get("method", False) else [])
            + ["amount"]
        )
        return (
            " + ".join(parts)
            + f" · {p.get('window', 1)}"
            + ("" if p.get("window") == "day" else " min")
        )
    return {
        "ref": "Reference + amount",
        "batch": f"Batch payout by {p.get('groupBy', 'merchant_id')}",
        "amount": "Amount only",
    }[kind]


def describe_rule(rule):
    p, kind = rule["params"], rule["kind"]
    if kind == "id":
        return [f"POS {p['posCol']} equals settlement {p['stlCol']}", "Each row is used once"]
    if kind == "withdrawal":
        return [
            f"Daily withdrawal by {p.get('groupBy', 'entity_id')}",
            f"Amount tolerance Rp {p.get('amountTol', 0):g}",
            f"Bank arrives within {p.get('maxDays', 3):g} days",
        ] + (["Store ID appears in bank description"] if p.get("requireId", True) else [])
    if kind == "composite":
        return (
            (["Same outlet"] if p.get("outlet", True) else [])
            + (["Same payment method"] if p.get("method") else [])
            + [
                f"Amount tolerance Rp {p.get('amountTol', 0):g}",
                "Same day"
                if p.get("window") == "day"
                else f"Within {p.get('window', 1):g} minutes",
            ]
        )
    return [rule_name(rule), f"Amount tolerance Rp {p.get('amountTol', 0):g}"]


def run_l1(rules, T):
    pos, stl = T["pos"]["rows"], T["settlement"]["rows"]
    available = {i for i, r in enumerate(stl) if is_sale(r)}
    used, links, hits = set(), [], {}
    for rule in rules:
        rid, p = rule.get("id", "draft"), rule["params"]
        hits[rid] = 0
        index = defaultdict(deque)
        amounts = defaultdict(list)
        settlement_times = {}
        branches = {}
        dates = {}
        if rule["kind"] == "id":
            for j in sorted(available):
                key = text_id(stl[j].get(p["stlCol"]))
                if key:
                    index[key].append(j)
        else:
            for j in sorted(available):
                amounts[num(stl[j].get("gross_amount"))].append(j)
                settlement_times[j] = ts(stl[j].get("transaction_date"))
                branches[j] = norm_branch(stl[j].get("branch"))
                dates[j] = day(stl[j].get("transaction_date"))
        ordered_amounts = sorted(amounts)
        for i, row in enumerate(pos):
            if i in used:
                continue
            candidate = None
            if rule["kind"] == "id":
                bucket = index.get(text_id(row.get(p["posCol"])))
                if bucket:
                    candidate = bucket.popleft()
            elif rule["kind"] == "composite":
                pt = ts(row.get("sales_datetime_out"))
                choices = []
                if pt is None:
                    continue
                amount, tolerance = num(row.get("payment_amount")), p.get("amountTol", 0)
                branch = norm_branch(row.get("branch"))
                window = p.get("window", 1)
                pos_day = day(row.get("sales_datetime_out"))
                if p.get("outlet", True) and not branch:
                    continue
                nearby = ordered_amounts[
                    bisect_left(ordered_amounts, amount - tolerance) : bisect_right(
                        ordered_amounts, amount + tolerance
                    )
                ]
                for j in sorted(
                    j
                    for a in nearby
                    for j in amounts[a]
                    if j in available
                    and (not p.get("outlet", True) or branch in branches[j])
                    and (window != "day" or dates[j] == pos_day)
                ):
                    sale = stl[j]
                    st = settlement_times[j]
                    if st is None:
                        continue
                    a, b = row.get("payment_method"), sale.get("payment_method")
                    if p.get("method") and a and b and str(a).lower() != str(b).lower():
                        continue
                    fits = (
                        day(row.get("sales_datetime_out")) == day(sale.get("transaction_date"))
                        if window == "day"
                        else abs(st - pt) <= window * 60
                    )
                    if fits:
                        choices.append((abs(st - pt), j))
                if choices:
                    candidate = min(choices)[1]
            if candidate is not None:
                used.add(i)
                available.remove(candidate)
                links.append({"rule": rid, "left": [i], "right": [candidate], "review": False})
                hits[rid] += 1
    return {
        "stage": "l1",
        "rules": [r.get("id", "draft") for r in rules],
        "links": links,
        "matched": len(used),
        "total": len(pos),
        "unmatched_left": len(pos) - len(used),
        "unmatched_right": len(available),
        "hits": hits,
        "ambiguous": [],
        "batches": 0,
    }


def run_l2(rules, T):
    stl, bank = T["settlement"]["rows"], T["bank"]["rows"]
    sales = {i for i, r in enumerate(stl) if is_sale(r)}
    unused = {i for i, r in enumerate(bank) if num(r.get("kredit")) > 0}
    used, links, hits, ambiguous = set(), [], {}, set()
    for rule in rules:
        rid, kind, p = rule.get("id", "draft"), rule["kind"], rule["params"]
        tol = p.get("amountTol", 0)
        hits[rid] = 0

        def link(indices, credit, via=None, review=False):
            links.append(
                {"rule": rid, "left": indices, "right": [credit], "via": via, "review": review}
            )
            used.update(indices)
            ambiguous.difference_update(indices)
            unused.remove(credit)
            hits[rid] += len(indices)

        if kind in ("withdrawal", "batch"):
            group_col = p.get("groupBy", "entity_id" if kind == "withdrawal" else "merchant_id")
            groups = defaultdict(list)
            for j in sorted(sales - used):
                value = text_id(stl[j].get(group_col))
                date = day(
                    stl[j].get("transaction_date" if kind == "withdrawal" else "settled_date")
                )
                if value and date:
                    groups[(value, date)].append(j)
            sources = (
                [(j, row) for j, row in enumerate(stl) if is_withdrawal(row)]
                if kind == "withdrawal"
                else [(None, {group_col: key, "transaction_date": date}) for key, date in groups]
            )
            for via, row in sources:
                value, date = text_id(row.get(group_col)), day(row.get("transaction_date"))
                indices = [j for j in groups.get((value, date), []) if j not in used]
                if not indices:
                    continue
                amount = (
                    abs(
                        num(
                            row.get("nett_amount")
                            if row.get("nett_amount") not in (None, "")
                            else row.get("gross_amount")
                        )
                    )
                    if kind == "withdrawal"
                    else sum(num(stl[j].get("nett_amount")) for j in indices)
                )
                for b in sorted(unused):
                    credit = bank[b]
                    if abs(num(credit.get("kredit")) - amount) > tol:
                        continue
                    needle = value[-5:] if kind == "withdrawal" else value
                    if (
                        p.get("requireId", True)
                        and needle.lower() not in str(credit.get("keterangan", "")).lower()
                    ):
                        continue
                    if kind == "withdrawal":
                        bt, wt = ts(day(credit.get("tanggal_transaksi"))), ts(date)
                        if (
                            bt is None
                            or wt is None
                            or not 0 <= (bt - wt) / 86400 <= p.get("maxDays", 3)
                        ):
                            continue
                    link(indices, b, via)
                    break
        else:
            references = {text_id(stl[j].get("reference")).lower() for j in sales} - {""}
            for j in sorted(sales - used):
                reference = text_id(stl[j].get("reference")).lower()
                candidates = []
                for b in sorted(unused):
                    description = str(bank[b].get("keterangan", "")).lower()
                    if abs(num(bank[b].get("kredit")) - num(stl[j].get("nett_amount"))) > tol:
                        continue
                    if kind == "ref" and reference and reference in description:
                        candidates.append(b)
                    elif kind == "amount" and not any(ref in description for ref in references):
                        candidates.append(b)
                if candidates and (kind == "ref" or len(candidates) == 1):
                    link([j], candidates[0], review=kind == "amount")
                elif len(candidates) > 1:
                    ambiguous.add(j)
    return {
        "stage": "l2",
        "rules": [r.get("id", "draft") for r in rules],
        "links": links,
        "matched": len(used),
        "total": len(sales),
        "unmatched_left": len(sales - used),
        "unmatched_right": len(unused),
        "hits": hits,
        "ambiguous": sorted(ambiguous),
        "batches": sum(len(x["left"]) > 1 for x in links),
    }


def run_stage(stage, rules, T):
    if stage not in STAGES:
        raise ValueError("Matching stage must be l1 or l2")
    return (run_l1 if stage == "l1" else run_l2)(rules, T)


def suggest(stage, saved, T):
    candidates = []

    def offer(kind, params, why):
        if not any(r["kind"] == kind and r["params"] == params for r in saved):
            candidates.append({"stage": stage, "kind": kind, "params": params, "why": why})

    if stage == "l1":
        pos = T["pos"]["rows"]
        stl = [r for r in T["settlement"]["rows"] if is_sale(r)]

        def ids(rows):
            result = {}
            for col in dict.fromkeys(k for r in rows for k in r):
                if col in {
                    "branch",
                    "payment_method",
                    "payment_method_ori",
                    "sales_date",
                    "settled_date",
                } or not re.search(r"id|code|number|reference|ref|no", col):
                    continue
                values = [text_id(r.get(col)) for r in rows if text_id(r.get(col))]
                if (
                    values
                    and len(set(values)) >= 0.9 * len(values)
                    and any(len(v) > 3 for v in values)
                ):
                    result[col] = set(values)
            return result

        if not any(r["kind"] == "id" for r in saved):
            pairs = [(len(a & b), x, y) for x, a in ids(pos).items() for y, b in ids(stl).items()]
            if pairs:
                count, x, y = max(pairs)
                if count and count >= 0.3 * len(pos):
                    offer(
                        "id",
                        {"posCol": x, "stlCol": y},
                        f"{count} of {len(pos)} POS sales share this exact ID.",
                    )
        midnight = stl and sum(
            str(r.get("transaction_date", ""))[10:19] in ("", "T00:00:00", " 00:00:00") for r in stl
        ) >= 0.9 * len(stl)
        if midnight:
            offer(
                "composite",
                {"outlet": True, "method": False, "amountTol": 0, "window": "day"},
                "Settlement dates have no time. Compare the same outlet, amount and day.",
            )
        else:
            previous = run_l1(saved, T)
            paired_pos = {x["left"][0] for x in previous["links"]}
            paired_stl = {x["right"][0] for x in previous["links"]}
            remaining = {
                **T,
                "pos": {"rows": [r for i, r in enumerate(pos) if i not in paired_pos]},
                "settlement": {
                    "rows": [
                        r for i, r in enumerate(T["settlement"]["rows"]) if i not in paired_stl
                    ]
                },
            }
            p = {"outlet": True, "method": False, "amountTol": 0, "window": 1440}
            probe = run_l1([{"kind": "composite", "params": p}], remaining)
            pairs = [
                (
                    remaining["pos"]["rows"][x["left"][0]],
                    remaining["settlement"]["rows"][x["right"][0]],
                )
                for x in probe["links"]
            ]
            if pairs:
                delays = [
                    abs(ts(a["sales_datetime_out"]) - ts(b["transaction_date"])) / 60
                    for a, b in pairs
                ]
                p["window"] = next(
                    (w for w in (1, 5, 15, 60) if sum(d <= w for d in delays) >= 0.9 * len(delays)),
                    60,
                )
                same = sum(
                    bool(a.get("payment_method"))
                    and str(a["payment_method"]).lower()
                    == str(b.get("payment_method") or "").lower()
                    for a, b in pairs
                )
                p["method"] = same >= 0.9 * len(pairs)
                offer("composite", p, "Nearest settlement with the same outlet and amount.")
        if saved:
            offer(
                "composite",
                {"outlet": True, "method": False, "amountTol": 1000, "window": "day"},
                "Check remaining sales with a small amount difference.",
            )
    elif stage == "l2":
        withdrawals = [r for r in T["settlement"]["rows"] if is_withdrawal(r)]
        for col in ("entity_id", "merchant_id", "partner_merchant_id", "branch"):
            values = [text_id(r.get(col)) for r in withdrawals]
            if values and all(values) and len(set(values)) > 1:
                for require in (True, False):
                    params = {"groupBy": col, "requireId": require, "amountTol": 0, "maxDays": 3}
                    if run_l2([{"kind": "withdrawal", "params": params}], T)["matched"]:
                        offer(
                            "withdrawal",
                            params,
                            f"The provider pays out by withdrawal: {len(withdrawals)} withdrawals by {col}.",
                        )
                        break
                break
        offer("ref", {"amountTol": 0}, "Bank description contains the settlement reference.")
        offer(
            "batch",
            {"groupBy": "merchant_id", "requireId": True, "amountTol": 0},
            "One credit pays a merchant's settlement batch.",
        )
    else:
        raise ValueError("Matching stage must be l1 or l2")
    baseline = run_stage(stage, saved, T)["matched"]
    output = []
    for candidate in candidates:
        alone = run_stage(stage, [candidate], T)
        extra = run_stage(stage, saved + [candidate], T)["matched"] - baseline
        if extra:
            output.append(
                {
                    **candidate,
                    "name": rule_name(candidate),
                    "conditions": describe_rule(candidate),
                    "matches_alone": alone["matched"],
                    "total": alone["total"],
                    "extra_after_saved": extra,
                }
            )
    if stage == "l2" and not output:
        candidate = {
            "stage": stage,
            "kind": "amount",
            "params": {"amountTol": 0},
            "why": "Amount-only links require review.",
        }
        alone = run_l2([candidate], T)
        extra = run_l2(saved + [candidate], T)["matched"] - baseline
        if extra:
            output.append(
                {
                    **candidate,
                    "name": rule_name(candidate),
                    "conditions": describe_rule(candidate),
                    "matches_alone": alone["matched"],
                    "total": alone["total"],
                    "extra_after_saved": extra,
                }
            )
    return output


def final_result(T, r1, r2):
    pos, stl, bank = (T[k]["rows"] for k in ("pos", "settlement", "bank"))
    by_stl = {x["right"][0]: x for x in r1["links"]}
    used_pos = {x["left"][0] for x in r1["links"]}
    used_stl, used_bank, groups = set(), set(), []

    def record(j, link=None):
        pair = by_stl.get(j)
        p = pair["left"][0] if pair else None
        review = bool(link and link.get("review")) or j in r2.get("ambiguous", [])
        reason = (
            ("Matched by amount only" if link else "Several possible credits")
            if review
            else ("No POS sale" if p is None else ("" if link else "Not in bank yet"))
        )
        return {
            "pos": p,
            "stl": j,
            "status": "Needs review" if review else ("Matched" if not reason else "Mismatched"),
            "reason": reason,
            "r1": pair["rule"] if pair else "",
            "r2": link["rule"] if link else "",
        }

    for link in r2["links"]:
        b = link["right"][0]
        used_bank.add(b)
        used_stl.update(link["left"])
        groups.append(
            {
                "bank": b,
                "via": link.get("via"),
                "label": str(bank[b].get("keterangan", "Bank credit")),
                "rows": [record(j, link) for j in link["left"]],
            }
        )
    pending = [record(j) for j, row in enumerate(stl) if is_sale(row) and j not in used_stl]
    if pending:
        groups.append({"bank": None, "via": None, "label": "No bank credit yet", "rows": pending})
    pending = [
        {
            "pos": i,
            "stl": None,
            "status": "Mismatched",
            "reason": "No settlement",
            "r1": "",
            "r2": "",
        }
        for i in range(len(pos))
        if i not in used_pos
    ]
    if pending:
        groups.append(
            {"bank": None, "via": None, "label": "POS without settlement", "rows": pending}
        )
    for b, row in enumerate(bank):
        if num(row.get("kredit")) > 0 and b not in used_bank:
            groups.append(
                {
                    "bank": b,
                    "via": None,
                    "label": str(row.get("keterangan", "Bank credit")),
                    "rows": [
                        {
                            "pos": None,
                            "stl": None,
                            "status": "Mismatched",
                            "reason": "Credit with no settlement",
                            "r1": "",
                            "r2": "",
                        }
                    ],
                }
            )
    records = [r for g in groups for r in g["rows"]]
    totals = {
        "rows": len(records),
        "matched": sum(r["status"] == "Matched" for r in records),
        "mismatched": sum(r["status"] == "Mismatched" for r in records),
        "review": sum(r["status"] == "Needs review" for r in records),
        "pos": len(pos),
        "full": sum(r["pos"] is not None and r["status"] == "Matched" for r in records),
        "l1": len(used_pos),
        "stl": sum(is_sale(r) for r in stl),
        "l2": len(used_stl),
        "credits": sum(num(r.get("kredit")) > 0 for r in bank),
        "credits_linked": len(used_bank),
        "cash": sum(num(bank[b].get("kredit")) for b in used_bank),
        "many_to_one": sum(len(x["left"]) > 1 for x in r2["links"]),
    }
    return {"totals": totals, "groups": groups}


def export_csv(T, F):
    output = io.StringIO(newline="")
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    columns = {
        area: [c["name"] if isinstance(c, dict) else c for c in table.get("columns", [])]
        or list(dict.fromkeys(k for r in table["rows"] for k in r if not k.startswith("__")))
        for area, table in T.items()
    }
    writer.writerow(
        ["status", "reason", "pos_settlement_rule", "settlement_mutation_rule"]
        + [
            f"{prefix}.{col}"
            for area, prefix in (("bank", "mutation"), ("settlement", "settlement"), ("pos", "pos"))
            for col in columns[area]
        ]
    )
    for group in F["groups"]:
        for row in group["rows"]:
            values = [row["status"], row["reason"], row["r1"], row["r2"]]
            for area, i in (
                ("bank", group["bank"]),
                ("settlement", row["stl"]),
                ("pos", row["pos"]),
            ):
                source = T[area]["rows"][i] if i is not None else {}
                values.extend(source.get(col, "") for col in columns[area])
            writer.writerow(values)
    return output.getvalue()
