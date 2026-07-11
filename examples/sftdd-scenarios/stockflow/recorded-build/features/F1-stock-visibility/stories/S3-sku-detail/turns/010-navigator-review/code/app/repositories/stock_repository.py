"""Stock record repository , the ONLY layer that touches the ORM/session.

Owns the full session lifecycle (open, query, commit/rollback, close) for
every persistence operation, so the service layer above it never imports
`SessionLocal`/`Session` directly (architecture.json: repository `may_import`
is `models` only).
"""

from dataclasses import dataclass
from datetime import datetime

from app.database import SessionLocal
from app.models import StockRecord


@dataclass(frozen=True)
class StockRecordDTO:
    sku: str
    location: str
    quantity: int
    inventory_code: str
    created_at: datetime
    actor: str


def _to_dto(record: StockRecord) -> StockRecordDTO:
    return StockRecordDTO(
        sku=record.sku,
        location=record.location,
        quantity=record.quantity,
        inventory_code=record.inventory_code,
        created_at=record.created_at,
        actor=record.actor,
    )


def list_stock_by_location(location: str) -> list[StockRecordDTO]:
    """Return every filed stock record at `location`, or an empty list.

    An empty result is a normal, distinct outcome from an error; the caller
    (service) surfaces it as an empty collection, never a null/crash.
    """
    session = SessionLocal()
    try:
        records = (
            session.query(StockRecord)
            .filter(StockRecord.location == location)
            .order_by(StockRecord.sku)
            .all()
        )
        return [_to_dto(record) for record in records]
    finally:
        session.close()


def list_stock_records_for_sku(sku: str) -> list[StockRecordDTO]:
    """Return every filed stock record for `sku`, one row per location.

    The WHERE sku=:sku scoping lives here (never in the boundary or
    service): the (sku, location) UNIQUE constraint already guarantees at
    most one row per location, so this query alone produces the SKU detail
    entry set.
    """
    session = SessionLocal()
    try:
        records = (
            session.query(StockRecord)
            .filter(StockRecord.sku == sku)
            .order_by(StockRecord.location)
            .all()
        )
        return [_to_dto(record) for record in records]
    finally:
        session.close()


def upsert_stock_record(
    sku: str, location: str, quantity: int, inventory_code: str, actor: str
) -> StockRecordDTO:
    """Create-or-update the single row for (sku, location).

    On collision (an existing row for this pair), overwrites quantity and
    inventory_code in place (last-write-wins, NFR-F1-sku-location-uniqueness)
    while leaving the original `created_at`/`actor` untouched (immutable
    audit fields, NFR-F1-durability-migrations). Never creates a second row:
    resolved by an existence check plus the DB's composite UNIQUE(sku,
    location) constraint as the write-time backstop.
    """
    session = SessionLocal()
    try:
        existing = (
            session.query(StockRecord)
            .filter(StockRecord.sku == sku, StockRecord.location == location)
            .one_or_none()
        )
        if existing is not None:
            existing.quantity = quantity
            existing.inventory_code = inventory_code
            session.commit()
            session.refresh(existing)
            return _to_dto(existing)

        record = StockRecord(
            sku=sku,
            location=location,
            quantity=quantity,
            inventory_code=inventory_code,
            actor=actor,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return _to_dto(record)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
