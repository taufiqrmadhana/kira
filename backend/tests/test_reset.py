"""Reset backs up only the confirmed demo client and commits before responding."""

import json
import sqlite3
from contextlib import closing
import stat
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from test_matching_api import seed
from test_matching_engine import ID, WITHDRAWAL

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.services import analysis, clients, files, match, performance, state

DEMO = "zestly-demo"
OTHER = "zestly-demo-latihan"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'workspace.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    clients.save_client("Zestly Demo", DEMO)
    clients.save_client("Zestly Practice", OTHER)
    for cid in (DEMO, OTHER):
        token = db.current_client.set(cid)
        try:
            with db.session_scope() as s:
                for area in ("pos", "settlement", "bank"):
                    files.add_file(
                        s, area, area + ".csv", f"branch,amount\n{area},100\n".encode(), "Test"
                    )
                seed(s)
                for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
                    match.save_rule(s, stage, rule["kind"], rule["params"], "Test")
                    match.run(s, stage, "Test")
                performance.profiles(s)
            with db.session_scope(write=False) as s:
                assert analysis.summary(s)["totals"]["matched"] == 2
        finally:
            db.current_client.reset(token)
    with TestClient(create_app()) as api:
        yield api
    analysis.clear_cache()
    db.dispose_engines()


def reset(api, cid=DEMO, confirmation=None):
    return api.post(
        "/api/reset",
        headers={"X-Kira-Client": cid, "X-Kira-User": "Taufiq"},
        json={"confirmation": cid if confirmation is None else confirmation},
    )


def test_backup_contains_wal_and_reset_is_client_scoped(client):
    before = client.get("/api/status", headers={"X-Kira-Client": DEMO}).json()
    token = db.current_client.set(DEMO)
    try:
        with db.session_scope() as s:
            state.put(s, "wal_probe", {"seen": True})
    finally:
        db.current_client.reset(token)
    source = Path(db.engine_for(DEMO).url.database)
    assert Path(str(source) + "-wal").stat().st_size > 0
    response = reset(client)
    assert response.status_code == 200, response.text
    assert set(response.json()) == {"ok", "backup"} and response.json()["ok"] is True
    backup = Path(db.engine_for(DEMO).url.database).parent / response.json()["backup"]
    assert backup.is_file() and stat.S_IMODE(backup.stat().st_mode) == 0o600
    with closing(sqlite3.connect(backup)) as s:
        assert s.execute("pragma integrity_check").fetchone() == ("ok",)
        assert json.loads(
            s.execute("SELECT value FROM workflow_state WHERE key='wal_probe'").fetchone()[0]
        ) == {"seen": True}
        assert s.execute("select count(*) from raw_files").fetchone()[0] == sum(
            before["files"].values()
        )
        assert s.execute("select count(*) from match_runs where current=1").fetchone()[0] == 2
        assert s.execute("select count(*) from clean_rows").fetchone()[0] > 0
    after = client.get("/api/status", headers={"X-Kira-Client": DEMO}).json()
    assert after["step"] == 1 and not any(after["files"].values())
    assert after["cleaning"]["rules_version"] is None
    assert all(not x["done"] and x["rules"] == 0 for x in after["matching"].values())
    assert client.get("/api/analysis/summary", headers={"X-Kira-Client": DEMO}).status_code == 409
    assert (
        client.get("/api/analysis/summary", headers={"X-Kira-Client": OTHER}).json()["totals"][
            "matched"
        ]
        == 2
    )
    assert len(client.get("/api/clients").json()) == 3
    audits = client.get("/api/audit", headers={"X-Kira-Client": DEMO}).json()
    assert (
        len(audits) == 1 and audits[0]["action"] == "Reset demo" and audits[0]["actor"] == "Taufiq"
    )
    assert response.json()["backup"] in audits[0]["detail"]


@pytest.mark.parametrize("cid", ["", "merchant", "demo-copy", "zestly-demo-copy", "../zestly-demo"])
def test_non_demo_clients_are_refused_without_backup(client, cid):
    response = reset(client, cid)
    assert response.status_code == 409, response.text
    assert not list(
        Path(settings.database_url.removeprefix("sqlite:///")).parent.glob("*.bak-reset-*.db")
    )


def test_wrong_confirmation_preserves_data(client):
    response = reset(client, confirmation="RESET")
    assert response.status_code == 409
    assert (
        client.get("/api/analysis/summary", headers={"X-Kira-Client": DEMO}).json()["totals"][
            "matched"
        ]
        == 2
    )
    assert client.post("/api/reset", headers={"X-Kira-Client": DEMO}).status_code == 422


def test_backup_failure_preserves_data(client):
    with patch("kira.services.reset._backup", side_effect=OSError("No space")):
        response = reset(client)
    assert response.status_code == 409 and "backup" in response.json()["detail"].lower()
    assert (
        client.get("/api/analysis/summary", headers={"X-Kira-Client": DEMO}).json()["totals"][
            "matched"
        ]
        == 2
    )


def test_delete_failure_rolls_back_and_retains_backup(client):
    with patch("kira.services.reset.state.audit", side_effect=RuntimeError("Forced failure")):
        with pytest.raises(RuntimeError, match="Forced failure"):
            reset(client)
    assert (
        client.get("/api/analysis/summary", headers={"X-Kira-Client": DEMO}).json()["totals"][
            "matched"
        ]
        == 2
    )
    assert list(
        Path(settings.database_url.removeprefix("sqlite:///")).parent.glob("*.bak-reset-*.db")
    )


def test_bound_database_must_match_client(client):
    from kira.services.reset import reset_demo

    with db.session_scope() as s:
        with pytest.raises(ValueError, match="selected client"):
            reset_demo(s, DEMO, DEMO, "Test")


def test_repeated_resets_keep_distinct_backups(client):
    first = reset(client).json()["backup"]
    second = reset(client).json()["backup"]
    assert first != second
    directory = Path(db.engine_for(DEMO).url.database).parent
    assert (directory / first).is_file() and (directory / second).is_file()


def test_authentication_protects_reset(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_password", "test-password")
    monkeypatch.setattr(settings, "secret", "test-secret")
    assert reset(client).status_code == 401
