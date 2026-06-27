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


# ==================================================================
# T9 -- DB name read from env; no hardcoded DSN in app/ source
# ==================================================================

# ==================================================================
# T18 -- home route read path goes through the repository (layering)
# ==================================================================

def test_home_route_read_path_uses_repository_t18() -> None:
    """The home/boundary module must not import the DB session directly;
    the listing read path must be owned by the repository (architecture.json
    layering contract, stock-boundary -> stock-service -> stock-repository).

    Fails RED until StockRepository exposes a listing method."""

    routes_dir = Path("app/routes")
    assert routes_dir.is_dir(), (
        "app/routes/ must exist (boundary layer for T18 layering check)"
    )

    # Boundary must not hold a direct DB session reference
    session_pattern = re.compile(
        r"from\s+app\.database\s+import"
        r"|import\s+app\.database"
        r"|from\s+sqlalchemy\.orm\s+import\s+Session"
        r"|\bSessionLocal\b"
    )
    for py_file in routes_dir.rglob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        assert not session_pattern.search(source), (
            f"{py_file}: boundary must not import the DB session or SessionLocal; "
            "the home read path delegates to service -> repository (T18 layering contract)"
        )

    # Repository must expose a listing method for the home read path
    repo_file = Path("app/repositories/stock_repository.py")
    assert repo_file.exists(), (
        "app/repositories/stock_repository.py must exist (T18 layering contract)"
    )
    repo_src = repo_file.read_text(encoding="utf-8")
    list_method = re.compile(
        r"def\s+(list_all|list|get_all|find_all|list_ordered|list_by_location)\s*\("
    )
    assert list_method.search(repo_src), (
        "app/repositories/stock_repository.py must expose a listing method "
        "(e.g. list_all, get_all) for the home route read path; "
        "currently only upsert exists -- the Driver must add the method (T18)"
    )


# ==================================================================
# T19 -- ordering by location/SKU lives in the repository, not
#        in the boundary or template
# ==================================================================

def test_ordering_lives_in_repository_not_boundary_t19() -> None:
    """The repository (or service) must supply rows ordered by location then
    SKU; no sort/group logic may appear in the boundary or templates
    (architecture.json: stock-boundary role = boundary only, ordering is a
    repository/service responsibility).

    Fails RED until the repository listing method includes ORDER BY location, sku."""

    # Repository must contain ORDER BY (location, sku) logic
    repo_file = Path("app/repositories/stock_repository.py")
    assert repo_file.exists(), (
        "app/repositories/stock_repository.py must exist (T19 ordering contract)"
    )
    repo_src = repo_file.read_text(encoding="utf-8")
    order_pattern = re.compile(
        r"order_by\s*\(.*location|ORDER\s+BY\s+.*location",
        re.IGNORECASE | re.DOTALL,
    )
    assert order_pattern.search(repo_src), (
        "app/repositories/stock_repository.py must ORDER BY location (then sku) "
        "in its listing query; no such ORDER BY found -- "
        "the Driver must add it to the repository list method (T19)"
    )

    # Templates must not contain Jinja2 sort filters or SQL ORDER BY
    templates_dir = Path("templates")
    template_sort = re.compile(r"\|\s*sort\b|ORDER\s+BY", re.IGNORECASE)
    if templates_dir.is_dir():
        for tmpl in templates_dir.rglob("*.html"):
            source = tmpl.read_text(encoding="utf-8")
            assert not template_sort.search(source), (
                f"{tmpl}: sorting must not appear in templates; "
                "the repository supplies already-ordered rows (T19)"
            )

    # Routes module must not call sorted() or .sort() for stock listing
    routes_dir = Path("app/routes")
    route_sort = re.compile(r"\bsorted\s*\(|\blist\.sort\s*\(")
    if routes_dir.is_dir():
        for py_file in routes_dir.rglob("*.py"):
            source = py_file.read_text(encoding="utf-8")
            assert not route_sort.search(source), (
                f"{py_file}: sorted()/list.sort() must not appear in the boundary; "
                "ordering belongs in the repository (T19)"
            )


# ==================================================================
# T9 -- DB name read from env; no hardcoded DSN in app/ source
# ==================================================================

