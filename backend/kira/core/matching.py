"""Deterministic two-stage reconciliation of cleaned tables (docs/09, section 4)."""

import csv
import io
import math
import re
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
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


def money(value):
    """Missing or invalid amounts are not evidence of a zero payment."""
    try:
        result = float(value)
        return result if math.isfinite(result) and not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def sale_difference(pos, stl):
    left, right = money(pos.get("payment_amount")), money(stl.get("gross_amount"))
    difference = left - right if left is not None and right is not None else 0
    promo = num(stl.get("promo_amount"))
    return (
        "promo" if promo and abs(abs(difference) - abs(promo)) <= 1 else "sale_diff",
        difference,
    )


def payout_gaps(T, indices, credit, via=None):
    """Separate provider rounding/fees from an actual withdrawal-to-bank shortage."""
    rows = [T["settlement"]["rows"][j] for j in indices]
    nett = sum(num(r.get("nett_amount")) for r in rows)
    fees = sum(num(r.get("fee_withdrawal")) + num(r.get("fee_handling")) for r in rows)
    paid = num(T["bank"]["rows"][credit].get("kredit"))
    target = paid
    if via is not None:
        withdrawal = T["settlement"]["rows"][via]
        target = abs(
            num(
                withdrawal.get("nett_amount")
                if withdrawal.get("nett_amount") not in (None, "")
                else withdrawal.get("gross_amount")
            )
        )
        fees += (
            num(withdrawal.get("fee_withdrawal")) + num(withdrawal.get("fee_handling"))
            if any(k in withdrawal for k in ("fee_withdrawal", "fee_handling"))
            else abs(num(withdrawal.get("gross_amount")) - num(withdrawal.get("nett_amount")))
        )
    difference = nett - target
    kind = (
        "fee"
        if fees > 0 and abs(abs(difference) - fees) < 1000
        else "rounding"
        if target % 1000 == 0 and abs(difference) < 1000
        else "payout_diff"
    )
    return [(kind, difference)] + ([("payout_diff", target - paid)] if via is not None else [])


def window_description(window):
    if window == "day":
        return "Same calendar date"
    for divisor, unit in ((1440, "days"), (60, "hours")):
        if window and window % divisor == 0:
            return f"Within {window / divisor:g} {unit}"
    return f"Within {window:g} minutes"


def rule_name(rule):
    p, kind = rule["params"], rule["kind"]
    if kind == "id":
        return f"ID: {p['posCol']} = {p['stlCol']}"
    if kind == "withdrawal":
        return f"Withdrawal payout by {p.get('groupBy', 'entity_id')}"
    if kind == "composite":
        parts = (
            (["Reference"] if p.get("requireId") else [])
            + (["Outlet"] if p.get("outlet", True) else [])
            + (["method"] if p.get("method", False) else [])
            + ["amount"]
        )
        return " + ".join(parts) + ": " + window_description(p.get("window", 1))
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
            f"Bank arrives {p.get('minDays', 0):g} to {p.get('maxDays', 3):g} days after payout",
        ] + (["Store ID appears in bank description"] if p.get("requireId", True) else [])
    if kind == "composite":
        return (
            (
                [
                    "Same reference required"
                    if p.get("requireId")
                    else "Existing references must agree"
                ]
                if p.get("posCol")
                else []
            )
            + (["Same outlet"] if p.get("outlet", True) else [])
            + (["Same payment method"] if p.get("method") else [])
            + [
                f"Amount tolerance Rp {p.get('amountTol', 0):g}",
                window_description(p.get("window", 1)),
            ]
        )
    return [rule_name(rule), f"Amount tolerance Rp {p.get('amountTol', 0):g}"] + (
        [f"Bank delay {p.get('minDays', 0):g} to {p['maxDays']:g} days"] if "maxDays" in p else []
    )


