import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_analysis_comparison import payout_tables
from test_analysis_services import database as database
from test_analysis_services import match_all

from kira import db
from kira.api.app import create_app
from kira.models import CleaningRules, CleanRow
from kira.services import state


@pytest.fixture
def api(database):
    with db.session_scope() as s:
        state.put(s, "conversion", {"stale": False})
        s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="test"))
        for area, table in payout_tables().items():
            s.add_all(
                CleanRow(type=area, row_no=i, source_row=i, data=row, was={})
                for i, row in enumerate(table["rows"])
            )
        match_all(s)
    with TestClient(create_app()) as client:
        yield client


def proposal(api):
    group = api.get("/api/analysis/payout-comparison?keys=P0").json()["groups"][0]
    assert group["selected_count"] == 1 and group["group_count"] == 138
    assert group["force_match_eligible"]
    return dict(
        group_id=group["id"],
        withdrawal_n=138,
        bank_n=0,
        max_days=3,
        evidence_token=group["candidates"][0]["evidence_token"],
        note="Confirmed provider payout; accepted bank adjustment.",
        accept_difference=True,
    )


def test_force_match_preserves_difference_reason_rerun_and_undo(api):
    body = proposal(api)
    created = api.post("/api/analysis/force-matches", json=body)
    assert created.status_code == 200, created.text
    link = created.json()
    assert link["note"] == body["note"] and len(link["left"]) == 138
    assert api.get("/api/analysis/summary").json()["totals"]["matched"] == 138
    gaps = api.get("/api/analysis/gaps").json()
    assert gaps["unexplained"] == 0
    assert {x["kind"]: x["amount"] for x in gaps["kinds"]} == {
        "rounding": 27,
        "accepted_payout_diff": 2500,
    }
    assert api.post("/api/analysis/force-matches", json=body).status_code == 409
    assert len(api.get("/api/analysis/force-matches").json()) == 1
    for stage in ("l1", "l2"):
        assert api.post(f"/api/matching/{stage}/run", json={}).status_code == 200
    assert api.get("/api/analysis/summary").json()["totals"]["matched"] == 138
    assert api.delete(f"/api/analysis/manual-links/{link['id']}").status_code == 200
    assert api.get("/api/analysis/summary").json()["totals"]["matched"] == 0
    assert api.get("/api/analysis/force-matches").json() == []


@pytest.mark.parametrize(
    "patch",
    [
        dict(note=" "),
        dict(accept_difference=False),
        dict(bank_n=99),
        dict(withdrawal_n=0),
        dict(evidence_token="stale"),
        dict(max_days=0),
    ],
)
def test_force_match_rejects_missing_approval_or_invalid_evidence(api, patch):
    body = proposal(api) | patch
    response = api.post("/api/analysis/force-matches", json=body)
    assert response.status_code in (409, 422), response.text
    assert api.get("/api/analysis/force-matches").json() == []


def test_force_match_does_not_hide_pos_amount_difference(api):
    with db.session_scope() as s:
        row = s.scalar(select(CleanRow).where(CleanRow.type == "pos", CleanRow.row_no == 0))
        row.data = {**row.data, "payment_amount": 80010}
    response = api.post("/api/analysis/force-matches", json=proposal(api))
    assert response.status_code == 200, response.text
    assert api.get("/api/analysis/summary").json()["totals"]["matched"] == 137
    assert api.get("/api/analysis/gaps").json()["unexplained"] == 10


def test_withdrawal_changes_invalidate_approval(api):
    assert api.post("/api/analysis/force-matches", json=proposal(api)).status_code == 200
    with db.session_scope() as s:
        row = s.scalar(
            select(CleanRow).where(CleanRow.type == "settlement", CleanRow.row_no == 138)
        )
        row.data = {**row.data, "nett_amount": -11147000}
    assert api.get("/api/analysis/summary").json()["totals"]["matched"] == 0
    assert api.get("/api/analysis/force-matches").json()[0]["valid"] is False


@pytest.mark.parametrize(
    "change", ["bank_amount", "wrong_store", "extra_payment", "extra_withdrawal"]
)
def test_stale_or_incomplete_payout_cannot_be_force_matched(api, change):
    body = proposal(api)
    with db.session_scope() as s:
        if change in ("bank_amount", "wrong_store"):
            row = s.scalar(select(CleanRow).where(CleanRow.type == "bank", CleanRow.row_no == 0))
            row.data = {
                **row.data,
                **(
                    {"kredit": 11143000}
                    if change == "bank_amount"
                    else {"keterangan": "AIRPAY 99999"}
                ),
            }
        else:
            n = 0 if change == "extra_payment" else 138
            row = s.scalar(
                select(CleanRow).where(CleanRow.type == "settlement", CleanRow.row_no == n)
            )
            s.add(CleanRow(type="settlement", row_no=139, source_row=139, data=row.data, was={}))
    assert api.post("/api/analysis/force-matches", json=body).status_code == 409
    assert api.get("/api/analysis/force-matches").json() == []


def test_force_match_export_contains_reason_and_actor_and_daily_gaps_exclude_accepted(api):
    body = proposal(api)
    assert api.post("/api/analysis/force-matches", json=body).status_code == 200
    csv = api.get("/api/analysis/export").text
    assert "force_match_note" in csv and body["note"] in csv and "Force match" in csv
    import io

    from openpyxl import load_workbook

    response = api.get("/api/matching/export.xlsx")
    assert response.status_code == 200
    book = load_workbook(io.BytesIO(response.content), read_only=True)
    rows = list(book.active.values)
    note_column = rows[0].index("force_match_note")
    assert all(row[note_column] == body["note"] for row in rows[1:])
    book.close()
    days = api.get("/api/analysis/gaps?by_day=true").json()["days"]
    assert sum(d["to_check"] for d in days) == 0
    assert api.get("/api/analysis/force-matches").json()[0]["active"] is True
