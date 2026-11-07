import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_matching_engine import ID, WITHDRAWAL, tables

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.core import analysis, matching
from kira.models import AuditLog, CleaningRules, CleanRow, MatchRun
from kira.services import match, state


def payout_tables():
    table = tables()
    table["pos"]["rows"] = []
    table["settlement"]["rows"] = []
    for index in range(138):
        amount = 80000 if index < 137 else 186027
        table["pos"]["rows"].append(
            {
                "sales_number": f"P{index}",
                "trace_number": f"T{index}",
                "branch": "Riverside",
                "payment_amount": amount,
                "sales_datetime_out": "2026-10-29T12:00:00+07:00",
            }
        )
        table["settlement"]["rows"].append(
            {
                "reference": f"S{index}",
                "external_reference_id": f"T{index}",
                "entity_id": "0012345678",
                "transaction_type": "Payment",
                "branch": "Riverside",
                "transaction_date": "2026-10-29",
                "gross_amount": amount,
                "nett_amount": amount,
            }
        )
    table["settlement"]["rows"].append(
        {
            "reference": "W1",
            "entity_id": "0012345678",
            "transaction_type": "Withdrawal",
            "transaction_date": "2026-10-29",
            "nett_amount": -11146000,
        }
    )
    table["bank"]["rows"] = [
        {
            "id": "B1",
            "keterangan": "AIRPAY 45678",
            "tanggal_transaksi": "2026-10-30",
            "kredit": 11143500,
        }
    ]
    return table


def payout_records(table):
    return analysis.records(
        table,
        matching.final_result(
            table, matching.run_l1([ID], table), matching.run_l2([WITHDRAWAL], table)
        ),
    )


def test_payout_comparison_finds_unlinked_next_day_bank_without_changing_results():
    table = payout_tables()
    records = payout_records(table)
    before = copy.deepcopy((table, records))
    scoped = analysis.select_records(
        records,
        {"outlet": "Riverside", "date_from": "2026-10-29", "date_to": "2026-10-29"},
        table,
    )
    assert analysis.side_rows(scoped, "bank", "l2") == []
    (group,) = analysis.payout_comparison(scoped, records, table)
    assert group["selected_count"] == group["group_count"] == 138
    assert group["net_settled"] == 11146027
    (withdrawal,) = group["withdrawals"]
    (candidate,) = group["candidates"]
    assert withdrawal["amount"] == 11146000
    assert candidate["bank_credit"] == 11143500
    assert group["net_settled"] - withdrawal["amount"] == 27
    assert withdrawal["amount"] - candidate["bank_credit"] == 2500
    assert candidate["day"] == "2026-10-30" and candidate["delay_days"] == 1
    assert candidate["linked"] is False and candidate["link"] == ""
    assert (table, records) == before
    (one,) = analysis.payout_comparison(scoped[:1], records, table)
    assert one["selected_count"] == 1 and one["group_count"] == 138
    assert one["net_settled"] == group["net_settled"] and one["id"] == group["id"]


def test_candidate_lookup_keeps_ambiguity_and_rejects_wrong_identity_dates_and_amounts():
    table = payout_tables()
    original = table["bank"]["rows"][0]
    table["bank"]["rows"] += [
        {**original, "id": "B2", "kredit": 100},
        {**original, "id": "other-store", "keterangan": "AIRPAY 945678"},
        {**original, "id": "early", "tanggal_transaksi": "2026-10-28"},
        {**original, "id": "late", "tanggal_transaksi": "2026-11-02"},
        {**original, "id": "debit", "kredit": 0, "debet": 11143500},
        {**original, "id": "missing", "kredit": None},
        {**original, "id": "infinite", "kredit": "inf"},
    ]
    records = payout_records(table)
    (group,) = analysis.payout_comparison(records, records, table)
    assert [row["row"]["id"] for row in group["candidates"]] == ["B1", "B2"]
    assert all(row["linked"] is False for row in group["candidates"])
    (later,) = analysis.payout_comparison(records, records, table, min_days=4, max_days=4)
    assert [row["row"]["id"] for row in later["candidates"]] == ["late"]


def test_comparison_marks_linked_credits_and_does_not_invent_withdrawals():
    table = payout_tables()
    table["bank"]["rows"][0]["kredit"] = 11146000
    records = payout_records(table)
    (group,) = analysis.payout_comparison(records, records, table)
    assert group["candidates"][0]["linked"] is True
    assert group["candidates"][0]["link"] == "M2-0001"
    table["settlement"]["rows"].pop()
    records = payout_records(table)
    (group,) = analysis.payout_comparison(records, records, table)
    assert group["withdrawals"] == [] and group["warning"]
    assert len(group["candidates"]) == 1


