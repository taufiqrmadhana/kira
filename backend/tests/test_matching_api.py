import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_matching_engine import ID, WITHDRAWAL, tables

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.models import AuditLog, CleaningRules, CleanRow, FollowUp, MatchRun, UploadRule
from kira.services import match, state


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    with TestClient(create_app()) as api:
        with db.session_scope() as s:
            seed(s)
        yield api
    db.dispose_engines()


def seed(s):
    state.put(s, "conversion", {"stale": False, "proposals": {}, "decisions": {}})
    s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="Rifat"))
    for area, table in tables().items():
        for i, row in enumerate(table["rows"]):
            s.add(CleanRow(type=area, row_no=i, source_row=i, data=row, was={}))


def run(api):
    for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
        response = api.post(
            f"/api/matching/{stage}/rules", json={"kind": rule["kind"], "params": rule["params"]}
        )
        assert response.status_code == 200, response.text
        response = api.post(f"/api/matching/{stage}/run", json={})
        assert response.status_code == 200, response.text


def test_matching_contract_invalidation_and_persistence(client):
    run(client)
    assert client.get("/api/matching/results").json()["totals"]["full"] == 2
    records = client.get("/api/analysis/records").json()
    assert records["records"][0]["pos"]["sales_number"] == "P1"
    rid = records["records"][0]["rid"]
    saved = client.post(
        "/api/analysis/follow-ups",
        json={"rid": rid, "status": "investigating", "note": "Check", "assignee": "Nurwan"},
    )
    assert saved.status_code == 200
    tested = client.post("/api/matching/l1/test", json={})
    assert set(tested.json()) == {
        "stage",
        "rules",
        "matched",
        "total",
        "unmatched_left",
        "unmatched_right",
        "hits",
        "ambiguous",
    }
    edited = client.patch(
        "/api/matching/rules/PS1", json={"kind": "id", "params": ID["params"], "name": "ID revised"}
    )
    assert edited.json()["results_cleared"] is True
    assert client.get("/api/matching/results").json() is None
    for stage in ("l1", "l2"):
        assert client.post(f"/api/matching/{stage}/run", json={}).status_code == 200
    notes = client.get("/api/analysis/follow-ups").json()
    assert notes["records"][0]["follow_up"]["note"] == "Check"
    with db.session_scope(write=False) as s:
        assert len(list(s.scalars(select(MatchRun)))) == 4


def test_invalid_rules_and_stage_order_are_refused(client):
    assert client.post("/api/matching/l2/run", json={}).status_code == 409
    assert (
        client.post("/api/matching/l1/rules", json={"kind": "withdrawal", "params": {}}).status_code
        == 409
    )
    assert (
        client.post(
            "/api/matching/l1/rules",
            json={"kind": "id", "params": {"posCol": "missing", "stlCol": "reference"}},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/matching/l1/rules", json={"kind": "composite", "params": {"amountTol": -1}}
        ).status_code
        == 409
    )
    run(client)
    assert (
        client.post("/api/matching/l1/order", json={"rule_ids": ["PS1", "PS1"]}).status_code == 409
    )
    assert client.post("/api/matching/l1/test", json={"rule_ids": ["SM1"]}).status_code == 409
    assert client.get("/api/matching/results", headers={"X-Kira-Client": "other"}).json() is None
    assert (
        client.get("/api/analysis/records", headers={"X-Kira-Client": "other"}).status_code == 409
    )


def test_followup_bulk_is_atomic_and_drafts_do_not_write(client):
    run(client)
    client.delete("/api/matching/rules/SM1")
    # An empty saved-rule selection is a legitimate run with all rows unmatched.
    assert client.post("/api/matching/l2/run", json={"rule_ids": []}).status_code == 200
    draft = client.post("/api/analysis/follow-ups/draft", json={"lang": "id"})
    assert draft.status_code == 200, draft.text
    assert len(draft.json()["drafts"]) == 3
    with db.session_scope(write=False) as s:
        assert list(s.scalars(select(FollowUp))) == []
    item = draft.json()["drafts"][0]
    payload = {k: item[k] for k in ("rid", "note", "assignee", "status")}
    assert (
        client.post(
            "/api/analysis/follow-ups/bulk",
            json={"items": [payload, {**payload, "rid": "unknown"}]},
        ).status_code
        == 409
    )
    with db.session_scope(write=False) as s:
        assert list(s.scalars(select(FollowUp))) == []
    assert (
        client.post("/api/analysis/follow-ups/bulk", json={"items": [payload]}).json()["saved"] == 1
    )


def test_unfinished_cleaning_blocks_matching(client):
    with db.session_scope() as s:
        state.put(s, "recommendations", [{"decision": "accept"}])
    assert client.post("/api/matching/l1/run", json={}).status_code == 409


