"""Step definitions for S1-split-add-backfill (F6-split-tracking-code).

Behavior tests T1-T8 run against the real experiment-branch DB.
A module-scoped ``applied_migration`` fixture:
  1. seeds test rows with known inventory_code values,
  2. runs ``alembic upgrade head`` (applies the new split migration),
  3. yields the session so scenarios assert the post-migration state,
  4. downgrades back to the pre-fixture revision on teardown,
  5. deletes all test rows.

RED state: no migration adds batch_number/serial_number yet, so the
Background step fails with a clear assertion error on every scenario.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pytest_bdd import given, parsers, then
from pytest_bdd import scenarios
from sqlalchemy import text

from app.database import SessionLocal, engine

scenarios("../features/S1-split-add-backfill.feature")

# ---------------------------------------------------------------------------
# Test-row identifiers (unique to this module)
# ---------------------------------------------------------------------------
_T3_SKU = "SPLIT-T3-3SEG"
_T3_LOC = "LOC-SPLIT-T3"
_T3_QTY = 42
_T3_IC  = "A12-B7-S001"

_T4_SKU = "SPLIT-T4-2SEG"
_T4_LOC = "LOC-SPLIT-T4"
_T4_QTY = 7
_T4_IC  = "A12-B7"

_T5_SKU = "SPLIT-T5-1SEG"
_T5_LOC = "LOC-SPLIT-T5"
_T5_QTY = 3
_T5_IC  = "A12"

_T6_PREFIX    = "SPLIT-T6-ROW-"
_T6_ROW_COUNT = 100

# The split migration backfills batch_number/serial_number; a later migration
# (S3) DROPs inventory_code, so assertions can no longer query by it -- they are
# re-keyed by sku, using this map from the seeded inventory code to its sku.
_IC_TO_SKU = {_T3_IC: _T3_SKU, _T4_IC: _T4_SKU, _T5_IC: _T5_SKU}

# Revision just below the S1 split migration (add_inventory_code).  The fixture
# downgrades to here so that ``upgrade head`` re-runs the S1 backfill against the
# freshly seeded rows before the later S3 migration drops inventory_code.
_PRE_SPLIT_REVISION = "20260624134308"

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI  = str(PROJECT_ROOT / "alembic.ini")


# ---------------------------------------------------------------------------
# Module-scoped helpers
# ---------------------------------------------------------------------------

def _delete_test_rows(sess) -> None:
    try:
        sess.execute(text("DELETE FROM stock WHERE sku LIKE 'SPLIT-T%'"))
        sess.commit()
    except Exception:
        sess.rollback()


def _insert_row(sess, sku: str, location: str, qty: int, ic: str) -> None:
    sess.execute(
        text(
            "INSERT INTO stock (sku, location, quantity, inventory_code)"
            " VALUES (:sku, :loc, :qty, :ic)"
            " ON CONFLICT (sku, location) DO UPDATE"
            "   SET quantity = EXCLUDED.quantity,"
            "       inventory_code = EXCLUDED.inventory_code"
        ),
        {"sku": sku, "loc": location, "qty": qty, "ic": ic},
    )


# ---------------------------------------------------------------------------
# Module-scoped migration fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def _module_session():
    sess = SessionLocal()
    try:
        yield sess
    finally:
        sess.close()


@pytest.fixture(scope="module")
def applied_migration(_module_session):
    """Seed test rows, apply the S1 split migration, yield, then teardown.

    In RED state alembic upgrade head is a no-op (no split migration exists),
    so the Background step assertion on batch_number fails immediately.
    """
    from alembic import command
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext

    sess = _module_session

    # Capture the current head revision so teardown can restore it precisely.
    with engine.connect() as conn:
        pre_rev = MigrationContext.configure(conn).get_current_revision()

    # Clean any leftover rows from a previous interrupted run.
    _delete_test_rows(sess)

    # Step below the split migration so the subsequent ``upgrade head`` actually
    # executes the S1 split migration (and its backfill UPDATE) against the freshly
    # seeded rows, before the later S3 migration drops inventory_code.
    alembic_cfg = Config(ALEMBIC_INI)
    command.downgrade(alembic_cfg, _PRE_SPLIT_REVISION)

    # Seed T3 / T7 / T8 row (3-segment code, known location + quantity).
    _insert_row(sess, _T3_SKU, _T3_LOC, _T3_QTY, _T3_IC)
    # Seed T4 row (2-segment code).
    _insert_row(sess, _T4_SKU, _T4_LOC, _T4_QTY, _T4_IC)
    # Seed T5 row (1-segment code).
    _insert_row(sess, _T5_SKU, _T5_LOC, _T5_QTY, _T5_IC)
    # Seed 100 T6 rows with varied code widths.
    for i in range(1, _T6_ROW_COUNT + 1):
        remainder = i % 3
        if remainder == 0:
            ic = f"LOC-{i:03d}"                       # 1-segment
        elif remainder == 1:
            ic = f"LOC-{i:03d}-B{i:02d}"              # 2-segment
        else:
            ic = f"LOC-{i:03d}-B{i:02d}-S{i:03d}"    # 3-segment
        _insert_row(sess, f"{_T6_PREFIX}{i:03d}", f"LOC-T6-{i:03d}", i, ic)
    sess.commit()

    # Apply the split migration (runs upgrade + backfill UPDATE against seeded rows).
    command.upgrade(alembic_cfg, "head")

    sess.expire_all()
    yield sess

    # Teardown: revert to the revision we started from.
    with engine.connect() as conn:
        post_rev = MigrationContext.configure(conn).get_current_revision()
    if post_rev != pre_rev:
        command.downgrade(alembic_cfg, pre_rev or "base")

    _delete_test_rows(sess)


# ---------------------------------------------------------------------------
# Background step
# ---------------------------------------------------------------------------

@given("the S1 split migration has been applied")
def step_migration_applied(applied_migration) -> None:
    """Verify the split migration actually ran by asserting batch_number exists."""
    sess = applied_migration
    row = sess.execute(
        text(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'stock' AND column_name = 'batch_number'"
        )
    ).fetchone()
    assert row is not None, (
        "batch_number column not found after alembic upgrade head; "
        "the S1 split migration (ADD COLUMN batch_number + serial_number + backfill) "
        "must be created as the next Alembic revision in alembic/versions/"
    )


# ---------------------------------------------------------------------------
# T1 / T2 - column existence
# ---------------------------------------------------------------------------

@then(parsers.parse('the stock table has a "{col}" column'))
def step_column_exists(col: str, applied_migration) -> None:
    sess = applied_migration
    row = sess.execute(
        text(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'stock' AND column_name = :col"
        ),
        {"col": col},
    ).fetchone()
    assert row is not None, (
        f"stock table is missing the {col!r} column after the S1 split migration; "
        f"upgrade() must ADD COLUMN {col}"
    )


# ---------------------------------------------------------------------------
# T3 / T4 / T5 - parsing / backfill
# ---------------------------------------------------------------------------

@then(
    parsers.parse(
        'the stock row with inventory code "{ic}"'
        ' has batch number "{batch}" and serial number "{serial}"'
    )
)
def step_has_batch_and_serial(ic: str, batch: str, serial: str, applied_migration) -> None:
    sess = applied_migration
    sku = _IC_TO_SKU[ic]
    row = sess.execute(
        text(
            "SELECT batch_number, serial_number"
            " FROM stock WHERE sku = :sku"
        ),
        {"sku": sku},
    ).fetchone()
    assert row is not None, (
        f"No stock row found for sku={sku!r} (seeded inventory code {ic!r}) after migration; "
        "ensure the row was seeded before upgrade()"
    )
    assert row[0] == batch, (
        f"batch_number mismatch for seeded inventory code {ic!r}: "
        f"expected {batch!r}, got {row[0]!r}"
    )
    assert row[1] == serial, (
        f"serial_number mismatch for seeded inventory code {ic!r}: "
        f"expected {serial!r}, got {row[1]!r}"
    )


@then(
    parsers.parse(
        'the stock row with inventory code "{ic}"'
        " has batch number \"{batch}\" and no serial number"
    )
)
def step_has_batch_null_serial(ic: str, batch: str, applied_migration) -> None:
    sess = applied_migration
    sku = _IC_TO_SKU[ic]
    row = sess.execute(
        text(
            "SELECT batch_number, serial_number"
            " FROM stock WHERE sku = :sku"
        ),
        {"sku": sku},
    ).fetchone()
    assert row is not None, (
        f"No stock row found for sku={sku!r} (seeded inventory code {ic!r}) after migration"
    )
    assert row[0] == batch, (
        f"batch_number mismatch for {ic!r}: expected {batch!r}, got {row[0]!r}"
    )
    assert row[1] is None, (
        f"serial_number should be NULL for 2-segment code {ic!r}, got {row[1]!r}"
    )


@then(
    parsers.parse(
        'the stock row with inventory code "{ic}"'
        " has no batch number and no serial number"
    )
)
def step_has_null_batch_null_serial(ic: str, applied_migration) -> None:
    sess = applied_migration
    sku = _IC_TO_SKU[ic]
    row = sess.execute(
        text(
            "SELECT batch_number, serial_number"
            " FROM stock WHERE sku = :sku"
        ),
        {"sku": sku},
    ).fetchone()
    assert row is not None, (
        f"No stock row found for sku={sku!r} (seeded inventory code {ic!r}) after migration"
    )
    assert row[0] is None, (
        f"batch_number should be NULL for 1-segment code {ic!r}, got {row[0]!r}"
    )
    assert row[1] is None, (
        f"serial_number should be NULL for 1-segment code {ic!r}, got {row[1]!r}"
    )


# ---------------------------------------------------------------------------
# T6 - all rows migrated
# ---------------------------------------------------------------------------

@then("all 100 seeded T6 rows have batch_number and serial_number present")
def step_all_100_rows_have_columns(applied_migration) -> None:
    sess = applied_migration

    # Both columns must exist (belt-and-suspenders alongside T1/T2).
    for col in ("batch_number", "serial_number"):
        exists = sess.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name = 'stock' AND column_name = :col"
            ),
            {"col": col},
        ).fetchone()
        assert exists is not None, (
            f"Column {col!r} missing; S1 split migration must ADD COLUMN {col}"
        )

    # No rows were deleted or skipped by the migration.
    count = sess.execute(
        text("SELECT COUNT(*) FROM stock WHERE sku LIKE 'SPLIT-T6-ROW-%'")
    ).scalar()
    assert count == _T6_ROW_COUNT, (
        f"Expected {_T6_ROW_COUNT} T6 rows after migration, found {count}; "
        "the migration must not delete or skip any row"
    )


# ---------------------------------------------------------------------------
# T7 - location unchanged
# ---------------------------------------------------------------------------

@then(
    parsers.parse(
        'the seeded row for sku "{sku}" still has location "{expected_loc}"'
    )
)
def step_location_unchanged(sku: str, expected_loc: str, applied_migration) -> None:
    sess = applied_migration
    actual = sess.execute(
        text("SELECT location FROM stock WHERE sku = :sku"),
        {"sku": sku},
    ).scalar()
    assert actual is not None, (
        f"No row found for sku={sku!r} after migration"
    )
    assert actual == expected_loc, (
        f"location changed after migration: expected {expected_loc!r}, got {actual!r}; "
        "the S1 split migration must not modify the location column"
    )


# ---------------------------------------------------------------------------
# T8 - sku and quantity unchanged
# ---------------------------------------------------------------------------

@then(
    parsers.parse(
        'the seeded row for sku "{sku}" still has sku "{expected_sku}"'
        " and quantity {expected_qty:d}"
    )
)
def step_sku_qty_unchanged(
    sku: str, expected_sku: str, expected_qty: int, applied_migration
) -> None:
    sess = applied_migration
    row = sess.execute(
        text("SELECT sku, quantity FROM stock WHERE sku = :sku"),
        {"sku": sku},
    ).fetchone()
    assert row is not None, (
        f"No row found for sku={sku!r} after migration"
    )
    assert row[0] == expected_sku, (
        f"sku changed after migration: expected {expected_sku!r}, got {row[0]!r}"
    )
    assert row[1] == expected_qty, (
        f"quantity changed after migration: expected {expected_qty}, got {row[1]}; "
        "the S1 split migration must not modify quantity values (NFR-F6-S1-2)"
    )
