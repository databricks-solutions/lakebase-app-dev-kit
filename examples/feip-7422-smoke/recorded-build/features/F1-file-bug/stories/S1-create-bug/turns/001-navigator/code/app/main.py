"""FastAPI application entry point."""

from fastapi import FastAPI

app = FastAPI(title="bug-tracker-ff-20260608-235044", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}
