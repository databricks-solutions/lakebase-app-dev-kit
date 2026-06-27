"""Step definitions for S2-split-validate (F6-split-tracking-code).

Behavior tests T15-T18 run against the real experiment-branch DB.

RED state: count_unparseable_codes does not yet exist in
app.repositories.stock_repository, so the import at module level raises
ImportError and every scenario in this file fails to collect.
"""

from __future__ import annotations

import pytest
from pytest_bdd import given, when, then, scenarios
from sqlalchemy import text

# RED trigger: ImportError until the Driver adds count_unparseable_codes
# to app.repositories.stock_repository.
from app.repositories.stock_repository import count_unparseable_codes  # noqa: F401

from app.database import SessionLocal, engine

scenarios("../features/S2-split-validate.feature")

_S2_VALID_PREFIX = "S2-VALID-"
_S2_BAD_PREFIX = "S2-BAD-"


# ---------------------------------------------------------------------------
# Module-scoped session (shared across scenarios; each Given step commits)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def _s2_session():
    sess = SessionLocal()
    try:
        yield sess
    finally:
        sess.close()


@pytest.fixture(autouse=True, scope="module")
def _cleanup_s2_rows(_s2_session):
    """Delete all S2 test rows at module start and teardown."""
    sess = _s2_session
    _wipe_s2_rows(sess)
    yield
    _wipe_s2_rows(sess)


def _wipe_s2_rows(sess) -> None:
    try:
        sess.execute(
            text(
                "DELETE FROM stock"
                " WHERE sku LIKE 'S2-VALID-%' OR sku LIKE 'S2-BAD-%'"
            )
        )
        sess.commit()
    except Exception:
        sess.rollback()


# ---------------------------------------------------------------------------
# Function-scoped context: shares probe result within a single scenario
# ---------------------------------------------------------------------------

@pytest.fixture()
def s2_context():
    return {}


# ---------------------------------------------------------------------------
# Background
# ---------------------------------------------------------------------------

@given("the S1 split migration is applied and the batch_number column exists")
def step_s1_migration_applied() -> None:
    """Verify the S1 migration ran; live engine.connect() also confirms real DB."""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name = 'stock' AND column_name = 'batch_number'"
            )
        ).fetchone()
    assert row is not None, (
        "batch_number column not found; the S1 split migration must be applied "
        "to the experiment branch (experiment-s2-split-validate-exp1) "
        "before S2 validation tests run"
    )


# ---------------------------------------------------------------------------
# T15 -- probe callable without error
# ---------------------------------------------------------------------------

@when("the validation probe is called against the stock table")
def step_call_probe_t15(s2_context, _s2_session) -> None:
    sess = _s2_session
    sess.expire_all()
    result = count_unparseable_codes(sess)
    s2_context["probe_result"] = result


@then("it returns a result without raising an error")
def step_result_no_error(s2_context) -> None:
    assert "probe_result" in s2_context, (
        "count_unparseable_codes raised an exception; "
        "the probe must execute without error against the migrated stock table (T15)"
    )
    assert s2_context["probe_result"] is not None, (
        "count_unparseable_codes returned None; it must return a scalar integer (T15)"
    )


# ---------------------------------------------------------------------------
# T16 -- Given: seed valid rows (all three-segment), ensure no NULL-split rows
# ---------------------------------------------------------------------------

@given("the stock table has only S2 seeded rows with three-segment codes")
def step_seed_valid_rows(_s2_session) -> None:
    sess = _s2_session
    # Remove S2 test rows, S1 leftover rows, and any residual NULL-split rows
    sess.execute(
        text(
            "DELETE FROM stock"
            " WHERE sku LIKE 'S2-VALID-%' OR sku LIKE 'S2-BAD-%'"
        )
    )
    sess.execute(text("DELETE FROM stock WHERE sku LIKE 'SPLIT-T%'"))
    # Purge any remaining NULL-split rows so the probe baseline is 0
    sess.execute(
        text(
            "DELETE FROM stock"
            " WHERE batch_number IS NULL OR serial_number IS NULL"
        )
    )
    sess.commit()

    # Seed two rows with fully-parsed batch_number / serial_number values
    for i in range(1, 3):
        sess.execute(
            text(
                "INSERT INTO stock"
                " (sku, location, quantity, batch_number, serial_number)"
                " VALUES (:sku, :loc, 1, :bn, :sn)"
                " ON CONFLICT (sku, location) DO UPDATE"
                "   SET batch_number   = EXCLUDED.batch_number,"
                "       serial_number  = EXCLUDED.serial_number"
            ),
            {
                "sku": f"S2-VALID-{i:03d}",
                "loc": f"LOC-S2-VALID-{i:03d}",
                "bn": f"B{i:02d}",
                "sn": f"S{i:03d}",
            },
        )
    sess.commit()


