import asyncio
import json
import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_matching_api import seed
from test_matching_engine import ID, WITHDRAWAL
from test_pipeline_convert import SETTLEMENT, create_rules, upload_three
from test_pipeline_files import BANK, POS, upload
from test_pipeline_files import client as client

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.models import AuditLog, MatchRun, ParsedRow
from kira.services import convert, state


def events(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/x-ndjson")
    return [json.loads(line) for line in response.text.splitlines() if line]


def test_conversion_stream_reports_real_areas_then_committed_result(client):
    upload_three(client)
    output = events(client.post("/api/convert/stream"))
    progress = [event for event in output if event["type"] == "progress" and "area" in event]
    assert list(dict.fromkeys(e["area"] for e in progress)) == ["pos", "settlement", "bank"]
    for area in state.TYPES:
        checkpoints = [e for e in progress if e["area"] == area]
        assert checkpoints[0]["completed"] == 0
        assert [e["completed"] for e in checkpoints] == [0, 1, 2, 3]
        assert all(e["total"] == 3 and e["unit"] == "steps" for e in checkpoints)
    assert output[-1]["type"] == "complete"
    assert output[-1]["result"] == client.get("/api/convert").json()
    assert output[-1]["result"]["decisions"] == dict.fromkeys(state.TYPES, "new")


def test_conversion_failure_rolls_back_staged_tables_and_audit(client, monkeypatch):
    upload_three(client)
    create_rules(client)
    before = client.get("/api/convert").json()
    with db.session_scope(write=False) as session:
        parsed = [(row.id, row.data) for row in session.scalars(select(ParsedRow))]
        audits = len(list(session.scalars(select(AuditLog))))
    original = convert._propose

    def fail_bank(session, area, rule, **kwargs):
        if area == "bank":
            raise ValueError("Invalid bank header")
        return original(session, area, rule, **kwargs)

    monkeypatch.setattr(convert, "_propose", fail_bank)
    output = events(client.post("/api/convert/stream"))
    assert output[-1] == {"type": "error", "detail": "Invalid bank header", "status": 400}
    assert not any(event["type"] == "complete" for event in output)
    assert client.get("/api/convert").json() == before
    with db.session_scope(write=False) as session:
        assert [(row.id, row.data) for row in session.scalars(select(ParsedRow))] == parsed
        assert len(list(session.scalars(select(AuditLog)))) == audits


def test_stream_never_reports_complete_when_commit_fails(client, monkeypatch):
    upload_three(client)
    before = client.get("/api/convert").json()

    def fail_commit(_session):
        raise RuntimeError("Private database failure")

    monkeypatch.setattr(Session, "commit", fail_commit)
    output = events(client.post("/api/convert/stream"))
    assert output[-1]["type"] == "error"
    assert "Private" not in output[-1]["detail"]
    assert not any(event["type"] == "complete" for event in output)
    assert client.get("/api/convert").json() == before


def test_stream_preserves_client_context_and_owns_session_in_one_worker(client, monkeypatch):
    headers = {"X-Kira-Client": "stream-test", "X-Kira-User": "Progress tester"}
    for area, data in [("pos", POS), ("settlement", SETTLEMENT), ("bank", BANK)]:
        assert upload(client, area=area, content=data, headers=headers).status_code == 200
    original_convert, original_commit = convert.convert, Session.commit
    seen = []

    def checked(session, actor, **kwargs):
        session.info["stream_thread"] = threading.get_ident()
        seen.append((db.current_client.get(), actor))
        return original_convert(session, actor, **kwargs)

    def commit(session):
        if "stream_thread" in session.info:
            assert session.info["stream_thread"] == threading.get_ident()
        return original_commit(session)

    monkeypatch.setattr(convert, "convert", checked)
    monkeypatch.setattr(Session, "commit", commit)
    output = events(client.post("/api/convert/stream", headers=headers))
    assert output[-1]["type"] == "complete"
    assert seen == [("stream-test", "Progress tester")]
    assert client.get("/api/convert").json() is None
    assert client.get("/api/convert", headers=headers).json() == output[-1]["result"]


def test_stream_authentication_workflow_validation_and_write_lock(client):
    with TestClient(create_app()) as signed_out:
        assert signed_out.post("/api/convert/stream").status_code == 401
    output = events(client.post("/api/convert/stream"))
    assert output == [
        {
            "type": "error",
            "detail": "Upload files to POS, Settlement and Mutation before converting",
            "status": 409,
        }
    ]
    with db.session_scope():
        output = events(client.post("/api/convert/stream"))
    assert output[-1]["type"] == "error" and output[-1]["status"] == 409
    assert "busy" in output[-1]["detail"].lower()


def test_matching_stream_results_are_committed_and_legacy_contract_stays_intact(client):
    with db.session_scope() as session:
        seed(session)
    for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
        saved = client.post(
            f"/api/matching/{stage}/rules", json={"kind": rule["kind"], "params": rule["params"]}
        )
        assert saved.status_code == 200
        output = events(client.post(f"/api/matching/{stage}/run/stream", json={}))
        assert output[0]["type"] == "progress"
        assert output[-1]["type"] == "complete"
        result = output[-1]["result"]
        assert result["matched"] == result["total"] == 2
        with db.session_scope(write=False) as session:
            run = session.get(MatchRun, result["run_id"])
            assert run is not None and run.current
        old = client.post(f"/api/matching/{stage}/run", json={}).json()
        assert {key: value for key, value in result.items() if key != "run_id"} == {
            key: value for key, value in old.items() if key != "run_id"
        }
    assert client.get("/api/matching/results").json()["totals"]["full"] == 2
    invalid = events(client.post("/api/matching/nope/run/stream", json={}))
    assert invalid[-1]["status"] == 409
    other = events(
        client.post("/api/matching/l1/run/stream", json={}, headers={"X-Kira-Client": "other"})
    )
    assert other[-1]["type"] == "error"


def test_failed_matching_commit_keeps_both_existing_runs(client, monkeypatch):
    with db.session_scope() as session:
        seed(session)
    from test_matching_api import run

    run(client)
    before = client.get("/api/matching/results").json()
    with db.session_scope(write=False) as session:
        current = [(row.id, row.current) for row in session.scalars(select(MatchRun))]

    def fail_commit(_session):
        raise RuntimeError("Cannot commit")

    monkeypatch.setattr(Session, "commit", fail_commit)
    output = events(client.post("/api/matching/l1/run/stream", json={}))
    assert output[-1]["type"] == "error"
    assert not any(event["type"] == "complete" for event in output)
    assert client.get("/api/matching/results").json() == before
    with db.session_scope(write=False) as session:
        assert [(row.id, row.current) for row in session.scalars(select(MatchRun))] == current


@pytest.mark.asyncio
async def test_disconnected_stream_rolls_back_and_releases_its_session(tmp_path, monkeypatch):
    from kira.api.progress import stream_write

    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'cancel.db'}")
    token = db.current_client.set("")
    resume, finished = threading.Event(), threading.Event()

    def operation(session, progress):
        try:
            state.put(session, "cancel-test", {"saved": True})
            progress({"completed": 0, "total": 1})
            assert resume.wait(5)
            progress({"completed": 1, "total": 1})
            return {"ok": True}
        finally:
            finished.set()

    response = stream_write(operation)
    iterator = response.body_iterator
    assert json.loads(await anext(iterator))["type"] == "progress"
    await iterator.aclose()
    resume.set()
    assert await asyncio.to_thread(finished.wait, 5)
    # Acquiring the same write lock waits for the worker's rollback to finish.
    with db.session_scope() as session:
        assert state.get(session, "cancel-test") is None
    db.current_client.reset(token)
    db.dispose_engines()
