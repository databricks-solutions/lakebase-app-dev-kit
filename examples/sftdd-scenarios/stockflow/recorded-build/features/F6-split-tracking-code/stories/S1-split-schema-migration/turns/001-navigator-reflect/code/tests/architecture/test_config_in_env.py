"""AC2-file-new-stock-confirmed / T3: config-in-env fitness (twelve-factor).
The app and its Alembic env must resolve the DB connection from the injected
DATABASE_URL env var, with no hardcoded DSN and no app-specific DB name in
place of the paired branch's databricks_postgres.
"""

import re
from pathlib import Path

import pytest

from app import database

REPO_ROOT = Path(__file__).resolve().parents[2]

# A DSN literal embedding a real host/db pair, e.g. postgresql://user@host/db.
_HARDCODED_DSN_RE = re.compile(r"postgresql(?:\+psycopg)?://[^\s\"'{}]*@[^\s\"'/{}]+/\w+")


def test_app_resolves_connection_from_database_url_env(monkeypatch):
    fake_dsn = "postgresql://tester@paired-branch-host:5432/databricks_postgres"
    monkeypatch.setenv("DATABASE_URL", fake_dsn)

    resolved = database.resolved_url()

    assert "paired-branch-host" in resolved, (
        "resolved_url() must read the injected DATABASE_URL verbatim; got "
        f"{resolved!r}"
    )


def test_no_hardcoded_dsn_literal_in_app_or_alembic_source():
    for py_file in (REPO_ROOT / "app" / "database.py", REPO_ROOT / "alembic" / "env.py"):
        source = py_file.read_text()
        match = _HARDCODED_DSN_RE.search(source)
        assert match is None, (
            f"{py_file.relative_to(REPO_ROOT)} contains a hardcoded DSN "
            f"literal ({match.group(0) if match else ''!r}); connection must "
            "resolve from the injected DATABASE_URL env var, never a "
            "hardcoded DSN"
        )


def test_db_name_defaults_to_the_generic_paired_branch_database(monkeypatch):
    monkeypatch.delenv("DB_NAME", raising=False)
    source = (REPO_ROOT / "app" / "database.py").read_text()
    assert 'os.getenv("DB_NAME", "databricks_postgres")' in source, (
        "DB_NAME must default to the generic paired-branch database "
        "'databricks_postgres', never an app-specific hardcoded DB name"
    )
