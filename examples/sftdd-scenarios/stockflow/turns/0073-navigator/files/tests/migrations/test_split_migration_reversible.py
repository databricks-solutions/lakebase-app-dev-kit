"""S1-split-schema-migration / T10 / AC6-migration-reverses /
PI1-split-migration-reversible: running the split migration's down() after
up() on a conforming-code row reconstructs inventory_code from the canonical
location plus batch_number and serial_number, matching the pre-migration
value. An isolated single-step `downgrade -1` / `upgrade head` round-trip ,
NEVER `downgrade base`. Marked `migration`: the verify runs it on its OWN
isolated ephemeral branch (never the shared verify database).
"""

import uuid

import pytest
from alembic import command
from sqlalchemy import text

from tests._split_migration_helpers import alembic_config, ensure_pre_split_schema, has_column

pytestmark = pytest.mark.migration


def test_down_reconstructs_inventory_code_for_a_conforming_row(db_session):
    ensure_pre_split_schema(db_session)

    location = f"LOC{uuid.uuid4().hex[:8].upper()}"
    sku = f"SKU-REV-{uuid.uuid4().hex[:8]}"
    inventory_code = f"{location}-B9-S777"

    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, 8, :inventory_code)"
        ),
        {"sku": sku, "location": location, "inventory_code": inventory_code},
    )
    db_session.commit()

    try:
        command.upgrade(alembic_config(), "head")
        db_session.rollback()

        # Sanity guard: the split migration must have actually run forward
        # (batch_number present) before its down path is meaningful to test;
        # otherwise downgrading "-1" would just undo an unrelated migration
        # and this test would pass without the split migration existing.
        assert has_column(db_session, "batch_number"), (
            "expected the split migration to have run forward (batch_number "
            "present) before testing its down path"
        )

        command.downgrade(alembic_config(), "-1")
        db_session.rollback()

        assert has_column(db_session, "inventory_code"), (
            "expected inventory_code to be restored by the split migration's "
            "down path"
        )
        row = db_session.execute(
            text("SELECT inventory_code FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        ).first()
        db_session.rollback()
        assert row is not None, "expected the row to survive the down migration"
        assert row.inventory_code == inventory_code, (
            f"expected inventory_code reconstructed to {inventory_code!r} from "
            f"location + batch_number + serial_number, got {row.inventory_code!r}"
        )
    finally:
        # Close out any read transaction on db_session BEFORE the cross-
        # connection upgrade DDL below, so it can never block waiting on a
        # lock this session is still holding (or, left open, hit the
        # branch's idle-in-transaction timeout).
        db_session.rollback()
        command.upgrade(alembic_config(), "head")
        db_session.rollback()
        try:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
            db_session.commit()
        except Exception:
            db_session.rollback()
