"""Outlet Insights mounts independently and only reads completed reconciliation."""

import json

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_matching_api import seed
from test_matching_engine import ID, WITHDRAWAL, demo_tables

from kira import db
from kira.config import settings
from kira.models import AuditLog, CleaningRules, CleanRow, MatchRun, WorkflowState
from kira.services import match, state


@pytest.fixture
def client(tmp_path, monkeypatch):
    registered_before = "outlet_profiles" in db.Base.metadata.tables
    from kira.api.routes.performance import router
    from kira.models_insights import OutletProfile

    table = OutletProfile.__table__
    if table.name not in db.Base.metadata.tables:
        # Reattach the exact mapped Table after an earlier isolated test removed it.
        db.Base.metadata._add_table(table.name, table.schema, table)
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'insights.db'}")
    monkeypatch.setattr(settings, "ai", False)
    db.init_db()
    app = FastAPI()
    app.include_router(router, prefix="/api")

    @app.exception_handler(state.WorkflowError)
    async def workflow_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    try:
        with TestClient(app) as api:
            yield api
    finally:
        db.dispose_engines()
        if not registered_before:
            db.Base.metadata.remove(table)


def run_all(s):
    for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
        match.save_rule(s, stage, rule["kind"], rule["params"], "Insights test")
        match.run(s, stage, "Insights test")


def seed_demo():
    tables, _ = demo_tables("with-exceptions")
    with db.session_scope() as s:
        state.put(s, "conversion", {"stale": False})
        s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="Insights test"))
        for area, table in tables.items():
            s.add_all(
                [
                    CleanRow(type=area, row_no=i, source_row=i, data=row, was={})
                    for i, row in enumerate(table["rows"])
                ]
            )
        run_all(s)


def snapshot(s):
    return (
        [(r.id, r.stage, r.current, r.summary) for r in s.scalars(select(MatchRun))],
        [(r.key, r.value) for r in s.scalars(select(WorkflowState))],
    )


def test_bank_gap_allocated_once_across_outlets_and_dates(client):
    with db.session_scope() as s:
        seed(s)
        pos = s.scalar(select(CleanRow).where(CleanRow.type == "pos", CleanRow.row_no == 1))
        pos.data = {**pos.data, "branch": "East", "sales_datetime_out": "2026-10-25T13:00:00+07:00"}
        for i in (0, 1):
            row = s.scalar(
                select(CleanRow).where(CleanRow.type == "settlement", CleanRow.row_no == i)
            )
            row.data = {
                **row.data,
                "settled_date": "2026-10-25",
                **({"branch": "East", "transaction_date": "2026-10-25"} if i else {}),
            }
        bank = s.scalar(select(CleanRow).where(CleanRow.type == "bank"))
        bank.data = {**bank.data, "kredit": 900}
        match.save_rule(s, "l1", ID["kind"], ID["params"], "Insights test")
        match.run(s, "l1", "Insights test")
        match.save_rule(
            s,
            "l2",
            "batch",
            {"groupBy": "entity_id", "requireId": False, "amountTol": 100},
            "Insights test",
        )
        match.run(s, "l2", "Insights test")
    result = client.get("/api/performance/outlets").json()
    assert result["totals"]["bank_received"] == 900
    assert result["totals"]["to_check"] == 100
    assert {r["outlet"]: r["to_check"] for r in result["rows"]} == {"Harbor": 60, "East": 40}
    selected = client.get(
        "/api/performance/outlets", params={"date_from": "2026-10-25", "date_to": "2026-10-25"}
    ).json()
    assert selected["totals"]["to_check"] == 40
    assert selected["totals"]["bank_received"] == 360


def test_gap_totals_are_not_truncated_to_five_samples(client):
    from kira.services import analysis

    with db.session_scope() as s:
        seed(s)
        original = s.scalar(
            select(CleanRow).where(CleanRow.type == "pos", CleanRow.row_no == 0)
        ).data
        for i in range(2, 10):
            s.add(
                CleanRow(
                    type="pos",
                    row_no=i,
                    source_row=i,
                    data={**original, "sales_number": f"EXTRA{i}", "trace_number": f"extra{i}"},
                    was={},
                )
            )
        match.run(s, "l1", "Insights test", [])
        match.run(s, "l2", "Insights test", [])
        expected = analysis.gaps(s)["unexplained"]
    result = client.get("/api/performance/outlets").json()
    assert result["totals"]["to_check"] + result["unassigned"]["amount"] == expected
    assert result["totals"]["orders"] == 10


