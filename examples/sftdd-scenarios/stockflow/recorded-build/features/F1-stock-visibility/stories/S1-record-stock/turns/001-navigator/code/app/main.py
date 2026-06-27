"""FastAPI application entry point."""

from fastapi import FastAPI

app = FastAPI(title="stockflow-cap-20260624-072956", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}
