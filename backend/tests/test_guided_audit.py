"""Guided button writes use the ordinary endpoints and commit their named audit actor."""

from sqlalchemy import select
from test_pipeline_clean import prepare
from test_pipeline_files import client as client

from kira import db
from kira.models import AuditLog


def test_guided_upload_convert_rules_cleaning_and_matching_have_approval_audit(client):
    client.headers.update({"X-Kira-User": "Taufiq", "X-Kira-Origin": "guided"})
    prepare(client)
    recs = client.get("/api/cleaning").json()["recommendations"]
    for rec in recs:
        response = client.post(
            f"/api/cleaning/recommendations/{rec['id']}", json={"decision": "accept"}
        )
        assert response.status_code == 200
    assert client.post("/api/cleaning/save").status_code == 200
    for stage in ("l1", "l2"):
        assert client.post(f"/api/matching/{stage}/run", json={}).status_code == 200
    with db.session_scope(write=False) as s:
        audit = list(s.scalars(select(AuditLog)))
        assert audit and all(row.actor == "via Kira, approved by Taufiq" for row in audit)
        decisions = [row for row in audit if row.action == "Decide cleaning recommendation"]
        assert len(decisions) == len(recs)
        assert {row.object for row in decisions} == {rec["id"] for rec in recs}
    other = client.get("/api/audit", headers={"X-Kira-Client": "other"}).json()
    assert other == []


def test_normal_button_audit_actor_stays_unchanged(client):
    client.headers.update({"X-Kira-User": "Andrew"})
    prepare(client)
    with db.session_scope(write=False) as s:
        assert {row.actor for row in s.scalars(select(AuditLog))} == {"Andrew"}
