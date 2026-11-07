import pytest
from fastapi.testclient import TestClient

from kira.config import settings


@pytest.fixture
def ui_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "auth_password", "")
    monkeypatch.setattr(settings, "ui_dir", tmp_path)
    (tmp_path / "index.html").write_text('<script type="module" src="/assets/current.js"></script>')
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "current.js").write_text("export const release = 'current';")
    from kira.api.app import create_app

    return TestClient(create_app())


@pytest.mark.parametrize("path", ["/", "/overview", "/index.html"])
def test_html_entry_points_revalidate_the_current_release(ui_client, path):
    response = ui_client.get(path)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    assert response.text == '<script type="module" src="/assets/current.js"></script>'


def test_html_revalidation_does_not_change_asset_responses(ui_client):
    response = ui_client.get("/assets/current.js")

    assert response.status_code == 200
    assert response.text == "export const release = 'current';"
    assert "cache-control" not in response.headers
