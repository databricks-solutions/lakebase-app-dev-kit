"""Stock service , business rules for recording stock.

Owns the create-or-update rule (a refile overwrites the existing row rather
than duplicating it, NFR-F1-sku-location-uniqueness) and sets the immutable
audit `actor` on every write (NFR-F1-durability-migrations). Never touches
the ORM/session directly; delegates persistence to the repository.
"""

from app.repositories.stock_repository import StockRecordDTO, upsert_stock_record

# V1 has no authentication (architecture.md: AuthN/AuthZ out of bounds), so
# every write is attributed to a single system actor.
_SYSTEM_ACTOR = "system"


def record_stock(sku: str, location: str, quantity: int, inventory_code: str) -> StockRecordDTO:
    """Create-or-update the stock record for (sku, location)."""
    return upsert_stock_record(
        sku=sku,
        location=location,
        quantity=quantity,
        inventory_code=inventory_code,
        actor=_SYSTEM_ACTOR,
    )
