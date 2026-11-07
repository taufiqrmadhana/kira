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
            assert (totals["pos"], totals["full"], totals["credits_linked"]) == (8784, 8637, 69)
            assert totals["linked"] == 8639
            gaps = api.get("/api/analysis/gaps").json()
            assert gaps["unexplained"] == 10671421
            assert gaps["explained"] == 26361
            assert api.get("/api/learning").json()["closes"][0]["questions"] == 7
            assert api.get("/api/workflow").status_code == 200
            # Rehearse day 8 from the actual first close, with saved follow-up evidence.
            scope = {
                "outlet": "Zestly Harbor Square Surabaya",
                "date_from": "2026-10-24",
                "date_to": "2026-10-24",
            }
            draft = api.post(
                "/api/analysis/follow-ups/draft", params=scope, json={"lang": "en"}
            ).json()
            assert len(draft["drafts"]) == 142 and len(draft["groups"]) == 1
            items = [
                {k: row[k] for k in ("rid", "status", "note", "assignee")}
                for row in draft["drafts"]
            ]
            for item in items:
                item["assignee"] = "Andrew"
            assert (
                api.post("/api/analysis/follow-ups/bulk", json={"items": items}).json()["saved"]
                == 142
            )
            day8 = next(root.glob("day-08-*"))
            for file in sorted(day8.glob("*.csv")):
                response = api.post(
                    f"/api/files/{areas[file.name[:3]]}",
                    files={"uploads": (file.name, file.read_bytes(), "text/csv")},
                )
                assert response.status_code == 200, response.text
            response = api.post("/api/convert")
            assert response.status_code == 200, response.text
            pending = api.get("/api/upload-rules").json()["pending"]
            assert len(pending) == 1 and pending[0]["type"] == "pos"
            assert api.post("/api/upload-rules/pos", json={"choice": "update"}).status_code == 200
            recommendations = api.get("/api/cleaning").json()["recommendations"]
            assert len(recommendations) == 1
            assert [item["from"] for item in recommendations[0]["items"]] == [
                "Zestly - Central Plz"
            ]
            assert (
                api.post(
                    f"/api/cleaning/recommendations/{recommendations[0]['id']}",
                    json={"decision": "accept"},
                ).status_code
                == 200
            )
            assert api.post("/api/cleaning/save").status_code == 200
            for stage in ("l1", "l2"):
                response = api.post(f"/api/matching/{stage}/run", json={})
                assert response.status_code == 200, response.text
            totals = api.get("/api/matching/results").json()["totals"]
            assert (totals["pos"], totals["full"]) == (9982, 9835)
            assert totals["linked"] == 9837
            assert [c["questions"] for c in api.get("/api/learning").json()["closes"]] == [7, 2]
            notes = api.get("/api/analysis/follow-ups", params={**scope, "limit": 1000}).json()
            assert len(notes["records"]) == 142
            assert all(
                r["follow_up"]["note"] == items[0]["note"]
                and r["follow_up"]["assignee"] == "Andrew"
                for r in notes["records"]
            )
    finally:
        db.dispose_engines()
