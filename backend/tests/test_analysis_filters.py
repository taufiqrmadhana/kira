"""Chains filters preserve real discrepancies, whole-scope totals and CSV evidence."""

import csv
import io

import pytest
from fastapi.testclient import TestClient
from test_matching_engine import ID, WITHDRAWAL, demo_tables, tables

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.core import analysis as core
from kira.core import matching
from kira.models import CleaningRules, CleanRow
from kira.services import match, state


def records(table):
    return core.records(
        table,
        matching.final_result(
            table, matching.run_l1([ID], table), matching.run_l2([WITHDRAWAL], table)
        ),
    )


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'filters.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    token = db.current_client.set("")
    data = tables()
    data["pos"]["rows"][0]["payment_amount"] = 668
    for row in data["pos"]["rows"]:
        row["payment_method_ori"] = "GOPAY"
    data["pos"]["rows"].append(
        {
            "sales_number": "P3",
            "trace_number": "orphan",
            "branch": "Garden",
            "payment_amount": 20,
            "sales_datetime_out": "2026-10-24",
            "payment_method_ori": "DANA",
        }
    )
    data["settlement"]["rows"].append(
        {
            "reference": "S3",
            "external_reference_id": "extra",
            "transaction_type": "Payment",
            "branch": "Garden",
            "transaction_date": "2026-10-24",
            "gross_amount": 30,
            "nett_amount": 30,
        }
    )
    data["bank"]["rows"].append(
        {
            "id": "B2",
            "keterangan": "AIRPAY extra credit",
            "tanggal_transaksi": "2026-10-25",
            "kredit": 10,
        }
    )
    try:
        with TestClient(create_app()) as api:
            with db.session_scope() as s:
                state.put(s, "conversion", {"stale": False, "proposals": {}, "decisions": {}})
                s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="QA"))
                for area, table in data.items():
                    s.add_all(
                        CleanRow(type=area, row_no=i, source_row=i, data=row, was={})
                        for i, row in enumerate(table["rows"])
                    )
                for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
                    match.save_rule(s, stage, rule["kind"], rule["params"], "QA")
                    match.run(s, stage, "QA")
            yield api
    finally:
        db.current_client.reset(token)
        db.dispose_engines()


def test_default_and_explicit_false_keep_the_existing_contract(client):
    before = client.get("/api/analysis/records").json()
    assert before["total"] == 5
    assert set(before) == {
        "total",
        "offset",
        "limit",
        "status_counts",
        "columns",
        "records",
        "banks",
    }
    assert (
        client.get("/api/analysis/records?pos_only=false&only_differences=false").json() == before
    )
    assert (
        client.get("/api/analysis/summary?pos_only=false&only_differences=false").json()["scope"]
        == {}
    )


def test_filters_run_before_pagination_and_status_counts(client):
    params = {"pos_only": True, "only_differences": True, "offset": 1, "limit": 1}
    result = client.get("/api/analysis/records", params=params).json()
    assert result["total"] == 2
    assert [row["rid"] for row in result["records"]] == ["pos:P3"]
    assert result["status_counts"] == {"Matched": 1, "Needs review": 0, "Mismatched": 1}
    selected = client.get(
        "/api/analysis/records", params={**params, "offset": 0, "status": "Matched"}
    ).json()
    assert selected["total"] == 1
    assert selected["status_counts"] == result["status_counts"]
    assert selected["records"][0]["rid"] == "pos:P1"
    assert selected["records"][0]["status"] == "Matched"
    assert selected["records"][0]["group_size"] == 2
    assert selected["records"][0]["group_nett"] == 1000
    assert selected["banks"][str(selected["records"][0]["bank_i"])]["id"] == "B1"


def test_pos_only_excludes_orphans_but_differences_alone_keeps_them(client):
    pos = client.get("/api/analysis/records?pos_only=true").json()
    assert pos["total"] == 3
    assert all(row["pos"] is not None for row in pos["records"])
    differences = client.get("/api/analysis/records?only_differences=true").json()
    assert differences["total"] == 4
    assert {row["reason"] for row in differences["records"]} == {
        "",
        "No POS sale",
        "No settlement",
        "Credit with no settlement",
    }


@pytest.mark.parametrize(
    "scope,expected",
    [
        ({"outlet": "Garden", "provider": "DANA"}, ["P3"]),
        ({"outlet": "Harbor", "status": "Matched", "amount_min": 650}, ["P1"]),
        ({"date_from": "2026-10-25", "date_to": "2026-10-25"}, []),
        ({"q": "P1"}, ["P1"]),
    ],
)
def test_scoped_records_and_export_select_the_same_evidence(client, scope, expected):
    params = {"pos_only": True, "only_differences": True, **scope}
    response = client.get("/api/analysis/records", params=params)
    assert response.status_code == 200
    assert [row["key"] for row in response.json()["records"]] == expected
    exported = client.get("/api/analysis/export", params=params)
    assert exported.status_code == 200
    assert 'filename="kira-analysis.csv"' in exported.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert [row["pos.sales_number"] for row in rows] == expected


def test_export_contains_the_full_filtered_selection_not_the_page(client):
    params = {"pos_only": True, "only_differences": True, "limit": 1}
    assert len(client.get("/api/analysis/records", params=params).json()["records"]) == 1
    rows = list(csv.DictReader(io.StringIO(client.get("/api/analysis/export", params=params).text)))
    assert [row["pos.sales_number"] for row in rows] == ["P1", "P3"]


@pytest.mark.parametrize("kind", ["amount", "outlet", "rounding", "fee", "review"])
def test_differences_include_matched_money_and_outlet_evidence(kind):
    table = tables()
    if kind == "amount":
        table["pos"]["rows"][0]["payment_amount"] += 68
    elif kind == "outlet":
        table["pos"]["rows"][0]["branch"] = "Other outlet"
    elif kind in {"rounding", "fee"}:
        table["settlement"]["rows"][0]["nett_amount"] += 1 if kind == "rounding" else 500
        table["settlement"]["rows"][2]["fee_withdrawal"] = 500 if kind == "fee" else 0
    rows = records(table)
    if kind == "review":
        rows[0]["status"] = "Needs review"
    else:
        assert all(row["status"] == "Matched" for row in rows)
    result = core.select_records(rows, {"only_differences": True}, table)
    assert {row["key"] for row in result} == (
        {"P1", "P2"} if kind in {"rounding", "fee"} else {"P1"}
    )
    if kind in {"rounding", "fee"}:
        assert core.gaps(rows, rows, table)["kinds"][0]["kind"] == kind


def test_normal_next_day_bank_date_is_information_not_a_difference():
    table = tables()
    rows = records(table)
    assert core.compare(rows[0], table)[-1]["status"] == "info"
    assert core.select_records(rows, {"only_differences": True}, table) == []


def test_real_e4_sales_stay_matched_and_appear_in_difference_chains():
    table, root = demo_tables("with-exceptions")
    with (root / "answer_key.csv").open(encoding="utf-8-sig", newline="") as source:
        expected = {
            row["sales_number"] for row in csv.DictReader(source) if row["exception"] == "E4"
        }
    assert len(expected) == 2
    selected = {
        row["key"]: row
        for row in core.select_records(
            records(table), {"pos_only": True, "only_differences": True}, table
        )
    }
    assert expected <= selected.keys()
    for key in expected:
        assert selected[key]["status"] == "Matched"
        amount = next(
            field for field in core.compare(selected[key], table) if field["label"] == "Amount"
        )
        assert amount["status"] == "diff"