def test_duplicate_or_invalid_withdrawal_evidence_remains_explicit():
    table = payout_tables()
    table["settlement"]["rows"].append(
        {**table["settlement"]["rows"][-1], "reference": "W2", "nett_amount": None}
    )
    records = payout_records(table)
    (group,) = analysis.payout_comparison(records, records, table)
    assert len(group["withdrawals"]) == 2 and group["warning"]
    assert group["withdrawals"][1]["amount"] is None
    table["settlement"]["rows"][0]["nett_amount"] = None
    records = payout_records(table)
    (group,) = analysis.payout_comparison(records, records, table)
    assert group["net_settled"] is None and group["warning"]


def test_candidate_already_linked_to_another_day_remains_marked_as_used():
    table = payout_tables()
    table["settlement"]["rows"] += [
        {
            **table["settlement"]["rows"][0],
            "reference": "other-day",
            "external_reference_id": "unrelated",
            "transaction_date": "2026-10-30",
            "nett_amount": 11143500,
        },
        {
            **table["settlement"]["rows"][-1],
            "reference": "other-withdrawal",
            "transaction_date": "2026-10-30",
            "nett_amount": -11143500,
        },
    ]
    records = payout_records(table)
    selected = analysis.select_records(records, {"date_to": "2026-10-29"}, table)
    (group,) = analysis.payout_comparison(selected, records, table)
    (candidate,) = group["candidates"]
    assert candidate["linked"] is True and candidate["link"] == "M2-0001"


@pytest.mark.parametrize("field,value", [("entity_id", ""), ("transaction_date", "invalid")])
def test_missing_group_identity_or_date_cannot_suggest_bank(field, value):
    table = payout_tables()
    for row in table["settlement"]["rows"]:
        row[field] = value
    records = payout_records(table)
    (group,) = analysis.payout_comparison(records, records, table)
    assert group["candidates"] == [] and group["warning"]


def test_shared_store_suffix_requires_full_entity_evidence():
    table = payout_tables()
    table["settlement"]["rows"].append(
        {**table["settlement"]["rows"][0], "entity_id": "9912345678", "branch": "Other store"}
    )
    records = payout_records(table)
    groups = analysis.payout_comparison(records, records, table)
    assert all(group["candidates"] == [] and group["warning"] for group in groups)
    table["bank"]["rows"][0]["keterangan"] = "AIRPAY 0012345678"
    groups = analysis.payout_comparison(records, records, table)
    assert [group["entity_id"] for group in groups if group["candidates"]] == ["0012345678"]


@pytest.fixture
def comparison_api(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'comparison.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    with TestClient(create_app()) as api:
        with db.session_scope() as session:
            state.put(session, "conversion", {"stale": False})
            session.add(CleaningRules(version=1, maps={}, exclude={}, created_by="Rifat"))
            for area, table in payout_tables().items():
                session.add_all(
                    CleanRow(type=area, row_no=index, source_row=index, data=row, was={})
                    for index, row in enumerate(table["rows"])
                )
            for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
                match.save_rule(session, stage, rule["kind"], rule["params"], "Nurwan")
                match.run(session, stage, "Nurwan")
        yield api
    db.dispose_engines()


def test_comparison_endpoint_preserves_scope_contract_and_saved_runs(comparison_api):
    api = comparison_api
    scope = {"outlet": "Riverside", "date_from": "2026-10-29", "date_to": "2026-10-29"}
    before = api.get("/api/matching/results").json()
    scope["reason"] = "Not in bank yet"
    assert api.get("/api/analysis/side/l2/bank", params=scope).json()["total"] == 0
    with db.session_scope(write=False) as session:
        counts = [
            session.scalar(select(func.count()).select_from(model))
            for model in (MatchRun, AuditLog)
        ]
    response = api.get("/api/analysis/payout-comparison", params=scope)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scope"] == scope and body["search"] == {"min_days": 0, "max_days": 3}
    assert body["total"] == 1 and body["groups"][0]["candidates"][0]["bank_credit"] == 11143500
    page = api.get("/api/analysis/payout-comparison", params={**scope, "offset": 1}).json()
    assert page["total"] == 1 and page["groups"] == []
    assert api.get("/api/matching/results").json() == before
    with db.session_scope(write=False) as session:
        assert counts == [
            session.scalar(select(func.count()).select_from(model))
            for model in (MatchRun, AuditLog)
        ]
    for params in ({"min_days": 4, "max_days": 3}, {"date_from": "bad"}):
        assert api.get("/api/analysis/payout-comparison", params=params).status_code == 409
    for params in ({"max_days": 91}, {"min_days": -1}, {"limit": 1001}):
        assert api.get("/api/analysis/payout-comparison", params=params).status_code == 422
