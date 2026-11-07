import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_matching_api import seed
from test_matching_engine import ID, WITHDRAWAL, demo_tables, tables

from kira import db
from kira.api.app import create_app
from kira.config import settings
from kira.core import analysis as core
from kira.core import matching
from kira.models import CleaningRules, CleanRow, FollowUp
from kira.services import analysis, followup, learning, manual, match, state


@pytest.fixture
def database(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'analysis.db'}")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    db.init_db()
    yield
    db.dispose_engines()


def match_all(s):
    for stage, rule in (("l1", ID), ("l2", WITHDRAWAL)):
        match.save_rule(s, stage, rule["kind"], rule["params"], "Nurwan")
        match.run(s, stage, "Nurwan")


def test_harbor_followups_all_pages_and_agent_limit(database):
    T, _ = demo_tables("with-exceptions")
    with db.session_scope() as s:
        state.put(s, "conversion", {"stale": False})
        s.add(CleaningRules(version=1, maps={}, exclude={}, created_by="Rifat"))
        for area, table in T.items():
            s.add_all(
                [
                    CleanRow(type=area, row_no=i, source_row=i, data=row, was={})
                    for i, row in enumerate(table["rows"])
                ]
            )
        for area in ("pos", "settlement", "bank"):
            learning.note(s, "upload", table=area, choice="create")
        for card in ("branch", "bank"):
            learning.note(s, "cleaning", id=card)
        match_all(s)
    scope = {
        "outlet": "Zestly Harbor Square Surabaya",
        "date_from": "2026-10-24",
        "date_to": "2026-10-24",
    }
    with db.session_scope(write=False) as s:
        rate = analysis.rates(s, scope)["rows"][0]
        assert rate["r_full"] == 0
        stl = analysis.side(s, "settlement", "l2", scope, limit=100)
        assert stl["total"] == 142
        assert len(stl["rows"]) == 100
        assert stl["aggregates"]["nett_amount"]["sum"] == 9031421
        assert analysis.side(s, "bank", "l2", scope)["total"] == 0
        drafted = followup.draft(s, f=scope, lang="id")
        assert len(drafted["groups"]) == 1
        assert len(drafted["drafts"]) == 142
        assert "Rp 9.031.421" in drafted["groups"][0]["note"]
        assert "3 hari" in drafted["groups"][0]["note"]
        assert analysis.follow_ups(s, scope, limit=1001)["total"] == 142
        assert learning.summary(s)["closes"][0]["questions"] == 7
        assert not list(s.scalars(select(FollowUp)))
    with db.session_scope() as s:
        items = [
            {k: r[k] for k in ("rid", "status", "note", "assignee")} for r in drafted["drafts"]
        ]
        assert analysis.save_bulk(s, items, "Nurwan")["saved"] == 142
        match.run(s, "l1", "Nurwan")
        match.run(s, "l2", "Nurwan")
    with db.session_scope(write=False) as s:
        assert analysis.follow_ups(s, scope, status="investigating")["total"] == 142
        assert followup.draft(s, f=scope)["skipped"] == 142
        assert learning.summary(s)["closes"][-1]["questions"] == 0
        assert analysis.overview(s)["results"]["totals"]["full"] == 8637
        assert analysis.overview(s)["results"]["totals"]["linked"] == 8639


def test_side_links_rates_scope_export_and_validation(database):
    with db.session_scope() as s:
        seed(s)
        match_all(s)
    with TestClient(create_app()) as api:
        rows = api.get("/api/analysis/side/l2/settlement").json()
        assert rows["rows"][0]["link"] == rows["rows"][1]["link"]
        bank = api.get(
            "/api/analysis/side/l2/bank", params={"links": rows["rows"][0]["link"]}
        ).json()
        assert bank["total"] == 1 and bank["rows"][0]["pays"] == 2
        assert bank["aggregates"]["kredit"]["sum"] == 1000
        selected = api.get("/api/analysis/rates", params={"keys": "P1"}).json()
        assert selected["totals"]["bank_credit"] == 600
        exported = api.get("/api/analysis/export", params={"keys": "P1"})
        assert exported.status_code == 200 and len(exported.text.splitlines()) == 2
        for path in (
            "/api/analysis/rates?period=bad",
            "/api/analysis/summary?date_from=bad",
            "/api/analysis/side/l1/bank",
            "/api/analysis/records?date_from=2026-10-25&date_to=2026-10-24",
        ):
            assert api.get(path).status_code == 409