# ==================================================================
# T23 -- SKU detail read path does not bypass the layering contract
# ==================================================================

def test_sku_detail_route_does_not_import_db_session_t23() -> None:
    """The SKU detail route module must NOT import the DB session or SessionLocal;
    the read path must flow boundary -> service -> repository with no ORM access
    outside the repository (architecture.json layering contract, NFR-F1-7).

    Also asserts the repository exposes a by-SKU read method so the detail
    route can delegate through service -> repository (fails RED until the
    Driver adds the method)."""

    routes_dir = Path("app/routes")
    assert routes_dir.is_dir(), (
        "app/routes/ directory must exist (boundary layer for T23 layering check)"
    )

    session_pattern = re.compile(
        r"from\s+app\.database\s+import"
        r"|import\s+app\.database"
        r"|from\s+sqlalchemy\.orm\s+import\s+Session"
        r"|\bSessionLocal\b"
        r"|\bdb\.add\b|\bdb\.commit\b|\bdb\.query\b|\bsession\.execute\b"
    )
    for py_file in routes_dir.rglob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        assert not session_pattern.search(source), (
            f"{py_file}: boundary must not import the DB session or call ORM methods "
            "directly; the SKU detail read path must delegate to service -> repository "
            "(T23 layering contract, NFR-F1-7)"
        )

    repo_file = Path("app/repositories/stock_repository.py")
    assert repo_file.exists(), (
        "app/repositories/stock_repository.py must exist (T23 layering contract)"
    )
    repo_src = repo_file.read_text(encoding="utf-8")

    by_sku_method = re.compile(
        r"def\s+(?:get_by_sku|list_by_sku|find_by_sku|get_stock_for_sku|list_for_sku)\s*\("
    )
    assert by_sku_method.search(repo_src), (
        "app/repositories/stock_repository.py must expose a by-SKU read method "
        "(e.g. list_by_sku, get_by_sku) for the SKU detail route read path; "
        "the Driver must add this method so the boundary -> service -> repository "
        "chain holds without any ORM access outside the repository (T23, NFR-F1-7)"
    )


# ==================================================================
# T24 -- detail view read completeness: N seeded rows -> exactly N rows returned
# ==================================================================

def test_sku_detail_read_completeness_t24(db_session) -> None:
    """Seeding N stock records for a SKU at distinct locations and requesting the
    detail view must return exactly N rows, each matching the seeded location,
    quantity, and tracking code, with no records omitted (NFR-F1-7).

    Fails RED because /sku/<sku> does not exist yet (404 response)."""

    from fastapi.testclient import TestClient
    from sqlalchemy import text as sa_text

    from app.main import app

    _T24_SKU = "T24-S3-ARCH-SKU"
    _T24_ENTRIES = [
        ("LOC-T24-ARCH-A", 11, "TC-T24-A"),
        ("LOC-T24-ARCH-B", 22, "TC-T24-B"),
        ("LOC-T24-ARCH-C", 33, "TC-T24-C"),
    ]

    # Seed
    try:
        for loc, qty, tc in _T24_ENTRIES:
            db_session.execute(
                sa_text(
                    "INSERT INTO stock (sku, location, quantity, tracking_code, created_at)"
                    " VALUES (:sku, :location, :quantity, :tc, NOW())"
                    " ON CONFLICT (sku, location) DO UPDATE SET"
                    "  quantity = EXCLUDED.quantity, tracking_code = EXCLUDED.tracking_code"
                ),
                {"sku": _T24_SKU, "location": loc, "quantity": qty, "tc": tc},
            )
        db_session.commit()

        client = TestClient(app, raise_server_exceptions=False)
        response = client.get(f"/sku/{_T24_SKU}", follow_redirects=True)

        assert response.status_code == 200, (
            f"GET /sku/{_T24_SKU} returned HTTP {response.status_code}; "
            "expected 200 -- the SKU detail route does not exist yet (T24 RED)"
        )

        html = response.text
        row_count = html.count('data-testid="sku-detail-row"')
        assert row_count == len(_T24_ENTRIES), (
            f"Detail view for {_T24_SKU!r} returned {row_count} rows; "
            f"expected exactly {len(_T24_ENTRIES)} (one per seeded location). "
            "No records may be omitted (read completeness, NFR-F1-7)"
        )

        for loc, qty, tc in _T24_ENTRIES:
            assert loc in html, (
                f"Location {loc!r} not found in detail view response; "
                "the read path must include all committed records (NFR-F1-7)"
            )
            assert str(qty) in html, (
                f"Quantity {qty} for location {loc!r} not found in response (NFR-F1-7)"
            )
            assert tc in html, (
                f"Tracking code {tc!r} for location {loc!r} not found in response (NFR-F1-7)"
            )
    finally:
        try:
            db_session.execute(
                sa_text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": _T24_SKU},
            )
            db_session.commit()
        except Exception:
            db_session.rollback()


