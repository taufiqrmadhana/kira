"""Approved export directives preserve the selected workspace and exact filter scope."""

from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select
from test_matching_api import client as client
from test_matching_api import run

from kira import db
from kira.models import AuditLog
from kira.services.state import WorkflowError


def test_export_returns_a_safe_scoped_download_and_audits_without_sending_csv(client):
    from kira.services import agent_actions

    run(client)
    scope = {"keys": "P1", "provider": "", "pos_only": True, "only_differences": False}
    with db.session_scope() as s:
        result = agent_actions.export_results(s, scope, "Kira (approved by Taufiq)")
    assert set(result) == {"download", "filename", "client_id"}
    assert result["filename"] == "kira-results.csv" and result["client_id"] == ""
    url = urlsplit(result["download"])
    assert not url.netloc and url.path == "/api/analysis/export"
    assert parse_qs(url.query) == {"keys": ["P1"], "pos_only": ["true"]}
    response = client.get(result["download"])
    assert response.status_code == 200 and len(response.text.splitlines()) == 2
    with db.session_scope(write=False) as s:
        entry = s.scalar(select(AuditLog).where(AuditLog.action == "Export results"))
        assert entry.actor == "Kira (approved by Taufiq)"
        assert '"keys": "P1"' in entry.detail
    token = db.current_client.set("other")
    try:
        with db.session_scope() as s, pytest.raises(WorkflowError, match="both matching"):
            agent_actions.export_results(s, {}, "Taufiq")
        with db.session_scope(write=False) as s:
            assert s.scalar(select(AuditLog)) is None
    finally:
        db.current_client.reset(token)


@pytest.mark.parametrize(
    "scope",
    [
        {"client_id": "other"},
        {"download": "https://other"},
        {"offset": 100},
        {"pos_only": "false"},
        {"only_differences": 1},
        {"amount_min": float("nan")},
        {"amount_max": float("inf")},
        {"keys": ["P1"]},
        {"date_from": "bad"},
        {"date_from": "2026-10-25", "date_to": "2026-10-20"},
    ],
)
def test_export_rejects_unknown_scope_and_invalid_filter_types_before_audit(client, scope):
    from kira.services import agent_actions

    run(client)
    with db.session_scope() as s, pytest.raises(WorkflowError):
        agent_actions.export_results(s, scope, "Taufiq")
    with db.session_scope(write=False) as s:
        assert not list(s.scalars(select(AuditLog).where(AuditLog.action == "Export results")))
