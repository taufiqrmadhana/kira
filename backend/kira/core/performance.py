"""Pure outlet insights derived from reconciled rates and complete money-gap items.

Money rates are fractions; match_rate retains analysis.r_full's 0–100 units.
Unassigned bank credits belong in the service response, never in an outlet row.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import median

EXPECTED = {"rounding", "fee", "promo"}
# Jakarta uses UTC+7 without daylight saving; works on Windows without tzdata.
JAKARTA = timezone(timedelta(hours=7), "Asia/Jakarta")
REASONS = {
    "not_in_bank": "Not in bank yet",
    "pos_no_settlement": "No settlement",
    "stl_no_pos": "No POS sale",
    # Money-gap kinds are not all record reasons. Blank retains outlet/date evidence.
    "sale_diff": "",
    "payout_diff": "",
}


def seed_city(outlet):
    words = str(outlet or "").split()
    return words[-1] if words else ""


def _ratio(numerator, denominator):
    return numerator / denominator if denominator else None


def _money(value):
    return "Rp " + f"{value:,.0f}".replace(",", ".")


def _day_label(value):
    try:
        parsed = date.fromisoformat(value)
        return f"{parsed.day} {parsed.strftime('%b')}"
    except (ValueError, TypeError):
        return value or "the selected period"


def _gap_groups(gap_items, outlet, expected=False):
    groups = defaultdict(float)
    for item in gap_items:
        if item.get("outlet") != outlet or item.get("kind") == "credit_no_settlement":
            continue
        if (item.get("kind") in EXPECTED) != expected:
            continue
        groups[(item.get("kind", ""), item.get("day", ""))] += abs(item.get("amount") or 0)
    return groups


def _driver(row, gap_items):
    """Prefer the dated pending payout when pending and to-check totals tie."""
    pending, deduction, check = (
        row.get(key) or 0 for key in ("pending_bank", "deduction", "to_check")
    )
    if pending > 0 and pending >= max(deduction, check):
        groups = _gap_groups(gap_items, row["outlet"])
        payouts = [(day, amount) for (kind, day), amount in groups.items() if kind == "not_in_bank"]
        if payouts:
            day, amount = max(payouts, key=lambda pair: pair[1])
            return f"{_money(amount)} payout of {_day_label(day)} not in the bank yet"
        return f"{_money(pending)} settled but not in the bank yet"
    if check > deduction:
        return f"{_money(check)} in reconciled money gaps to check"
    return f"{_money(deduction)} deducted from gross sales, including payout fees"


def outlet_rows(rate_rows, gap_items, profiles):
    """Aggregate outlet rate rows without reallocating or matching any money.

    gap_items must contain all attributable gaps, not analysis's capped samples.
    The service may enrich rate rows with promo_provider, date bounds and period.
    """
    profile_map = profiles if isinstance(profiles, dict) else {p["outlet"]: p for p in profiles}
    grouped = defaultdict(list)
    for row in rate_rows:
        if row.get("outlet"):
            grouped[row["outlet"]].append(row)
    result = []
    for outlet, source in grouped.items():

        def total(key):
            return sum(row.get(key) or 0 for row in source)

        profile = profile_map.get(outlet, {})
        row = {
            "outlet": outlet,
            "period": source[0].get("period", ""),
            "date_from": source[0].get("date_from", ""),
            "date_to": source[0].get("date_to", ""),
            "orders": total("pos"),
            "gross_sales": total("pos_amount"),
            "provider_gross": total("stl_gross"),
            "mdr": total("stl_mdr"),
            "nett_settled": total("stl_nett"),
            "bank_received": total("bank_credit"),
            "city": profile.get("city", seed_city(outlet)),
            "region": profile.get("region", ""),
        }
        promos = [r.get("promo_provider", r.get("stl_promo")) for r in source]
        row["promo_provider"] = (
            sum(p or 0 for p in promos) if any(p is not None for p in promos) else None
        )
        items = [
            g
            for g in gap_items
            if g.get("outlet") == outlet and g.get("kind") != "credit_no_settlement"
        ]
        row["fees"] = sum(abs(g.get("amount") or 0) for g in items if g.get("kind") == "fee")
        row["pending_bank"] = sum(
            abs(g.get("amount") or 0) for g in items if g.get("kind") == "not_in_bank"
        )
        row["to_check"] = sum(
            abs(g.get("amount") or 0) for g in items if g.get("kind") not in EXPECTED
        )
        row["expected_diff"] = sum(
            abs(g.get("amount") or 0) for g in items if g.get("kind") in EXPECTED
        )
        row["deduction"] = row["gross_sales"] - row["nett_settled"] + row["fees"]
        row["avg_ticket"] = _ratio(row["gross_sales"], row["orders"])
        row["deduction_rate"] = _ratio(row["deduction"], row["gross_sales"])
        row["keep_rate"] = _ratio(row["bank_received"], row["gross_sales"])
        row["keep_rate_expected"] = _ratio(row["nett_settled"] - row["fees"], row["gross_sales"])
        matched = sum(
            r.get("full", (r.get("r_full") or 0) * (r.get("pos") or 0) / 100) for r in source
        )
        row["match_rate"] = _ratio(matched * 100, row["orders"])
        row["reason"] = _driver(row, gap_items)
        result.append(row)
    return result


def quadrants(rows):
    sales_values = [r["gross_sales"] for r in rows if r.get("gross_sales") is not None]
    keep_values = [r["keep_rate"] for r in rows if r.get("keep_rate") is not None]
    sales_median = median(sales_values) if sales_values else None
    keep_median = median(keep_values) if keep_values else None
    result = []
    for row in rows:
        quadrant = ""
        if (
            sales_median is not None
            and keep_median is not None
            and row.get("keep_rate") is not None
            and row.get("gross_sales") is not None
        ):
            sales = "a_lot" if row["gross_sales"] > sales_median else "less"
            keeps = "little" if row["keep_rate"] < keep_median else "more"
            quadrant = f"sells_{sales}_keeps_{keeps}"
        result.append(
            {**row, "quadrant": quadrant, "reason": row.get("reason") or _driver(row, [])}
        )
    return result


def _bounds(row):
    period = row.get("period", "")
    if isinstance(period, dict):
        return row.get("date_from") or period.get("from", ""), row.get("date_to") or period.get(
            "to", ""
        )
    # Analysis's all-period bucket has no calendar date.
    period = period if isinstance(period, str) and len(period) == 10 else ""
    return row.get("date_from") or period, row.get("date_to") or period


def _anomaly(row, kind, value, expected, rupiah, why, severity="low", day="", reason=""):
    start, end = _bounds(row)
    return {
        "kind": kind,
        "severity": severity,
        "outlet": row["outlet"],
        "period": {"from": day or start, "to": day or end},
        "value": value,
        "expected": expected,
        "rupiah": rupiah,
        "why": why,
        "filter": {
            "date_from": day or start,
            "date_to": day or end,
            "outlet": row["outlet"],
            "reason": reason,
        },
    }


def anomalies(rows, gap_items, daily=None):
    found, skipped = [], []
    for row in rows:
        check = row.get("to_check") or 0
        groups = _gap_groups(gap_items, row["outlet"])
        kind, day = max(groups, key=groups.get) if groups else ("", "")
        if check > 0:
            why = _driver({**row, "deduction": 0}, gap_items)
            found.append(
                _anomaly(
                    row,
                    "missing_money",
                    check,
                    0,
                    check,
                    why,
                    "high" if check > (row.get("gross_sales") or 0) * 0.005 else "low",
                    day=day if len(groups) == 1 else "",
                    reason=REASONS.get(kind, "") if len({key[0] for key in groups}) == 1 else "",
                )
            )
        match = row.get("match_rate")
        if match is not None and match < 99:
            found.append(
                _anomaly(
                    row,
                    "low_match",
                    match,
                    99,
                    check,
                    f"{match:.1f}% of orders matched end to end; expected at least 99%",
                )
            )

    comparable = [r for r in rows if r.get("deduction_rate") is not None]
    if len(comparable) < 5:
        skipped.append(
            {"kind": "high_deduction", "why": "needs at least 5 outlets with gross sales"}
        )
    else:
        center = median(r["deduction_rate"] for r in comparable)
        scale = median(abs(r["deduction_rate"] - center) for r in comparable) * 1.4826
        if not scale:
            skipped.append(
                {
                    "kind": "high_deduction",
                    "why": "MAD is zero; a robust z score cannot be calculated",
                }
            )
        else:
            for row in comparable:
                z = (row["deduction_rate"] - center) / scale
                if z > 2.5:
                    found.append(
                        _anomaly(
                            row,
                            "high_deduction",
                            row["deduction_rate"],
                            center,
                            row.get("deduction") or 0,
                            f"Deduction rate {row['deduction_rate']:.1%} exceeds the outlet median {center:.1%} (robust z {z:.2f})",
                        )
                    )

    by_outlet = defaultdict(dict)
    for item in daily or []:
        day = item.get("day") or item.get("date") or item.get("period")
        if isinstance(day, str) and day:
            by_outlet[item["outlet"]][day] = item
    insufficient = not rows
    for row in rows:
        history = by_outlet[row["outlet"]]
        start, end = _bounds(row)
        candidates = [
            (day, item)
            for day, item in history.items()
            if item.get("in_scope", True)
            and (not start or day >= start)
            and (not end or day <= end)
        ]
        if not candidates:
            insufficient = True
        for day, item in candidates:
            current = date.fromisoformat(day)
            earlier = [history.get((current - timedelta(weeks=n)).isoformat()) for n in range(1, 5)]
            earlier = [p for p in earlier if p is not None]
            if len(earlier) < 3:
                insufficient = True
                continue
            average = sum(p.get("orders", p.get("pos", 0)) for p in earlier) / len(earlier)
            orders = item.get("orders", item.get("pos", 0))
            kind = (
                "sales_drop"
                if orders < 0.6 * average
                else "sales_spike"
                if orders > 1.6 * average
                else ""
            )
            if kind:
                found.append(
                    _anomaly(
                        row,
                        kind,
                        orders,
                        average,
                        0,
                        f"{orders} orders on {_day_label(day)} versus {average:.1f} on the previous {len(earlier)} same weekdays",
                        day=day,
                    )
                )
    if insufficient:
        skipped.extend(
            {"kind": kind, "why": "needs at least 3 earlier same weekdays"}
            for kind in ("sales_drop", "sales_spike")
        )
    found.sort(key=lambda a: (a["severity"] != "high", -a["rupiah"], a["outlet"], a["kind"]))
    return found, skipped


def resolve_period(name, today, data_dates):
    """Resolve relative calendar periods in Jakarta; current periods end today."""
    if isinstance(today, datetime):
        today = today.replace(tzinfo=JAKARTA) if today.tzinfo is None else today.astimezone(JAKARTA)
        today = today.date()
    elif isinstance(today, str):
        today = date.fromisoformat(today)
    quarter = date(today.year, (today.month - 1) // 3 * 3 + 1, 1)
    if name == "last_week":
        end = today - timedelta(days=today.weekday() + 1)
        start, label = end - timedelta(days=6), "Last week"
    elif name == "last_month":
        end = today.replace(day=1) - timedelta(days=1)
        start, label = end.replace(day=1), "Last month"
    elif name == "last_quarter":
        end = quarter - timedelta(days=1)
        start, label = date(end.year, (end.month - 1) // 3 * 3 + 1, 1), "Last quarter"
    elif name == "this_quarter":
        start, end, label = quarter, today, "This quarter to date"
    elif name == "ytd":
        start, end, label = date(today.year, 1, 1), today, "Year to date"
    else:
        raise ValueError(f"Unknown period: {name}")
    dates = {str(value)[:10] for value in data_dates}
    covered = sum(start.isoformat() <= value <= end.isoformat() for value in dates)
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "label": label,
        "coverage": covered / ((end - start).days + 1),
    }
