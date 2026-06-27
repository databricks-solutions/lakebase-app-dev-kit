"""E2E step definitions for S2-home-stock-table (T12, T13, T14, T15, T16, T17).

All ACs in this story are E2E-layer: interactions go through the real browser
(Playwright) against the live_server, which serves the Jinja2-rendered app backed
by the real paired-branch Lakebase DB.  DB-state setup uses the db_session fixture
(real SessionLocal, no mocks) from tests/conftest.py.

Step defs live here (tests/e2e/) so pytest discovers tests/e2e/conftest.py and
injects the live_server fixture -- that conftest must not be duplicated.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-home-stock-table.feature")

_HOME_PATH = "/"

# -----------------------------------------------------------------------
# Test-data identifiers -- scoped to S2 to avoid cross-suite conflicts.
# -----------------------------------------------------------------------
_T12_SKUS = ["T12-S2-SKU-A", "T12-S2-SKU-B"]
_T12_LOC = "LOC-T12-S2"

_T14_LOC_A = "LOC-T14-S2-A"
_T14_LOC_B = "LOC-T14-S2-B"
# SKU-Z and SKU-M sit at LOC-A; SKU-A sits at LOC-B.
# Sorted purely by SKU, LOC-B's row would appear first (A < M < Z),
# breaking location grouping.  ORDER BY (location, sku) keeps LOC-A first.
_T14_ENTRIES = [
    ("T14-S2-SKU-Z", _T14_LOC_A, 10),
    ("T14-S2-SKU-M", _T14_LOC_A, 20),
    ("T14-S2-SKU-A", _T14_LOC_B, 30),
]

_T15_SKU = "T15-S2-SKU"
_T15_LOC = "LOC-T15-S2"

_T16_SKU = "T16-S2-SKU"
_T16_LOC = "LOC-T16-S2"

_ALL_S2_SKUS = [
    *_T12_SKUS,
    *(sku for sku, _, _ in _T14_ENTRIES),
    _T15_SKU,
    _T16_SKU,
]


# -----------------------------------------------------------------------
# Isolation: delete S2 test rows before and after each scenario.
# -----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_s2_rows(db_session):
    """Delete S2 test rows before and after every scenario for isolation."""
    _delete_s2_rows(db_session)
    yield
    _delete_s2_rows(db_session)


def _delete_s2_rows(db_session) -> None:
    try:
        for sku in _ALL_S2_SKUS:
            db_session.execute(
                text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": sku},
            )
        db_session.commit()
    except Exception:
        db_session.rollback()


# -----------------------------------------------------------------------
# Shared navigation step (T12, T13, T14, T15, T16, T17)
# -----------------------------------------------------------------------

@when("the user navigates to the stock home page")
def navigate_to_stock_home(page: Page, live_server: str) -> None:
    page.goto(live_server + _HOME_PATH)


# -----------------------------------------------------------------------
# T12 / T17 -- seed two records for home table display and quantity style
# -----------------------------------------------------------------------

@given("two stock records are seeded for the home table display test")
def seed_two_records_for_home_display(db_session) -> None:
    for sku in _T12_SKUS:
        db_session.execute(
            text(
                "INSERT INTO stock (sku, location, quantity, tracking_code, created_at)"
                " VALUES (:sku, :location, :quantity, '', NOW())"
                " ON CONFLICT (sku, location) DO UPDATE SET quantity = EXCLUDED.quantity"
            ),
            {"sku": sku, "location": _T12_LOC, "quantity": 10},
        )
    db_session.commit()


@then("the stock table is visible and each seeded record has exactly one row")
def stock_table_shows_one_row_per_seeded_record(page: Page) -> None:
    expect(page.get_by_test_id("stock-table")).to_be_visible()
    for sku in _T12_SKUS:
        expect(
            page.locator(f"[data-testid='stock-row'][data-sku='{sku}']")
        ).to_be_visible()


# -----------------------------------------------------------------------
# T13 -- empty state
# -----------------------------------------------------------------------

@given("no stock records exist in the database")
def clear_all_stock_records(db_session) -> None:
    """Truncate the stock table so the home page encounters zero rows."""
    db_session.execute(text("DELETE FROM stock"))
    db_session.commit()


@then("the empty-state guidance message is shown instead of a blank table")
def empty_state_guidance_shown(page: Page) -> None:
    expect(page.get_by_test_id("stock-table-empty")).to_be_visible()
    expect(page.get_by_test_id("stock-table")).not_to_be_visible()


# -----------------------------------------------------------------------
# T14 -- location grouping
# -----------------------------------------------------------------------

@given("stock records exist across two distinct locations for the grouping test")
def seed_multi_location_records(db_session) -> None:
    for sku, loc, qty in _T14_ENTRIES:
        db_session.execute(
            text(
                "INSERT INTO stock (sku, location, quantity, tracking_code, created_at)"
                " VALUES (:sku, :location, :quantity, '', NOW())"
                " ON CONFLICT (sku, location) DO UPDATE SET quantity = EXCLUDED.quantity"
            ),
            {"sku": sku, "location": loc, "quantity": qty},
        )
    db_session.commit()


@then("all stock rows for the first test location appear before any row for the second test location")
def location_grouping_is_correct(page: Page) -> None:
    expect(page.get_by_test_id("stock-table")).to_be_visible()
    rows = page.locator("[data-testid='stock-row']").all()
    row_locs = [r.get_attribute("data-location") for r in rows]
    test_locs = [loc for loc in row_locs if loc in (_T14_LOC_A, _T14_LOC_B)]
    assert len(test_locs) >= 3, (
        f"Expected at least 3 test rows (2 at {_T14_LOC_A}, 1 at {_T14_LOC_B}); "
        f"found location sequence: {test_locs}"
    )
    a_indices = [i for i, loc in enumerate(test_locs) if loc == _T14_LOC_A]
    b_indices = [i for i, loc in enumerate(test_locs) if loc == _T14_LOC_B]
    assert max(a_indices) < min(b_indices), (
        f"Location grouping broken: all rows for {_T14_LOC_A} must precede {_T14_LOC_B}; "
        f"got order: {test_locs} (AC2-organized-by-location)"
    )


# -----------------------------------------------------------------------
# T15 -- columns display (SKU, location, quantity, inventory_code)
# -----------------------------------------------------------------------

@given("a stock record with known SKU location quantity and inventory code is seeded")
def seed_record_with_inventory_code(db_session) -> None:
    """Seed a row with a known tracking_code (the post-split tracking column).

    inventory_code was dropped by the S3 migration; the home table now renders
    tracking_code in its place."""
    db_session.execute(
        text(
            "INSERT INTO stock"
            "  (sku, location, quantity, tracking_code, created_at)"
            " VALUES (:sku, :location, :quantity, :tracking_code, NOW())"
            " ON CONFLICT (sku, location) DO UPDATE SET"
            "  quantity = EXCLUDED.quantity,"
            "  tracking_code = EXCLUDED.tracking_code"
        ),
        {
            "sku": _T15_SKU,
            "location": _T15_LOC,
            "quantity": 42,
            "tracking_code": "TRK-T15",
        },
    )
    db_session.commit()


@then("the stock row for that record shows the correct SKU location quantity and inventory code")
def row_shows_all_column_values(page: Page) -> None:
    row = page.locator(f"[data-testid='stock-row'][data-sku='{_T15_SKU}']")
    expect(row).to_be_visible()
    expect(row).to_contain_text(_T15_SKU)
    expect(row).to_contain_text(_T15_LOC)
    expect(row).to_contain_text("42")
    expect(row).to_contain_text("TRK-T15")


# -----------------------------------------------------------------------
# T16 -- null inventory_code renders as "not tracked"
# -----------------------------------------------------------------------

@given("a stock record with a null inventory code is seeded")
def seed_record_with_null_inventory_code(db_session) -> None:
    """Seed a row whose tracking_code is empty (the post-split untracked state).

    inventory_code was dropped by the S3 migration; an untracked row now carries
    an empty tracking_code, which the home table renders as 'not tracked'."""
    db_session.execute(
        text(
            "INSERT INTO stock"
            "  (sku, location, quantity, tracking_code, created_at)"
            " VALUES (:sku, :location, :quantity, '', NOW())"
            " ON CONFLICT (sku, location) DO UPDATE SET"
            "  quantity = EXCLUDED.quantity,"
            "  tracking_code = ''"
        ),
        {"sku": _T16_SKU, "location": _T16_LOC, "quantity": 5},
    )
    db_session.commit()


@then('the inventory code cell for that record shows "not tracked"')
def null_inventory_code_renders_as_not_tracked(page: Page) -> None:
    row = page.locator(f"[data-testid='stock-row'][data-sku='{_T16_SKU}']")
    expect(row).to_be_visible()
    expect(row).to_contain_text("not tracked")


# -----------------------------------------------------------------------
# T17 -- quantity cell carries right-align CSS style
# -----------------------------------------------------------------------

@then("the quantity cell in each visible stock row is right-aligned")
def quantity_cells_are_right_aligned(page: Page) -> None:
    """The design guide specifies numeric cells are right-aligned + mono font.
    Asserts via CSS computed value on the stock-row-qty testid."""
    expect(page.get_by_test_id("stock-table")).to_be_visible()
    qty_cell = page.locator("[data-testid='stock-row-qty']").first()
    expect(qty_cell).to_have_css("text-align", "right")
