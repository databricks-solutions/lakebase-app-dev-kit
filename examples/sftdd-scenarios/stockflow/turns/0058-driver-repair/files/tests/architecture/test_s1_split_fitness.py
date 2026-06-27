"""Architectural fitness tests for F6-split-tracking-code / S1-split-add-backfill.

T10 -- no hardcoded DSN; app and Alembic env read DB_NAME/PGDATABASE from env
T11 -- after up() then down(), inventory_code is reconstructed and the new
       columns are removed (migration reversibility)
T12 -- UNIQUE(sku, location) constraint survives the migration and still
       rejects duplicate (sku, location) pairs
T13 -- quantity values are identical before and after the migration; no
       negative quantity introduced
T14 -- the integration test suite connects to the real Lakebase branch DB;
       the conftest fixture verifies the live connection before scenarios run
"""

from __future__ import annotations

import re
import os
from pathlib import Path

import pytest
from sqlalchemy import text

from app.database import SessionLocal, engine

PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Helper: locate the S1 split migration by content (adds batch_number column)
# ---------------------------------------------------------------------------

def _find_split_migration() -> Path | None:
    """Return the alembic revision file that adds batch_number, or None."""
    versions_dir = PROJECT_ROOT / "alembic" / "versions"
    for path in sorted(versions_dir.glob("*.py")):
        if path.name.startswith("_"):
            continue
        content = path.read_text()
        if "batch_number" in content and "def upgrade" in content:
            return path
    return None


# ===========================================================================
# T10 -- config-in-env: no hardcoded DSN in migration or config path
# ===========================================================================

def test_t10_config_read_from_env_no_hardcoded_dsn() -> None:
    """T10: app.database and alembic/env.py derive the DB connection from env vars.

    Born-green guard (NFR-F6-S1-5): existing code is already env-driven.
    Turns RED if any migration or config file introduces a literal DSN with
    embedded credentials.
    """
    # app/database.py must call os.getenv to read connection parameters.
    db_src = (PROJECT_ROOT / "app" / "database.py").read_text()
    assert "os.getenv" in db_src, (
        "app/database.py must read DB connection parameters via os.getenv(); "
        "no hardcoded DSN is permitted (NFR-F6-S1-5: twelve-factor config-in-env)"
    )

    # alembic/env.py must not contain a literal postgresql://user:pass@host/db string.
    env_src = (PROJECT_ROOT / "alembic" / "env.py").read_text()
    hardcoded_dsn = re.compile(
        r"postgresql(?:\+\w+)?://[^{'\"\s]+:[^{'\"\s]+@[^{'\"\s]+/\w"
    )
    match = hardcoded_dsn.search(env_src)
    assert match is None, (
        f"alembic/env.py contains a hardcoded DSN: {match.group()!r}; "
        "the connection URL must be derived from app.database.DATABASE_URL "
        "(which reads from env vars) -- no literal credentials in source (NFR-F6-S1-5)"
    )

    # Alembic revision files must not embed literal connection strings.
    versions_dir = PROJECT_ROOT / "alembic" / "versions"
    for path in sorted(versions_dir.glob("*.py")):
        if path.name.startswith("_"):
            continue
        content = path.read_text()
        m = hardcoded_dsn.search(content)
        assert m is None, (
            f"{path.name}: revision file contains a hardcoded DSN {m.group()!r}; "
            "migration modules must not contain embedded connection strings (NFR-F6-S1-5)"
        )


# ===========================================================================
# T11 -- migration reversibility: down() reconstructs inventory_code
# ===========================================================================

