"""Architectural fitness tests for F1-stock-visibility / S1-record-stock.

T8  -- boundary (app/routes/) must NOT import the DB session; persistence is
       only reachable via app/repositories/.
T11 -- conftest binds to the real paired-branch DB (DB_NAME=stockflow); no
       mock or in-memory substitute is used (NFR-F1-4).
T10 -- the stock table carries a DB-level UNIQUE constraint on (sku, location)
       so the upsert strategy is enforced at the schema layer (NFR-F1-3).
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
from sqlalchemy import text


# ==================================================================
# T8 -- boundary layer does not import the DB session
# ==================================================================

def test_boundary_does_not_import_db_session_t8() -> None:
    """Routes/boundary module must not import DB session; persistence belongs
    only in the repository layer (architecture.json layering contract)."""

    routes_dir = Path("app/routes")
    assert routes_dir.is_dir(), (
        "app/routes/ directory must exist (boundary layer not yet created); "
        "create it so the layering contract is testable"
    )

    db_import = re.compile(
        r"from\s+app\.database\s+import|import\s+app\.database"
    )
    for py_file in routes_dir.rglob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        assert not db_import.search(source), (
            f"{py_file}: boundary must not import the DB session directly; "
            "the route delegates to the service layer, which delegates to the repository"
        )

    repos_dir = Path("app/repositories")
    assert repos_dir.is_dir(), (
        "app/repositories/ directory must exist; persistence belongs only there "
        "(architecture.json: stock-repository role)"
    )


# ==================================================================
# T11 -- conftest binds to the real paired-branch DB, no mocks
# ==================================================================

def test_conftest_uses_real_branch_db_not_mock_t11() -> None:
    """pytest-bdd conftest must bind to the real DB; no mock or in-memory
    substitute is permitted in integration tests (NFR-F1-4).
    database.py must also not hard-code 'databricks_postgres' as the DB_NAME
    default -- the project DB name is 'stockflow' (NFR-F1-5)."""

    conftest_src = Path("tests/conftest.py").read_text(encoding="utf-8")

    # No mock or in-memory DB anywhere in conftest
    assert "sqlite:///:memory:" not in conftest_src, (
        "tests/conftest.py must not use SQLite in-memory; "
        "integration tests require the real paired-branch DB (NFR-F1-4)"
    )
    assert "MagicMock" not in conftest_src, (
        "tests/conftest.py must not mock the DB session (NFR-F1-4)"
    )
    assert "unittest.mock" not in conftest_src, (
        "tests/conftest.py must not mock the DB session (NFR-F1-4)"
    )

    # database.py must not default to 'databricks_postgres'; project DB = 'stockflow'
    db_src = Path("app/database.py").read_text(encoding="utf-8")
    assert '"databricks_postgres"' not in db_src, (
        "app/database.py must not default DB_NAME to 'databricks_postgres'; "
        "set the default to 'stockflow' per NFR-F1-5 "
        "(DB_NAME / PGDATABASE = stockflow, not databricks_postgres)"
    )

    # DATABASE_URL (if present) must not use SQLite
    database_url = os.environ.get("DATABASE_URL", "")
    if database_url:
        assert "sqlite" not in database_url.lower(), (
            "DATABASE_URL must not point to SQLite; "
            "integration tests require the real Lakebase branch (NFR-F1-4)"
        )


# ==================================================================
# T10 -- stock table has a DB-level UNIQUE constraint on (sku, location)
# ==================================================================

def test_stock_table_unique_constraint_on_sku_location_t10(db_session) -> None:
    """The stock table must carry a database-level UNIQUE constraint on exactly
    the (sku, location) columns so the upsert strategy is enforced at the
    schema layer and survives concurrent writes (NFR-F1-3)."""

    rows = db_session.execute(
        text(
            """
            SELECT tc.constraint_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema    = kcu.table_schema
            WHERE tc.table_name      = 'stock'
              AND tc.constraint_type = 'UNIQUE'
              AND tc.table_schema    = current_schema()
            ORDER BY tc.constraint_name, kcu.column_name
            """
        )
    ).fetchall()

    # Group by constraint name -> frozenset of columns
    constraints: dict[str, set[str]] = {}
    for constraint_name, column_name in rows:
        constraints.setdefault(constraint_name, set()).add(column_name)

    sku_location_constraints = [
        name
        for name, cols in constraints.items()
        if cols == {"sku", "location"}
    ]

    assert sku_location_constraints, (
        "stock table must have a UNIQUE constraint covering exactly (sku, location); "
        "none found -- add a UniqueConstraint or unique index to the migration (NFR-F1-3)"
    )