def test_service_rollback_does_not_leave_current_run(client):
    with pytest.raises(RuntimeError):
        with db.session_scope() as s:
            match.save_rule(s, "l1", "id", ID["params"], "Nurwan")
            match.run(s, "l1", "Nurwan")
            raise RuntimeError("rollback")
    assert client.get("/api/matching/rules").json() == []


def test_disabled_rule_persists_and_cannot_be_run_without_activation(client):
    run(client)
    payload = {"kind": "id", "params": {**ID["params"], "enabled": False}}
    response = client.patch("/api/matching/rules/PS1", json=payload)
    assert response.status_code == 200
    assert response.json()["results_cleared"] is True
    assert client.get("/api/matching/rules").json()[0]["params"]["enabled"] is False
    assert client.post("/api/matching/l1/test", json={}).json()["matched"] == 0
    assert client.post("/api/matching/l1/run", json={"rule_ids": ["PS1"]}).status_code == 409
    payload["params"]["enabled"] = True
    assert client.patch("/api/matching/rules/PS1", json=payload).status_code == 200
    assert client.post("/api/matching/l1/test", json={}).json()["matched"] == 2
    with db.session_scope(write=False) as s:
        audit = s.scalar(
            select(AuditLog)
            .where(AuditLog.action == "Edited matching rule")
            .order_by(AuditLog.id.desc())
        )
        assert '"enabled": true' in audit.detail


def test_overlapping_suggestions_can_be_saved_then_activated_reordered_and_deleted(client):
    assert (
        client.post(
            "/api/matching/l1/rules", json={"kind": "id", "params": ID["params"]}
        ).status_code
        == 200
    )
    suggestion = next(
        r
        for r in client.get("/api/matching/l1/suggestions").json()
        if r["kind"] == "composite" and r["params"]["amountTol"] == 0
    )
    assert (suggestion["matches_alone"], suggestion["extra_after_saved"]) == (2, 0)
    payload = {
        "kind": suggestion["kind"],
        "params": {**suggestion["params"], "enabled": False},
    }
    response = client.post("/api/matching/l1/rules", json=payload)
    assert response.status_code == 200
    assert not any(
        r["kind"] == suggestion["kind"] and r["params"] == suggestion["params"]
        for r in client.get("/api/matching/l1/suggestions").json()
    )
    assert client.post("/api/matching/l1/test", json={}).json()["hits"] == {"PS1": 2}
    assert (
        client.post("/api/matching/l1/order", json={"rule_ids": ["PS2", "PS1"]}).status_code == 200
    )
    payload["params"]["enabled"] = True
    assert client.patch("/api/matching/rules/PS2", json=payload).status_code == 200
    result = client.post("/api/matching/l1/run", json={}).json()
    assert result["matched"] == 2
    assert result["hits"] == {"PS2": 2, "PS1": 0}
    assert client.delete("/api/matching/rules/PS2").status_code == 200
    assert client.post("/api/matching/l1/test", json={}).json()["hits"] == {"PS1": 2}


def test_rule_editor_columns_and_interval_validation(client):
    with db.session_scope() as s:
        s.add(
            UploadRule(
                type="pos",
                version=1,
                delimiter=",",
                columns=[{"name": "trace_number", "type": "text"}],
                rename={},
                created_by="Rifat",
            )
        )
    columns = client.get("/api/matching/columns")
    assert columns.status_code == 200
    assert any(c["name"] == "trace_number" for c in columns.json()["pos"])
    assert any(c["name"] == "payment_amount" for c in columns.json()["pos"])
    p = {
        "outlet": True,
        "method": False,
        "window": "day",
        "amountTol": 0,
        "posCol": "trace_number",
        "stlCol": "external_reference_id",
        "requireId": True,
        "posAmount": "payment_amount",
        "stlAmount": "gross_amount",
        "posDate": "sales_datetime_out",
        "stlDate": "transaction_date",
        "enabled": False,
    }
    saved = client.post("/api/matching/l1/rules", json={"kind": "composite", "params": p})
    assert saved.status_code == 200, saved.text
    preview = client.post("/api/matching/l1/preview", json={"kind": "composite", "params": p})
    assert preview.json()["matches_alone"] == 2
    for invalid in (
        {**p, "enabled": "false"},
        {**p, "posAmount": "missing"},
        {**p, "posCol": ""},
        {**p, "window": -1},
    ):
        assert (
            client.post(
                "/api/matching/l1/rules", json={"kind": "composite", "params": invalid}
            ).status_code
            == 409
        )
    assert (
        client.post(
            "/api/matching/l2/rules",
            json={
                "kind": "withdrawal",
                "params": {**WITHDRAWAL["params"], "minDays": 4, "maxDays": 3},
            },
        ).status_code
        == 409
    )
