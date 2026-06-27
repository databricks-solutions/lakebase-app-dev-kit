"""FastAPI application entry point."""

from fastapi import FastAPI

from app.routes.stock_routes import router as stock_router

app = FastAPI(title="stockflow-cap-20260624-072956", version="0.1.0")

app.include_router(stock_router)


@app.get("/health")
def health():
    return {"status": "ok"}
