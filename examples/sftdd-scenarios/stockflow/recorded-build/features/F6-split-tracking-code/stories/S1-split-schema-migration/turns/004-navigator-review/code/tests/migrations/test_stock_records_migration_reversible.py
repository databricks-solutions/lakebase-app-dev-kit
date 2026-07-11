"""AC2-file-new-stock-confirmed / T8 / PI4-migration-reversible: the
stock_records migration applies, reverses on a single `alembic downgrade -1`,
and re-applies cleanly, preserving any pre-existing rows. NEVER
`downgrade base`. Marked `migration` so the verify runs it on its OWN
isolated ephemeral branch (never the shared verify database).

Superseded by F6-split-tracking-code/S1-split-schema-migration/AC4: the
combined inventory_code column is gone at head (split into batch_number/
serial_number); this round-trip now seeds/asserts on the split columns.
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
    # No embedded hyphen: the split migration's down() reconstructs
    # inventory_code as location-batch_number-serial_number, so a hyphenated
    # location would make the round-trip re-parse into more than 3 segments.
    location = f"LOCMIG{uuid.uuid4().hex[:8].upper()}"
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, batch_number, serial_number) "
            "VALUES (:sku, :location, 4, 'BPRESERVE', 'SPRESERVE')"
        ),
        {"sku": sku, "location": location},
    )
    db_session.commit()

    try:
        command.downgrade(_alembic_config(), "-1")
        command.upgrade(_alembic_config(), "head")

        row = db_session.execute(
            text(
                "SELECT quantity, batch_number, serial_number FROM stock_records "
                "WHERE sku = :sku AND location = :location"
            ),
            {"sku": sku, "location": location},
        ).first()
        assert row is not None, (
            "the pre-existing row must survive a single downgrade -1 "
            "followed by upgrade head"
        )
        assert row.quantity == 4
        assert row.batch_number == "BPRESERVE"
        assert row.serial_number == "SPRESERVE"
    finally:
        try:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
                {"sku": sku, "location": location},
            )
            db_session.commit()
        except Exception:
            db_session.rollback()
