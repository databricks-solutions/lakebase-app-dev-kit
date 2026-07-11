"""S1-split-schema-migration / T6 / AC3-every-row-survives-unchanged /
PI2-split-migration-atomic: forcing the split migration's backfill UPDATE to
fail mid-migration must leave the branch as if the migration never ran , no
batch_number/serial_number columns added, inventory_code not dropped, and a
pre-existing row's canonical location/quantity untouched. Confirms the
add-columns + backfill + drop-column sequence runs as a single atomic
transaction. Marked `migration`: mutates schema via downgrade/upgrade, so
the verify runs it on its OWN isolated ephemeral branch, never the shared
verify database.
"""

import uuid

import pytest
from alembic import command
from sqlalchemy import text
from sqlalchemy.engine import Connection

from tests._split_migration_helpers import alembic_config, ensure_pre_split_schema, has_column

pytestmark = pytest.mark.migration


def _sql_text(statement) -> str:
    try:
        return str(getattr(statement, "text", statement))
    except Exception:
        return ""


def test_backfill_failure_leaves_no_half_migrated_state(db_session, monkeypatch):
    ensure_pre_split_schema(db_session)

    sku = f"SKU-ATOMIC-{uuid.uuid4().hex[:8]}"
    location = f"LOC-ATOMIC-{uuid.uuid4().hex[:8]}"

    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, 6, 'A12-B7-S001')"
        ),
        {"sku": sku, "location": location},
    )
    db_session.commit()

    original_execute = Connection.execute

    def _raising_execute(self, statement, *args, **kwargs):
        sql = _sql_text(statement).upper()
        if "UPDATE" in sql and "STOCK_RECORDS" in sql:
            raise RuntimeError("test-injected backfill failure")
        return original_execute(self, statement, *args, **kwargs)

    monkeypatch.setattr(Connection, "execute", _raising_execute)

    try:
        with pytest.raises(Exception):
            command.upgrade(alembic_config(), "head")
    finally:
        monkeypatch.undo()
        db_session.rollback()

    try:
        assert has_column(db_session, "inventory_code"), (
            "a failed backfill must leave inventory_code in place (no "
            "half-migrated drop)"
        )
        assert not has_column(db_session, "batch_number"), (
            "a failed backfill must leave batch_number un-added; the "
            "add-columns + backfill + drop-column sequence must run as one "
            "atomic transaction"
        )
        row = db_session.execute(
            text("SELECT location, quantity FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        ).first()
        assert row is not None
        assert row.location == location
        assert row.quantity == 6
    finally:
        db_session.rollback()
        try:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
            db_session.commit()
        except Exception:
            db_session.rollback()