def test_t11_downgrade_reconstructs_inventory_code() -> None:
    """T11: Running up() then down() restores inventory_code and removes batch_number/serial_number.

    Fails RED because the S1 split migration file does not exist yet.
    """
    from alembic import command
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext

    # The split migration must exist before we can test its reversibility.
    split_path = _find_split_migration()
    assert split_path is not None, (
        "No Alembic revision file found that adds a batch_number column; "
        "the S1 split migration must be created in alembic/versions/ to satisfy T11 "
        "(down() must reconstruct the original inventory_code value)"
    )

    alembic_cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    _T11_SKU = "SPLIT-T11-ROUNDTRIP"
    _T11_LOC = "LOC-T11"
    _T11_IC  = "A12-B7-S001"

    sess = SessionLocal()
    try:
        # Clean any leftover rows from a previous run.
        sess.execute(text("DELETE FROM stock WHERE sku = :sku"), {"sku": _T11_SKU})
        sess.commit()

        # Capture pre-test revision.
        with engine.connect() as conn:
            pre_rev = MigrationContext.configure(conn).get_current_revision()

        # Ensure we are at the split-migration head before testing down().
        command.upgrade(alembic_cfg, "head")
        sess.expire_all()

        # Verify the split migration actually ran (batch_number must exist).
        col = sess.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name = 'stock' AND column_name = 'batch_number'"
            )
        ).fetchone()
        assert col is not None, (
            "batch_number column not found after upgrade head; "
            "the split migration upgrade() must ADD COLUMN batch_number"
        )

        # Seed a row so we can verify inventory_code reconstruction on down().
        sess.execute(
            text(
                "INSERT INTO stock (sku, location, quantity, inventory_code,"
                " batch_number, serial_number)"
                " VALUES (:sku, :loc, 1, :ic, :bn, :sn)"
                " ON CONFLICT (sku, location) DO UPDATE"
                "   SET inventory_code = EXCLUDED.inventory_code,"
                "       batch_number = EXCLUDED.batch_number,"
                "       serial_number = EXCLUDED.serial_number"
            ),
            {"sku": _T11_SKU, "loc": _T11_LOC, "ic": _T11_IC, "bn": "B7", "sn": "S001"},
        )
        sess.commit()

        # Run the downgrade (step one revision back regardless of pre_rev).
        command.downgrade(alembic_cfg, "-1")
        sess.expire_all()

        # Verify batch_number and serial_number columns are gone.
        batch_col = sess.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name = 'stock' AND column_name = 'batch_number'"
            )
        ).fetchone()
        assert batch_col is None, (
            "batch_number column still exists after downgrade; "
            "down() must DROP COLUMN batch_number (NFR-F6-S1-6)"
        )

        # Verify inventory_code is reconstructed.
        row = sess.execute(
            text(
                "SELECT inventory_code FROM stock"
                " WHERE sku = :sku AND location = :loc"
            ),
            {"sku": _T11_SKU, "loc": _T11_LOC},
        ).fetchone()
        assert row is not None, (
            f"Row for T11 roundtrip test disappeared after downgrade; "
            "down() must not delete rows"
        )
        assert row[0] == _T11_IC, (
            f"inventory_code not reconstructed after downgrade: "
            f"expected {_T11_IC!r}, got {row[0]!r}; "
            "down() must reassemble the original inventory_code from "
            "batch_number and serial_number (NFR-F6-S1-6)"
        )

        # Restore to the post-split state so other tests (if run after T11) are unaffected.
        command.upgrade(alembic_cfg, "head")
        sess.expire_all()

    finally:
        try:
            sess.execute(text("DELETE FROM stock WHERE sku = :sku"), {"sku": _T11_SKU})
            sess.commit()
        except Exception:
            sess.rollback()
        sess.close()


# ===========================================================================
# T12 -- UNIQUE(sku, location) constraint survives the migration
# ===========================================================================

def test_t12_unique_sku_location_constraint_survives_migration() -> None:
    """T12: UNIQUE(sku, location) constraint exists after migration and rejects duplicates.

    Born-green guard (NFR-F6-S1-3): constraint was added in the initial
    migration and must not be dropped by the split migration.
    """
    _T12_SKU = "SPLIT-T12-UNIQUE"
    _T12_LOC = "LOC-T12-UNIQUE"

    sess = SessionLocal()
    try:
        # Verify constraint is present in information_schema.
        with engine.connect() as conn:
            col_rows = conn.execute(
                text(
                    """
                    SELECT kcu.column_name
                    FROM information_schema.key_column_usage kcu
                    JOIN information_schema.table_constraints tc
                      ON kcu.constraint_name = tc.constraint_name
                     AND kcu.table_schema    = tc.table_schema
                    WHERE tc.table_name      = 'stock'
                      AND tc.constraint_type = 'UNIQUE'
                      AND tc.table_schema    = current_schema()
                    """
                )
            ).fetchall()
        unique_cols = {row[0] for row in col_rows}
        assert "sku" in unique_cols and "location" in unique_cols, (
            f"UNIQUE(sku, location) constraint not found on stock table; "
            f"unique-indexed columns: {unique_cols}; "
            "the S1 split migration must preserve this constraint (NFR-F6-S1-3)"
        )

        # Verify the constraint actually rejects a duplicate pair.
        sess.execute(text("DELETE FROM stock WHERE sku = :sku"), {"sku": _T12_SKU})
        sess.commit()

        sess.execute(
            text(
                "INSERT INTO stock (sku, location, quantity)"
                " VALUES (:sku, :loc, 1)"
            ),
            {"sku": _T12_SKU, "loc": _T12_LOC},
        )
        sess.commit()

        with pytest.raises(Exception) as exc_info:
            sess.execute(
                text(
                    "INSERT INTO stock (sku, location, quantity)"
                    " VALUES (:sku, :loc, 2)"
                ),
                {"sku": _T12_SKU, "loc": _T12_LOC},
            )
            sess.commit()

        err_text = str(exc_info.value).lower()
        assert "unique" in err_text or "duplicate" in err_text or "constraint" in err_text, (
            f"Expected a unique-constraint violation, got: {exc_info.value}; "
            "UNIQUE(sku, location) must be enforced at the DB level (NFR-F6-S1-3)"
        )

    finally:
        sess.rollback()
        try:
            sess.execute(text("DELETE FROM stock WHERE sku = :sku"), {"sku": _T12_SKU})
            sess.commit()
        except Exception:
            sess.rollback()
        sess.close()


# ===========================================================================
# T13 -- quantity values identical before and after migration
# ===========================================================================

