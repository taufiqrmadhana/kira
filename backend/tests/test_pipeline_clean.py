"""R4 contract, rule persistence, invalidation and Drive day-1/day-8 acceptance."""

from pathlib import Path

import pytest
from sqlalchemy import select
from test_pipeline_convert import create_rules
from test_pipeline_files import client as client
from test_pipeline_files import upload

from kira import db
from kira.models import CleaningRules, FollowUp, MatchLink, MatchRun
from kira.services import ai, clean, state


def prepare(client):
    content = {
        "pos": b"id,branch,payment_amount,sales_datetime_out\n001,Zestly Central Plaza Jakarta,100,2026-10-20\n",
        "settlement": b"id,branch,gross_amount,transaction_date,reference,nett_amount\n001,Zestly - Central Plz,100,2026-10-20,001,99\n",
        "bank": b"id,keterangan,kredit,debit\n001,DANA payout,99,0\n002,Bank fee 123,0,1\n003,Cash deposit 123,100,0\n",
    }
    for area, value in content.items():
        assert upload(client, content=value, area=area, name=f"{area}.csv").status_code == 200
    create_rules(client)


def decide_all(client):
    for rec in client.get("/api/cleaning").json()["recommendations"]:
        assert (
            client.post(
                f"/api/cleaning/recommendations/{rec['id']}", json={"decision": "accept"}
            ).status_code
            == 200
        )


def test_cleaning_contract_preview_undo_save_and_learning(client):
    assert client.get("/api/cleaning").json()["recommendations"] == []
    prepare(client)
    response = client.get("/api/cleaning").json()
    assert set(response) == {"standard", "rules", "recommendations"}
    assert response["rules"] is None
    assert set(response["standard"]["outlets"]) == {"Zestly Central Plaza Jakarta"}
    assert {r["id"] for r in response["recommendations"]} == {"settlement.branch", "bank.exclude"}
    assert client.post("/api/cleaning/save").status_code == 409
    path = "/api/cleaning/recommendations/settlement.branch"
    assert (
        client.post(
            path,
            json={
                "decision": "accept",
                "mapping": {"Zestly - Central Plz": "Zestly Central Plaza Jakarta"},
            },
        ).json()["decision"]
        == "accept"
    )
    preview = client.get("/api/tables/clean/settlement").json()
    assert preview["rows"][0]["branch"] == "Zestly Central Plaza Jakarta"
    assert preview["rows"][0]["__was"]["branch"] == "Zestly - Central Plz"
    assert preview["changed"] == 1
    assert client.post(path, json={"decision": None}).json()["decision"] is None
    assert "__was" not in client.get("/api/tables/clean/settlement").json()["rows"][0]
    decide_all(client)
    assert client.get("/api/tables/clean/bank").json()["dropped"] == 2
    saved = client.post("/api/cleaning/save", headers={"X-Kira-User": "Rifat"}).json()
    assert set(saved) == {"version", "maps", "exclude", "created_by", "created_at"}
    assert saved["version"] == 1 and saved["created_by"] == "Rifat"
    assert client.get("/api/cleaning").json()["recommendations"] == []
    assert client.get("/api/status").json()["step"] == 4
    with db.session_scope(write=False) as s:
        assert clean.settled(s)
        events = [e for e in state.get(s, "learning") if e["kind"] == "cleaning"]
        assert sum(len(e["cards"]) for e in events) == 2
    client.post("/api/cleaning/save")
    with db.session_scope(write=False) as s:
        assert len(list(s.scalars(select(CleaningRules)))) == 1
    assert client.post("/api/convert").status_code == 200
    assert client.get("/api/cleaning").json()["recommendations"] == []


