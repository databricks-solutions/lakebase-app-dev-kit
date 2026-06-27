"""Stock repository -- only layer that touches the ORM session."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.stock import Stock


class StockRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def upsert(self, sku: str, location: str, quantity: int, tracking_code: str) -> Stock:
        """Insert or update the stock record for (sku, location)."""
        existing = (
            self._db.query(Stock)
            .filter(Stock.sku == sku, Stock.location == location)
            .first()
        )
        if existing is not None:
            existing.quantity = quantity
            existing.tracking_code = tracking_code
            self._db.commit()
            self._db.refresh(existing)
            return existing

        record = Stock(
            sku=sku,
            location=location,
            quantity=quantity,
            tracking_code=tracking_code,
        )
        self._db.add(record)
        self._db.commit()
        self._db.refresh(record)
        return record