# ---------------------------------------------------------------------------
# T17 -- Given: seed two non-conforming rows (NULL batch and serial)
# ---------------------------------------------------------------------------

@given("the stock table has 2 S2 seeded rows with non-conforming codes")
def step_seed_bad_rows(_s2_session) -> None:
    sess = _s2_session
    # Clean up any S2 rows from prior scenarios
    sess.execute(
        text(
            "DELETE FROM stock"
            " WHERE sku LIKE 'S2-VALID-%' OR sku LIKE 'S2-BAD-%'"
        )
    )
    sess.execute(text("DELETE FROM stock WHERE sku LIKE 'SPLIT-T%'"))
    sess.commit()

    # one-segment code (was 'A12') -> batch_number NULL, serial_number NULL
    sess.execute(
        text(
            "INSERT INTO stock"
            " (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, NULL, NULL)"
            " ON CONFLICT (sku, location) DO UPDATE"
            "   SET batch_number   = NULL,"
            "       serial_number  = NULL"
        ),
        {"sku": "S2-BAD-001", "loc": "LOC-S2-BAD-001"},
    )
    # single-character code (was 'c') -> batch_number NULL, serial_number NULL
    sess.execute(
        text(
            "INSERT INTO stock"
            " (sku, location, quantity, batch_number, serial_number)"
            " VALUES (:sku, :loc, 1, NULL, NULL)"
            " ON CONFLICT (sku, location) DO UPDATE"
            "   SET batch_number   = NULL,"
            "       serial_number  = NULL"
        ),
        {"sku": "S2-BAD-002", "loc": "LOC-S2-BAD-002"},
    )
    sess.commit()


# ---------------------------------------------------------------------------
# T16 / T17 / T18 -- When: run the probe
# ---------------------------------------------------------------------------

@when("the S2 validation probe runs")
def step_run_s2_probe(s2_context, _s2_session) -> None:
    sess = _s2_session
    sess.expire_all()
    result = count_unparseable_codes(sess)
    s2_context["probe_result"] = result


# ---------------------------------------------------------------------------
# T16 -- Then: probe returns 0 for valid-only data
# ---------------------------------------------------------------------------

@then("the S2 probe count is 0")
def step_probe_count_zero(s2_context) -> None:
    count = s2_context.get("probe_result")
    assert isinstance(count, int), (
        f"count_unparseable_codes must return an int; got {type(count).__name__!r} (T16)"
    )
    assert count == 0, (
        f"Expected probe count 0 when all codes are three-segment, got {count}; "
        "rows with non-NULL batch_number AND non-NULL serial_number must not be counted "
        "(AC2: probe returns 0 when all codes conform)"
    )


# ---------------------------------------------------------------------------
# T17 -- Then: probe returns 2 for two non-conforming rows
# ---------------------------------------------------------------------------

@then("the S2 probe count is 2")
def step_probe_count_two(s2_context) -> None:
    count = s2_context.get("probe_result")
    assert isinstance(count, int), (
        f"count_unparseable_codes must return an int; got {type(count).__name__!r} (T17)"
    )
    assert count == 2, (
        f"Expected probe count 2 (matching the 2 seeded rows with NULL batch/serial), "
        f"got {count}; count_unparseable_codes must count rows "
        "WHERE batch_number IS NULL OR serial_number IS NULL "
        "(AC3: count equals unparseable rows)"
    )


# ---------------------------------------------------------------------------
# T18 -- Then: result is a scalar integer (DBA-accessible)
# ---------------------------------------------------------------------------

@then("the S2 probe result is a scalar integer")
def step_probe_scalar_int(s2_context) -> None:
    result = s2_context.get("probe_result")
    assert isinstance(result, int), (
        f"count_unparseable_codes must return a scalar integer so a DBA can read "
        f"and record it before the drop; "
        f"got {type(result).__name__!r} = {result!r} "
        "(AC4: count is retrievable and reviewable)"
    )