def test_provider_filter_scopes_totals_coverage_gap_allocations_and_anomalies(client):
    with db.session_scope() as s:
        seed(s)
        for index, provider in enumerate(("DANA", "OVO")):
            row = s.scalar(select(CleanRow).where(CleanRow.type == "pos", CleanRow.row_no == index))
            row.data = {**row.data, "payment_method": provider}
            settlement = s.scalar(
                select(CleanRow).where(CleanRow.type == "settlement", CleanRow.row_no == index)
            )
            settlement.data = {**settlement.data, "settled_date": "2026-10-25"}
        bank = s.scalar(select(CleanRow).where(CleanRow.type == "bank"))
        bank.data = {**bank.data, "kredit": 900}
        match.save_rule(s, "l1", ID["kind"], ID["params"], "Insights test")
        match.run(s, "l1", "Insights test")
        match.save_rule(
            s,
            "l2",
            "batch",
            {"groupBy": "entity_id", "requireId": False, "amountTol": 100},
            "Insights test",
        )
        match.run(s, "l2", "Insights test")
    default = client.get("/api/performance/outlets").json()
    assert client.get("/api/performance/outlets", params={"provider": ""}).json() == default
    for provider, gross, received, gap in (("DANA", 600, 540, 60), ("OVO", 400, 360, 40)):
        selected = client.get("/api/performance/outlets", params={"provider": provider}).json()
        assert selected["totals"]["orders"] == 1
        assert selected["totals"]["gross_sales"] == gross
        assert selected["totals"]["bank_received"] == received
        assert selected["totals"]["to_check"] == gap
        assert selected["period"]["data_dates"] == ["2026-10-24"]
        anomalies = client.get("/api/performance/anomalies", params={"provider": provider}).json()
        money = next(a for a in anomalies["anomalies"] if a["kind"] == "missing_money")
        assert money["rupiah"] == gap
        assert money["filter"]["provider"] == provider
    empty = client.get("/api/performance/outlets", params={"provider": "No such provider"}).json()
    assert empty["rows"] == [] and empty["totals"]["orders"] == 0
    assert empty["period"]["coverage"] == 0
    assert (
        client.get("/api/performance/anomalies", params={"provider": "No such provider"}).json()[
            "anomalies"
        ]
        == []
    )


def test_payout_gap_uses_absolute_weights_for_signed_settlements(client):
    from kira.services import performance

    records = [
        {"i": 0, "outlet": "A", "day": "2026-10-24", "bank_i": 0, "stl": {"nett_amount": 120}},
        {"i": 1, "outlet": "B", "day": "2026-10-24", "bank_i": 0, "stl": {"nett_amount": -20}},
    ]
    events = [("payout_diff", 10, {"bank": 0}, "")]
    items = performance._gap_items(records, records, events)
    assert sum(item["amount"] for item in items) == pytest.approx(10)
    assert [item["amount"] for item in items] == pytest.approx([60 / 7, 10 / 7])
    selected = performance._gap_items(records, records[1:], events)
    assert selected[0]["amount"] == pytest.approx(10 / 7)
    for r in records:
        r["stl"]["nett_amount"] = 0
    assert [item["amount"] for item in performance._gap_items(records, records, events)] == [5, 5]


