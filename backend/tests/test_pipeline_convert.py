"""R3 conversion contracts, transactional decisions and real Drive acceptance data."""

from pathlib import Path

import pytest
from sqlalchemy import select
from test_pipeline_files import BANK, POS, upload
from test_pipeline_files import client as client

from kira import db
from kira.models import CleanRow, ParsedRow, UploadRule
from kira.services import clean, convert, state

SETTLEMENT = b"id,merchant_store_name,transaction_amount,create_time,transaction_id,settlement_amount\n001,Central,100,2026-10-20,001,99\n"


def upload_three(client):
    for area, content in [("pos", POS), ("settlement", SETTLEMENT), ("bank", BANK)]:
        assert upload(client, content=content, area=area, name=f"{area}.csv").status_code == 200


def create_rules(client):
    response = client.post("/api/convert")
    assert response.status_code == 200
    for area in state.TYPES:
        assert (
            client.post(f"/api/upload-rules/{area}", json={"choice": "create"}).status_code == 200
        )


def test_first_conversion_three_cards_typed_tables_and_learning(client):
    assert client.get("/api/convert").json() is None
    upload_three(client)
    result = client.post("/api/convert").json()
    assert set(result) == {"at", "stale", "proposals", "decisions"}
    assert result["stale"] is False
    assert result["decisions"] == dict.fromkeys(state.TYPES, "new")
    assert client.get("/api/convert").json() == result
    rules = client.get("/api/upload-rules").json()
    assert rules["current"] == dict.fromkeys(state.TYPES)
    assert len(rules["pending"]) == 3
    assert set(rules["pending"][0]) == {
        "type",
        "decision",
        "delimiter",
        "columns",
        "diff",
        "rename",
        "current_version",
    }
    with db.session_scope(write=False) as s:
        assert convert.rules_settled(s) is False
    for area in state.TYPES:
        assert (
            client.post(f"/api/upload-rules/{area}", json={"choice": "create"}).status_code == 200
        )
    with db.session_scope(write=False) as s:
        assert convert.rules_settled(s) is True
        tables = convert.parsed_tables(s)
        assert tables["pos"]["rows"][0]["payment_amount"] == 100
        assert tables["pos"]["rows"][0]["id"] == "001"
        assert tables["settlement"]["rows"][0]["branch"] == "Central"
        events = state.get(s, "learning")
        assert len(events) == 3
        assert all(e["kind"] == "upload_rule" and e["choice"] == "create" for e in events)
        assert s.scalar(select(CleanRow)) is not None
    assert client.get("/api/upload-rules").json()["pending"] == []
    assert client.get("/api/status").json()["step"] == 3
    assert client.get("/api/workflow").status_code == 200


def test_unchanged_conversion_applies_saved_rule_without_new_learning(client):
    upload_three(client)
    create_rules(client)
    assert upload(client, content=POS.replace(b"001", b"002")).status_code == 200
    result = client.post("/api/convert").json()
    assert result["decisions"] == dict.fromkeys(state.TYPES, "same")
    with db.session_scope(write=False) as s:
        assert len(convert.parsed_tables(s)["pos"]["rows"]) == 2
        assert len(state.get(s, "learning")) == 3
        assert len(list(s.scalars(select(UploadRule)))) == 3


@pytest.mark.parametrize("choice", ["keep", "update"])
def test_changed_column_keep_or_update_and_preserve_other_tables(client, choice):
    upload_three(client)
    create_rules(client)
    with db.session_scope(write=False) as s:
        other = [
            (r.id, r.data) for r in s.scalars(select(ParsedRow).where(ParsedRow.type == "bank"))
        ]
    changed = b"id,branch,payment_amount,sales_datetime_out,order_channel\n002,Central,200,2026-10-21,online\n"
    upload(client, content=changed)
    result = client.post("/api/convert").json()
    assert result["proposals"]["pos"]["diff"]["added"] == ["order_channel"]
    assert [p["type"] for p in client.get("/api/upload-rules").json()["pending"]] == ["pos"]
    with db.session_scope(write=False) as s:
        before_decision = [
            (r.id, r.data) for r in s.scalars(select(ParsedRow).where(ParsedRow.type == "bank"))
        ]
    body = {"choice": choice}
    if choice == "update":
        body["columns"] = [{"name": "order_channel", "keep": True}]
    assert client.post("/api/upload-rules/pos", json=body).status_code == 200
    with db.session_scope(write=False) as s:
        rule = convert.current_rule(s, "pos")
        assert rule["version"] == (2 if choice == "update" else 1)
        rows = convert.parsed_tables(s)["pos"]["rows"]
        assert len(rows) == 2
        assert ("order_channel" in rows[0]) == (choice == "update")
        assert [
            (r.id, r.data) for r in s.scalars(select(ParsedRow).where(ParsedRow.type == "bank"))
        ] == before_decision
        assert [r[1] for r in other] == [r[1] for r in before_decision]
        assert len(state.get(s, "learning")) == 4
        assert state.get(s, "learning")[-1]["choice"] == choice
        assert convert.rules_settled(s)
    assert client.post("/api/upload-rules/pos", json=body).status_code == 409


