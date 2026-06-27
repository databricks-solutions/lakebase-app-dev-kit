"""Shared fixtures for tests against the real Lakebase database."""

import pytest
from fastapi.testclient import TestClient
from pytest_bdd import given, parsers, then
from sqlalchemy import text

from app.database import SessionLocal  # .env already loaded by app.database
from app.main import app


@pytest.fixture()
def client():
    """FastAPI TestClient for making HTTP requests."""
    return TestClient(app)


@pytest.fixture()
def db_session():
    """Raw SQLAlchemy session for test setup / assertions."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# T5 step definitions -- shared here so they are in scope for both the
# step_defs (API-layer) tests AND the e2e test file that loads all scenarios
# via scenarios().  pytest-bdd resolves steps via pytest's fixture scoping:
# the more-local definition in the step_defs test module shadows this one
# for step_defs tests; for e2e tests this conftest version is used.
# ---------------------------------------------------------------------------

@given(
    parsers.parse(
        'the stock write API receives SKU "{sku}", location "{location}",'
        " quantity {qty:d}, and tracking code \"{tracking_code}\""
    )
)
def post_stock_via_api(sku: str, location: str, qty: int, tracking_code: str, client) -> None:  # noqa: F811
    """POST /receive as the outermost API boundary."""
    resp = client.post(
        "/receive",
        data={
            "sku": sku,
            "location": location,
            "qty": str(qty),
            "tracking_code": tracking_code,
        },
        follow_redirects=False,
    )
    assert resp.status_code in (200, 303), (
        f"POST /receive returned HTTP {resp.status_code}; "
        "expected 303 redirect on success or 200 (AC5 write path must accept the submission)"
    )


@then(
    parsers.parse(
        'the database record for SKU "{sku}" at location "{location}"'
        " has tracking code \"{tracking_code}\""
    )
)
def assert_tracking_code_in_db(sku: str, location: str, tracking_code: str, db_session) -> None:  # noqa: F811
    """Query the real paired-branch DB directly; no UI, no mock."""
    result = db_session.execute(
        text(
            "SELECT tracking_code FROM stock"
            " WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    )
    row = result.fetchone()
    assert row is not None, (
        f"No stock row found for sku={sku!r} location={location!r} after POST /receive; "
        "the write did not persist the record (AC5 round-trip contract)"
    )
    assert row[0] == tracking_code, (
        f"Tracking code round-trip failed: submitted {tracking_code!r}, "
        f"stored {row[0]!r}; the field was lost or truncated "
        "(AC5-tracking-code-persisted contract)"
    )


@pytest.fixture(autouse=True)
def _restore_migration_head_after_each_test():
    """Within-run test isolation for migration up/down fixtures.

    Some tests drive Alembic up/down against the shared verify database (a
    contract/cleanup story DROPS a column; a backfill story seeds rows then
    `upgrade head`). Run sequentially against ONE database, those fixtures can
    leave it half-migrated , or, if a downgrade overshoots, below a table a later
    test needs , so the next test fails with `relation ... does not exist`. This
    autouse teardown brings the DB back to `head` after EVERY test, so each test
    starts from the fully-migrated schema regardless of what the previous one did.
    """
    yield
    try:
        from pathlib import Path

        from alembic import command
        from alembic.config import Config

        ini = str(Path(__file__).resolve().parent.parent / "alembic.ini")
        command.upgrade(Config(ini), "head")
    except Exception:
        # Best-effort isolation; never fail a test on teardown restoration.
        pass
