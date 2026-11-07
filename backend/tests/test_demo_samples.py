"""Bundled samples use the ordinary upload pipeline in the two demo workspaces."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.models import AuditLog
from kira.services import files, state

DEMO = "zestly-demo"
PRACTICE = "zestly-demo-latihan"
DATA = Path(__file__).resolve().parents[2] / "data/with-exceptions"
AREAS = {"POS": "pos", "SET": "settlement", "STA": "bank"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'samples.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    token = db.current_client.set("")
    try:
        with TestClient(
            create_app(), headers={"X-Kira-Client": DEMO, "X-Kira-User": "Rifat"}
        ) as api:
            yield api
    finally:
        db.current_client.reset(token)
        db.dispose_engines()


@pytest.fixture
def bundle(tmp_path, monkeypatch):
    root = tmp_path / "bundled"
    folder = root / "day-01-20261020"
    folder.mkdir(parents=True)
    for prefix in AREAS:
        (folder / f"{prefix}_20261020.csv").write_text(f"id,amount\n{prefix},100\n")
    monkeypatch.setattr(files, "SAMPLES", root)
    return folder


@pytest.mark.parametrize("day", range(1, 9))
def test_each_bundled_day_loads_three_original_files_and_commits(client, day):
    folder = next(DATA.glob(f"day-{day:02}-*"))
    response = client.post(f"/api/files/samples/{day}")
    assert response.status_code == 200, response.text
    added = response.json()
    assert len(added) == 3
    assert all(set(row) == {"name", "status", "ids"} and row["status"] == "added" for row in added)
    uploaded = client.get("/api/files").json()
    assert {row["type"] for row in uploaded} == set(AREAS.values())
    assert all(row["folder"] == folder.name and row["uploaded_by"] == "Rifat" for row in uploaded)
    for row in uploaded:
        assert row["type"] == AREAS[row["name"][:3]]
        assert (
            client.get(f"/api/files/{row['id']}/download").content
            == (folder / row["name"]).read_bytes()
        )
    assert client.get("/api/status").json()["files"] == {"pos": 1, "settlement": 1, "bank": 1}


def test_duplicates_preserve_current_state_and_other_clients_are_isolated(client, bundle):
    first = client.post("/api/files/samples/1").json()
    token = db.current_client.set(DEMO)
    try:
        with db.session_scope() as s:
            state.put(s, "conversion", {"stale": False, "decisions": {}, "proposals": {}})
        repeated = client.post("/api/files/samples/1").json()
        assert [row["status"] for row in repeated] == ["duplicate"] * 3
        assert [row["ids"] for row in repeated] == [row["ids"] for row in first]
        with db.session_scope(write=False) as s:
            assert state.get(s, "conversion")["stale"] is False
            assert len(list(s.scalars(select(AuditLog)))) == 3
    finally:
        db.current_client.reset(token)
    assert client.get("/api/files", headers={"X-Kira-Client": PRACTICE}).json() == []
    other = client.post("/api/files/samples/1", headers={"X-Kira-Client": PRACTICE})
    assert other.status_code == 200
    assert [row["status"] for row in other.json()] == ["added"] * 3
    assert len(client.get("/api/files").json()) == 3
    assert client.get("/api/files", headers={"X-Kira-Client": ""}).json() == []


@pytest.mark.parametrize("cid", ["", "merchant", "zestly-demo-copy", "demo", "../zestly-demo"])
def test_non_demo_workspaces_cannot_load_samples(client, cid):
    response = client.post("/api/files/samples/1", headers={"X-Kira-Client": cid})
    assert response.status_code == 409
    assert "demo" in response.json()["detail"].lower()
    assert client.get("/api/files", headers={"X-Kira-Client": cid}).json() == []


@pytest.mark.parametrize("day", [-1, 0, 9, 100])
def test_day_must_be_in_the_bundled_range(client, day):
    response = client.post(f"/api/files/samples/{day}")
    assert response.status_code == 400
    assert "1" in response.json()["detail"] and "8" in response.json()["detail"]
    assert client.get("/api/files").json() == []


@pytest.mark.parametrize(
    "problem", ["missing-source", "duplicate-source", "duplicate-day", "outside-root"]
)
def test_incomplete_or_ambiguous_bundle_is_rejected_before_any_upload(
    client, bundle, monkeypatch, problem
):
    bank = bundle / "STA_20261020.csv"
    if problem == "missing-source":
        bank.unlink()
    elif problem == "duplicate-source":
        (bundle / "STA_copy.csv").write_text(bank.read_text())
    elif problem == "duplicate-day":
        (bundle.parent / "day-01-copy").mkdir()
    else:
        outside = bundle.parent.parent / "outside.csv"
        outside.write_text(bank.read_text())
        bank.unlink()
        bank.symlink_to(outside)
    monkeypatch.setattr(files, "add_file", lambda *args: pytest.fail("Validate every source first"))
    response = client.post("/api/files/samples/1")
    assert response.status_code == 409
    assert client.get("/api/files").json() == []


def test_missing_bundle_returns_workflow_error(client, tmp_path, monkeypatch):
    monkeypatch.setattr(files, "SAMPLES", tmp_path / "not-installed")
    assert client.post("/api/files/samples/1").status_code == 409
    assert client.get("/api/files").json() == []


def test_all_sources_are_read_before_upload_and_io_failure_is_atomic(client, bundle, monkeypatch):
    read_bytes = Path.read_bytes

    def unreadable(path):
        if path.name.startswith("STA_"):
            raise OSError("unreadable source")
        return read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", unreadable)
    monkeypatch.setattr(files, "add_file", lambda *args: pytest.fail("Read every source first"))
    assert client.post("/api/files/samples/1").status_code == 409
    assert client.get("/api/files").json() == []


def test_invalid_sample_rolls_back_uploads_audit_and_conversion(client, bundle):
    token = db.current_client.set(DEMO)
    try:
        with db.session_scope() as s:
            state.put(s, "conversion", {"stale": False, "decisions": {}, "proposals": {}})
        (bundle / "STA_20261020.csv").write_bytes(b"\xff")
        assert client.post("/api/files/samples/1").status_code == 400
        assert client.get("/api/files").json() == []
        with db.session_scope(write=False) as s:
            assert s.scalar(select(AuditLog)) is None
            assert state.get(s, "conversion")["stale"] is False
    finally:
        db.current_client.reset(token)


def test_service_requires_the_selected_demo_database(client):
    token = db.current_client.set(DEMO)
    try:
        with db.session_scope(write=False) as s:
            other = db.current_client.set(PRACTICE)
            try:
                with pytest.raises(state.WorkflowError, match="selected client"):
                    files.add_samples(s, "Rifat", 1)
            finally:
                db.current_client.reset(other)
    finally:
        db.current_client.reset(token)


def test_sample_loading_requires_authentication(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_password", "secret-for-test")
    assert client.post("/api/files/samples/1").status_code == 401
