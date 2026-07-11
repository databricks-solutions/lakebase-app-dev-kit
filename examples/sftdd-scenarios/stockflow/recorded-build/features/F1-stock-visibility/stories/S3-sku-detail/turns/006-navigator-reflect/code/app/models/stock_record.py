"""StockRecord domain model.

A single-responsibility aggregate for a SKU's stock level at a physical
location. `created_at` and `actor` are set once by the service on first
insert and are never reassigned on refile (NFR-F1-durability-migrations);
the model stores them immutably by simply never including them in an
update statement.
"""

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StockRecord(Base):
    __tablename__ = "stock_records"
    __table_args__ = (
        UniqueConstraint("sku", "location", name="uq_stock_records_sku_location"),
        CheckConstraint("quantity >= 0", name="ck_stock_records_quantity_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sku: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    inventory_code: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    actor: Mapped[str] = mapped_column(String(255), nullable=False, server_default="system")
