from datetime import date, datetime, timezone

import pytest

from kira.core import performance


def rate(outlet="A", **values):
    return {
        "outlet": outlet,
        "period": "",
        "pos": 10,
        "pos_amount": 1000,
        "stl_gross": 980,
        "stl_mdr": 20,
        "stl_nett": 960,
        "bank_credit": 850,
        "r_full": 90,
        **values,
    }


def test_formulas_use_reconciled_rates_and_expected_gap_kinds():
    gaps = [
        {"outlet": "A", "kind": "fee", "amount": 10},
        {"outlet": "A", "kind": "rounding", "amount": -2},
        {"outlet": "A", "kind": "promo", "amount": 20},
        {"outlet": "A", "kind": "not_in_bank", "amount": 100, "day": "2026-10-24"},
        {"outlet": "A", "kind": "sale_diff", "amount": -5},
        {"outlet": "", "kind": "credit_no_settlement", "amount": -1250},
    ]
    source = rate(promo_provider=20)
    (row,) = performance.outlet_rows([source], gaps, {"A": {"city": "Jakarta", "region": "Java"}})
    assert row["orders"] == 10
    assert row["gross_sales"] == 1000
    assert row["avg_ticket"] == 100
    assert row["provider_gross"] == 980
    assert row["mdr"] == 20
    assert row["promo_provider"] == 20
    assert row["fees"] == 10
    assert row["nett_settled"] == 960
    assert row["bank_received"] == 850
    assert row["pending_bank"] == 100
    assert row["to_check"] == 105
    assert row["expected_diff"] == 32
    assert row["deduction"] == 50
    assert row["deduction_rate"] == 0.05
    assert row["keep_rate"] == 0.85
    assert row["keep_rate_expected"] == 0.95
    assert row["match_rate"] == 90
    assert (row["city"], row["region"]) == ("Jakarta", "Java")
    assert source == rate(promo_provider=20)


def test_multiple_period_rows_are_weighted_and_zero_denominators_stay_unknown():
    rows = performance.outlet_rows(
        [
            rate(pos=2, r_full=50),
            rate(pos=8, r_full=100),
            rate("Zero", pos=0, pos_amount=0, r_full=None),
        ],
        [],
        [],
    )
    assert rows[0]["orders"] == 10
    assert rows[0]["match_rate"] == 90
    assert rows[1]["avg_ticket"] is None
    assert rows[1]["keep_rate"] is None
    assert rows[1]["deduction_rate"] is None
    assert rows[1]["match_rate"] is None


def test_quadrant_medians_and_payout_reason():
    rows = performance.outlet_rows(
        [
            rate("Harbor", pos_amount=20000000, stl_nett=19500000, bank_credit=10468579),
            rate("B", pos_amount=10000000, bank_credit=9900000),
            rate("C", pos_amount=15000000, bank_credit=14000000),
        ],
        [{"outlet": "Harbor", "kind": "not_in_bank", "amount": 9031421, "day": "2026-10-24"}],
        [],
    )
    result = performance.quadrants(rows)
    harbor = next(row for row in result if row["outlet"] == "Harbor")
    assert harbor["quadrant"] == "sells_a_lot_keeps_little"
    assert "24 Oct" in harbor["reason"]
    assert "9.031.421" in harbor["reason"]
    assert "quadrant" not in rows[0]
    assert (
        next(row for row in result if row["outlet"] == "C")["quadrant"]
        != "sells_a_lot_keeps_little"
    )


def test_missing_money_threshold_low_match_and_expected_fees():
    rows = performance.outlet_rows(
        [rate("A", pos_amount=100000), rate("B", pos_amount=100000, r_full=100)],
        [
            {"outlet": "A", "kind": "sale_diff", "amount": 501, "day": "2026-10-24"},
            {"outlet": "B", "kind": "fee", "amount": 4464},
        ],
        [],
    )
    found, _ = performance.anomalies(
        rows, [{"outlet": "A", "kind": "sale_diff", "amount": 501, "day": "2026-10-24"}]
    )
    missing = next(a for a in found if a["kind"] == "missing_money")
    assert missing["severity"] == "high"
    assert missing["rupiah"] == 501
    assert missing["filter"]["date_from"] == "2026-10-24"
    assert any(a["kind"] == "low_match" for a in found)
    assert all(a["outlet"] != "B" for a in found)
    rows[0]["to_check"] = 500
    assert (
        next(a for a in performance.anomalies(rows, [])[0] if a["kind"] == "missing_money")[
            "severity"
        ]
        == "low"
    )