def test_rejected_and_blank_mappings_are_remembered_as_is(client):
    prepare(client)
    assert (
        client.post(
            "/api/cleaning/recommendations/settlement.branch",
            json={
                "decision": "accept",
                "mapping": {"Zestly - Central Plz": ""},
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/cleaning/recommendations/bank.exclude", json={"decision": "reject"}
        ).status_code
        == 200
    )
    saved = client.post("/api/cleaning/save").json()
    assert saved["maps"]["settlement.branch"]["Zestly - Central Plz"] == "Zestly - Central Plz"
    assert not any(saved["exclude"]["bank"].values())
    assert client.get("/api/tables/clean/bank").json()["total"] == 3
    client.post("/api/convert")
    assert client.get("/api/cleaning").json()["recommendations"] == []


def test_exclusions_can_be_overridden_and_paging_preserves_originals(client):
    prepare(client)
    response = client.post(
        "/api/cleaning/recommendations/bank.exclude",
        json={
            "decision": "accept",
            "exclude": {"cash deposit #": False},
        },
    )
    assert response.status_code == 200
    table = client.get("/api/tables/clean/bank?limit=1&offset=1").json()
    assert table["total"] == 2 and table["dropped"] == 1
    assert table["rows"][0]["id"] == "003"
    assert set(table) == {"columns", "rows", "total", "raw", "dupes", "changed", "dropped"}
    assert client.get("/api/tables/parsed/bank").json()["total"] == 3
    assert client.get("/api/tables/clean/bank?offset=99").json()["rows"] == []
    assert client.get("/api/tables/wrong/bank").status_code == 422
    assert client.get("/api/tables/parsed/unknown").status_code == 400
    assert client.get("/api/tables/parsed/bank?offset=-1").status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"decision": "accept", "mapping": {"missing": "Zestly Central Plaza Jakarta"}},
        {"decision": "accept", "mapping": {"Zestly - Central Plz": "Not a POS outlet"}},
        {"decision": "accept", "exclude": {"unknown #": True}},
    ],
)
def test_invalid_mapping_does_not_mutate_recommendation(client, body):
    prepare(client)
    before = client.get("/api/cleaning").json()
    assert (
        client.post("/api/cleaning/recommendations/settlement.branch", json=body).status_code == 400
    )
    assert client.get("/api/cleaning").json() == before


def test_stale_and_missing_decisions_workflow_guards_and_isolation(client):
    assert client.post("/api/cleaning/save").status_code == 409
    prepare(client)
    assert (
        client.post(
            "/api/cleaning/recommendations/missing", json={"decision": "accept"}
        ).status_code
        == 409
    )
    assert client.post("/api/cleaning/recommendations/bank.exclude", json={}).status_code == 422
    assert (
        client.post(
            "/api/cleaning/recommendations/bank.exclude", json={"decision": "bad"}
        ).status_code
        == 422
    )
    assert client.get("/api/cleaning", headers={"X-Kira-Client": "other"}).json()["rules"] is None
    assert (
        client.get("/api/tables/clean/bank", headers={"X-Kira-Client": "other"}).json()["rows"]
        == []
    )
    upload(client, content=b"id,branch,payment_amount,sales_datetime_out\n002,New,100,2026-10-21\n")
    assert (
        client.post(
            "/api/cleaning/recommendations/bank.exclude", json={"decision": "accept"}
        ).status_code
        == 409
    )
    assert client.post("/api/cleaning/save").status_code == 409


def test_change_clears_current_matches_but_retains_evidence(client):
    prepare(client)
    with db.session_scope() as s:
        for stage in ["l1", "l2"]:
            run = MatchRun(stage=stage, rule_ids=[], summary={}, run_by="Rifat")
            s.add(run)
            s.flush()
            s.add(MatchLink(run_id=run.id, rule_id="test", left_rows=[0], right_rows=[0]))
            state.put(s, f"run_{stage}", {"id": run.id})
        s.add(FollowUp(rid="001", note="Keep this", updated_by="Rifat"))
    assert (
        client.post(
            "/api/cleaning/recommendations/bank.exclude", json={"decision": "accept"}
        ).status_code
        == 200
    )
    with db.session_scope(write=False) as s:
        assert all(not run.current for run in s.scalars(select(MatchRun)))
        assert state.get(s, "run_l1") is None and state.get(s, "run_l2") is None
        assert len(list(s.scalars(select(MatchLink)))) == 2
        assert s.scalar(select(FollowUp)).note == "Keep this"


def test_failed_save_rolls_back_rules_learning_and_recommendations(client, monkeypatch):
    prepare(client)
    decide_all(client)
    before = client.get("/api/cleaning").json()

    def fail(*args, **kwargs):
        raise RuntimeError("failed rebuild")

    monkeypatch.setattr(clean, "_rebuild", fail)
    with pytest.raises(RuntimeError):
        client.post("/api/cleaning/save")
    assert client.get("/api/cleaning").json() == before
    with db.session_scope(write=False) as s:
        assert len(state.get(s, "learning")) == 3


def test_cleaning_ai_validation_and_optional_failure(monkeypatch):
    monkeypatch.setattr(
        ai,
        "ask_json",
        lambda *args: {
            "Raw": {"name": "Menteng", "why": "Same outlet"},
            "Invented": {"name": "Unknown"},
            "Bad": "bad",
        },
    )
    assert ai.standard_names("outlets", ["Menteng"], ["Raw", "Bad"]) == {
        "Raw": {"name": "Menteng", "why": "Same outlet"}
    }
    monkeypatch.setattr(
        ai,
        "ask_json",
        lambda *args: {
            "transfer #": {"payout": True, "why": "Provider"},
            "cash #": {"payout": "false"},
            "missing": {"payout": True},
        },
    )
    assert ai.classify_bank_rows([{"pattern": "transfer #"}, {"pattern": "cash #"}], ["dana"]) == {
        "transfer #": {"payout": True, "why": "Provider"}
    }


