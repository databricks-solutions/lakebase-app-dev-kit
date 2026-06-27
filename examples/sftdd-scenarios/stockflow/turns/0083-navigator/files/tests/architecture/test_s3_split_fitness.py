"""Architectural fitness tests for F6-split-tracking-code / S3-split-drop-old.

T29 -- the S3 Alembic revision module (drop inventory_code) does not import
       app/routes or app/services; the migration stays in the
       repository/migration layer and never crosses the layering contract.
"""

from __future__ import annotations

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
VERSIONS_DIR = PROJECT_ROOT / "alembic" / "versions"


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
