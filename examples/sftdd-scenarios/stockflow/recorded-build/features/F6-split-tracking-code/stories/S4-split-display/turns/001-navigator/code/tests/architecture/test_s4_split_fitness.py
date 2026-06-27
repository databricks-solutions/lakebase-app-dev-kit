"""Architectural fitness tests for F6-split-tracking-code / S4-split-display.

T37 -- the stock-list route (app/routes/) does not import app/repositories or
       the DB session; batch_number and serial_number reach the boundary already
       projected (boundary -> service -> repository), with no column computation
       (no re-parsing of the dropped inventory_code / tracking_code) inside the
       component (the Jinja2 templates that render the split fields).

T38 -- the S4 E2E test suite binds to the real Lakebase branch DB
       (DB_NAME=stockflow); no mock or in-memory substitute is used and the S4
       e2e module verifies the live connection (engine.connect) before any S4
       scenario runs.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ROUTES_DIR = PROJECT_ROOT / "app" / "routes"
TEMPLATES_DIR = PROJECT_ROOT / "templates"
S4_E2E = PROJECT_ROOT / "tests" / "e2e" / "test_s4_split_display.py"


# ===========================================================================
# T37 -- stock-list route layering + no column computation in the component
# ===========================================================================

def test_t37_stock_list_route_layering_and_no_column_computation() -> None:
    """The boundary must not import app.repositories or the DB session, and the
    split fields must not be computed (re-parsed) inside the templates.

    batch_number / serial_number are first-class model fields after the F6 split;
    the boundary delegates to the service (which delegates to the repository),
    and the template renders the already-projected values directly -- it must not
    derive batch/serial by splitting inventory_code or tracking_code (that would
    re-introduce the parsing logic the split removed)."""

    assert ROUTES_DIR.is_dir(), "app/routes/ must exist (S4 boundary layering check)"

    forbidden_imports = re.compile(
        r"from\s+app\.repositories"
        r"|import\s+app\.repositories"
        r"|from\s+app\.database\s+import"
        r"|import\s+app\.database"
        r"|from\s+sqlalchemy\.orm\s+import\s+Session"
        r"|\bSessionLocal\b"
        r"|\bdb\.add\b|\bdb\.commit\b|\bdb\.query\b|\bsession\.execute\b"
    )
    for py_file in ROUTES_DIR.rglob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        match = forbidden_imports.search(source)
        assert match is None, (
            f"{py_file}: the stock-list route must not import app.repositories or the "
            f"DB session (found {match.group()!r}); the boundary delegates to the "
            "service layer, which owns the repository (T37 layering contract)"
        )

    # The template (component) must not compute the split columns by re-parsing
    # the dropped inventory_code or the tracking_code into batch/serial segments.
    assert TEMPLATES_DIR.is_dir(), "templates/ must exist (S4 component check)"
    split_in_template = re.compile(
        r"(?:inventory_code|tracking_code)[^\n]*\.split\s*\(",
    )
    for tmpl in TEMPLATES_DIR.rglob("*.html"):
        source = tmpl.read_text(encoding="utf-8")
        assert "inventory_code" not in source, (
            f"{tmpl}: references the dropped inventory_code; batch_number / "
            "serial_number are model fields and must be rendered directly (T37)"
        )
        assert not split_in_template.search(source), (
            f"{tmpl}: computes the split columns by re-parsing a tracking code; "
            "batch_number / serial_number must be projected at the boundary and "
            "rendered directly -- no column computation inside the component (T37)"
        )


# ===========================================================================
# T38 -- S4 E2E suite uses the real Lakebase branch DB, no mock
# ===========================================================================

def test_t38_s4_suite_uses_real_lakebase_branch_db() -> None:
    """The S4 E2E module binds to the real branch DB (DB_NAME=stockflow), not a
    mock, and verifies the live connection before any S4 scenario runs."""

    from app.database import DATABASE_URL, engine

    # --- Part 1: DATABASE_URL points at a real PostgreSQL instance ---
    assert DATABASE_URL, (
        "DATABASE_URL is empty; the S4 test environment must configure a real "
        "Lakebase branch DB connection (DB_NAME=stockflow) (T38)"
    )
    assert "sqlite" not in DATABASE_URL.lower(), (
        f"DATABASE_URL={DATABASE_URL!r} points to SQLite; the S4 E2E suite must "
        "run against the real branch DB (T38)"
    )
    assert DATABASE_URL.startswith("postgresql"), (
        f"DATABASE_URL={DATABASE_URL!r} is not a PostgreSQL URL; Lakebase branch "
        "DBs are PostgreSQL-compatible (T38)"
    )

    # --- Part 2: live connection works ---
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).scalar()
    assert result == 1, (
        "Live SELECT 1 against the branch DB returned an unexpected value; ensure "
        "LAKEBASE_BRANCH_ID / DATABASE_URL point to the S4 experiment branch "
        "(DB_NAME=stockflow) (T38)"
    )

    # --- Part 3: S4 e2e module exists and uses the real session, no mocks ---
    assert S4_E2E.exists(), (
        f"{S4_E2E.relative_to(PROJECT_ROOT)} does not exist; the S4 E2E module "
        "must be created (T38)"
    )
    src = S4_E2E.read_text(encoding="utf-8")
    for forbidden in (
        "sqlite:///:memory:",
        "MagicMock",
        "unittest.mock",
        'create_engine("sqlite',
        "create_engine('sqlite",
    ):
        assert forbidden not in src, (
            f"tests/e2e/test_s4_split_display.py references {forbidden!r}; the S4 "
            "suite must use the real SessionLocal / DATABASE_URL, not an in-memory "
            "or mock substitute (T38)"
        )

    # --- Part 4: the S4 module verifies the live connection before scenarios ---
    assert "engine.connect" in src, (
        "tests/e2e/test_s4_split_display.py does not call engine.connect(); a "
        "fixture must verify the live DB connection before any S4 scenario runs "
        "(T38: live-connection verification)"
    )
