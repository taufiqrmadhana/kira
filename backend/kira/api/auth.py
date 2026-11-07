"""Signed, expiring sign-in cookies for the public deployment."""

import base64
import hmac
import json
import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from kira.config import settings

COOKIE = "kira_session"
OPEN_PATHS = {"/api/login", "/api/logout", "/api/me"}


def _key() -> bytes:
    if not settings.secret:
        raise ValueError("KIRA_SECRET must be set when KIRA_PASSWORD is enabled")
    return settings.secret.encode()


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_token(user: str, days: int | None = None) -> str:
    expires = int(time.time() + (settings.session_days if days is None else days) * 86400)
    payload = _encode(json.dumps({"user": user, "exp": expires}, separators=(",", ":")).encode())
    signature = _encode(hmac.digest(_key(), payload.encode(), "sha256"))
    return f"{payload}.{signature}"


def read_token(token: str | None) -> str | None:
    if not token or len(token) > 4096 or not settings.secret:
        return None
    try:
        payload, signature = token.split(".")
        expected = _encode(hmac.digest(_key(), payload.encode(), "sha256"))
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if type(data["exp"]) is not int or data["exp"] <= time.time():
            return None
        return data["user"] if data["user"] == settings.auth_user else None
    except (ValueError, KeyError, TypeError, UnicodeError):
        return None


def signed_in(request: Request) -> str | None:
    return read_token(request.cookies.get(COOKIE)) if settings.auth_password else "local"


class Login(BaseModel):
    username: str = Field(max_length=200)
    password: str = Field(max_length=4096)


async def login(body: Login, request: Request):
    if settings.auth_password:
        valid_user = hmac.compare_digest(body.username.encode(), settings.auth_user.encode())
        valid_password = hmac.compare_digest(
            body.password.encode(), settings.auth_password.encode()
        )
        if not (valid_user and valid_password):
            raise HTTPException(401, "Incorrect username or password")
        response = JSONResponse({"user": settings.auth_user, "auth": True})
        response.set_cookie(
            COOKIE,
            make_token(settings.auth_user),
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=settings.session_days * 86400,
            path="/",
        )
        response.headers["Cache-Control"] = "no-store"
        return response
    return {"user": "local", "auth": False}


def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
    return response


def me(request: Request):
    return {"user": signed_in(request), "auth": bool(settings.auth_password)}


def install(app) -> None:
    if settings.auth_password:
        _key()

    @app.middleware("http")
    async def protect(request: Request, call_next):
        # The shell supplies its own sign-in form; all data and API documentation require sign-in.
        protected = request.url.path.startswith("/api/") or request.url.path in {
            "/docs",
            "/redoc",
            "/openapi.json",
        }
        if protected and request.url.path not in OPEN_PATHS and not signed_in(request):
            return JSONResponse({"detail": "Sign in required"}, status_code=401)
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response
