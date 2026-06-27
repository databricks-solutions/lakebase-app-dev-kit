"""Stock ORM model."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Stock(Base):
    __tablename__ = "stock"
    __table_args__ = (UniqueConstraint("sku", "location", name="uq_stock_sku_location"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sku: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    tracking_code: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    actor: Mapped[str] = mapped_column(
        String(255), nullable=False, default="system", server_default="system"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
