"""Cross-request reuse must isolate clients and never publish uncommitted evidence."""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from sqlalchemy import select
from test_matching_api import seed
from test_matching_engine import ID, WITHDRAWAL

from kira import db
from kira.config import settings
from kira.models import CleaningRules, CleanRow
from kira.services import analysis, manual, match, performance, state


@pytest.fixture
def database(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'cache.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    monkeypatch.setattr(analysis, "schedule_warm", lambda engine: None)
    analysis.clear_cache()
    with db.session_scope() as s:
        seed(s)
        for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
            match.save_rule(s, stage, rule["kind"], rule["params"], "Test")
            match.run(s, stage, "Test")
    yield
    analysis.clear_cache()
    db.dispose_engines()


def read_full():
    with db.session_scope(write=False) as s:
        return analysis.summary(s)["totals"]["matched"]


def test_reuses_load_and_normalises_scope_across_sessions(database):
    with patch.object(analysis, "_tables", wraps=analysis._tables) as tables:
        with patch.object(analysis.core, "aggregate", wraps=analysis.core.aggregate) as aggregate:
            with db.session_scope(write=False) as s:
                first = analysis.summary(s)
            with db.session_scope(write=False) as s:
                assert analysis.summary(s, {"provider": "", "outlet": None}) == first
                analysis.rates(s)
                analysis.overview(s)
            assert tables.call_count == aggregate.call_count == 1


def test_cached_responses_are_isolated(database):
    with db.session_scope(write=False) as s:
        analysis.summary(s)["facets"]["outlets"].append("Injected")
        analysis.records(s)["records"][0]["pos"]["sales_number"] = "Injected"
        analysis.rates(s)["rows"][0]["pos"] = -1
    with db.session_scope(write=False) as s:
        assert "Injected" not in analysis.summary(s)["facets"]["outlets"]
        assert analysis.records(s)["records"][0]["pos"]["sales_number"] == "P1"
        assert analysis.rates(s)["rows"][0]["pos"] > 0
        assert analysis.side(s, "pos", "l1")["rows"][0]["row"]["sales_number"] == "P1"


def test_client_isolation(database):
    assert read_full() == 2
    token = db.current_client.set("another")
    try:
        with db.session_scope() as s:
            seed(s)
            match.run(s, "l1", "Test", [])
            match.run(s, "l2", "Test", [])
        assert read_full() == 0
    finally:
        db.current_client.reset(token)
    assert read_full() == 2


def test_rerun_and_clear_matching_invalidate(database):
    assert read_full() == 2
    with db.session_scope() as s:
        match.run(s, "l1", "Test", [])
        match.run(s, "l2", "Test", [])
    assert read_full() == 0
    with db.session_scope() as s:
        state.clear_matching(s)
    with pytest.raises(state.WorkflowError):
        read_full()


def test_manual_link_and_undo_invalidate(database):
    with db.session_scope() as s:
        match.run(s, "l1", "Test", [])
        match.run(s, "l2", "Test", [])
    assert read_full() == 0
    with db.session_scope() as s:
        manual.create(s, "l1", [0], [0], "Checked", "Test")
        link = manual.create(s, "l2", [0, 1], [0], "Checked", "Test")
    assert read_full() == 1
    with db.session_scope() as s:
        manual.delete(s, link["id"], "Test")
    assert read_full() == 0


def test_rollback_never_publishes_uncommitted_results(database):
    assert read_full() == 2
    with pytest.raises(RuntimeError):
        with db.session_scope() as s:
            match.run(s, "l1", "Test", [])
            match.run(s, "l2", "Test", [])
            assert analysis.summary(s)["totals"]["matched"] == 0
            raise RuntimeError("Rollback")
    assert read_full() == 2


def test_cleaned_rows_and_version_invalidate(database):
    with db.session_scope(write=False) as s:
        old = analysis.records(s)
    with db.session_scope() as s:
        row = s.scalar(select(CleanRow).where(CleanRow.type == "pos", CleanRow.row_no == 0))
        row.data = {**row.data, "payment_amount": 123}
        s.add(CleaningRules(version=2, maps={}, exclude={}, created_by="Test"))
    with db.session_scope(write=False) as s:
        fresh = analysis.records(s)
        assert (
            old["records"][0]["pos"]["payment_amount"]
            != fresh["records"][0]["pos"]["payment_amount"]
        )


def test_performance_cache_and_profile_changes(database):
    with db.session_scope() as s:
        performance.profiles(s)
    with patch.object(performance, "_context", wraps=performance._context) as context:
        with db.session_scope(write=False) as s:
            first = performance.outlets(s)
        with db.session_scope(write=False) as s:
            assert performance.outlets(s, {"city": ""}) == first
        assert context.call_count == 1
        with db.session_scope() as s:
            performance.save_profiles(
                s, [{"outlet": first["rows"][0]["outlet"], "city": "New city"}], "Test"
            )
        with db.session_scope(write=False) as s:
            assert performance.outlets(s)["rows"][0]["city"] == "New city"
        assert context.call_count == 2


def test_lru_bound_and_concurrent_reads_compute_once(database):
    with patch.object(analysis, "_tables", wraps=analysis._tables) as tables:
        with ThreadPoolExecutor(max_workers=4) as executor:
            assert list(executor.map(lambda _: read_full(), range(4))) == [2] * 4
        assert tables.call_count == 1
    with db.session_scope(write=False) as s:
        for offset in range(40):
            analysis.records(s, offset=offset)
    assert analysis.cache_info()["size"] <= 32


def test_warm_populates_common_endpoints(database):
    analysis.warm_cache(db.engine_for(""))
    with patch.object(analysis, "_tables", side_effect=AssertionError("Warm cache missed")):
        with db.session_scope(write=False) as s:
            assert analysis.summary(s)["totals"]["matched"] == 2
            analysis.rates(s)
            analysis.gaps(s)
            analysis.gaps(s, by_day=True)
            analysis.overview(s)
            performance.outlets(s)


def test_slow_client_does_not_block_other_clients_or_invalidation(database):
    from threading import Event

    started, release = Event(), Event()
    engine = db.engine_for("")
    other = db.engine_for("other")

    def slow():
        from sqlalchemy.orm import Session

        with Session(engine) as s:

            def compute():
                started.set()
                assert release.wait(5)
                return {"done": True}

            return analysis._cached(s, "slow", (), compute)

    def fast():
        from sqlalchemy.orm import Session

        with Session(other) as s:
            return analysis._cached(s, "fast", (), lambda: {"done": True})

    with ThreadPoolExecutor(max_workers=3) as executor:
        pending = executor.submit(slow)
        assert started.wait(2)
        try:
            assert executor.submit(fast).result(timeout=1) == {"done": True}
            executor.submit(analysis.clear_cache, engine).result(timeout=1)
        finally:
            release.set()
        assert pending.result(timeout=2) == {"done": True}


def test_warming_matches_http_default_parameters(database):
    from fastapi.testclient import TestClient
    from kira.api.app import create_app

    analysis.warm_cache(db.engine_for(""))
    with patch.object(analysis.core, "rate_rows", side_effect=AssertionError("Warm rates missed")):
        api = TestClient(create_app())
        assert api.get("/api/analysis/rates").status_code == 200
        assert (
            api.get("/api/analysis/rates?limit=1000&by_outlet=true&by_provider=false").status_code
            == 200
        )


def test_warm_starts_after_commit_and_never_after_rollback(database, monkeypatch):
    warmed = []
    monkeypatch.setattr(analysis, "schedule_warm", warmed.append)
    with db.session_scope() as s:
        match.run(s, "l2", "Test")
        assert warmed == []
    assert warmed == [db.engine_for("")]
    warmed.clear()
    with pytest.raises(RuntimeError):
        with db.session_scope() as s:
            match.run(s, "l2", "Test")
            assert warmed == []
            raise RuntimeError("Rollback")
    assert warmed == []


def test_startup_warms_each_client(database, monkeypatch):
    from kira.services import clients

    clients.save_client("Another", "another")
    warmed = []
    monkeypatch.setattr(analysis, "schedule_warm", warmed.append)
    analysis.warm_startup()
    assert set(warmed) == {db.engine_for(""), db.engine_for("another")}


def test_followup_save_refreshes_notes_and_learning_without_a_run(database):
    from kira.services import learning

    with db.session_scope(write=False) as s:
        assert analysis.follow_ups(s)["records"] == []
        assert learning.summary(s)["knowledge"]["resolved_follow_ups"] == 0
        rid = analysis.records(s)["records"][0]["rid"]
    with db.session_scope() as s:
        analysis.set_follow_up(s, rid, "resolved", "Bank confirmed", "Taufiq", "Test")
    with db.session_scope(write=False) as s:
        assert analysis.follow_ups(s)["records"][0]["follow_up"]["note"] == "Bank confirmed"
        assert learning.summary(s)["knowledge"]["resolved_follow_ups"] == 1


def test_matching_response_cannot_mutate_cached_evidence(database):
    with db.session_scope(write=False) as s:
        first = match.results(s, with_rows=True)
        first["totals"]["full"] = -1
        first["groups"][0]["rows"][0]["reason"] = "Injected"
    with db.session_scope(write=False) as s:
        assert match.results(s, with_rows=True)["groups"][0]["rows"][0]["reason"] != "Injected"
        assert match.results(s)["totals"]["full"] == 2


def test_background_warm_is_async_and_deduplicated(database, monkeypatch, quiescent_analysis_cache):
    from threading import Event

    entered, release = Event(), Event()

    def warm(engine):
        entered.set()
        assert release.wait(3)

    monkeypatch.setattr(analysis, "warm_cache", warm)
    engine = db.engine_for("")
    worker = quiescent_analysis_cache(engine)
    assert entered.wait(1)
    try:
        assert worker.is_alive()
        assert quiescent_analysis_cache(engine) is None
    finally:
        release.set()
        worker.join(timeout=2)
    assert not worker.is_alive()
