"""E2E step definitions for S3-sku-detail-view (T20, T21, T22).

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

scenarios("../features/S3-sku-detail-view.feature")

_DETAIL_PATH_PREFIX = "/sku/"

# -----------------------------------------------------------------------
# Test-data identifiers -- scoped to S3 to avoid cross-suite conflicts.
# -----------------------------------------------------------------------

_T20_SKU = "T20-S3-SKU"
_T20_ENTRIES = [
    ("LOC-T20-S3-A", 5),
    ("LOC-T20-S3-B", 12),
    ("LOC-T20-S3-C", 7),
]

_T21_SKU = "T21-S3-SKU"
_T21_ENTRIES = [
    ("LOC-T21-S3-A", 3, "TC-T21-A"),
    ("LOC-T21-S3-B", 9, "TC-T21-B"),
]

_T22_SKU = "T22-S3-SKU"
_T22_LOC = "LOC-T22-S3"

_ALL_S3_SKUS = [_T20_SKU, _T21_SKU, _T22_SKU]


# -----------------------------------------------------------------------
# Isolation: delete S3 test rows before and after each scenario.
# -----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _cleanup_s3_rows(db_session):
    """Delete S3 test rows before and after every scenario for isolation."""
    _delete_s3_rows(db_session)
    yield
    _delete_s3_rows(db_session)


def _delete_s3_rows(db_session) -> None:
    try:
        for sku in _ALL_S3_SKUS:
            db_session.execute(
                text("DELETE FROM stock WHERE sku = :sku"),
                {"sku": sku},
            )
        db_session.commit()
    except Exception:
        db_session.rollback()


# -----------------------------------------------------------------------
# Shared context fixture -- carries the active SKU from @given to @when.
# -----------------------------------------------------------------------

@pytest.fixture()
def sku_context() -> dict:
    """Mutable dict for sharing the active SKU between @given and @when steps."""
    return {"sku": ""}


# -----------------------------------------------------------------------
# T20 -- multi-location detail view renders one row per location
# -----------------------------------------------------------------------

@given("a SKU has stock seeded at multiple locations for the detail view display test")
def seed_multi_location_stock_t20(db_session, sku_context) -> None:
    sku_context["sku"] = _T20_SKU
    for loc, qty in _T20_ENTRIES:
        db_session.execute(
            text(
                "INSERT INTO stock (sku, location, quantity, tracking_code, created_at)"
                " VALUES (:sku, :location, :quantity, '', NOW())"
                " ON CONFLICT (sku, location) DO UPDATE SET quantity = EXCLUDED.quantity"
            ),
            {"sku": _T20_SKU, "location": loc, "quantity": qty},
        )
    db_session.commit()


@then("the detail view shows one row per seeded location with the location name and current quantity")
def detail_view_has_one_row_per_location(page: Page) -> None:
    expect(page.get_by_test_id("sku-detail-table")).to_be_visible()
    for loc, qty in _T20_ENTRIES:
        row = page.locator(
            f"[data-testid='sku-detail-row'][data-location='{loc}']"
        )
        expect(row).to_be_visible()
        expect(row).to_contain_text(loc)
        expect(row).to_contain_text(str(qty))


# -----------------------------------------------------------------------
# T21 -- each detail row shows the stored tracking code
# -----------------------------------------------------------------------

@given(
    "stock records with distinct tracking codes exist for a SKU at multiple"
    " locations for the tracking code display test"
)
def seed_entries_with_tracking_codes_t21(db_session, sku_context) -> None:
    sku_context["sku"] = _T21_SKU
    for loc, qty, tc in _T21_ENTRIES:
        db_session.execute(
            text(
                "INSERT INTO stock (sku, location, quantity, tracking_code, created_at)"
                " VALUES (:sku, :location, :quantity, :tc, NOW())"
                " ON CONFLICT (sku, location) DO UPDATE SET"
                "  quantity = EXCLUDED.quantity, tracking_code = EXCLUDED.tracking_code"
            ),
            {"sku": _T21_SKU, "location": loc, "quantity": qty, "tc": tc},
        )
    db_session.commit()


@then("each location row in the detail view shows the tracking code stored for that location")
def detail_rows_show_tracking_codes(page: Page) -> None:
    expect(page.get_by_test_id("sku-detail-table")).to_be_visible()
    for loc, _qty, tc in _T21_ENTRIES:
        row = page.locator(
            f"[data-testid='sku-detail-row'][data-location='{loc}']"
        )
        expect(row).to_be_visible()
        tracking_cell = row.locator("[data-testid='sku-detail-row-tracking']")
        expect(tracking_cell).to_contain_text(tc)


# -----------------------------------------------------------------------
# T22 -- optional field with no stored value renders "not tracked"
# -----------------------------------------------------------------------

@given("a stock record exists for a SKU at a location with no optional field value stored")
def seed_record_with_null_optional_field_t22(db_session, sku_context) -> None:
    """Seed a record with inventory_code = NULL (the optional field for the detail view).

    The detail view must render the NULL cell as 'not tracked' rather than
    leaving it blank or crashing (AC3-optional-fields-show-not-tracked, NFR-F1-6).
    Fails RED because the /sku/<sku> route does not exist yet.
    """
    sku_context["sku"] = _T22_SKU
    db_session.execute(
        text(
            "INSERT INTO stock"
            "  (sku, location, quantity, tracking_code, inventory_code, created_at)"
            " VALUES (:sku, :location, 1, '', NULL, NOW())"
            " ON CONFLICT (sku, location) DO UPDATE SET inventory_code = NULL"
        ),
        {"sku": _T22_SKU, "location": _T22_LOC},
    )
    db_session.commit()


@then("the optional field cell for that location row displays the text not tracked")
def optional_field_renders_not_tracked(page: Page) -> None:
    expect(page.get_by_test_id("sku-detail-table")).to_be_visible()
    row = page.locator(
        f"[data-testid='sku-detail-row'][data-location='{_T22_LOC}']"
    )
    expect(row).to_be_visible()
    expect(row).to_contain_text("not tracked")


# -----------------------------------------------------------------------
# Shared navigation step (T20, T21, T22)
# -----------------------------------------------------------------------

@when("the user navigates to that SKU's detail page")
def navigate_to_sku_detail_page(page: Page, live_server: str, sku_context: dict) -> None:
    """Navigate to /sku/<sku>; fails RED until the detail route is implemented."""
    sku = sku_context["sku"]
    page.goto(live_server + _DETAIL_PATH_PREFIX + sku)
