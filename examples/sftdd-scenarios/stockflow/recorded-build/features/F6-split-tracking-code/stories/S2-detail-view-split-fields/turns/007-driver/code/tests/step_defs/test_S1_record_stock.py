"""Step definitions for S1-record-stock.feature (T5/AC2, T9/AC3, T11/AC4).

Real-branch integration: exercises the SPA -> JSON api boundary
(app/routes/) -> service (app/services/) -> repository (app/repositories/)
-> stock_records write path against the paired Lakebase branch. Never
mocked (NFR-F1-real-branch-tests).

Superseded by F6-split-tracking-code/S1-split-schema-migration/AC4: the
combined inventory_code field is gone (split into batch_number/
serial_number); these steps carry the original intent (save-confirmation,
create-or-update-not-duplicate) forward onto the split schema shape.
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S1-record-stock.feature")


@pytest.fixture()
def filing_context():
    return {
        "sku": f"SKU-{uuid.uuid4().hex[:8]}",
        "location": f"LOC-{uuid.uuid4().hex[:8]}",
    }


@pytest.fixture(autouse=True)
def _cleanup(filing_context, db_session):
    yield
    db_session.rollback()
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
            {"sku": filing_context["sku"], "location": filing_context["location"]},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()


@given("a (sku, location) pair with no existing stock record")
def _no_existing_record(filing_context, db_session):
    row = db_session.execute(
        text("SELECT 1 FROM stock_records WHERE sku = :sku AND location = :location"),
        {"sku": filing_context["sku"], "location": filing_context["location"]},
    ).first()
    assert row is None, "test fixture collision: pair already has a stock record"


@given("an existing stock record for a (sku, location) pair")
def _existing_record(filing_context, client):
    response = client.post(
        "/api/stock-records",
        json={
            "sku": filing_context["sku"],
            "location": filing_context["location"],
            "quantity": 10,
            "batch_number": "B-ORIGINAL",
            "serial_number": "S-ORIGINAL",
        },
    )
    assert response.status_code in (200, 201), (
        f"fixture setup failed to seed an existing record: {response.status_code} "
        f"{response.text}"
    )


@when("the operator files a quantity and inventory_code for that pair")
def _file_new(filing_context, client):
    filing_context["quantity"] = 7
    filing_context["batch_number"] = "B-NEW-1"
    filing_context["serial_number"] = "S-NEW-1"
    filing_context["response"] = client.post(
        "/api/stock-records",
        json={
            "sku": filing_context["sku"],
            "location": filing_context["location"],
            "quantity": filing_context["quantity"],
            "batch_number": filing_context["batch_number"],
            "serial_number": filing_context["serial_number"],
        },
    )


@when("the operator files that same pair again with a different quantity and inventory_code")
def _refile_different(filing_context, client):
    filing_context["quantity"] = 42
    filing_context["batch_number"] = "B-UPDATED"
    filing_context["serial_number"] = "S-UPDATED"
    filing_context["response"] = client.post(
        "/api/stock-records",
        json={
            "sku": filing_context["sku"],
            "location": filing_context["location"],
            "quantity": filing_context["quantity"],
            "batch_number": filing_context["batch_number"],
            "serial_number": filing_context["serial_number"],
        },
    )


@when("the operator files that same pair again")
def _refile_same(filing_context, client):
    filing_context["response"] = client.post(
        "/api/stock-records",
        json={
            "sku": filing_context["sku"],
            "location": filing_context["location"],
            "quantity": 10,
            "batch_number": "B-ORIGINAL",
            "serial_number": "S-ORIGINAL",
        },
    )


@then("a stock record exists for that pair with the entered quantity and inventory_code")
def _assert_recorded(filing_context, db_session):
    row = db_session.execute(
        text(
            "SELECT quantity, batch_number, serial_number FROM stock_records "
            "WHERE sku = :sku AND location = :location"
        ),
        {"sku": filing_context["sku"], "location": filing_context["location"]},
    ).first()
    assert row is not None, "expected a persisted stock_records row for this pair"
    assert row.quantity == filing_context["quantity"]
    assert row.batch_number == filing_context["batch_number"]
    assert row.serial_number == filing_context["serial_number"]


@then("a save confirmation is returned")
def _assert_confirmation(filing_context):
    assert filing_context["response"].status_code in (200, 201)


@then("exactly one stock record exists for that pair")
def _assert_single_row(filing_context, db_session):
    count = db_session.execute(
        text(
            "SELECT COUNT(*) FROM stock_records WHERE sku = :sku AND location = :location"
        ),
        {"sku": filing_context["sku"], "location": filing_context["location"]},
    ).scalar_one()
    assert count == 1, f"expected exactly one row for this (sku, location) pair, found {count}"


@then("it holds the newly filed quantity and inventory_code")
def _assert_updated_values(filing_context, db_session):
    row = db_session.execute(
        text(
            "SELECT quantity, batch_number, serial_number FROM stock_records "
            "WHERE sku = :sku AND location = :location"
        ),
        {"sku": filing_context["sku"], "location": filing_context["location"]},
    ).first()
    assert row is not None
    assert row.quantity == filing_context["quantity"]
    assert row.batch_number == filing_context["batch_number"]
    assert row.serial_number == filing_context["serial_number"]


@then("the response is a save confirmation, not an error page")
def _assert_no_error_page(filing_context):
    response = filing_context["response"]
    assert 200 <= response.status_code < 300, (
        f"expected a 2xx save confirmation on refile, got {response.status_code}"
    )
    assert "<html" not in response.text.lower()
