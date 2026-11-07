import time

import pytest
from fastapi.testclient import TestClient

from kira.config import settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'kira.db'}")
    monkeypatch.setattr(settings, "auth_password", "test-password")
    monkeypatch.setattr(settings, "auth_user", "taufiq")
    monkeypatch.setattr(settings, "secret", "test-cookie-signing-secret-only")
    monkeypatch.setattr(settings, "ui_dir", tmp_path / "web")
    from kira.api.app import create_app

    with TestClient(create_app()) as c:
        yield c


def login(client):
    return client.post("/api/login", json={"username": "taufiq", "password": "test-password"})


def test_status_requires_cookie_then_returns_contract(client):
    assert client.get("/api/status").status_code == 401
    response = login(client)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Max-Age=1209600" in cookie
    assert "SameSite=lax" in cookie
    status = client.get("/api/status")
    assert status.status_code == 200
    assert status.json()["files"] == {"pos": 0, "settlement": 0, "bank": 0}
    assert status.json()["step"] == 1
    assert client.get("/api/me").json() == {"user": "taufiq", "auth": True}


def test_bad_password_forged_expired_cookie_and_logout(client, monkeypatch):
    assert (
        client.post("/api/login", json={"username": "taufiq", "password": "wrong"}).status_code
        == 401
    )
    client.cookies.set("kira_session", "forged")
    assert client.get("/api/status").status_code == 401
    from kira.api.auth import make_token, read_token

    token = make_token("taufiq", days=-1)
    assert read_token(token) is None
    token = make_token("taufiq")
    assert read_token(token) == "taufiq"
    assert read_token(token[:-8] + "tampered") is None
    monkeypatch.setattr(time, "time", lambda: 9999999999)
    assert read_token(token) is None
    monkeypatch.undo()


def test_logout_clears_session(client):
    login(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/status").status_code == 401


def test_open_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_password", "")
    assert client.get("/api/me").json() == {"user": "local", "auth": False}
    assert client.get("/api/status").status_code == 200


def test_missing_signing_secret_refuses_protected_start(client, monkeypatch):
    from kira.api.app import create_app

    monkeypatch.setattr(settings, "secret", "")
    with pytest.raises(ValueError, match="KIRA_SECRET"):
        create_app()


def test_client_directory_is_global_and_invalid_names_are_rejected(client):
    login(client)
    result = client.post("/api/clients", json={"name": "Zestly Demo"})
    assert result.status_code == 200
    assert result.json() == {"id": "zestly-demo", "name": "Zestly Demo"}
    clients = client.get("/api/clients", headers={"X-Kira-Client": "another"}).json()
    assert result.json() in clients
    assert client.post("/api/clients", json={"name": ""}).status_code in (409, 422)


def test_static_spa_never_shadows_api_and_cannot_escape_root(client, tmp_path):
    login(client)
    root = settings.ui_dir
    root.mkdir()
    (root / "index.html").write_text("<main>Kira app</main>")
    (tmp_path / "secret.txt").write_text("do not serve")
    assert client.get("/").text == "<main>Kira app</main>"
    assert client.get("/analysis").status_code == 200
    assert client.get("/api/does-not-exist").status_code == 404
    assert "do not serve" not in client.get("/%2e%2e/secret.txt").text


def test_agent_route_rejects_coerced_confirmation_booleans(client):
    login(client)
    response = client.post(
        "/api/agent/confirm", json={"session_id": "demo", "answers": {"x": "false"}}
    )
    assert response.status_code == 422


def test_https_login_sets_secure_cookie(client):
    response = client.post(
        "https://testserver/api/login", json={"username": "taufiq", "password": "test-password"}
    )
    assert "Secure" in response.headers["set-cookie"]