def run_l1(rules, T):
    pos, stl = T["pos"]["rows"], T["settlement"]["rows"]
    available = {i for i, r in enumerate(stl) if is_sale(r)}
    used, links, hits, ambiguous = set(), [], {}, set()
    rules = [r for r in rules if r["params"].get("enabled", True)]
    for rule in rules:
        rid, p = rule.get("id", "draft"), rule["params"]
        hits[rid] = 0
        by_id, amounts = defaultdict(list), defaultdict(list)
        info = {}
        for j in sorted(available):
            if rule["kind"] == "id":
                key = text_id(stl[j].get(p["stlCol"]))
                if key:
                    by_id[key].append(j)
            else:
                amount = money(stl[j].get(p.get("stlAmount", "gross_amount")))
                if amount is not None:
                    amounts[amount].append(j)
                date = stl[j].get(p.get("stlDate", "transaction_date"))
                info[j] = (
                    amount,
                    ts(date),
                    day(date),
                    norm_branch(stl[j].get("branch")),
                    text_id(stl[j].get("payment_method")).lower(),
                )
                if p.get("stlCol"):
                    by_id[text_id(stl[j].get(p["stlCol"]))].append(j)
        ordered = sorted(amounts)
        candidates = {}
        for i, row in enumerate(pos):
            if i in used:
                continue
            if rule["kind"] == "id":
                candidates[i] = by_id.get(text_id(row.get(p["posCol"])), [])
                continue
            date = row.get(p.get("posDate", "sales_datetime_out"))
            pt, amount = ts(date), money(row.get(p.get("posAmount", "payment_amount")))
            if pt is None or amount is None:
                continue
            branch, tol = norm_branch(row.get("branch")), p.get("amountTol", 0)
            if p.get("outlet", True) and not branch:
                continue
            nearby = ordered[
                bisect_left(ordered, amount - tol) : bisect_right(ordered, amount + tol)
            ]
            left_ref = text_id(row.get(p.get("posCol", "")))
            if p.get("requireId") and not left_ref:
                continue
            pool = (
                by_id[left_ref] + ([] if p.get("requireId") else by_id[""])
                if p.get("stlCol") and left_ref
                else (j for a in nearby for j in amounts[a])
            )
            choices = []
            for j in pool:
                sale = stl[j]
                st_amount, st, st_date, st_branch, st_method = info[j]
                if (
                    st is None
                    or st_amount is None
                    or abs(amount - st_amount) > tol
                    or p.get("outlet", True)
                    and branch != st_branch
                ):
                    continue
                if p.get("method"):
                    left, right = text_id(row.get("payment_method")).lower(), st_method
                    if not left or left != right:
                        continue
                if p.get("posCol") and p.get("stlCol"):
                    left, right = text_id(row.get(p["posCol"])), text_id(sale.get(p["stlCol"]))
                    # Optional references may be missing; conflicting references are never ignored.
                    if (
                        left
                        and right
                        and left != right
                        or p.get("requireId")
                        and not (left and right)
                    ):
                        continue
                window = p.get("window", 1)
                if day(date) == day(st_date) if window == "day" else abs(st - pt) <= window * 60:
                    choices.append(j)
            candidates[i] = choices
        owners = Counter(j for choices in candidates.values() for j in choices)
        for i, choices in candidates.items():
            if len(choices) == 1 and owners[choices[0]] == 1:
                j = choices[0]
                used.add(i)
                available.remove(j)
                ambiguous.discard(i)
                links.append({"rule": rid, "left": [i], "right": [j], "review": False})
                hits[rid] += 1
            elif choices:
                ambiguous.add(i)
    return {
        "stage": "l1",
        "rules": [r.get("id", "draft") for r in rules],
        "links": links,
        "matched": len(used),
        "total": len(pos),
        "unmatched_left": len(pos) - len(used),
        "unmatched_right": len(available),
        "hits": hits,
        "ambiguous": sorted(ambiguous),
        "batches": 0,
    }


