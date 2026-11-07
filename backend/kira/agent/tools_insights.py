"""Outlet insights from reconciled results, using the existing threaded tool boundary."""

from kira.services.state import WorkflowError

from .tools import _call, _service, _threaded

_SORTS = {
    "outlet",
    "orders",
    "gross_sales",
    "avg_ticket",
    "provider_gross",
    "mdr",
    "promo_provider",
    "fees",
    "nett_settled",
    "bank_received",
    "pending_bank",
    "to_check",
    "expected_diff",
    "deduction",
    "deduction_rate",
    "keep_rate",
    "keep_rate_expected",
    "match_rate",
    "city",
    "region",
}
_KINDS = {"missing_money", "low_match", "high_deduction", "sales_drop", "sales_spike"}


def _scope(period, date_from, date_to, city, region, outlet):
    return {
        "period": period,
        "date_from": date_from,
        "date_to": date_to,
        "city": city,
        "region": region,
        "outlet": outlet,
    }


@_threaded
def get_outlet_performance(
    period: str = "",
    date_from: str = "",
    date_to: str = "",
    city: str = "",
    region: str = "",
    outlet: str = "",
    sort: str = "keep_rate",
) -> dict:
    """Read reconciled sales, deductions and bank keep rates for up to 12 outlets.

    Pass last_week, last_month, last_quarter, this_quarter or ytd as period;
    never calculate relative dates. Explicit dates use YYYY-MM-DD. Sort ascending
    (lowest keep rate first), or prefix a field with '-' for descending. Totals,
    medians and outlets_included cover the entire selection, including omitted rows.
    When coverage is below 1, report period.data_dates (and any gaps) honestly.
    """
    field = sort.removeprefix("-")
    if field not in _SORTS:
        raise WorkflowError("Choose an outlet performance field to sort by.")

    def read(s):
        result = _service("performance", "outlets")(
            s, _scope(period, date_from, date_to, city, region, outlet)
        )
        rows = result["rows"]
        present = [r for r in rows if r.get(field) is not None]
        missing = [r for r in rows if r.get(field) is None]
        ranked = sorted(present, key=lambda r: r[field], reverse=sort.startswith("-")) + missing
        return {
            **result,
            "rows": ranked[:12],
            "total": len(rows),
            "outlets_included": [r["outlet"] for r in rows],
        }

    # The service seeds only outlet_profiles on its first read. No reconciliation
    # or workflow state is written; committing persists those requested seeds.
    return _call(read, write=True)


@_threaded
def get_outlet_anomalies(
    period: str = "",
    date_from: str = "",
    date_to: str = "",
    city: str = "",
    region: str = "",
    outlet: str = "",
    kind: str = "",
) -> dict:
    """Read up to 15 evidence-backed outlet anomalies plus skipped checks.

    Pass relative periods as period, never computed dates. Optional kind is
    missing_money, low_match, high_deduction, sales_drop or sales_spike.
    Skipped checks mean evidence is insufficient; never invent a comparison.
    """
    if kind and kind not in _KINDS:
        raise WorkflowError(
            "Choose missing_money, low_match, high_deduction, sales_drop or sales_spike."
        )

    def read(s):
        result = _service("performance", "anomalies")(
            s, _scope(period, date_from, date_to, city, region, outlet)
        )
        selected = [a for a in result["anomalies"] if not kind or a["kind"] == kind]
        return {**result, "anomalies": selected[:15], "total": len(selected)}

    return _call(read, write=True)


INSIGHTS_TOOLS = [get_outlet_performance, get_outlet_anomalies]
