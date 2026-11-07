import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import inspect, select

from kira import db
from kira.config import settings
from kira.models import CleaningRules, CleanRow, FollowUp, MatchRun, RawFile, UploadRule
from kira.services import clients, learning, state, status


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'kira.db'}")
    token = db.current_client.set("")
    yield
    db.current_client.reset(token)
    db.dispose_engines()


def test_schema_and_empty_status():
    db.init_db()
    assert set(inspect(db.engine_for("")).get_table_names()) == {
        "raw_files",
        "upload_rules",
        "parsed_rows",
        "cleaning_rules",
        "clean_rows",
        "matching_rules",
        "match_runs",
        "match_links",
        "manual_links",
        "force_match_approvals",
        "follow_ups",
        "workflow_state",
        "audit_log",
        "outlet_profiles",
    }
    with db.session_scope(write=False) as s:
        assert status.status(s) == {
            "step": 1,
            "next": {"tool": "add_sample_files", "say": "Add files to POS, Settlement, Mutation."},
            "files": {"pos": 0, "settlement": 0, "bank": 0},
            "converted": False,
            "upload_rules_pending": [],
            "cleaning": {"open": 0, "rules_version": None},
            "tables": {},
            "matching": {"l1": {"done": False, "rules": 0}, "l2": {"done": False, "rules": 0}},
        }


def test_transactions_client_isolation_and_json_updates():
    with db.session_scope() as s:
        state.put(s, "example", {"nested": {"value": 1}})
        state.audit(s, "Taufiq", "Created", "example")
    with db.session_scope() as s:
        value = state.get(s, "example")
        value["nested"]["value"] = 2
        state.put(s, "example", value)
    with pytest.raises(RuntimeError):
        with db.session_scope() as s:
            state.put(s, "example", {"bad": True})
            raise RuntimeError("rollback")
    with db.session_scope(write=False) as s:
        assert state.get(s, "example") == {"nested": {"value": 2}}
        assert status.audit_log(s)[0]["actor"] == "Taufiq"
    token = db.current_client.set("second")
    try:
        with db.session_scope(write=False) as s:
            assert state.get(s, "example") is None
    finally:
        db.current_client.reset(token)


def test_read_session_does_not_commit_accidental_writes():
    with db.session_scope(write=False) as s:
        state.put(s, "not_saved", {})
    with db.session_scope(write=False) as s:
        assert state.get(s, "not_saved") is None


def test_write_lock_times_out_without_blocking_reads():
    ready, release = threading.Event(), threading.Event()

    def hold_lock():
        with db.session_scope():
            ready.set()
            release.wait(2)

    with ThreadPoolExecutor() as pool:
        future = pool.submit(hold_lock)
        assert ready.wait(2)
        try:
            with pytest.raises(db.Busy):
                with db.session_scope(wait=0.01):
                    pass
            with db.session_scope(write=False) as s:
                assert state.get(s, "none") is None
        finally:
            release.set()
        future.result()


def test_safe_clients_are_shared_and_context_restored():
    assert db.client_id("../outside") == ""
    assert db.client_id("a" * 41) == ""
    assert db.client_id("zestly-demo") == "zestly-demo"
    token = db.current_client.set("second")
    try:
        assert clients.save_client("Kopi Nusantara") == {
            "id": "kopi-nusantara",
            "name": "Kopi Nusantara",
        }
        assert clients.save_client("Updated", "kopi-nusantara")["name"] == "Updated"
        assert db.current_client.get() == "second"
        assert clients.list_clients()[0] == {"id": "", "name": settings.client_name}
        assert clients.list_clients()[1] == {"id": "kopi-nusantara", "name": "Updated"}
        with pytest.raises(state.WorkflowError):
            clients.save_client("Unsafe", "../bad")
    finally:
        db.current_client.reset(token)


def test_clear_matching_preserves_history_and_follow_ups():
    with db.session_scope() as s:
        s.add_all(
            [
                MatchRun(stage="l1", rule_ids=["PS1"], summary={}, run_by="Taufiq"),
                MatchRun(stage="l2", rule_ids=["SM1"], summary={}, run_by="Taufiq"),
                FollowUp(rid="pos:sale-1", note="Check tomorrow", updated_by="Taufiq"),
            ]
        )
    with db.session_scope() as s:
        state.clear_matching(s, "l1")
    with db.session_scope(write=False) as s:
        assert all(not r.current for r in s.scalars(select(MatchRun)))
        assert s.scalar(select(FollowUp)).note == "Check tomorrow"


def test_table_order_and_learning_events_persist():
    with db.session_scope() as s:
        s.add(
            UploadRule(
                type="pos",
                version=1,
                delimiter=",",
                columns=[{"name": "sale", "type": "text", "keep": True}],
                created_by="Taufiq",
            )
        )
        s.add_all(
            [
                CleanRow(type="pos", row_no=2, source_row=2, data={"sale": "second"}),
                CleanRow(type="pos", row_no=1, source_row=1, data={"sale": "first"}),
            ]
        )
        learning.note(s, "upload", table="pos", choice="create")
    with db.session_scope(write=False) as s:
        assert state.clean_tables(s)["pos"]["rows"] == [{"sale": "first"}, {"sale": "second"}]
        assert state.get(s, "learning")[0]["kind"] == "upload"


def test_empty_workflow_contract_and_client_session():
    with db.session_scope() as s:
        clients.save_client("Demo", session=s)
        assert clients.list_clients(session=s)[1]["id"] == "demo"
    with db.session_scope(write=False) as s:
        result = status.workflow(s)
        assert set(result) == {
            "status",
            "files",
            "conversion",
            "upload_rules",
            "cleaning",
            "tables",
            "matching",
        }
        assert result["matching"] == {
            "rules": [],
            "stages": result["status"]["matching"],
            "results": None,
        }
        assert result["tables"]["parsed"]["pos"]["total"] == 0
        assert result["tables"]["clean"]["bank"]["dropped"] == 0


def test_status_requires_decisions_to_be_saved_and_stale_conversion_to_rerun():
    with db.session_scope() as s:
        for table in state.TYPES:
            s.add(
                RawFile(
                    type=table,
                    name=f"{table}.csv",
                    sha256=table,
                    size=1,
                    content=b"x",
                    text="x",
                    uploaded_by="Taufiq",
                )
            )
        assert status.status(s)["step"] == 2
        state.put(
            s,
            "conversion",
            {
                "at": "2026-11-07",
                "stale": False,
                "proposals": {"pos": {}},
                "decisions": {"pos": "new"},
            },
        )
        assert status.status(s)["upload_rules_pending"] == ["pos"]
        state.put(
            s,
            "conversion",
            {
                "at": "2026-11-07",
                "stale": False,
                "proposals": {"pos": {}},
                "decisions": {"pos": "created"},
            },
        )
        s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="Taufiq"))
        state.put(s, "recommendations", [{"id": "bank.exclude", "decision": "accept"}])
        assert status.status(s)["step"] == 3
        state.put(s, "recommendations", [])
        assert status.status(s)["step"] == 4
        conversion = state.get(s, "conversion")
        conversion["stale"] = True
        state.put(s, "conversion", conversion)
        assert status.status(s)["converted"] is False
        assert status.status(s)["next"]["tool"] == "convert_files"
