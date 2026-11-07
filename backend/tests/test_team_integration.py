"""A real-data close across Rifat's pipeline, Nurwan's engine and Taufiq's API."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from kira import db
from kira.api.app import create_app
from kira.config import settings


def test_team_pipeline_first_close_and_analysis(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[2] / "data/with-exceptions/with-exceptions"
    if not root.exists():
        pytest.skip("Install the Drive with-exceptions fixture for the complete integration close")
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path}/integration.db")
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ai", False)
    areas = {"POS": "pos", "SET": "settlement", "STA": "bank"}
    try:
        with TestClient(create_app(), headers={"X-Kira-User": "Integration QA"}) as api:
            for day in sorted(root.glob("day-0[1-7]-*")):
                for file in sorted(day.glob("*.csv")):
                    response = api.post(
                        f"/api/files/{areas[file.name[:3]]}",
                        files={"uploads": (file.name, file.read_bytes(), "text/csv")},
                    )
                    assert response.status_code == 200, response.text
                response = api.post("/api/convert")
                assert response.status_code == 200, response.text
                for area, decision in response.json()["decisions"].items():
                    if decision not in ("new", "changed"):
                        continue
                    result = api.post(
                        f"/api/upload-rules/{area}",
                        json={"choice": "create" if decision == "new" else "update"},
                    )
                    assert result.status_code == 200, result.text

            recommendations = api.get("/api/cleaning").json()["recommendations"]
            assert len(recommendations) == 2
            for card in recommendations:
                response = api.post(
                    f"/api/cleaning/recommendations/{card['id']}", json={"decision": "accept"}
                )
                assert response.status_code == 200, response.text
            response = api.post("/api/cleaning/save")
            assert response.status_code == 200, response.text
            assert api.get("/api/status").json()["step"] == 4
            for stage, kind in (("l1", "id"), ("l2", "withdrawal")):
                proposals = api.get(f"/api/matching/{stage}/suggestions")
                assert proposals.status_code == 200, proposals.text
                rule = next(r for r in proposals.json() if r["kind"] == kind)
                response = api.post(
                    f"/api/matching/{stage}/rules",
                    json={k: rule[k] for k in ("kind", "params", "name")},
                )
                assert response.status_code == 200, response.text
                response = api.post(f"/api/matching/{stage}/run", json={})
                assert response.status_code == 200, response.text

            totals = api.get("/api/matching/results").json()["totals"]
            assert (totals["pos"], totals["full"], totals["credits_linked"]) == (8784, 8639, 69)
            gaps = api.get("/api/analysis/gaps").json()
            assert gaps["unexplained"] == 10671421
            assert gaps["explained"] == 26361
            assert api.get("/api/learning").json()["closes"][0]["questions"] == 7
            assert api.get("/api/workflow").status_code == 200
    finally:
        db.dispose_engines()