# ==================================================================
# T9 (F6-S1) -- Alembic revision modules must not import app/routes
#               or app/services (migration layering contract)
# ==================================================================

def test_t9_f6_migration_modules_do_not_import_routes_or_services() -> None:
    """T9 (F6/S1): No Alembic revision file imports app.routes or app.services.

    The migration layer is a persistence concern and must only depend on
    alembic ops, sqlalchemy primitives, and (optionally) app.models/app.database.
    Importing routes or services would couple the schema change to the
    application boundary, violating the architecture.json layering contract.

    Born-green guard: existing migrations are already clean.  Turns RED if a
    future migration (including the S1 split migration) adds such an import.
    """
    versions_dir = Path("alembic/versions")
    assert versions_dir.is_dir(), (
        "alembic/versions/ directory must exist; "
        "at least the initial create_stock_table migration must be present"
    )

    violations: list[str] = []
    for path in sorted(versions_dir.glob("*.py")):
        if path.name.startswith("_"):
            continue
        content = path.read_text()
        if "app.routes" in content or "from app.routes" in content:
            violations.append(f"{path.name}: imports app.routes")
        if "app.services" in content or "from app.services" in content:
            violations.append(f"{path.name}: imports app.services")

    assert not violations, (
        "Alembic revision files must not import app.routes or app.services; "
        "migrations are persistence-layer artifacts "
        "(architecture.json: stock-repository / migration layer).\n"
        "Violations:\n  " + "\n  ".join(violations)
    )


def test_db_name_from_env_no_hardcoded_dsn_t9() -> None:
    """app/database.py must read the database name from DB_NAME or PGDATABASE
    env vars, and no file under app/ may contain a hardcoded DSN string with
    embedded credentials (config-in-env, NFR-F1-5)."""

    app_dir = Path("app")
    assert app_dir.is_dir(), "app/ directory must exist"

    db_src = Path("app/database.py").read_text(encoding="utf-8")

    # Must read DB_NAME or PGDATABASE from env (twelve-factor config-in-env)
    reads_db_name = (
        'os.getenv("DB_NAME"' in db_src or "os.getenv('DB_NAME'" in db_src
    )
    reads_pgdatabase = (
        'os.getenv("PGDATABASE"' in db_src or "os.getenv('PGDATABASE'" in db_src
    )
    assert reads_db_name or reads_pgdatabase, (
        "app/database.py must read the DB name from DB_NAME or PGDATABASE env vars "
        "(NFR-F1-5); found neither os.getenv call -- "
        "twelve-factor config: connection params come from the environment, not the source"
    )

    # No hardcoded DSN: a literal string matching postgresql(+driver)://user:pass@host/db
    # is detected by the absence of f-string placeholders ({}) in the credential segment.
    # Dynamic f-strings (credentials from env vars) are NOT flagged.
    hardcoded_dsn = re.compile(
        r'["\']postgresql(?:\+\w+)?://(?:[^{"\'@\s]+:[^{"\'@\s]*@)[^{"\'@\s]+/\w[^"\']*["\']'
    )
    for py_file in app_dir.rglob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        match = hardcoded_dsn.search(source)
        assert match is None, (
            f"{py_file}: contains a hardcoded DSN string {match.group()!r}; "
            "the DB connection must be assembled from env vars at runtime only (NFR-F1-5)"
        )
