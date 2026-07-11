"""Step definitions for S1-split-schema-migration.feature
(T1/AC1-backfill-conforming-codes, T2/AC2-nonconforming-left-null,
T5/AC3-every-row-survives-unchanged, T8/AC4-combined-column-dropped,
T9/AC5-nonconforming-count-reported).

Real-branch integration: seeds stock_records rows directly (pre-migration
shape) via SQL against the paired Lakebase branch, drives the real Alembic
split revision, and asserts on the migrated schema/rows. Never mocked
(NFR-F6-real-branch-tests). Every scenario scopes its seed AND its
assertions to this test's own marked (sku-tagged) rows, never a whole-table
aggregate.
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

from tests._split_migration_helpers import (
    ensure_pre_split_schema,
    has_column,
    upgrade_to_head,
)

scenarios("../features/S1-split-schema-migration.feature")


def _location() -> str:
    # No embedded hyphen: keeps a conforming inventory_code to exactly 3
    # '-'-delimited segments (location-batch-serial), so the parsed leading
    # segment reconciles with the canonical `location` column for a clean
    # round-trip elsewhere in this story.
    return f"LOC{uuid.uuid4().hex[:8].upper()}"


def _sku() -> str:
    return f"SKU-SPLIT-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def split_context():
    return {"rows": [], "skus": []}


@pytest.fixture(autouse=True)
def _cleanup(split_context, db_session):
    yield
    db_session.rollback()
    try:
        for sku in split_context["skus"]:
            db_session.execute(text("DELETE FROM stock_records WHERE sku = :sku"), {"sku": sku})
        db_session.commit()
    except Exception:
        db_session.rollback()


def _seed_pre_split_row(db_session, split_context, sku, location, quantity, inventory_code):
    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, :quantity, :inventory_code)"
        ),
        {
            "sku": sku,
            "location": location,
            "quantity": quantity,
            "inventory_code": inventory_code,
        },
    )
    db_session.commit()
    split_context["skus"].append(sku)
    split_context["rows"].append(
        {"sku": sku, "location": location, "quantity": quantity, "inventory_code": inventory_code}
    )


@given("a stock row seeded pre-migration with an inventory_code that parses as location-batch-serial")
def _seed_conforming_row(split_context, db_session):
    ensure_pre_split_schema(db_session)
    location = _location()
    sku = _sku()
    inventory_code = f"{location}-B7-S001"
    _seed_pre_split_row(db_session, split_context, sku, location, 4, inventory_code)
    split_context["expected_batch"] = "B7"
    split_context["expected_serial"] = "S001"


@given("stock rows seeded pre-migration with inventory_codes that lack a batch or serial segment")
def _seed_nonconforming_rows(split_context, db_session):
    ensure_pre_split_schema(db_session)
    for inventory_code in ("X-1", "c"):
        _seed_pre_split_row(db_session, split_context, _sku(), _location(), 1, inventory_code)


@given("a marked set of stock rows snapshotted before the split migration")
def _seed_marked_survival_set(split_context, db_session):
    ensure_pre_split_schema(db_session)
    for quantity, inventory_code in ((3, "A12-B7-S001"), (9, "X-1")):
        _seed_pre_split_row(db_session, split_context, _sku(), _location(), quantity, inventory_code)


@given("the split migration has run")
def _run_split_migration_given(db_session):
    upgrade_to_head(db_session)


@given("a marked set of stock rows seeded with a known mix of conforming and nonconforming inventory_codes")
def _seed_marked_probe_mix(split_context, db_session):
    ensure_pre_split_schema(db_session)
    conforming = [(2, f"{_location()}-B1-S100"), (5, f"{_location()}-B2-S200")]
    nonconforming = [(1, "X-1"), (1, "c"), (7, "Y-2")]
    for quantity, inventory_code in conforming + nonconforming:
        _seed_pre_split_row(db_session, split_context, _sku(), _location(), quantity, inventory_code)
    split_context["expected_nonconforming"] = len(nonconforming)


@when("the split migration's up migration runs")
def _run_up_migration(db_session):
    upgrade_to_head(db_session)


@when("the stock_records schema is inspected")
def _inspect_schema():
    pass  # the inspection itself happens in the Then step via information_schema


@when("the integrity probe is run for review scoped to the marked rows")
def _run_probe(split_context, db_session):
    from migration_tooling.integrity_probe import count_nonconforming_inventory_codes

    split_context["reported_count"] = count_nonconforming_inventory_codes(
        db_session, skus=split_context["skus"]
    )


@then("the row's batch_number and serial_number match the parsed segments")
def _assert_backfilled_values(split_context, db_session):
    sku = split_context["rows"][0]["sku"]
    row = db_session.execute(
        text("SELECT batch_number, serial_number FROM stock_records WHERE sku = :sku"),
        {"sku": sku},
    ).first()
    assert row is not None, "expected the seeded row to survive the migration"
    assert row.batch_number == split_context["expected_batch"], (
        f"expected batch_number={split_context['expected_batch']!r}, got {row.batch_number!r}"
    )
    assert row.serial_number == split_context["expected_serial"], (
        f"expected serial_number={split_context['expected_serial']!r}, got {row.serial_number!r}"
    )


@then("each row's batch_number and serial_number are left NULL")
def _assert_nonconforming_left_null(split_context, db_session):
    for sku in split_context["skus"]:
        row = db_session.execute(
            text("SELECT batch_number, serial_number FROM stock_records WHERE sku = :sku"),
            {"sku": sku},
        ).first()
        assert row is not None
        assert row.batch_number is None, (
            f"expected batch_number NULL for nonconforming sku {sku}, got {row.batch_number!r}"
        )
        assert row.serial_number is None, (
            f"expected serial_number NULL for nonconforming sku {sku}, got {row.serial_number!r}"
        )


@then("every marked row still exists afterward with its location and quantity unchanged")
def _assert_rows_survive_unchanged(split_context, db_session):
    assert has_column(db_session, "batch_number") and not has_column(db_session, "inventory_code"), (
        "expected the split migration to have actually run (batch_number "
        "present, inventory_code dropped) before checking row survival"
    )
    for seeded in split_context["rows"]:
        row = db_session.execute(
            text("SELECT location, quantity FROM stock_records WHERE sku = :sku"),
            {"sku": seeded["sku"]},
        ).first()
        assert row is not None, f"expected sku {seeded['sku']} to survive the split migration"
        assert row.location == seeded["location"], (
            f"expected location {seeded['location']!r} unchanged, got {row.location!r}"
        )
        assert row.quantity == seeded["quantity"], (
            f"expected quantity {seeded['quantity']!r} unchanged, got {row.quantity!r}"
        )


@then("the inventory_code column is absent and batch_number and serial_number are separately queryable")
def _assert_column_dropped(db_session):
    assert not has_column(db_session, "inventory_code"), (
        "expected inventory_code to be dropped after the split migration"
    )
    assert has_column(db_session, "batch_number"), (
        "expected batch_number to exist as a separately queryable field"
    )
    assert has_column(db_session, "serial_number"), (
        "expected serial_number to exist as a separately queryable field"
    )


@then("it reports a count matching exactly the marked nonconforming subset")
def _assert_probe_count(split_context):
    assert split_context["reported_count"] == split_context["expected_nonconforming"], (
        f"expected the probe to report {split_context['expected_nonconforming']} "
        "nonconforming rows among this test's marked skus, got "
        f"{split_context['reported_count']}"
    )
