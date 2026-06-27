"""Step definitions for S3-split-drop-old (F6-split-tracking-code).

Behavior test T21 runs against the real experiment-branch DB. A module-scoped
``s3_up_applied`` fixture:
  1. captures the current head revision,
  2. runs ``alembic upgrade head`` (applies the new S3 drop migration),
  3. yields the session so the scenario asserts the post-migration schema,
  4. downgrades back to the pre-fixture revision on teardown.

RED state: no S3 migration drops inventory_code yet, so ``upgrade head`` is a
no-op for this column and the inventory_code column is still present, failing
the T21 assertion with a clear message.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import text

from app.database import SessionLocal, engine

scenarios("../features/S3-split-drop-old.feature")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = str(PROJECT_ROOT / "alembic.ini")


@pytest.fixture(scope="module")
def _module_session():
    sess = SessionLocal()
    try:
        yield sess
    finally:
        sess.close()


@pytest.fixture(scope="module")
def s3_up_applied(_module_session):
    """Apply the S3 up migration via ``alembic upgrade head``, yield, then revert."""
    from alembic import command
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext

    sess = _module_session

    with engine.connect() as conn:
        pre_rev = MigrationContext.configure(conn).get_current_revision()

    alembic_cfg = Config(ALEMBIC_INI)
    command.upgrade(alembic_cfg, "head")

    sess.expire_all()
    yield sess

    with engine.connect() as conn:
        post_rev = MigrationContext.configure(conn).get_current_revision()
    if post_rev != pre_rev:
        command.downgrade(alembic_cfg, pre_rev or "base")


@given("the S3 up migration has been applied")
def step_s3_up_applied(s3_up_applied) -> None:
    """Pin the fixture so the upgrade runs before the scenario asserts schema."""
    assert s3_up_applied is not None


@then(parsers.parse('the stock table has no "{col}" column'))
def step_column_absent(col: str, s3_up_applied) -> None:
    sess = s3_up_applied
    row = sess.execute(
        text(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'stock' AND column_name = :col"
        ),
        {"col": col},
    ).fetchone()
    assert row is None, (
        f"stock table still has the {col!r} column after the S3 up migration; "
        f"the S3 Alembic revision's upgrade() must DROP COLUMN {col} "
        "(AC1-column-dropped)"
    )


@pytest.fixture
def s3_down_applied(s3_up_applied):
    """Run the S3 ``down()`` migration (downgrade off the current head), yield the
    session so the scenario asserts the restored schema, then re-upgrade to head
    so the module returns to the post-up state for teardown."""
    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    sess = s3_up_applied
    alembic_cfg = Config(ALEMBIC_INI)
    script = ScriptDirectory.from_config(alembic_cfg)
    head = script.get_current_head()
    down_target = script.get_revision(head).down_revision

    command.downgrade(alembic_cfg, down_target or "base")
    sess.expire_all()
    yield sess

    command.upgrade(alembic_cfg, "head")
    sess.expire_all()


@when("the S3 down migration has been run")
def step_s3_down_run(s3_down_applied) -> None:
    """Pin the fixture so the downgrade runs before the scenario asserts schema."""
    assert s3_down_applied is not None


@then(parsers.parse('the stock table has the "{col}" column'))
def step_column_present(col: str, s3_down_applied) -> None:
    sess = s3_down_applied
    row = sess.execute(
        text(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'stock' AND column_name = :col"
        ),
        {"col": col},
    ).fetchone()
    assert row is not None, (
        f"stock table is missing the {col!r} column after the S3 down migration; "
        f"the S3 Alembic revision's downgrade() must re-ADD COLUMN {col} so the "
        "migration is reversible (AC2-column-restored)"
    )


# ---------------------------------------------------------------------------
# T23 -- AC3-all-rows-reconstructed: after down(), every row has a non-NULL
# inventory_code. Seed rows in the post-up state (inventory_code dropped) with
# populated batch_number/serial_number, run down(), then assert reconstruction
# left no NULL inventory_code on any row.
# ---------------------------------------------------------------------------

_S3_SEED_PREFIX = "S3-T23-"


@pytest.fixture(autouse=True, scope="module")
def _cleanup_s3_t23_rows(_module_session):
    """Remove T23 seed rows at module start and teardown so the assertion over
    *every* row is not polluted across runs."""
    sess = _module_session
    _wipe_s3_t23_rows(sess)
    yield
    _wipe_s3_t23_rows(sess)


def _wipe_s3_t23_rows(sess) -> None:
    try:
        sess.execute(
            text("DELETE FROM stock WHERE sku LIKE :p"),
            {"p": f"{_S3_SEED_PREFIX}%"},
        )
        sess.commit()
    except Exception:
        sess.rollback()


@given("the stock table has S3 seeded rows with populated batch_number and serial_number")
def step_seed_s3_rows(s3_up_applied) -> None:
    """Insert three rows in the post-up state (inventory_code column absent),
    each with a batch_number and serial_number for down() to reconstruct."""
    sess = s3_up_applied
    sess.execute(
        text("DELETE FROM stock WHERE sku LIKE :p"),
        {"p": f"{_S3_SEED_PREFIX}%"},
    )
    for i in range(1, 4):
        sess.execute(
            text(
                "INSERT INTO stock"
                " (sku, location, quantity, batch_number, serial_number)"
                " VALUES (:sku, :loc, 1, :bn, :sn)"
                " ON CONFLICT (sku, location) DO UPDATE"
                "   SET batch_number  = EXCLUDED.batch_number,"
                "       serial_number = EXCLUDED.serial_number"
            ),
            {
                "sku": f"{_S3_SEED_PREFIX}{i:03d}",
                "loc": f"LOC-S3-T23-{i:03d}",
                "bn": f"B{i:02d}",
                "sn": f"S{i:03d}",
            },
        )
    sess.commit()


@then("every stock row has a non-NULL inventory_code value")
def step_all_rows_non_null_inventory_code(s3_down_applied) -> None:
    sess = s3_down_applied
    sess.expire_all()
    null_count = sess.execute(
        text("SELECT count(*) FROM stock WHERE inventory_code IS NULL")
    ).scalar_one()
    seeded_count = sess.execute(
        text("SELECT count(*) FROM stock WHERE sku LIKE :p"),
        {"p": f"{_S3_SEED_PREFIX}%"},
    ).scalar_one()

    assert seeded_count == 3, (
        "expected the 3 T23 seed rows to be present after the S3 down migration, "
        f"found {seeded_count}; the migration must not drop rows when reconstructing"
    )
    assert null_count == 0, (
        f"{null_count} stock row(s) have a NULL inventory_code after the S3 down "
        "migration; downgrade() must reconstruct a non-NULL inventory_code for "
        "EVERY row from batch_number/serial_number (AC3-all-rows-reconstructed)"
    )
