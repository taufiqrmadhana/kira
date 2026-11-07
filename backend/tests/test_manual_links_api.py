"""HTTP manual links use strict source indices and isolate writes, audit and cache."""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from test_matching_api import seed

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.services import match


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'manual.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    try:
        for cid in ("a", "b"):
            token = db.current_client.set(cid)
            try:
                with db.session_scope() as s:
                    seed(s)
                    match.run(s, "l1", "Fixture", [])
                    match.run(s, "l2", "Fixture", [])
            finally:
                db.current_client.reset(token)
        with TestClient(
            create_app(), headers={"X-Kira-Client": "a", "X-Kira-User": "Andrew"}
        ) as api:
            yield api
    finally:
        db.dispose_engines()


def payload(stage="l1", **overrides):
    return {
        "stage": stage,
        "left": [0],
        "right": [0],
        "note": "Checked source documents",
        **overrides,
    }


def listed(client, **kwargs):
    # SQLite returns persisted UTC timestamps without their original timezone suffix.
    return [
        {**row, "at": datetime.fromisoformat(row["at"]).replace(tzinfo=timezone.utc).isoformat()}
        for row in client.get("/api/analysis/manual-links", **kwargs).json()
    ]


def test_create_list_undo_commits_audit_and_refreshes_cached_results(client):
    assert client.get("/api/analysis/summary").json()["totals"]["matched"] == 0
    first = client.post("/api/analysis/manual-links", json=payload())
    assert first.status_code == 200, first.text
    link = first.json()
    assert set(link) == {
        "id",
        "stage",
        "left",
        "right",
        "left_keys",
        "right_keys",
        "note",
        "by",
        "at",
        "valid",
    }
    assert link["left"] == [0] and link["right"] == [0]
    assert link["left_keys"] == ["P1"] and link["right_keys"] == ["S1"]
    assert link["by"] == "Andrew" and link["valid"] is True
    assert listed(client) == [link]
    second = client.post("/api/analysis/manual-links", json=payload("l2", left=[0, 1]))
    assert second.status_code == 200
    assert client.get("/api/analysis/summary").json()["totals"]["matched"] == 1
    assert client.get("/api/matching/results").json()["totals"]["full"] == 1
    assert client.get("/api/workflow?rows=5").json()["matching"]["results"]["totals"]["full"] == 1
    assert client.delete(f"/api/analysis/manual-links/{second.json()['id']}").json() == {"ok": True}
    assert client.get("/api/analysis/summary").json()["totals"]["matched"] == 0
    assert client.get("/api/workflow?rows=5").json()["matching"]["results"]["totals"]["full"] == 0
    assert listed(client) == [link]
    audit = client.get("/api/audit").json()
    writes = [
        row for row in audit if row["action"] in {"Linked rows by hand", "Removed manual link"}
    ]
    assert len(writes) == 3 and all(row["actor"] == "Andrew" for row in writes)
    assert writes[0]["action"] == "Removed manual link"
    assert any(row["detail"] == "Checked source documents" for row in writes)
    assert client.delete(f"/api/analysis/manual-links/{second.json()['id']}").status_code == 409


def test_overlapping_client_row_and_link_ids_never_cross_databases(client):
    a = client.post("/api/analysis/manual-links", json=payload()).json()
    other = {"X-Kira-Client": "b", "X-Kira-User": "Nurwan"}
    assert client.get("/api/analysis/manual-links", headers=other).json() == []
    assert client.delete(f"/api/analysis/manual-links/{a['id']}", headers=other).status_code == 409
    b = client.post(
        "/api/analysis/manual-links", headers=other, json=payload(left=[1], right=[1])
    ).json()
    assert a["id"] == b["id"]
    assert listed(client) == [a]
    assert listed(client, headers=other) == [b]
    assert client.delete(f"/api/analysis/manual-links/{b['id']}", headers=other).status_code == 200
    assert listed(client) == [a]
    assert client.get("/api/analysis/manual-links", headers=other).json() == []
    assert all(row["actor"] != "Nurwan" for row in client.get("/api/audit").json())


@pytest.mark.parametrize("value", [True, False, "0", 0.0, 0.5])
@pytest.mark.parametrize("side", ["left", "right"])
def test_manual_indices_are_strict_json_integers(client, side, value):
    response = client.post("/api/analysis/manual-links", json=payload(**{side: [value]}))
    assert response.status_code == 422
    assert client.get("/api/analysis/manual-links").json() == []


@pytest.mark.parametrize(
    "changes",
    [
        {"left": []},
        {"right": []},
        {"left": [0, 1]},
        {"right": [0, 1]},
        {"left": [-1]},
        {"right": [99]},
        {"left": [0, 0]},
        {"note": "  "},
        {"stage": "l2", "left": [2]},
        {"stage": "l2", "right": [0, 0]},
    ],
)
def test_invalid_manual_selections_never_save(client, changes):
    response = client.post("/api/analysis/manual-links", json=payload(**changes))
    assert response.status_code == 409
    assert client.get("/api/analysis/manual-links").json() == []


def test_already_linked_rows_are_refused_through_http(client):
    assert client.post("/api/analysis/manual-links", json=payload()).status_code == 200
    assert client.post("/api/analysis/manual-links", json=payload(right=[1])).status_code == 409
    assert len(client.get("/api/analysis/manual-links").json()) == 1
