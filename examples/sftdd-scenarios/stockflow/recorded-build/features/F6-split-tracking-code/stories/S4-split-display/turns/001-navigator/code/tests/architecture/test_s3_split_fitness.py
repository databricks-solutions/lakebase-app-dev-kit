"""Architectural fitness tests for F6-split-tracking-code / S3-split-drop-old.

T29 -- the S3 Alembic revision module (drop inventory_code) does not import
       app/routes or app/services; the migration stays in the
       repository/migration layer and never crosses the layering contract.

T30 -- the S3 integration test suite binds to the real Lakebase branch DB
       (DB_NAME=stockflow); no mock or in-memory substitute is used and the
       step_defs Background step verifies the live connection before any S3
       scenario runs.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parents[2]
VERSIONS_DIR = PROJECT_ROOT / "alembic" / "versions"
S3_STEP_DEFS = PROJECT_ROOT / "tests" / "step_defs" / "test_s3_split_drop_old.py"


def _find_s3_drop_migration() -> Path | None:
    """Return the alembic revision that drops inventory_code, or None."""
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        if path.name.startswith("_"):
            continue
        content = path.read_text()
        if "def upgrade" in content and 'drop_column("stock", "inventory_code"' in content:
            return path
        if "def upgrade" in content and "drop_column('stock', 'inventory_code'" in content:
            return path
    return None


# ===========================================================================
# T29 -- S3 migration layering: the drop revision does not import routes/services
# ===========================================================================

def test_t29_s3_drop_migration_does_not_import_routes_or_services() -> None:
    """T29: the S3 drop-inventory_code Alembic revision must not import from
    app.routes or app.services.

    Born-green regression guard: the migration is part of the
    repository/migration layer and must depend only inward (alembic op + sqlalchemy,
    never the boundary or domain layers). The dependency arrow must never point
    from a migration up into app.routes or app.services.
    """
    migration = _find_s3_drop_migration()
    assert migration is not None, (
        "No Alembic revision found whose upgrade() drops the inventory_code column; "
        "the S3 drop migration must exist in alembic/versions/ (T29 / AC1-column-dropped)"
    )

    src = migration.read_text()
    for forbidden in (
        "app.routes",
        "from app.routes",
        "import app.routes",
        "app.services",
        "from app.services",
        "import app.services",
    ):
        assert forbidden not in src, (
            f"{migration.relative_to(PROJECT_ROOT)}: "
            f"the S3 drop migration imports {forbidden!r}; "
            "an Alembic revision belongs to the repository/migration layer and must "
            "depend only on alembic.op + sqlalchemy -- it must never import the boundary "
            "(app.routes) or domain (app.services) layers (T29: layering contract)"
        )


# ===========================================================================
# T30 -- S3 test suite uses real Lakebase branch DB, no mock
# ===========================================================================

def test_t30_s3_suite_uses_real_lakebase_branch_db() -> None:
    """T30: The S3 step_defs file binds to the real branch DB, not a mock.

    Born-green regression guard (test-strategy / R3 schema evolution): verifies
    the S3 step_defs module exists, uses app.database (the real
    SessionLocal/engine bound to DB_NAME=stockflow), introduces no in-memory or
    mock substitute, and that its Background step performs a live connection
    check via engine.connect() before any S3 drop/restore scenario runs. Also
    asserts the configured DATABASE_URL is a real PostgreSQL endpoint and that a
    live SELECT 1 succeeds.
    """
    from app.database import DATABASE_URL, engine

    # --- Part 1: DATABASE_URL points at a real PostgreSQL instance ---
    assert DATABASE_URL, (
        "DATABASE_URL is empty; the S3 test environment must configure "
        "a real Lakebase branch DB connection (DB_NAME=stockflow) (T30)"
    )
    assert "sqlite" not in DATABASE_URL.lower(), (
        f"DATABASE_URL={DATABASE_URL!r} points to SQLite; "
        "S3 drop/restore migration tests must run against the real branch DB (T30)"
    )
    assert DATABASE_URL.startswith("postgresql"), (
        f"DATABASE_URL={DATABASE_URL!r} is not a PostgreSQL URL; "
        "Lakebase branch DBs are PostgreSQL-compatible (T30)"
    )

    # --- Part 2: live connection works ---
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).scalar()
    assert result == 1, (
        "Live SELECT 1 against the branch DB returned an unexpected value; "
        "ensure LAKEBASE_BRANCH_ID / DATABASE_URL point to the S3 experiment branch "
        "(DB_NAME=stockflow) (T30)"
    )

    # --- Part 3: S3 step_defs file exists and uses the real session ---
    assert S3_STEP_DEFS.exists(), (
        f"{S3_STEP_DEFS.relative_to(PROJECT_ROOT)} does not exist; "
        "the S3 step_defs module must be created (T30)"
    )

    step_src = S3_STEP_DEFS.read_text()
    for forbidden in (
        "sqlite:///:memory:",
        "MagicMock",
        "unittest.mock",
        'create_engine("sqlite',
        "create_engine('sqlite",
    ):
        assert forbidden not in step_src, (
            f"tests/step_defs/test_s3_split_drop_old.py references {forbidden!r}; "
            "the S3 step_defs must use the real SessionLocal / DATABASE_URL, "
            "not an in-memory or mock substitute (T30)"
        )

    # --- Part 4: Background step performs a live connection check ---
    assert "engine.connect" in step_src, (
        "tests/step_defs/test_s3_split_drop_old.py does not call engine.connect(); "
        "the Background step must verify the live DB connection before any S3 "
        "scenario runs -- add engine.connect() to the Background step definition "
        "(T30: Background fixture verifies live connection)"
    )