def test_manual_links_survive_runs_but_ignore_changed_rows(database):
    with db.session_scope() as s:
        seed(s)
        match.run(s, "l1", "Nurwan", [])
        match.run(s, "l2", "Nurwan", [])
        manual.create(s, "l1", [0], [0], "Checked the shared ID", "Nurwan")
        manual.create(s, "l2", [0, 1], [0], "Checked withdrawal", "Nurwan")
        assert match.results(s)["totals"]["full"] == 1
        with pytest.raises(state.WorkflowError):
            manual.create(s, "l1", [0], [1], "Wrong duplicate", "Nurwan")
        match.run(s, "l1", "Nurwan", [])
        match.run(s, "l2", "Nurwan", [])
        assert match.results(s)["totals"]["full"] == 1
        row = s.scalar(select(CleanRow).where(CleanRow.type == "pos", CleanRow.row_no == 0))
        row.data = {**row.data, "payment_amount": 123}
        s.flush()
        assert manual.list_links(s)[0]["valid"] is False
        assert match.results(s)["totals"]["full"] == 0


def test_rule_order_preview_exclude_and_persistent_ids(database):
    with db.session_scope() as s:
        seed(s)
        match_all(s)
        second = match.save_rule(s, "l1", "id", ID["params"], "Nurwan")
        assert match.preview(s, "l1", "id", ID["params"])["extra_after_saved"] == 0
        assert (
            match.preview(s, "l1", "id", ID["params"], exclude=second["id"])["extra_after_saved"]
            == 0
        )
        match.run(s, "l1", "Nurwan")
        match.run(s, "l2", "Nurwan")
        match.order_rules(s, "l1", [second["id"], "PS1"], "Nurwan")
        assert match.results(s) is None
        match.delete_rule(s, second["id"], "Nurwan")
        s.flush()
        assert match.save_rule(s, "l1", "id", ID["params"], "Nurwan")["id"] == "PS3"


def test_rule_kinds_review_and_time_boundary():
    t = tables()
    t["settlement"]["rows"][0]["transaction_date"] = "2026-10-24T12:01:00+07:00"
    composite = {
        "id": "PS2",
        "kind": "composite",
        "params": {"outlet": True, "method": False, "amountTol": 0, "window": 1},
    }
    assert matching.run_l1([composite], t)["matched"] == 1
    t["settlement"]["rows"][0]["transaction_date"] = "2026-10-24T12:01:01+07:00"
    assert matching.run_l1([composite], t)["matched"] == 0
    t = tables()
    t["bank"]["rows"][0].update(keterangan="S1 payment", kredit=600)
    ref = {"id": "SM2", "kind": "ref", "params": {"amountTol": 0}}
    assert matching.run_l2([ref], t)["matched"] == 1
    t["bank"]["rows"][0]["keterangan"] = "unidentified"
    amount = {"id": "SM3", "kind": "amount", "params": {"amountTol": 0}}
    l2 = matching.run_l2([amount], t)
    assert l2["links"][0]["review"] is True
    assert matching.final_result(t, matching.run_l1([ID], t), l2)["totals"]["review"] == 1
    t["bank"]["rows"].append(copy.deepcopy(t["bank"]["rows"][0]))
    assert matching.run_l2([amount], t)["ambiguous"] == [0]


def test_day_eight_is_fully_matched():
    T, _ = demo_tables("with-exceptions", day8=True)
    final = matching.final_result(T, matching.run_l1([ID], T), matching.run_l2([WITHDRAWAL], T))
    assert final["totals"]["full"] == final["totals"]["pos"] == 1198
    recs = core.records(T, final)
    assert core.gaps(recs, recs, T)["unexplained"] == 0


def test_draft_counts_and_ai_failure_keep_rule_evidence(database, monkeypatch):
    from types import SimpleNamespace

    import litellm

    with db.session_scope() as s:
        seed(s)
        match.run(s, "l1", "Nurwan", [])
        match.run(s, "l2", "Nurwan", [])
    with db.session_scope(write=False) as s:
        expected = followup.draft(s, lang="id")
        assert sum(g["drafted"] for g in expected["groups"]) == len(expected["drafts"])
        monkeypatch.setattr(settings, "ai", True)
        monkeypatch.setattr(settings, "model", "deepseek/deepseek-chat")
        monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
        monkeypatch.setattr(
            litellm,
            "completion",
            lambda **kwargs: SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="not JSON"))]
            ),
        )
        assert followup.draft(s, lang="id") == expected
        assert not list(s.scalars(select(FollowUp)))


def test_learning_day_eight_counts_only_new_decisions(database):
    with db.session_scope() as s:
        seed(s)
        for area in ("pos", "settlement", "bank"):
            learning.note(s, "upload_rule", type=area, choice="create")
        learning.note(s, "cleaning", cards=["outlet", "bank"])
        match_all(s)
        learning.note(s, "upload_rule", type="pos", choice="update")
        learning.note(s, "cleaning", cards=["Central Plz"])
        match.run(s, "l1", "Nurwan")
        match.run(s, "l2", "Nurwan")
        assert [c["questions"] for c in learning.summary(s)["closes"]] == [7, 2]
