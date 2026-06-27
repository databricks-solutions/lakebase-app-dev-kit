"""Stock repository -- only layer that touches the ORM session."""

from typing import List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.stock import Stock


def count_unparseable_codes(session: Session) -> int:
    """Return the number of stock rows where batch_number or serial_number is NULL.

    A row is considered unparseable when its tracking_code could not be split
    into batch and serial segments, leaving batch_number IS NULL OR
    serial_number IS NULL.  This counts post-split rows against the migrated
    schema and does not reference the dropped inventory_code column.
    """
    row = session.execute(
        text(
            "SELECT COUNT(*) FROM stock"
            " WHERE batch_number IS NULL OR serial_number IS NULL"
        )
    ).fetchone()
    return int(row[0])


class StockRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_all(self) -> List[Stock]:
        """Return all stock records ordered by location then SKU."""
        return (
            self._db.query(Stock)
            .order_by(Stock.location, Stock.sku)
            .all()
        )

    def list_by_sku(self, sku: str) -> List[Stock]:
        """Return all stock records for a given SKU ordered by location."""
        return (
            self._db.query(Stock)
            .filter(Stock.sku == sku)
            .order_by(Stock.location)
            .all()
        )

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
