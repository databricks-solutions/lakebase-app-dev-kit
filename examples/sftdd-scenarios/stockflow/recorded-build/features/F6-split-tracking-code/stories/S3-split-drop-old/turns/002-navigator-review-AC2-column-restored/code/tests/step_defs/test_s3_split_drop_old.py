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
