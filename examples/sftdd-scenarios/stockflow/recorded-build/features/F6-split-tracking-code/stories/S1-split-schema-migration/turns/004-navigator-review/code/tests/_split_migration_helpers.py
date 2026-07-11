"""Shared real-branch helpers for S1-split-schema-migration tests.

Schema-state probing (has the split migration run yet?) plus safe
pre-split seeding via a targeted single-step downgrade. NEVER `downgrade
base`: only ever a relative `-1` off of whatever head currently holds.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

REPO_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = str(REPO_ROOT / "alembic.ini")


def alembic_config() -> Config:
    return Config(ALEMBIC_INI)


def has_column(db_session, column: str, table: str = "stock_records") -> bool:
    row = db_session.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    ).first()
    # Close out the read transaction immediately: a subsequent alembic
    # upgrade/downgrade runs DDL on a SEPARATE connection, and a lingering
    # open read here would block that DDL (or, left open long enough, hit
    # the branch's idle-in-transaction timeout).
    db_session.rollback()
    return row is not None


def ensure_pre_split_schema(db_session) -> None:
    """Guarantee stock_records still carries inventory_code (the pre-split
    shape), downgrading a single step if a prior test already migrated to
    the split head. Never `downgrade base`."""
    db_session.rollback()
    if not has_column(db_session, "inventory_code"):
        command.downgrade(alembic_config(), "-1")
        db_session.rollback()


def upgrade_to_head(db_session) -> None:
    db_session.rollback()
    command.upgrade(alembic_config(), "head")
    db_session.rollback()
