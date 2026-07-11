"""AC2-file-new-stock-confirmed / T8 / PI4-migration-reversible: the
stock_records migration applies, reverses on a single `alembic downgrade -1`,
and re-applies cleanly, preserving any pre-existing rows. NEVER
`downgrade base`. Marked `migration` so the verify runs it on its OWN
isolated ephemeral branch (never the shared verify database).
"""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

pytestmark = pytest.mark.migration

ALEMBIC_INI = str(Path(__file__).resolve().parents[2] / "alembic.ini")


def _alembic_config() -> Config:
    return Config(ALEMBIC_INI)


def test_stock_records_migration_reverses_and_reapplies_preserving_rows(db_session):
    command.upgrade(_alembic_config(), "head")

    sku = f"SKU-MIG-{uuid.uuid4().hex[:8]}"
    location = f"LOC-MIG-{uuid.uuid4().hex[:8]}"
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, 4, 'INV-PRESERVE')"
        ),
        {"sku": sku, "location": location},
    )
    db_session.commit()

    try:
        command.downgrade(_alembic_config(), "-1")
        command.upgrade(_alembic_config(), "head")

        row = db_session.execute(
            text(
                "SELECT quantity, inventory_code FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        ).first()
        assert row is not None, (
            "the pre-existing row must survive a single downgrade -1 "
            "followed by upgrade head"
        )
        assert row.quantity == 4
        assert row.inventory_code == "INV-PRESERVE"
    finally:
        try:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
                {"sku": sku, "location": location},
            )
            db_session.commit()
        except Exception:
            db_session.rollback()
