"""API-layer step definitions for S1-record-stock T5 (AC5-tracking-code-persisted).

T5 -- persistence round-trip contract: a tracking code POSTed to /receive is
retrievable from the database with no loss or truncation.  This is an API-layer
test (boundary -> service -> repository), NOT E2E (no browser).  The real
paired-branch DB is used via the db_session fixture; TestClient drives the HTTP
boundary.
"""

from __future__ import annotations

import pytest
from pytest_bdd import given, parsers, scenario, then
from sqlalchemy import text

_FEATURE = "../features/S1-record-stock.feature"
_T5_SKU = "T5-SKU"
_T5_LOCATION = "LOC-T5"


@scenario(_FEATURE, "T5 Tracking code submitted on the form is retrievable without loss or truncation")
def test_t5_tracking_code_persisted_api():
    """T5: tracking code round-trip through POST /receive -> DB (API layer)."""


@pytest.fixture(autouse=True)
def _cleanup_t5_row(db_session):
    """Remove the T5 test row before and after the scenario to ensure isolation."""
    _delete_t5(db_session)
    yield
    _delete_t5(db_session)


def _delete_t5(db_session) -> None:
    try:
        db_session.execute(
            text("DELETE FROM stock WHERE sku = :sku AND location = :location"),
            {"sku": _T5_SKU, "location": _T5_LOCATION},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()


# ==================================================================
# T5 steps -- API boundary (TestClient, not browser)
# ==================================================================

@given(
    parsers.parse(
        'the stock write API receives SKU "{sku}", location "{location}",'
        " quantity {qty:d}, and tracking code \"{tracking_code}\""
    )
)
def post_stock_via_api(sku: str, location: str, qty: int, tracking_code: str, client) -> None:
    """POST /receive as the outermost API boundary; follow_redirects=False to
    assert the write path without depending on the confirmation template."""
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
def assert_tracking_code_in_db(sku: str, location: str, tracking_code: str, db_session) -> None:
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
