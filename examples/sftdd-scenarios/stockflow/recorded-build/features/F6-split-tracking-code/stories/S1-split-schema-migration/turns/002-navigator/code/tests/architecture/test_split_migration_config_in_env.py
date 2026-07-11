"""S1-split-schema-migration / T4 / AC4-combined-column-dropped:
config-in-env fitness (NFR-F6-config-in-env, twelve-factor). The split
migration's Alembic env and the app's DB config must resolve the connection
from the injected DATABASE_URL against the paired branch's databricks_postgres
database, with no hardcoded DSN. This is a regression guard expected to
already hold (born-green): F1 established config-in-env and the split
migration introduces no new connection-resolution code path.
"""

import re
from pathlib import Path

from app import database

REPO_ROOT = Path(__file__).resolve().parents[2]

# A DSN literal embedding a real host/db pair, e.g. postgresql://user@host/db.
_HARDCODED_DSN_RE = re.compile(r"postgresql(?:\+psycopg)?://[^\s\"'{}]*@[^\s\"'/{}]+/\w+")


def test_split_migration_resolves_connection_from_database_url_env(monkeypatch):
    fake_dsn = "postgresql://tester@split-paired-branch-host:5432/databricks_postgres"
    monkeypatch.setenv("DATABASE_URL", fake_dsn)

    resolved = database.resolved_url()

    assert "split-paired-branch-host" in resolved, (
        "the split migration's connection must resolve from the injected "
        f"DATABASE_URL verbatim; got {resolved!r}"
    )


def test_no_hardcoded_dsn_literal_in_app_or_alembic_source_for_split_migration():
    for py_file in (REPO_ROOT / "app" / "database.py", REPO_ROOT / "alembic" / "env.py"):
        source = py_file.read_text()
        match = _HARDCODED_DSN_RE.search(source)
        assert match is None, (
            f"{py_file.relative_to(REPO_ROOT)} contains a hardcoded DSN "
            f"literal ({match.group(0) if match else ''!r}); the split "
            "migration's connection must resolve from the injected "
            "DATABASE_URL env var, never a hardcoded DSN"
        )


def test_db_name_still_defaults_to_the_generic_paired_branch_database(monkeypatch):
    monkeypatch.delenv("DB_NAME", raising=False)
    source = (REPO_ROOT / "app" / "database.py").read_text()
    assert 'os.getenv("DB_NAME", "databricks_postgres")' in source, (
        "DB_NAME must default to the generic paired-branch database "
        "'databricks_postgres', never an app-specific hardcoded DB name"
    )
