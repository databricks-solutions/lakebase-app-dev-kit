"""Step definitions for S2-stock-by-location-home.feature (T13/AC1, T16/AC3).

Real-branch integration: exercises the SPA -> JSON api boundary
(app/routes/) -> service (app/services/) -> repository (app/repositories/)
-> stock_records read path against the paired Lakebase branch. Never mocked
(NFR-F1-real-branch-tests).
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-stock-by-location-home.feature")


@pytest.fixture()
def listing_context():
    return {
        "location": f"LOC-{uuid.uuid4().hex[:8]}",
        "records": [],
    }


@pytest.fixture(autouse=True)
def _cleanup(listing_context, db_session):
    yield
    db_session.rollback()
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE location = :location"),
            {"location": listing_context["location"]},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()


@given("a location with two seeded stock records at different SKUs")
def _seed_two_records(listing_context, client):
    for quantity, inventory_code in ((5, "INV-A"), (12, "INV-B")):
        sku = f"SKU-{uuid.uuid4().hex[:8]}"
        response = client.post(
            "/api/stock-records",
            json={
                "sku": sku,
                "location": listing_context["location"],
                "quantity": quantity,
                "inventory_code": inventory_code,
            },
        )
        assert response.status_code in (200, 201), (
            f"fixture setup failed to seed a stock record: {response.status_code} "
            f"{response.text}"
        )
        listing_context["records"].append(
            {"sku": sku, "location": listing_context["location"], "quantity": quantity}
        )


@given("a location with no stock records")
def _no_records(listing_context, db_session):
    row = db_session.execute(
        text("SELECT 1 FROM stock_records WHERE location = :location"),
        {"location": listing_context["location"]},
    ).first()
    assert row is None, "test fixture collision: location already has stock records"


@when("the home screen listing is requested for that location through the api boundary")
def _request_listing(listing_context, client):
    listing_context["response"] = client.get(
        "/api/stock-records", params={"location": listing_context["location"]}
    )


@then("the response contains one JSON row per filed (sku, location) record")
def _assert_row_count(listing_context):
    response = listing_context["response"]
    assert response.status_code == 200, (
        f"expected a 200 listing response, got {response.status_code} {response.text}"
    )
    body = response.json()
    assert isinstance(body, list), f"expected a JSON array, got {type(body)}"
    assert len(body) == len(listing_context["records"]), (
        f"expected one row per filed (sku, location) record "
        f"({len(listing_context['records'])}), got {len(body)}"
    )


@then("each row shows its sku, location, and quantity")
def _assert_row_fields(listing_context):
    body = listing_context["response"].json()
    seeded = {
        (r["sku"], r["location"], r["quantity"]) for r in listing_context["records"]
    }
    returned = {(row["sku"], row["location"], row["quantity"]) for row in body}
    assert returned == seeded, (
        f"expected each seeded (sku, location, quantity) to appear in the "
        f"listing; seeded={seeded} returned={returned}"
    )


@then("the response is a 2xx empty collection")
def _assert_empty_collection(listing_context):
    response = listing_context["response"]
    assert 200 <= response.status_code < 300, (
        f"expected a 2xx empty-collection response, got {response.status_code} "
        f"{response.text}"
    )
    body = response.json()
    assert body == [], f"expected an empty JSON collection, got {body}"
