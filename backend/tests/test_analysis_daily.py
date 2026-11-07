"""Daily markers retain matching results while exposing independent money evidence."""

import copy

import pytest
from fastapi.testclient import TestClient
from test_analysis_services import database, match_all  # noqa: F401
from test_matching_api import seed
from test_matching_engine import ID, WITHDRAWAL, demo_tables, tables

from kira import db
from kira.api.app import create_app
from kira.core import analysis as core
from kira.core import matching
from kira.models import CleaningRules, CleanRow
from kira.services import state


def records(t):
    final = matching.final_result(t, matching.run_l1([ID], t), matching.run_l2([WITHDRAWAL], t))
    return core.records(t, final)


@pytest.mark.usefixtures("database")
def test_daily_gaps_preserve_default_contract_and_filters():
    with db.session_scope() as s:
        seed(s)
        match_all(s)
    with TestClient(create_app()) as api:
        original = api.get("/api/analysis/gaps").json()
        assert set(original) == {"kinds", "explained", "unexplained", "latest_bank_date"}
        assert api.get("/api/analysis/gaps?by_day=false").json() == original
        response = api.get("/api/analysis/gaps?by_day=true")
        assert response.status_code == 200
        assert response.json() == {
            "days": [
                {
                    "day": "2026-10-24",
                    "outlet": "Harbor",
                    "to_check": 0,
                    "not_in_bank": 0,
                    "review": 0,
                }
            ]
        }
        assert api.get("/api/analysis/gaps?by_day=true&outlet=Missing").json() == {"days": []}
        assert api.get("/api/analysis/gaps?by_day=true&date_from=bad").status_code == 409
        assert api.get("/api/analysis/gaps").json() == original


@pytest.mark.usefixtures("database")
def test_daily_gaps_require_completed_matching():
    with TestClient(create_app()) as api:
        assert api.get("/api/analysis/gaps?by_day=true").status_code == 409


def test_daily_markers_are_independent_of_match_status():
    t = tables()
    recs = records(t)
    # A fully linked sale with an amount discrepancy still carries money to check.
    t["pos"]["rows"][0]["payment_amount"] += 68
    recs[1]["status"] = "Needs review"
    before = copy.deepcopy((t, recs))
    daily = core.day_gaps(recs, recs, t)
    assert daily == {
        "days": [
            {
                "day": "2026-10-24",
                "outlet": "Harbor",
                "to_check": 68,
                "not_in_bank": 0,
                "review": 1,
            }
        ]
    }
    assert (t, recs) == before


def test_daily_payout_gap_is_allocated_before_outlet_day_filtering():
    t = tables()
    recs = records(t)
    # Keep established links while creating an unexplained bank-level difference.
    t["bank"]["rows"][0]["kredit"] = 900
    t["settlement"]["rows"][2]["fee_withdrawal"] = 0
    recs[1].update(day="2026-10-25", outlet="Garden")
    all_days = core.day_gaps(recs, recs, t)["days"]
    assert [row["to_check"] for row in all_days] == [60, 40]
    assert core.day_gaps(recs[1:], recs, t)["days"] == [all_days[1]]
    # Absolute nett weights also conserve the gap for mixed payment/refund groups.
    t["settlement"]["rows"][1]["nett_amount"] = -400
    # Keep the withdrawal equal to the net group so this tests bank-gap allocation,
    # independently of the new net-to-withdrawal rounding classification.
    t["settlement"]["rows"][2]["nett_amount"] = -200
    signed = core.day_gaps(recs, recs, t)["days"]
    assert sum(row["to_check"] for row in signed) == pytest.approx(700)
    assert [row["to_check"] for row in signed] == pytest.approx([420, 280])


@pytest.mark.usefixtures("database")
def test_daily_gaps_demo_api_money_and_matching_unchanged():
    t, _ = demo_tables("with-exceptions")
    with db.session_scope() as s:
        state.put(s, "conversion", {"stale": False})
        s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="Rifat"))
        for area, table in t.items():
            s.add_all(
                CleanRow(type=area, row_no=i, source_row=i, data=row, was={})
                for i, row in enumerate(table["rows"])
            )
        match_all(s)
    with TestClient(create_app()) as api:
        before = api.get("/api/analysis/summary").json()
        original = api.get("/api/analysis/gaps").json()
        response = api.get("/api/analysis/gaps?by_day=true")
        assert response.status_code == 200
        days = response.json()["days"]
        outlet_days = [d for d in days if d["outlet"]]
        assert len(outlet_days) == 70
        for outlet, day, amount in (
            ("Harbor Square Surabaya", "2026-10-24", 9031421),
            ("Garden Mall Bandung", "2026-10-22", 171000),
            ("Bay View Cilegon", "2026-10-23", 151000),
            ("Riverside Center Jogja", "2026-10-21", 68000),
            ("Lakeside Town Tangerang", "2026-10-26", 0),
        ):
            row = next(d for d in days if d["outlet"] == f"Zestly {outlet}" and d["day"] == day)
            assert row["to_check"] == amount
            assert row["not_in_bank"] == (amount if "Harbor" in outlet else 0)
        assert sum(d["to_check"] > 0 for d in outlet_days) == 4
        assert sum(d["to_check"] for d in days) == original["unexplained"] == 10671421
        assert api.get("/api/analysis/summary").json() == before
        assert api.get("/api/analysis/gaps").json() == original
        harbor = api.get(
            "/api/analysis/records",
            params={
                "outlet": "Zestly Harbor Square Surabaya",
                "date_from": "2026-10-24",
                "date_to": "2026-10-24",
                "reason": "Not in bank yet",
            },
        ).json()
        assert harbor["total"] == 142
