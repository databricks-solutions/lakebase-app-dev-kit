"""S1-split-schema-migration / T3 / AC1-backfill-conforming-codes: layering
fitness. The split migration's delimiter-parsing logic must live only in the
Alembic revision under alembic/versions/, never in the running app/services
or app/models layers (architecture.md: "one-off migration logic ... kept out
of the running domain").
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VERSIONS_DIR = REPO_ROOT / "alembic" / "versions"
SERVICES_DIR = REPO_ROOT / "app" / "services"
MODELS_DIR = REPO_ROOT / "app" / "models"


def test_delimiter_parsing_logic_lives_only_in_the_split_migration():
    migration_files = [
        f
        for f in VERSIONS_DIR.glob("*.py")
        if f.name != "__init__.py" and "batch_number" in f.read_text()
    ]
    assert migration_files, (
        "expected an Alembic revision under alembic/versions/ that backfills "
        "batch_number (the split migration); none found"
    )

    offending = []
    for directory in (SERVICES_DIR, MODELS_DIR):
        for py_file in directory.glob("*.py"):
            if py_file.name == "__init__.py":
                continue
            source = py_file.read_text()
            if "inventory_code" in source and ".split(" in source:
                offending.append(str(py_file.relative_to(REPO_ROOT)))
    assert not offending, (
        f"delimiter-parsing logic found in {offending}; it must live only in "
        "the Alembic revision under alembic/versions/, never in app/services "
        "or app/models"
    )
