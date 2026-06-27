"""Architectural fitness tests for F6-split-tracking-code / S2-split-validate.

T19 -- the validation probe module (app/repositories) does not import
       app/routes or app/services; count_unparseable_codes is never
       re-implemented outside the repository layer.

T20 -- the S2 validation test suite binds to the real Lakebase branch DB
       (DB_NAME=stockflow); no mock or in-memory substitute is used and the
       step_defs Background step verifies the live connection before any
       probe scenario runs.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPOSITORIES_DIR = PROJECT_ROOT / "app" / "repositories"
ROUTES_DIR = PROJECT_ROOT / "app" / "routes"
SERVICES_DIR = PROJECT_ROOT / "app" / "services"
S2_STEP_DEFS = PROJECT_ROOT / "tests" / "step_defs" / "test_s2_split_validate.py"


# ===========================================================================
# T19 -- probe layering: repositories do not import routes or services;
#        count_unparseable_codes is not defined outside the repository layer
# ===========================================================================

def test_t19_repository_does_not_import_routes_or_services() -> None:
    """T19: app/repositories/ must not import from app.routes or app.services.

    Born-green regression guard (NFR-F6-S2-1): the probe must live in the
    repository layer and must never pull in the boundary or domain layers.
    Also verifies the probe function is not duplicated in routes/services.
    """
    # --- Part 1: repositories must not import routes or services ---
    for repo_file in REPOSITORIES_DIR.glob("*.py"):
        src = repo_file.read_text()
        for forbidden in ("app.routes", "from app.routes", "app.services", "from app.services"):
            assert forbidden not in src, (
                f"{repo_file.relative_to(PROJECT_ROOT)}: "
                f"repository module imports {forbidden!r}; "
                "the dependency arrow must point inward only "
                "(app/repositories -> app/models, never -> app/routes or app/services). "
                "Move any cross-layer logic to the service layer (T19)"
            )

    # --- Part 2: probe not reimplemented in boundary or service layers ---
    # After the Driver adds count_unparseable_codes to app/repositories/,
    # this guard ensures no duplicate appears in routes or services.
    probe_marker = "count_unparseable_codes"
    for layer_dir, layer_name in [
        (ROUTES_DIR, "app/routes"),
        (SERVICES_DIR, "app/services"),
    ]:
        for src_file in layer_dir.glob("*.py"):
            src = src_file.read_text()
            assert probe_marker not in src or _is_import_only(src, probe_marker), (
                f"{src_file.relative_to(PROJECT_ROOT)}: "
                f"defines or re-implements {probe_marker!r} in the {layer_name} layer; "
                "the integrity probe belongs exclusively in app/repositories/ -- "
                "routes and services must call the repository, not duplicate the query "
                "(T19: no reimplementation outside the repository layer)"
            )


def _is_import_only(src: str, symbol: str) -> bool:
    """Return True if symbol only appears in import statements (not a def)."""
    lines = [ln.strip() for ln in src.splitlines() if symbol in ln]
    return all(ln.startswith("from ") or ln.startswith("import ") for ln in lines)


# ===========================================================================
# T20 -- S2 test suite uses real Lakebase branch DB, no mock
# ===========================================================================

def test_t20_s2_suite_uses_real_lakebase_branch_db() -> None:
    """T20: The S2 step_defs file binds to the real branch DB, not a mock.

    Born-green regression guard (NFR-F6-S2-2): verifies the step_defs module
    exists, uses app.database (real SessionLocal/engine), and that the Background
    step in the feature file performs a live connection check via engine.connect().
    Also asserts the configured DATABASE_URL is a real PostgreSQL endpoint and
    that a live SELECT 1 succeeds.
    """
    from app.database import DATABASE_URL, engine

    # --- Part 1: DATABASE_URL points at a real PostgreSQL instance ---
    assert DATABASE_URL, (
        "DATABASE_URL is empty; the S2 test environment must configure "
        "a real Lakebase branch DB connection (NFR-F6-S2-2)"
    )
    assert "sqlite" not in DATABASE_URL.lower(), (
        f"DATABASE_URL={DATABASE_URL!r} points to SQLite; "
        "S2 validation tests must run against the real branch DB (NFR-F6-S2-2)"
    )
    assert DATABASE_URL.startswith("postgresql"), (
        f"DATABASE_URL={DATABASE_URL!r} is not a PostgreSQL URL; "
        "Lakebase branch DBs are PostgreSQL-compatible (NFR-F6-S2-2)"
    )

    # --- Part 2: live connection works ---
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).scalar()
    assert result == 1, (
        "Live SELECT 1 against the branch DB returned an unexpected value; "
        "ensure LAKEBASE_BRANCH_ID / DATABASE_URL point to the S2 experiment branch "
        "(NFR-F6-S2-2)"
    )

    # --- Part 3: S2 step_defs file exists and uses real session ---
    assert S2_STEP_DEFS.exists(), (
        f"{S2_STEP_DEFS.relative_to(PROJECT_ROOT)} does not exist; "
        "the S2 step_defs module must be created (T20)"
    )

    step_src = S2_STEP_DEFS.read_text()
    for forbidden in (
        "sqlite:///:memory:",
        "MagicMock",
        "unittest.mock",
        'create_engine("sqlite',
        "create_engine('sqlite",
    ):
        assert forbidden not in step_src, (
            f"tests/step_defs/test_s2_split_validate.py references {forbidden!r}; "
            "the S2 step_defs must use the real SessionLocal / DATABASE_URL, "
            "not an in-memory substitute (NFR-F6-S2-2)"
        )

    # --- Part 4: Background step performs a live connection check ---
    assert "engine.connect" in step_src, (
        "tests/step_defs/test_s2_split_validate.py does not call engine.connect(); "
        "the Background step must verify the live DB connection before any probe "
        "scenario runs -- add engine.connect() to the Background step definition "
        "(T20: conftest/background fixture verifies live connection)"
    )
