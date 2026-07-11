"""Stock service , business rules for recording stock.

Owns the create-or-update rule (a refile overwrites the existing row rather
than duplicating it, NFR-F1-sku-location-uniqueness) and sets the immutable
audit `actor` on every write (NFR-F1-durability-migrations). Never touches
the ORM/session directly; delegates persistence to the repository.
"""

from app.repositories.stock_repository import (
    StockRecordDTO,
    list_stock_by_location,
    list_stock_records_for_sku,
    upsert_stock_record,
)

# V1 has no authentication (architecture.md: AuthN/AuthZ out of bounds), so
# every write is attributed to a single system actor.
_SYSTEM_ACTOR = "system"


def record_stock(
    sku: str,
    location: str,
    quantity: int,
    batch_number: str | None = None,
    serial_number: str | None = None,
) -> StockRecordDTO:
    """Create-or-update the stock record for (sku, location)."""
    return upsert_stock_record(
        sku=sku,
        location=location,
        quantity=quantity,
        batch_number=batch_number,
        serial_number=serial_number,
        actor=_SYSTEM_ACTOR,
    )


def list_stock_for_location(location: str) -> list[StockRecordDTO]:
    """Return every filed stock record at `location` (an empty list, never
    an error, when there is none)."""
    return list_stock_by_location(location)


def get_sku_detail(sku: str) -> list[StockRecordDTO]:
    """Return every filed stock record for `sku`, one entry per location
    (an empty list, never an error, when the SKU holds no stock)."""
    return list_stock_records_for_sku(sku)
