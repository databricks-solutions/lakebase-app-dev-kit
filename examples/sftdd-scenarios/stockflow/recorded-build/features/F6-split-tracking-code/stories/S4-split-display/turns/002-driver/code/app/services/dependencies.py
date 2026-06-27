"""FastAPI dependency factories for the service layer.

Lives in app/services/ so the boundary (routes) never imports app.database directly.
"""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.stock_repository import StockRepository
from app.services.stock_service import StockService


def get_stock_service(db: Session = Depends(get_db)) -> StockService:
    return StockService(StockRepository(db))
