"""FastAPI application entry point."""

from fastapi import FastAPI

from app.routes.bugs import router as bugs_router

app = FastAPI(title="bug-tracker-ff-20260608-235044", version="0.1.0")

app.include_router(bugs_router)


@app.get("/health")
def health():
    return {"status": "ok"}
