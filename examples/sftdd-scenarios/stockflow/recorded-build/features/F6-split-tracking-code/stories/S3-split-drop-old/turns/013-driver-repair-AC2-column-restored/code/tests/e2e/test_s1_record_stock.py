"""E2E step definitions for S1-record-stock (T1, T2, T3, T7, T4, T6).

All ACs in this story are E2E-layer: interactions go through the real browser
(Playwright) against the live_server, which serves the React SPA backed by the
real paired-branch Lakebase DB.  DB-state assertions use the db_session fixture
(real SessionLocal, no mocks) from tests/conftest.py.

Step defs live here (tests/e2e/) so pytest discovers tests/e2e/conftest.py and
injects the live_server fixture -- that conftest must not be duplicated.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect
from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S1-record-stock.feature")

_RECEIVE_PATH = "/receive"

# ------------------------------------------------------------------
# Test-data SKUs used across scenarios -- cleaned up after each test.
# ------------------------------------------------------------------
_TEST_SKUS = ["T3-SKU", "T4-SKU", "T6-SKU", "T7-SKU"]


@pytest.fixture(autouse=True)
def _cleanup_test_stock_rows(db_session):
    """Delete rows seeded or created during each scenario."""
    yield
    try:
        for sku in _TEST_SKUS:
            db_session.execute(
                text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": sku},
            )
        db_session.commit()
    except Exception:
        db_session.rollback()


# ==================================================================
# Shared navigation step (T1, T2, T3, T7, T4, T6)
# ==================================================================

@given("the user is on the record stock page")
def navigate_to_record_stock_page(page: Page, live_server: str) -> None:
    page.goto(live_server + _RECEIVE_PATH)


# ==================================================================
# T1 -- form renders all required input fields
# ==================================================================

@then("a form is visible with inputs for SKU, location, quantity, and tracking code")
def form_renders_all_inputs(page: Page) -> None:
    expect(page.get_by_test_id("receive-form")).to_be_visible()
    expect(page.get_by_test_id("receive-sku-input")).to_be_visible()
    expect(page.get_by_test_id("receive-location-input")).to_be_visible()
    expect(page.get_by_test_id("receive-qty-input")).to_be_visible()
    expect(page.get_by_test_id("receive-tracking-code-input")).to_be_visible()


# ==================================================================
# T2 -- blank required field shows named inline validation error
# ==================================================================

@when("the user submits the form without filling in SKU")
def submit_without_sku(page: Page) -> None:
    page.get_by_test_id("receive-location-input").fill("A-01")
    page.get_by_test_id("receive-qty-input").fill("10")
    page.get_by_test_id("btn-save-receipt").click()


@then("an inline validation error names the SKU field")
def inline_error_names_sku(page: Page) -> None:
    error = page.get_by_test_id("field-error-sku")
    expect(error).to_be_visible()
    expect(error).to_contain_text("SKU")


# ==================================================================
# Shared fill-and-submit steps (T3, T7, T4, T6)
# ==================================================================

@when(
    parsers.parse(
        'the user fills in the form with SKU "{sku}", location "{location}",'
        ' quantity "{qty}", and tracking code "{tracking_code}"'
    )
)
def fill_stock_form(
    page: Page,
    sku: str,
    location: str,
    qty: str,
    tracking_code: str,
) -> None:
    page.get_by_test_id("receive-sku-input").fill(sku)
    page.get_by_test_id("receive-location-input").fill(location)
    page.get_by_test_id("receive-qty-input").fill(qty)
    page.get_by_test_id("receive-tracking-code-input").fill(tracking_code)


@when("the user clicks the submit button")
def click_submit(page: Page) -> None:
    page.get_by_test_id("btn-save-receipt").click()


# ==================================================================
# T3 -- valid submission creates a DB record
# ==================================================================

@then(
    parsers.parse(
        'a stock record exists in the database with SKU "{sku}"'
        " at location \"{location}\" with quantity {quantity:d}"
    )
)
def stock_record_in_db(sku: str, location: str, quantity: int, db_session) -> None:
    result = db_session.execute(
        text(
            "SELECT quantity FROM stock WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    )
    row = result.fetchone()
    assert row is not None, (
        f"No stock row found for sku={sku!r} location={location!r}; "
        "form submission did not persist the record"
    )
    assert row[0] == quantity, (
        f"Expected quantity {quantity} for sku={sku!r} location={location!r}, got {row[0]}"
    )


# ==================================================================
# T7 -- negative quantity rejected; no negative row stored
# ==================================================================

@then("the page shows a validation error for the quantity field")
def page_shows_qty_validation_error(page: Page) -> None:
    expect(page.get_by_test_id("field-error-qty")).to_be_visible()


@then(
    parsers.parse(
        'no stock row with negative quantity exists for SKU "{sku}"'
        " at location \"{location}\""
    )
)
def no_negative_quantity_row(sku: str, location: str, db_session) -> None:
    result = db_session.execute(
        text(
            "SELECT quantity FROM stock"
            " WHERE sku = :sku AND location = :location AND quantity < 0"
        ),
        {"sku": sku, "location": location},
    )
    row = result.fetchone()
    assert row is None, (
        f"Found a row with negative quantity ({row[0] if row else '?'}) "
        f"for sku={sku!r} location={location!r}; write must reject negative quantities (NFR-F1-2)"
    )


# ==================================================================
# T4 -- confirmation message visible after success
# ==================================================================

@then("a confirmation message is visible indicating the record was saved")
def confirmation_message_visible(page: Page) -> None:
    expect(page.get_by_test_id("receipt-confirm-page")).to_be_visible()
    expect(page.get_by_test_id("receipt-confirm-summary")).to_be_visible()


# ==================================================================
# T6 -- upsert: existing (sku, location) updates quantity, no error
# ==================================================================

@given(
    parsers.parse(
        'a stock record exists for SKU "{sku}" at location "{location}"'
        " with quantity {quantity:d}"
    )
)
def seed_existing_stock_record(
    sku: str, location: str, quantity: int, db_session
) -> None:
    db_session.execute(
        text(
            "INSERT INTO stock (sku, location, quantity, tracking_code, created_at)"
            " VALUES (:sku, :location, :quantity, '', NOW())"
            " ON CONFLICT (sku, location)"
            " DO UPDATE SET quantity = EXCLUDED.quantity"
        ),
        {"sku": sku, "location": location, "quantity": quantity},
    )
    db_session.commit()


@then(
    parsers.parse(
        'the stock record for SKU "{sku}" at location "{location}"'
        " has quantity {quantity:d}"
    )
)
def stock_record_has_expected_quantity(
    sku: str, location: str, quantity: int, db_session
) -> None:
    result = db_session.execute(
        text(
            "SELECT quantity FROM stock WHERE sku = :sku AND location = :location"
        ),
        {"sku": sku, "location": location},
    )
    row = result.fetchone()
    assert row is not None, f"No stock row for sku={sku!r} location={location!r}"
    assert row[0] == quantity, (
        f"Expected quantity {quantity} after upsert, got {row[0]} "
        f"(sku={sku!r} location={location!r})"
    )


@then("no error message is visible on the page")
def no_error_message_visible(page: Page) -> None:
    expect(page.get_by_test_id("receive-error")).not_to_be_visible()