@pytest.mark.parametrize("endpoint", ["outlets", "anomalies"])
def test_insights_does_not_recompute_gaps_for_each_outlet_day(client, monkeypatch, endpoint):
    from kira.core import analysis as core_analysis
    from kira.services import analysis

    with db.session_scope() as s:
        seed(s)
        run_all(s)
    calls = 0
    original = core_analysis._gap_events

    def counted(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original(*args, **kwargs)

    def disallow_requery(*args, **kwargs):
        pytest.fail("Insights must not requery gaps per outlet-day or bank group")

    monkeypatch.setattr(analysis, "gaps", disallow_requery)
    monkeypatch.setattr(core_analysis, "_gap_events", counted)
    result = client.get(f"/api/performance/{endpoint}")
    assert result.status_code == 200
    if endpoint == "outlets":
        assert result.json()["totals"]["orders"] == 2
    else:
        assert isinstance(result.json()["anomalies"], list)
    assert calls == 1, "Complete gap evidence must be computed once per Insights request"


def test_requires_both_stages(client):
    for endpoint in ("outlets", "anomalies", "outlet-profiles"):
        response = client.get(f"/api/performance/{endpoint}")
        assert response.status_code == 409
        assert (
            response.json()["detail"] == "Run matching first: insights use the reconciled results"
        )
    with db.session_scope() as s:
        seed(s)
        match.run(s, "l1", "Insights test", [])
    assert client.get("/api/performance/outlets").status_code == 409


def test_profiles_seed_persist_audit_filter_and_reject_unknown(client):
    from kira.models_insights import OutletProfile

    with db.session_scope() as s:
        seed(s)
        run_all(s)
        before = snapshot(s)
    profiles = client.get("/api/performance/outlet-profiles").json()["profiles"]
    assert profiles
    outlet = profiles[0]["outlet"]
    with db.session_scope(write=False) as s:
        assert s.get(OutletProfile, outlet) is not None
    response = client.put(
        "/api/performance/outlet-profiles",
        json={
            "profiles": [
                {"outlet": outlet, "city": "Test city", "region": "Java"},
            ]
        },
        headers={"X-Kira-User": "Taufiq"},
    )
    assert response.status_code == 200
    scoped = client.get("/api/performance/outlets", params={"city": "Test city", "region": "Java"})
    assert scoped.status_code == 200
    assert [r["outlet"] for r in scoped.json()["rows"]] == [outlet]
    assert client.get("/api/performance/outlets", params={"city": "Unknown"}).json()["rows"] == []
    assert (
        client.put(
            "/api/performance/outlet-profiles",
            json={
                "profiles": [
                    {"outlet": outlet, "city": "Must roll back", "region": ""},
                    {"outlet": "Unknown", "city": "", "region": ""},
                ]
            },
        ).status_code
        == 409
    )
    with db.session_scope(write=False) as s:
        profile = s.get(OutletProfile, outlet)
        assert profile.city == "Test city" and profile.updated_by == "Taufiq"
        audit = s.scalar(select(AuditLog).where(AuditLog.action == "Saved outlet profile"))
        assert audit.actor == "Taufiq" and audit.object == outlet
        assert json.loads(audit.detail)["city"] == "Test city"
        assert snapshot(s) == before


def test_demo_reconciled_totals_and_anomalies(client):
    seed_demo()
    params = {"date_from": "2026-10-20", "date_to": "2026-10-26"}
    result = client.get("/api/performance/outlets", params=params)
    assert result.status_code == 200, result.text
    result = result.json()
    assert result["totals"]["orders"] == sum(r["orders"] for r in result["rows"]) == 8784
    assert sum(r["to_check"] for r in result["rows"]) + result["unassigned"]["amount"] == 10671421
    assert result["unassigned"] == {"credits": 1, "amount": 1250000}
    assert result["period"]["coverage"] == 1
    harbor = next(r for r in result["rows"] if "Harbor Square" in r["outlet"])
    assert harbor["quadrant"] == "sells_a_lot_keeps_little"
    assert "24 Oct" in harbor["reason"]
    checks = client.get("/api/performance/anomalies", params=params).json()
    missing = {a["outlet"]: a for a in checks["anomalies"] if a["kind"] == "missing_money"}
    for name, amount, severity in (
        ("Harbor Square Surabaya", 9031421, "high"),
        ("Garden Mall Bandung", 171000, "low"),
        ("Bay View Cilegon", 151000, "low"),
        ("Riverside Center Jogja", 68000, "low"),
    ):
        assert missing[f"Zestly {name}"]["rupiah"] == amount
        assert missing[f"Zestly {name}"]["severity"] == severity
    assert any(
        a["kind"] == "low_match" and "Harbor Square" in a["outlet"] for a in checks["anomalies"]
    )
    assert not any("Lakeside Town" in a["outlet"] for a in checks["anomalies"])
    lakeside = next(r for r in result["rows"] if "Lakeside Town" in r["outlet"])
    assert lakeside["fees"] == 4464 and lakeside["expected_diff"] >= 4464
    assert missing["Zestly Harbor Square Surabaya"]["filter"] == {
        "date_from": "2026-10-24",
        "date_to": "2026-10-24",
        "outlet": "Zestly Harbor Square Surabaya",
        "reason": "Not in bank yet",
    }
    assert {"sales_drop", "sales_spike"} <= {x["kind"] for x in checks["skipped"]}
    assert all(
        "needs at least 3 earlier same weekdays" in x["why"]
        for x in checks["skipped"]
        if x["kind"].startswith("sales_")
    )


def test_period_validation_and_empty_historical_coverage(client, monkeypatch):
    from datetime import date

    from kira.services import performance

    with db.session_scope() as s:
        seed(s)
        run_all(s)
    monkeypatch.setattr(performance, "_today", lambda: date(2026, 11, 7))
    result = client.get("/api/performance/outlets", params={"period": "last_quarter"}).json()
    assert (result["period"]["from"], result["period"]["to"]) == ("2026-07-01", "2026-09-30")
    assert result["period"]["coverage"] == 0 and result["rows"] == []
    assert result["period"]["data_dates"] == []
    for params in (
        {"period": "unknown"},
        {"date_from": "bad"},
        {"date_from": "2026-10-26", "date_to": "2026-10-20"},
        {"period": "last_week", "date_from": "2026-10-20"},
    ):
        assert client.get("/api/performance/outlets", params=params).status_code == 409


def test_insight_tools_bound_results_preserve_scope_and_validate(monkeypatch):
    import asyncio

    from kira.agent import tools_insights as tools

    calls = []
    source = {
        "period": {
            "from": "2026-10-20",
            "to": "2026-10-26",
            "coverage": 0.5,
            "data_dates": ["2026-10-20"],
        },
        "totals": {"orders": 100},
        "medians": {"keep_rate": 0.9},
        "rows": [{"outlet": f"Store {i}", "keep_rate": i / 20} for i in range(20)],
        "unassigned": {"credits": 1, "amount": 1250000},
    }

    def service(module, name):
        assert module == "performance"

        def invoke(s, f):
            calls.append((name, f))
            if name == "outlets":
                return source
            return {
                "anomalies": [{"kind": "low_match", "outlet": str(i)} for i in range(20)]
                + [{"kind": "missing_money", "outlet": "Harbor"}],
                "skipped": [
                    {"kind": "sales_drop", "why": "needs at least 3 earlier same weekdays"}
                ],
            }

        return invoke

    def call(fn, *, write=False):
        assert write is True  # Commit only the service's first-read profile seeds.
        return {"status": "ok", "result": fn(object())}

    monkeypatch.setattr(tools, "_service", service)
    monkeypatch.setattr(tools, "_call", call)
    response = asyncio.run(tools.get_outlet_performance(period="last_week", city="Jakarta"))
    assert response["status"] == "ok"
    result = response["result"]
    assert len(result["rows"]) == 12 and result["rows"][0]["outlet"] == "Store 0"
    assert result["total"] == 20 and len(result["outlets_included"]) == 20
    assert result["period"] == source["period"] and result["totals"] == source["totals"]
    assert result["medians"] == source["medians"]
    assert calls[0][1]["period"] == "last_week" and calls[0][1]["city"] == "Jakarta"
    assert len(source["rows"]) == 20
    result = asyncio.run(tools.get_outlet_anomalies(kind="missing_money"))["result"]
    assert result["anomalies"] == [{"kind": "missing_money", "outlet": "Harbor"}]
    assert result["skipped"][0]["kind"] == "sales_drop"
    assert len(asyncio.run(tools.get_outlet_anomalies())["result"]["anomalies"]) == 15
    assert asyncio.run(tools.get_outlet_performance(sort="bad"))["status"] == "error"
    assert asyncio.run(tools.get_outlet_anomalies(kind="bad"))["status"] == "error"