def test_robust_z_needs_five_outlets_and_reports_only_outlier():
    rows = [
        {
            "outlet": str(i),
            "gross_sales": 1000,
            "deduction": r * 1000,
            "deduction_rate": r,
            "match_rate": 100,
            "to_check": 0,
        }
        for i, r in enumerate([0.01, 0.02, 0.03, 0.04, 0.25])
    ]
    found, skipped = performance.anomalies(rows[:4], [])
    assert not any(a["kind"] == "high_deduction" for a in found)
    assert any(a["kind"] == "high_deduction" for a in skipped)
    found, _ = performance.anomalies(rows, [])
    assert [a["outlet"] for a in found if a["kind"] == "high_deduction"] == ["4"]


def test_zero_mad_does_not_invent_a_z_score():
    rows = [
        {"outlet": str(i), "deduction_rate": r} for i, r in enumerate([0.02, 0.02, 0.02, 0.02, 0.2])
    ]
    found, skipped = performance.anomalies(rows, [])
    assert not any(a["kind"] == "high_deduction" for a in found)
    assert any(a["kind"] == "high_deduction" and "MAD" in a["why"] for a in skipped)


def test_mixed_money_gaps_keep_drilldown_broad_and_all_is_not_a_date():
    row = {"outlet": "A", "period": "all", "to_check": 600, "gross_sales": 100000}
    gaps = [
        {"outlet": "A", "kind": "not_in_bank", "amount": 500, "day": "2026-10-24"},
        {"outlet": "A", "kind": "pos_no_settlement", "amount": 100, "day": "2026-10-25"},
    ]
    found, _ = performance.anomalies([row], gaps)
    missing = next(a for a in found if a["kind"] == "missing_money")
    assert missing["filter"] == {"date_from": "", "date_to": "", "outlet": "A", "reason": ""}


def test_weekday_checks_skip_insufficient_history_and_use_previous_four():
    row = {"outlet": "A", "date_from": "2026-10-26", "date_to": "2026-10-26"}
    daily = [
        {"outlet": "A", "day": day, "orders": orders}
        for day, orders in [
            ("2026-10-05", 100),
            ("2026-10-12", 100),
            ("2026-10-19", 100),
            ("2026-10-26", 59),
        ]
    ]
    found, skipped = performance.anomalies([row], [], daily[1:])
    assert not any(a["kind"] == "sales_drop" for a in found)
    assert all(
        any(
            a["kind"] == kind and "needs at least 3 earlier same weekdays" in a["why"]
            for a in skipped
        )
        for kind in ["sales_drop", "sales_spike"]
    )
    found, _ = performance.anomalies([row], [], daily)
    (drop,) = [a for a in found if a["kind"] == "sales_drop"]
    assert drop["expected"] == 100
    assert drop["value"] == 59
    daily[-1]["orders"] = 161
    assert any(a["kind"] == "sales_spike" for a in performance.anomalies([row], [], daily)[0])


@pytest.mark.parametrize(
    "name,city", [("Zestly Central Plaza Jakarta", "Jakarta"), ("  Solo ", "Solo"), ("", "")]
)
def test_seed_city(name, city):
    assert performance.seed_city(name) == city


@pytest.mark.parametrize(
    "period,start,end",
    [
        ("last_week", "2026-10-26", "2026-11-01"),
        ("last_month", "2026-10-01", "2026-10-31"),
        ("last_quarter", "2026-07-01", "2026-09-30"),
        ("this_quarter", "2026-10-01", "2026-11-07"),
        ("ytd", "2026-01-01", "2026-11-07"),
    ],
)
def test_resolve_period(period, start, end):
    resolved = performance.resolve_period(period, date(2026, 11, 7), ["2026-10-24"])
    assert (resolved["from"], resolved["to"]) == (start, end)
    assert resolved["coverage"] == (
        0
        if period in {"last_week", "last_quarter"}
        else 1 / ((date.fromisoformat(end) - date.fromisoformat(start)).days + 1)
    )


def test_period_timezone_and_coverage_distinct_dates():
    resolved = performance.resolve_period(
        "last_month",
        datetime(2026, 10, 31, 18, tzinfo=timezone.utc),
        ["2026-10-24", "2026-10-24", "2026-11-01"],
    )
    assert resolved["from"] == "2026-10-01"
    assert resolved["coverage"] == 1 / 31
    with pytest.raises(ValueError):
        performance.resolve_period("imaginary", date(2026, 11, 7), [])