def run_l2(rules, T):
    stl, bank = T["settlement"]["rows"], T["bank"]["rows"]
    sales = {i for i, r in enumerate(stl) if is_sale(r)}
    unused = {i for i, r in enumerate(bank) if num(r.get("kredit")) > 0}
    used, links, hits, ambiguous = set(), [], {}, set()
    rules = [r for r in rules if r["params"].get("enabled", True)]
    for rule in rules:
        rid, kind, p = rule.get("id", "draft"), rule["kind"], rule["params"]
        hits[rid] = 0
        sources = []
        if kind in ("withdrawal", "batch"):
            group_col = p.get("groupBy", "entity_id" if kind == "withdrawal" else "merchant_id")
            groups = defaultdict(list)
            for j in sorted(sales):
                value = text_id(stl[j].get(group_col))
                date = day(
                    stl[j].get("transaction_date" if kind == "withdrawal" else "settled_date")
                )
                if value and date:
                    groups[(value, date)].append(j)
            if kind == "withdrawal":
                for via, row in enumerate(stl):
                    if not is_withdrawal(row):
                        continue
                    value, date = text_id(row.get(group_col)), day(row.get("transaction_date"))
                    indices = groups.get((value, date), [])
                    amount = money(
                        row.get("nett_amount")
                        if row.get("nett_amount") not in (None, "")
                        else row.get("gross_amount")
                    )
                    sources.append(
                        (
                            indices,
                            via,
                            value[-5:],
                            date,
                            abs(amount) if amount is not None else None,
                        )
                    )
            else:
                sources = [
                    (
                        indices,
                        None,
                        value,
                        date,
                        sum(num(stl[j].get("nett_amount")) for j in indices),
                    )
                    for (value, date), indices in groups.items()
                ]
        else:
            sources = [
                (
                    [j],
                    None,
                    text_id(stl[j].get("reference")),
                    day(stl[j].get("transaction_date") or stl[j].get("settled_date")),
                    money(stl[j].get("nett_amount")),
                )
                for j in sorted(sales - used)
            ]
        references = {text_id(stl[j].get("reference")).lower() for j in sales} - {""}
        store_ids = (
            {source[2].lower() for source in sources if source[2]}
            if kind in ("withdrawal", "batch")
            else set()
        )
        candidates = {}
        for n, (indices, via, needle, date, amount) in enumerate(sources):
            # Never apply a full payout to a group partly consumed by an earlier rule.
            if not indices or used.intersection(indices) or amount is None or amount <= 0:
                continue
            choices = []
            for b in sorted(unused):
                credit = bank[b]
                if abs(num(credit.get("kredit")) - amount) > p.get("amountTol", 0):
                    continue
                description = str(credit.get("keterangan", "")).lower()
                require_id = (
                    kind == "ref" or kind in ("withdrawal", "batch") and p.get("requireId", True)
                )
                if require_id and (not needle or needle.lower() not in description):
                    continue
                if (
                    store_ids
                    and needle.lower() not in description
                    and any(store in description for store in store_ids)
                ):
                    # Turning off the required ID allows missing evidence, not a different store.
                    continue
                if kind == "amount" and any(ref in description for ref in references):
                    continue
                if kind == "withdrawal" or "maxDays" in p:
                    bt, wt = ts(day(credit.get("tanggal_transaksi"))), ts(date)
                    if (
                        bt is None
                        or wt is None
                        or not p.get("minDays", 0) <= (bt - wt) / 86400 <= p.get("maxDays", 3)
                    ):
                        continue
                choices.append(b)
            candidates[n] = choices
        owners = Counter(b for choices in candidates.values() for b in choices)
        row_owners = Counter(
            j for n, choices in candidates.items() if choices for j in sources[n][0]
        )
        for n, choices in candidates.items():
            indices, via, _, _, _ = sources[n]
            if (
                len(choices) == 1
                and owners[choices[0]] == 1
                and all(row_owners[j] == 1 for j in indices)
            ):
                b = choices[0]
                links.append(
                    {
                        "rule": rid,
                        "left": indices,
                        "right": [b],
                        "via": via,
                        "review": kind == "amount",
                    }
                )
                used.update(indices)
                ambiguous.difference_update(indices)
                unused.remove(b)
                hits[rid] += len(indices)
            elif choices:
                ambiguous.update(indices)
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

    def already_saved(kind, params):
        defaults = {"minDays": 0} if stage == "l2" else {}
        return any(
            r["kind"] == kind
            and defaults | {k: v for k, v in r["params"].items() if k != "enabled"}
            == defaults | params
            for r in saved
        )

    def offer(kind, params, why):
        if not already_saved(kind, params):
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
            if not probe["matched"]:
                # Covered rows still provide evidence for an alternative rule.
                remaining = T
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
        if alone["matched"] or extra:
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
    if stage == "l2" and not output and not already_saved("amount", {"amountTol": 0}):
        candidate = {
            "stage": stage,
            "kind": "amount",
            "params": {"amountTol": 0},
            "why": "Amount-only links require review.",
        }
        alone = run_l2([candidate], T)
        extra = run_l2(saved + [candidate], T)["matched"] - baseline
        if alone["matched"] or extra:
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

    def record(j, link=None, payout_diff=False):
        pair = by_stl.get(j)
        p = pair["left"][0] if pair else None
        review = bool(link and link.get("review")) or j in r2.get("ambiguous", [])
        reason = (
            ("Matched by amount only" if link else "Several possible credits")
            if review
            else ("No POS sale" if p is None else ("" if link else "No approved bank link"))
        )
        if p is not None:
            kind, difference = sale_difference(pos[p], stl[j])
            if kind == "sale_diff" and abs(difference) >= 0.5:
                reason, review = "Sale and settlement amounts differ", False
            elif payout_diff:
                reason, review = "Bank payout amount differs", False
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
        payout_diff = any(
            kind == "payout_diff" and abs(amount) >= 0.5
            for kind, amount in payout_gaps(T, link["left"], b, link.get("via"))
        )
        groups.append(
            {
                "bank": b,
                "via": link.get("via"),
                "label": str(bank[b].get("keterangan", "Bank credit")),
                "rows": [record(j, link, payout_diff) for j in link["left"]],
            }
        )
    pending = [record(j) for j, row in enumerate(stl) if is_sale(row) and j not in used_stl]
    if pending:
        groups.append(
            {"bank": None, "via": None, "label": "No approved bank link", "rows": pending}
        )
    pending = [
        {
            "pos": i,
            "stl": None,
            "status": "Needs review" if i in r1.get("ambiguous", []) else "Mismatched",
            "reason": "Several possible settlements"
            if i in r1.get("ambiguous", [])
            else "No settlement",
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
        "linked": sum(
            r["pos"] is not None and r["stl"] is not None
            for g in groups
            if g["bank"] is not None
            for r in g["rows"]
        ),
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
