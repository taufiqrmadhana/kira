"""CSV download requests commit their explicit origin without changing CSV contracts."""

import json

import pytest
from sqlalchemy import select
from test_matching_api import client as client
from test_matching_api import run

from kira import db
from kira.models import AuditLog


@pytest.mark.parametrize("path", ["/api/matching/export", "/api/analysis/export?keys=P1"])
@pytest.mark.parametrize("guided", [True, False])
def test_export_get_commits_origin_audit_and_keeps_csv(client, path, guided):
    run(client)
    headers = {"X-Kira-User": "Taufiq", **({"X-Kira-Origin": "guided"} if guided else {})}
    response = client.get(path, headers=headers)
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    filename = "kira-analysis.csv" if "/analysis/" in path else "kira-results.csv"
    assert f'filename="{filename}"' in response.headers["content-disposition"]
    assert len(response.text.splitlines()) == (2 if "keys=" in path else 3)
    with db.session_scope(write=False) as s:
        entries = list(s.scalars(select(AuditLog).where(AuditLog.action == "Export results")))
        assert len(entries) == 1
        assert entries[0].actor == ("via Kira, approved by Taufiq" if guided else "Taufiq")
        if "keys=" in path:
            assert json.loads(entries[0].detail) == {"keys": "P1"}
    assert client.get(path, headers={"X-Kira-Client": "other"}).status_code == 409
    assert client.get("/api/audit", headers={"X-Kira-Client": "other"}).json() == []


def test_failed_export_does_not_write_audit(client, monkeypatch):
    from kira.core import matching
    from kira.services.state import WorkflowError

    run(client)

    def fail(*args):
        raise WorkflowError("Could not export these rows")

    monkeypatch.setattr(matching, "export_csv", fail)
    assert client.get("/api/analysis/export").status_code == 409
    with db.session_scope(write=False) as s:
        assert not list(s.scalars(select(AuditLog).where(AuditLog.action == "Export results")))
