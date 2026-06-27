"""Models package -- import all ORM models here so Base.metadata is populated."""

from app.models.stock import Stock  # noqa: F401

__all__ = ["Stock"]
