"""E2E step definitions for F6-split-tracking-code / S4-split-display.

Behavior tests T31, T32, T33, T34, T35, T36 -- all E2E-layer: interactions go
through the real browser (Playwright) against the live_server, which serves the
Jinja2-rendered app backed by the real paired-branch Lakebase DB.  DB-state setup
uses the db_session fixture (real SessionLocal, no mocks) from tests/conftest.py.

The split columns batch_number / serial_number are read directly from the model
(populated by the F6 S1 backfill migration); the views must render them as their
own column (home table) and their own labeled field (SKU detail), substituting
'not tracked' for a NULL value -- never re-parsing the dropped inventory_code.

Step defs live here (tests/e2e/) so pytest discovers tests/e2e/conftest.py and
injects the live_server fixture -- that conftest must not be duplicated.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

from app.database import engine

scenarios("../features/S4-split-display.feature")

_HOME_PATH = "/"
_DETAIL_PATH_PREFIX = "/sku/"

# -----------------------------------------------------------------------
# Test-data identifiers -- scoped to S4 to avoid cross-suite conflicts.
# -----------------------------------------------------------------------
_T31_SKU = "T31-S4-SKU"
_T31_LOC = "LOC-T31-S4"
_T31_BATCH = "BATCH-T31"
_T31_SERIAL = "SERIAL-T31"

_T33_SKU = "T33-S4-SKU"
_T33_LOC = "LOC-T33-S4"

_T34_SKU = "T34-S4-SKU"
_T34_LOC = "LOC-T34-S4"

_T32_SKU = "T32-S4-SKU"
_T32_ENTRIES = [
    ("LOC-T32-S4-A", 4, "BATCH-T32-A", "SERIAL-T32-A"),
    ("LOC-T32-S4-B", 8, "BATCH-T32-B", "SERIAL-T32-B"),
]

_T35_SKU = "T35-S4-SKU"
_T35_LOC = "LOC-T35-S4"

_T36_SKU = "T36-S4-SKU"
_T36_LOC = "LOC-T36-S4"

_ALL_S4_SKUS = [
    _T31_SKU,
    _T33_SKU,
    _T34_SKU,
    _T32_SKU,
    _T35_SKU,
    _T36_SKU,
]


# -----------------------------------------------------------------------
# Live-DB connection check -- the S4 suite must verify a real Lakebase
# branch connection before any scenario runs (NFR: no mock substitute, T38).
# -----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _verify_live_db_connection():
    """Verify the real branch DB is reachable before each S4 scenario."""
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1
    yield


# -----------------------------------------------------------------------
# Isolation: delete S4 test rows before and after each scenario.
# -----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_s4_rows(db_session):
    """Delete S4 test rows before and after every scenario for isolation."""
    _delete_s4_rows(db_session)
    yield
    _delete_s4_rows(db_session)


def _delete_s4_rows(db_session) -> None:
    try:
        for sku in _ALL_S4_SKUS:
            db_session.execute(
                text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": sku},
            )
        db_session.commit()
    except Exception:
        db_session.rollback()


def _seed(db_session, sku, location, qty, batch, serial) -> None:
    """Insert one stock row with explicit batch_number / serial_number (may be None)."""
    db_session.execute(
        text(
            "INSERT INTO stock"
            "  (sku, location, quantity, tracking_code, batch_number, serial_number, created_at)"
            " VALUES (:sku, :location, :quantity, '', :batch, :serial, NOW())"
            " ON CONFLICT (sku, location) DO UPDATE SET"
            "  quantity = EXCLUDED.quantity,"
            "  batch_number = EXCLUDED.batch_number,"
            "  serial_number = EXCLUDED.serial_number"
        ),
        {
            "sku": sku,
            "location": location,
            "quantity": qty,
            "batch": batch,
            "serial": serial,
        },
    )
    db_session.commit()


# -----------------------------------------------------------------------
# Shared context fixture -- carries the active SKU from @given to @when.
# -----------------------------------------------------------------------

@pytest.fixture()
def sku_context() -> dict:
    return {"sku": ""}


# -----------------------------------------------------------------------
# Shared navigation steps
# -----------------------------------------------------------------------

@when("the user opens the home stock page for the split-display test")
def open_home_page(page: Page, live_server: str) -> None:
    page.goto(live_server + _HOME_PATH)


@when("the user opens that SKU's detail page for the split-display test")
def open_detail_page(page: Page, live_server: str, sku_context: dict) -> None:
    page.goto(live_server + _DETAIL_PATH_PREFIX + sku_context["sku"])


# -----------------------------------------------------------------------
# T31 -- home table renders Batch Number + Serial Number columns
# -----------------------------------------------------------------------

@given("a stock record with populated batch and serial numbers is seeded for the home table")
def seed_home_populated(db_session) -> None:
    _seed(db_session, _T31_SKU, _T31_LOC, 10, _T31_BATCH, _T31_SERIAL)


@then(
    "the home stock table shows a Batch Number column and a Serial Number column"
    " with that record's batch and serial values"
)
def home_shows_batch_serial_columns(page: Page) -> None:
    table = page.get_by_test_id("stock-table")
    expect(table).to_be_visible()
    expect(table).to_contain_text("Batch Number")
    expect(table).to_contain_text("Serial Number")
    row = page.locator(f"[data-testid='stock-row'][data-sku='{_T31_SKU}']")
    expect(row).to_be_visible()
    expect(row.get_by_test_id("stock-row-batch")).to_contain_text(_T31_BATCH)
    expect(row.get_by_test_id("stock-row-serial")).to_contain_text(_T31_SERIAL)


# -----------------------------------------------------------------------
# T33 -- NULL batch_number renders "not tracked" in the Batch Number column
# -----------------------------------------------------------------------

@given("a stock record with a null batch number is seeded for the home table")
def seed_home_null_batch(db_session) -> None:
    _seed(db_session, _T33_SKU, _T33_LOC, 7, None, "SERIAL-T33")


@then('the Batch Number column for that home row shows "not tracked"')
def home_null_batch_not_tracked(page: Page) -> None:
    row = page.locator(f"[data-testid='stock-row'][data-sku='{_T33_SKU}']")
    expect(row).to_be_visible()
    expect(row.get_by_test_id("stock-row-batch")).to_contain_text("not tracked")


# -----------------------------------------------------------------------
# T34 -- NULL serial_number renders "not tracked" in the Serial Number column
# -----------------------------------------------------------------------

@given("a stock record with a null serial number is seeded for the home table")
def seed_home_null_serial(db_session) -> None:
    _seed(db_session, _T34_SKU, _T34_LOC, 9, "BATCH-T34", None)


@then('the Serial Number column for that home row shows "not tracked"')
def home_null_serial_not_tracked(page: Page) -> None:
    row = page.locator(f"[data-testid='stock-row'][data-sku='{_T34_SKU}']")
    expect(row).to_be_visible()
    expect(row.get_by_test_id("stock-row-serial")).to_contain_text("not tracked")


# -----------------------------------------------------------------------
# T32 -- detail view renders batch + serial as separate labeled fields
# -----------------------------------------------------------------------

@given(
    "a SKU has stock at multiple locations with populated batch and serial"
    " numbers for the detail view"
)
def seed_detail_populated(db_session, sku_context) -> None:
    sku_context["sku"] = _T32_SKU
    for loc, qty, batch, serial in _T32_ENTRIES:
        _seed(db_session, _T32_SKU, loc, qty, batch, serial)


@then(
    "each location row in the detail view shows the batch number and serial"
    " number as separate labeled fields"
)
def detail_shows_batch_serial_fields(page: Page) -> None:
    expect(page.get_by_test_id("sku-detail-table")).to_be_visible()
    for loc, _qty, batch, serial in _T32_ENTRIES:
        row = page.locator(f"[data-testid='sku-detail-row'][data-location='{loc}']")
        expect(row).to_be_visible()
        expect(row.get_by_test_id("sku-detail-row-batch")).to_contain_text(batch)
        expect(row.get_by_test_id("sku-detail-row-serial")).to_contain_text(serial)


# -----------------------------------------------------------------------
# T35 -- detail view NULL batch_number renders "not tracked"
# -----------------------------------------------------------------------

@given("a stock record at a location with a null batch number is seeded for the detail view")
def seed_detail_null_batch(db_session, sku_context) -> None:
    sku_context["sku"] = _T35_SKU
    _seed(db_session, _T35_SKU, _T35_LOC, 1, None, "SERIAL-T35")


@then('the batch number field for that detail location row shows "not tracked"')
def detail_null_batch_not_tracked(page: Page) -> None:
    row = page.locator(f"[data-testid='sku-detail-row'][data-location='{_T35_LOC}']")
    expect(row).to_be_visible()
    expect(row.get_by_test_id("sku-detail-row-batch")).to_contain_text("not tracked")


# -----------------------------------------------------------------------
# T36 -- detail view NULL serial_number renders "not tracked"
# -----------------------------------------------------------------------

@given("a stock record at a location with a null serial number is seeded for the detail view")
def seed_detail_null_serial(db_session, sku_context) -> None:
    sku_context["sku"] = _T36_SKU
    _seed(db_session, _T36_SKU, _T36_LOC, 1, "BATCH-T36", None)


@then('the serial number field for that detail location row shows "not tracked"')
def detail_null_serial_not_tracked(page: Page) -> None:
    row = page.locator(f"[data-testid='sku-detail-row'][data-location='{_T36_LOC}']")
    expect(row).to_be_visible()
    expect(row.get_by_test_id("sku-detail-row-serial")).to_contain_text("not tracked")
