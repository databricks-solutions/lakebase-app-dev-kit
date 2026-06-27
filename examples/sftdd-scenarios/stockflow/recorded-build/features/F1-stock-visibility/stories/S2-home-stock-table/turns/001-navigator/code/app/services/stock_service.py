"""Stock service -- business logic and validation."""

from dataclasses import dataclass, field
from typing import Optional

from app.models.stock import Stock
from app.repositories.stock_repository import StockRepository


@dataclass
class ValidationError:
    """Holds field-level validation messages."""

    sku: Optional[str] = None
    location: Optional[str] = None
    qty: Optional[str] = None

    @property
    def has_errors(self) -> bool:
        return any([self.sku, self.location, self.qty])


class StockService:
    def __init__(self, repository: StockRepository) -> None:
        self._repo = repository

    def validate(self, sku: str, location: str, qty_raw: str) -> ValidationError:
        """Validate inbound receipt fields; return a ValidationError (may be empty)."""
        err = ValidationError()
        if not sku or not sku.strip():
            err.sku = "SKU is required"
        if not location or not location.strip():
            err.location = "Location is required"
        if not qty_raw or not qty_raw.strip():
            err.qty = "Quantity is required"
        else:
            try:
                qty = int(qty_raw)
                if qty < 0:
                    err.qty = "Quantity must be zero or greater"
            except ValueError:
                err.qty = "Quantity must be a whole number"
        return err

    def record(self, sku: str, location: str, qty_raw: str, tracking_code: str) -> Stock:
        """Validate then upsert; raises ValueError if validation fails (callers should pre-validate)."""
        err = self.validate(sku, location, qty_raw)
        if err.has_errors:
            raise ValueError("Validation failed")
        return self._repo.upsert(
            sku=sku.strip(),
            location=location.strip(),
            quantity=int(qty_raw),
            tracking_code=tracking_code.strip() if tracking_code else "",
        )
