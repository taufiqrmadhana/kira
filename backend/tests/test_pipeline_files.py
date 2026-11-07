"""R2 service and API checks against the shared platform from Taufiq."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from kira import db
from kira.config import settings
from kira.models import AuditLog, FollowUp, MatchLink, MatchRun, RawFile
from kira.services import files, state

POS = b"id,branch,payment_amount,sales_datetime_out\n001,Central,100,2026-10-20\n"
BANK = b"keterangan,kredit,debit,saldo,account\nAIRPAY 001,100,0,100,001\n"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'kira.db'}")
    monkeypatch.setattr(settings, "auth_password", "r2-test-password")
    monkeypatch.setattr(settings, "auth_user", "rifat")
    monkeypatch.setattr(settings, "secret", "r2-test-signing-secret")
    monkeypatch.setattr(settings, "user", "Rifat")
    token = db.current_client.set("")
    from kira.api.app import create_app

    with TestClient(create_app()) as c:
        assert (
            c.post(
                "/api/login", json={"username": "rifat", "password": "r2-test-password"}
            ).status_code
            == 200
        )
        yield c
    db.current_client.reset(token)
    db.dispose_engines()


def upload(client, content=POS, name="pos.csv", area="pos", **kwargs):
    return client.post(
        f"/api/files/{area}", files={"uploads": (name, content, "text/csv")}, **kwargs
    )


def seed_results():
    with db.session_scope() as s:
        state.put(
            s, "conversion", {"at": "2026-11-07", "stale": False, "proposals": {}, "decisions": {}}
        )
        for stage in ("l1", "l2"):
            run = MatchRun(stage=stage, rule_ids=[], summary={}, run_by="Rifat")
            s.add(run)
            s.flush()
            s.add(MatchLink(run_id=run.id, rule_id="test", left_rows=[0], right_rows=[0]))
            state.put(s, f"run_{stage}", {"id": run.id})
        s.add(FollowUp(rid="sale-1", note="Keep this evidence", updated_by="Rifat"))


def assert_stale():
    with db.session_scope(write=False) as s:
        assert state.get(s, "conversion")["stale"] is True
        assert all(not r.current for r in s.scalars(select(MatchRun)))
        assert state.get(s, "run_l1") is None
        assert state.get(s, "run_l2") is None
        assert len(list(s.scalars(select(MatchLink)))) == 2
        assert s.scalar(select(FollowUp)).note == "Keep this evidence"


def test_upload_list_download_preserves_bytes_and_metadata(client):
    content = b"\xef\xbb\xbf" + POS.replace(b"\n", b"\r\n")
    response = upload(
        client, content=content, data={"folder": "Day 1"}, headers={"X-Kira-User": "Rifat"}
    )
    assert response.status_code == 200
    result = response.json()[0]
    assert result["status"] == "added"
    file_id = result["ids"][0]
    rows = client.get("/api/files").json()
    assert len(rows) == 1
    assert set(rows[0]) == {
        "id",
        "type",
        "name",
        "folder",
        "sheet",
        "size",
        "rows",
        "looks_like",
        "wrong_area",
        "uploaded_by",
        "uploaded_at",
    }
    assert rows[0] | {"uploaded_at": "ignored"} == {
        "id": file_id,
        "type": "pos",
        "name": "pos.csv",
        "folder": "Day 1",
        "sheet": None,
        "size": len(content),
        "rows": 1,
        "looks_like": None,
        "wrong_area": False,
        "uploaded_by": "Rifat",
        "uploaded_at": "ignored",
    }
    downloaded = client.get(f"/api/files/{file_id}/download")
    assert downloaded.status_code == 200
    assert downloaded.content == content
    assert "attachment" in downloaded.headers["content-disposition"]
    with db.session_scope(write=False) as s:
        stored = s.get(RawFile, file_id)
        assert stored.sha256 == hashlib.sha256(content).hexdigest()
        assert s.scalar(select(AuditLog)).actor == "Rifat"
        assert files.areas_filled(s) == {"pos": 1, "settlement": 0, "bank": 0}


def test_multiple_uploads_skip_duplicates_even_across_areas(client):
    response = client.post(
        "/api/files/pos",
        files=[
            ("uploads", ("one.csv", POS)),
            ("uploads", ("copy.csv", POS)),
            ("uploads", ("two.csv", POS.replace(b"001", b"002"))),
        ],
    )
    assert response.status_code == 200
    assert [r["status"] for r in response.json()] == ["added", "duplicate", "added"]
    assert len(client.get("/api/files").json()) == 2
    seed_results()
    assert upload(client, area="bank", name="renamed.csv").json()[0]["status"] == "duplicate"
    with db.session_scope(write=False) as s:
        assert state.get(s, "conversion")["stale"] is False
        assert all(r.current for r in s.scalars(select(MatchRun)))


def test_wrong_area_move_delete_and_committed_readback(client):
    file_id = upload(client, content=BANK, name="bank.csv").json()[0]["ids"][0]
    item = client.get("/api/files").json()[0]
    assert item["looks_like"] == "bank"
    assert item["wrong_area"] is True
    assert client.post(f"/api/files/{file_id}/move", json={"type": "bank"}).status_code == 422
    seed_results()
    assert client.post(f"/api/files/{file_id}/move", json={"to": "bank"}).status_code == 200
    item = client.get("/api/files").json()[0]
    assert item["type"] == "bank"
    assert item["wrong_area"] is False
    assert_stale()
    assert client.delete(f"/api/files/{file_id}").json() == {"ok": True}
    assert client.get("/api/files").json() == []
    assert client.get(f"/api/files/{file_id}/download").status_code == 409


@pytest.mark.parametrize("action", ["upload", "delete"])
def test_each_file_change_invalidates_results_without_deleting_evidence(client, action):
    file_id = upload(client).json()[0]["ids"][0]
    seed_results()
    response = (
        upload(client, content=BANK, name="bank.csv", area="bank")
        if action == "upload"
        else client.delete(f"/api/files/{file_id}")
    )
    assert response.status_code == 200
    assert_stale()


def test_noop_move_does_not_invalidate_results(client):
    file_id = upload(client).json()[0]["ids"][0]
    seed_results()
    assert client.post(f"/api/files/{file_id}/move", json={"to": "pos"}).status_code == 200
    with db.session_scope(write=False) as s:
        assert state.get(s, "conversion")["stale"] is False
        assert all(r.current for r in s.scalars(select(MatchRun)))


@pytest.mark.parametrize(
    "content,name",
    [
        (b"", "empty.csv"),
        (b"\xff\xfe\x00", "binary.csv"),
        (b'a,b\n"unterminated', "bad.csv"),
        (b"a,b\nx,y,z\n", "wide.csv"),
        (b"a,A\nx,y\n", "duplicate-headers.csv"),
        (POS, "book.xlsx"),
        (POS, "report.pdf"),
        (b"a,b\nx,\x00y\n", "nul.csv"),
    ],
)
def test_invalid_upload_is_rejected_without_changes(client, content, name):
    seed_results()
    response = upload(client, content=content, name=name)
    assert response.status_code == 400
    assert response.json()["detail"]
    assert client.get("/api/files").json() == []
    with db.session_scope(write=False) as s:
        assert state.get(s, "conversion")["stale"] is False


def test_failed_batch_rolls_back_files_audit_and_invalidation(client):
    seed_results()
    response = client.post(
        "/api/files/pos", files=[("uploads", ("good.csv", POS)), ("uploads", ("bad.csv", b"\xff"))]
    )
    assert response.status_code == 400
    assert client.get("/api/files").json() == []
    with db.session_scope(write=False) as s:
        assert s.scalar(select(AuditLog)) is None
        assert state.get(s, "conversion")["stale"] is False
        assert all(r.current for r in s.scalars(select(MatchRun)))


def test_size_limit_and_required_multipart_field(client, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    response = upload(client, content=b"x" * (1024 * 1024 + 1))
    assert response.status_code == 400
    assert "1 MB" in response.json()["detail"]
    assert client.post("/api/files/pos", files={"file": ("pos.csv", POS)}).status_code == 422
    assert client.get("/api/files").json() == []


def test_bad_areas_and_missing_ids(client):
    assert upload(client, area="unknown").status_code == 400
    file_id = upload(client).json()[0]["ids"][0]
    assert client.post(f"/api/files/{file_id}/move", json={"to": "unknown"}).status_code == 400
    assert client.post("/api/files/9999/move", json={"to": "bank"}).status_code == 409
    assert client.delete("/api/files/9999").status_code == 409


def test_authentication_and_workspace_isolation(client):
    file_id = upload(client).json()[0]["ids"][0]
    other = {"X-Kira-Client": "other"}
    assert client.get("/api/files", headers=other).json() == []
    assert client.get(f"/api/files/{file_id}/download", headers=other).status_code == 409
    assert client.delete(f"/api/files/{file_id}", headers=other).status_code == 409
    assert upload(client, headers=other).json()[0]["status"] == "added"
    client.cookies.clear()
    assert client.get("/api/files").status_code == 401
    assert upload(client).status_code == 401
    assert client.get(f"/api/files/{file_id}/download").status_code == 401


def test_names_and_txt_download_are_safe(client):
    response = upload(client, name="../laporan café.txt")
    assert response.status_code == 200
    item = client.get("/api/files").json()[0]
    assert item["name"] == "laporan café.txt"
    download = client.get(f"/api/files/{item['id']}/download")
    assert download.content == POS
    assert "filename*=utf-8''" in download.headers["content-disposition"]
    assert "%C3%A9" in download.headers["content-disposition"]


def test_service_writes_rollback_with_callers_transaction(client):
    with pytest.raises(RuntimeError):
        with db.session_scope() as s:
            files.add_file(s, "pos", "pos.csv", POS, "Rifat")
            raise RuntimeError("abort")
    assert client.get("/api/files").json() == []