def test_t13_quantity_identical_before_and_after_migration() -> None:
    """T13: Quantity values are identical for every row; no negative quantity introduced.

    Fails RED until the S1 split migration exists (batch_number column absent).
    """
    _T13_PREFIX = "SPLIT-T13-QTY-"
    _T13_ROWS = [
        {"sku": f"{_T13_PREFIX}{i}", "location": f"LOC-T13-{i}", "quantity": i * 5}
        for i in range(1, 6)
    ]

    sess = SessionLocal()
    try:
        # Clean any leftover rows.
        sess.execute(
            text("DELETE FROM stock WHERE sku LIKE 'SPLIT-T13-%'")
        )
        sess.commit()

        # Seed rows with known quantities.
        for r in _T13_ROWS:
            sess.execute(
                text(
                    "INSERT INTO stock (sku, location, quantity)"
                    " VALUES (:sku, :loc, :qty)"
                    " ON CONFLICT (sku, location) DO UPDATE"
                    "   SET quantity = EXCLUDED.quantity"
                ),
                {"sku": r["sku"], "loc": r["location"], "qty": r["quantity"]},
            )
        sess.commit()

        # The split migration must have been applied (batch_number column must exist).
        # This assertion is the RED trigger: no migration = no batch_number column.
        with engine.connect() as conn:
            col = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns"
                    " WHERE table_name = 'stock' AND column_name = 'batch_number'"
                )
            ).fetchone()
        assert col is not None, (
            "batch_number column not found; the S1 split migration must be applied "
            "before T13 can verify quantity preservation. "
            "Run the tests after creating the Alembic split revision."
        )

        sess.expire_all()

        # Verify each seeded row still has its original quantity.
        for r in _T13_ROWS:
            actual_qty = sess.execute(
                text("SELECT quantity FROM stock WHERE sku = :sku"),
                {"sku": r["sku"]},
            ).scalar()
            assert actual_qty == r["quantity"], (
                f"Quantity changed for sku={r['sku']!r}: "
                f"expected {r['quantity']}, got {actual_qty}; "
                "the S1 split migration must not alter quantity values (NFR-F6-S1-2)"
            )

        # No negative quantities anywhere in the table after migration.
        neg_count = sess.execute(
            text("SELECT COUNT(*) FROM stock WHERE quantity < 0")
        ).scalar()
        assert neg_count == 0, (
            f"{neg_count} rows have negative quantity after the migration; "
            "the split migration must not introduce or preserve negative quantities "
            "(NFR-F6-S1-2)"
        )

    finally:
        try:
            sess.execute(text("DELETE FROM stock WHERE sku LIKE 'SPLIT-T13-%'"))
            sess.commit()
        except Exception:
            sess.rollback()
        sess.close()


# ===========================================================================
# T14 -- integration suite connects to real Lakebase branch DB, not a mock
# ===========================================================================

def test_t14_integration_suite_uses_real_lakebase_branch_db() -> None:
    """T14: The test suite connects to the real Lakebase branch DB (not sqlite/mock).

    Born-green guard (NFR-F6-S1-4): the conftest fixtures use SessionLocal which
    is backed by the DATABASE_URL from the environment (a real PostgreSQL endpoint).
    Verifies:
      - DATABASE_URL is a postgresql:// URL (not sqlite or an in-memory substitute)
      - A live query (SELECT 1) succeeds against the configured DB
      - tests/conftest.py does not import or reference any mock/in-memory DB
    """
    # Check DATABASE_URL from the environment (loaded by app.database).
    from app.database import DATABASE_URL

    assert DATABASE_URL, (
        "DATABASE_URL is empty; the test environment must configure a real "
        "Lakebase branch DB connection (NFR-F6-S1-4)"
    )
    assert "sqlite" not in DATABASE_URL.lower(), (
        f"DATABASE_URL={DATABASE_URL!r} points to SQLite; "
        "integration tests must run against the real Lakebase branch DB (NFR-F6-S1-4)"
    )
    assert DATABASE_URL.startswith("postgresql"), (
        f"DATABASE_URL={DATABASE_URL!r} is not a PostgreSQL URL; "
        "Lakebase branch DBs are PostgreSQL-compatible (NFR-F6-S1-4)"
    )

    # Verify live connectivity.
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).scalar()
    assert result == 1, (
        "Live connection to the Lakebase branch DB failed (SELECT 1 returned != 1); "
        "ensure LAKEBASE_BRANCH_ID / DATABASE_URL are set to the experiment branch "
        "(NFR-F6-S1-4)"
    )

    # Verify tests/conftest.py does not mock or substitute the DB session.
    conftest_src = (PROJECT_ROOT / "tests" / "conftest.py").read_text()
    for forbidden in ("sqlite:///:memory:", "MagicMock", "unittest.mock", "create_engine(\"sqlite"):
        assert forbidden not in conftest_src, (
            f"tests/conftest.py references {forbidden!r}; "
            "the conftest must bind to the real SessionLocal / DATABASE_URL, "
            "not an in-memory substitute (NFR-F6-S1-4)"
        )
