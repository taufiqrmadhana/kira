"""KIRA app factory; optional feature routers arrive from the other owners."""

from contextlib import asynccontextmanager
from importlib import import_module, util

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from kira.api import auth
from kira.config import settings
from kira.db import Busy, client_id, current_client, init_db
from kira.services.state import WorkflowError


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        init_db()
        yield

    app = FastAPI(title="KIRA API", version="0.1.0", lifespan=lifespan)
    auth.install(app)

    @app.middleware("http")
    async def client_context(request: Request, call_next):
        token = current_client.set(client_id(request.headers.get("X-Kira-Client")))
        try:
            return await call_next(request)
        finally:
            current_client.reset(token)

    @app.exception_handler(WorkflowError)
    @app.exception_handler(Busy)
    async def workflow_error(request: Request, exc: Exception):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    for feature in (
        "auth",
        "status",
        "clients",
        "agent",
        "files",
        "convert",
        "clean",
        "match",
        "analysis",
        "overview",
        "performance",
    ):
        name = f"kira.api.routes.{feature}"
        if util.find_spec(name) is not None:
            app.include_router(import_module(name).router, prefix="/api")

    @app.get("/{path:path}", include_in_schema=False)
    def ui(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        root = settings.ui_dir.resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise HTTPException(404, "Not found")
        if target.is_file():
            headers = {"Cache-Control": "no-cache"} if target.suffix.lower() == ".html" else None
            return FileResponse(target, headers=headers)
        if "." in target.name:
            raise HTTPException(404, "Not found")
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        return {"app": "KIRA", "status": "platform ready", "web": "Awaiting the web build"}

    return app


app = create_app()