def test_column_overrides_mapping_and_duplicate_rows(client):
    upload_three(client)
    upload(
        client,
        content=b"id,branch,payment_amount,sales_datetime_out,paid\n001,Central,100,2026-10-20,00100\n",
    )
    client.post("/api/convert")
    response = client.post(
        "/api/upload-rules/pos",
        json={
            "choice": "create",
            "rename": {"paid": "nett_after_mdr"},
            "columns": [
                {"name": "id", "keep": False},
                {"name": "payment_amount", "type": "text"},
                {"name": "paid", "keep": False},
            ],
        },
    )
    assert response.status_code == 200
    with db.session_scope(write=False) as s:
        rule = convert.current_rule(s, "pos")
        assert rule["rename"]["paid"] == "nett_after_mdr"
        rows = convert.parsed_tables(s)["pos"]["rows"]
        assert len(rows) == 2
        assert rows[0]["payment_amount"] == "100"
        assert "id" not in rows[0]
        assert rows[1]["nett_after_mdr"] == 100
    # A differently named upload with different bytes can still produce an identical typed row.
    for area in ("settlement", "bank"):
        client.post(f"/api/upload-rules/{area}", json={"choice": "create"})
    upload(client, content=BANK.replace(b"100", b"100.0"), area="bank")
    client.post("/api/convert")
    with db.session_scope(write=False) as s:
        assert len(convert.parsed_tables(s)["bank"]["rows"]) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"choice": "create", "columns": [{"name": "absent", "keep": True}]},
        {"choice": "create", "columns": [{"name": "id"}, {"name": "id"}]},
        {"choice": "create", "rename": {"absent": "branch"}},
        {"choice": "create", "rename": {"id": "unknown"}},
        {"choice": "keep"},
        {"choice": "update"},
    ],
)
def test_invalid_decision_does_not_save_rule_or_learning(client, body):
    upload_three(client)
    client.post("/api/convert")
    assert client.post("/api/upload-rules/pos", json=body).status_code in (400, 409)
    with db.session_scope(write=False) as s:
        assert convert.current_rule(s, "pos") is None
        assert not state.get(s, "learning")
        assert state.get(s, "conversion")["decisions"]["pos"] == "new"


def test_workflow_guards_stale_requests_and_client_isolation(client):
    assert client.post("/api/convert").status_code == 409
    upload_three(client)
    assert client.post("/api/upload-rules/pos", json={"choice": "create"}).status_code == 409
    client.post("/api/convert")
    upload(client, content=POS.replace(b"001", b"002"))
    assert client.post("/api/upload-rules/pos", json={"choice": "create"}).status_code == 409
    assert client.get("/api/upload-rules").json()["pending"] == []
    assert client.post("/api/convert", headers={"X-Kira-Client": "other"}).status_code == 409
    assert client.get("/api/upload-rules", headers={"X-Kira-Client": "other"}).json()[
        "current"
    ] == dict.fromkeys(state.TYPES)
    client.post("/api/convert")
    assert client.post("/api/upload-rules/pos", json={"choice": "bad"}).status_code == 422
    assert (
        client.post(
            "/api/upload-rules/pos",
            json={"choice": "create", "columns": [{"name": "id", "type": "integer"}]},
        ).status_code
        == 422
    )


def test_decision_failure_rolls_back_rule_rows_state_and_learning(client, monkeypatch):
    upload_three(client)
    client.post("/api/convert")

    def fail(*args, **kwargs):
        raise RuntimeError("refresh failed")

    monkeypatch.setattr(clean, "refresh", fail)
    with pytest.raises(RuntimeError, match="refresh failed"):
        client.post("/api/upload-rules/pos", json={"choice": "create"})
    with db.session_scope(write=False) as s:
        assert convert.current_rule(s, "pos") is None
        assert s.scalar(select(ParsedRow)) is None
        assert not state.get(s, "learning")
        assert state.get(s, "conversion")["decisions"]["pos"] == "new"


def test_zestly_day1_to_day8_conversion_acceptance(client):
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
        response = client.post("/api/convert")
        assert response.status_code == 200
        pending = client.get("/api/upload-rules").json()["pending"]
        if day.name.startswith("day-01"):
            assert len(pending) == 3
            for area in state.TYPES:
                assert (
                    client.post(f"/api/upload-rules/{area}", json={"choice": "create"}).status_code
                    == 200
                )
            with db.session_scope(write=False) as s:
                assert len(convert.parsed_tables(s)["pos"]["rows"]) == 1178
                assert {r["id"] for r in clean.recommendations(s)} == {
                    "settlement.branch",
                    "bank.exclude",
                }
        elif day.name.startswith("day-08"):
            assert len(pending) == 1
            assert pending[0]["type"] == "pos"
            assert pending[0]["diff"]["added"] == ["order_channel"]
            assert (
                client.post("/api/upload-rules/pos", json={"choice": "update"}).status_code == 200
            )
        else:
            assert pending == []
    with db.session_scope(write=False) as s:
        assert len(convert.parsed_tables(s)["pos"]["rows"]) == 9982
        assert len(state.get(s, "learning")) == 4


def test_updating_new_column_preserves_types_without_a_reported_type_change(client):
    upload_three(client)
    create_rules(client)
    upload(
        client,
        content=b"id,branch,payment_amount,sales_datetime_out,order_channel\n002,Central,unknown,2026-10-21,online\n",
    )
    result = client.post("/api/convert").json()
    assert result["proposals"]["pos"]["diff"]["types"] == []
    assert client.post("/api/upload-rules/pos", json={"choice": "update"}).status_code == 200
    with db.session_scope(write=False) as s:
        amount = next(
            c for c in convert.current_rule(s, "pos")["columns"] if c["name"] == "payment_amount"
        )
        assert amount["type"] == "number"
        assert convert.parsed_tables(s)["pos"]["rows"][1]["payment_amount"] is None
