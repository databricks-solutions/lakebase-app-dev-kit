"""FastAPI application entry point."""

import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="{{PROJECT_NAME}}", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Register API routes ABOVE this line ─────────────────────────────────────
# Everything below serves the built React SPA (client/dist) in production, so a
# single-process deploy (e.g. a Databricks App) serves both the API and the UI.
# It is a no-op in development (Vite serves the client and proxies /api +
# /health here, so client/dist does not exist) and a no-op for a server-rendered
# or API-only backend that has no client/. The catch-all matches every remaining
# GET path (client-side routing needs index.html on deep-link refresh), so it
# MUST stay last: register API routers above it.
_CLIENT_DIST = os.path.join(os.path.dirname(__file__), os.pardir, "client", "dist")
if os.path.isdir(_CLIENT_DIST):
    _assets = os.path.join(_CLIENT_DIST, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # Unmatched API paths 404 as JSON instead of returning the app shell.
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(os.path.join(_CLIENT_DIST, "index.html"))