def test_ai_suggestions_are_previewed_once_and_never_auto_accepted(client, monkeypatch):
    from kira.config import settings

    monkeypatch.setattr(settings, "ai", True)
    monkeypatch.setattr(settings, "deepseek_api_key", "test-not-a-key")
    monkeypatch.setattr(ai, "map_columns", lambda *args: {})
    monkeypatch.setattr(ai, "judge_columns", lambda *args: {})
    monkeypatch.setattr(
        ai,
        "standard_names",
        lambda *args: {
            "Mystery shop": {"name": "Zestly Central Plaza Jakarta", "why": "Outlet spelling"}
        },
    )
    calls = []

    def classify(rows, providers):
        calls.extend(row["pattern"] for row in rows)
        return {"cash deposit #": {"payout": True, "why": "Provider credit"}}

    monkeypatch.setattr(ai, "classify_bank_rows", classify)
    prepare(client)
    upload(
        client,
        content=b"id,branch,gross_amount,transaction_date,reference,nett_amount\n002,Mystery shop,200,2026-10-21,002,199\n",
        area="settlement",
    )
    client.post("/api/convert")
    recs = client.get("/api/cleaning").json()["recommendations"]
    assert all(rec["decision"] is None for rec in recs)
    item = next(item for rec in recs for item in rec["items"] if item.get("from") == "Mystery shop")
    assert item["to"] == "Zestly Central Plaza Jakarta" and item["by"] == "ai"
    assert calls.count("cash deposit #") == 1
    assert "bank fee #" not in calls  # Known debits never need AI judgment.
    assert client.get("/api/tables/clean/bank").json()["total"] == 3


def test_zestly_day1_week_day8_cleaning_acceptance(client):
    root = Path(__file__).resolve().parents[2] / "data" / "with-exceptions"
    if not root.exists():
        pytest.skip("Drive with-exceptions fixtures are not installed")
    for day in sorted(root.glob("day-*")):
        for area, prefix in [("pos", "POS"), ("settlement", "SET"), ("bank", "STA")]:
            path = next(day.glob(f"{prefix}_*.csv"))
            assert (
                upload(client, content=path.read_bytes(), name=path.name, area=area).status_code
                == 200
            )
        assert client.post("/api/convert").status_code == 200
        for proposal in client.get("/api/upload-rules").json()["pending"]:
            choice = "create" if proposal["current_version"] is None else "update"
            assert (
                client.post(
                    f"/api/upload-rules/{proposal['type']}", json={"choice": choice}
                ).status_code
                == 200
            )
        recs = client.get("/api/cleaning").json()["recommendations"]
        if day.name.startswith("day-01"):
            assert {rec["id"] for rec in recs} == {"settlement.branch", "bank.exclude"}
        elif day.name.startswith("day-08"):
            assert len(recs) == 1 and recs[0]["id"] == "settlement.branch"
            assert [item["from"] for item in recs[0]["items"]] == ["Zestly - Central Plz"]
        else:
            assert {rec["id"] for rec in recs} == {"settlement.branch", "bank.exclude"}
        if day.name.startswith(("day-07", "day-08")):
            decide_all(client)
            assert client.post("/api/cleaning/save").status_code == 200
        if day.name.startswith("day-07"):
            assert client.get("/api/tables/clean/pos").json()["total"] == 8784
            assert client.get("/api/tables/clean/bank").json()["total"] == 70
    with db.session_scope(write=False) as s:
        events = state.get(s, "learning")
        assert sum(len(e["cards"]) for e in events if e["kind"] == "cleaning") == 3


def test_pos_standard_change_refreshes_dependent_settlement_preview(client):
    from kira.models import ParsedRow

    prepare(client)
    with db.session_scope() as s:
        state.drop_rows(s, ParsedRow, "pos")
        state.drop_rows(s, ParsedRow, "settlement")
        for i, name in enumerate(["SHOP", "SHOP", "Shop"]):
            s.add(ParsedRow(type="pos", row_no=i, data={"branch": name}))
        s.add(ParsedRow(type="settlement", row_no=0, data={"branch": "Shop"}))
        s.flush()
        clean.refresh(s)
        clean.decide(s, "settlement.branch", "accept")
        assert clean.table(s, "clean", "settlement")["rows"][0]["branch"] == "SHOP"
        for i in range(3, 6):
            s.add(ParsedRow(type="pos", row_no=i, data={"branch": "Shop"}))
        s.flush()
        clean.refresh(s, ["pos"])
        assert not any(rec["id"] == "settlement.branch" for rec in clean.recommendations(s))
        row = clean.table(s, "clean", "settlement")["rows"][0]
        assert row == {"branch": "Shop"}
