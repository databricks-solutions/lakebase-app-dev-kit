"""Step definitions for S3-sku-detail.feature (T18/AC1, T21/AC2, T23/AC3).

Real-branch integration: exercises the SPA -> JSON api boundary
(app/routes/) -> service (app/services/) -> repository (app/repositories/)
-> stock_records read path against the paired Lakebase branch. Never mocked
(NFR-F1-real-branch-tests).

Superseded by F6-split-tracking-code/S1-split-schema-migration/AC4: the
combined inventory_code field is gone (split into batch_number/
serial_number); the tracking-code scenario now asserts on the split fields
carried through the detail entries.
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S3-sku-detail.feature")


@pytest.fixture()
def detail_context():
    return {
        "sku": f"SKU-{uuid.uuid4().hex[:8]}",
        "records": [],
    }


@pytest.fixture(autouse=True)
def _cleanup(detail_context, db_session):
    yield
    db_session.rollback()
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": detail_context["sku"]},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()


def _seed(detail_context, client, location, quantity, batch_number, serial_number):
    response = client.post(
        "/api/stock-records",
        json={
            "sku": detail_context["sku"],
            "location": location,
            "quantity": quantity,
            "batch_number": batch_number,
            "serial_number": serial_number,
        },
    )
    assert response.status_code in (200, 201), (
        f"fixture setup failed to seed a stock record: {response.status_code} "
        f"{response.text}"
    )
    detail_context["records"].append(
        {
            "location": location,
            "quantity": quantity,
            "batch_number": batch_number,
            "serial_number": serial_number,
        }
    )


@given("a SKU seeded with stock at two different locations")
def _seed_two_locations(detail_context, client):
    for location, quantity, batch_number, serial_number in (
        (f"LOC-{uuid.uuid4().hex[:8]}", 5, "B-A", "S-A"),
        (f"LOC-{uuid.uuid4().hex[:8]}", 12, "B-B", "S-B"),
    ):
        _seed(detail_context, client, location, quantity, batch_number, serial_number)


@given("a SKU seeded with stock whose par level is not tracked")
def _seed_untracked_par_level(detail_context, client):
    _seed(detail_context, client, f"LOC-{uuid.uuid4().hex[:8]}", 7, "B-C", "S-C")


@when("the SKU detail view is requested for that SKU through the api boundary")
def _request_detail(detail_context, client):
    detail_context["response"] = client.get(
        f"/api/stock-records/{detail_context['sku']}/detail"
    )


@then("the response contains one JSON entry per location holding only that SKU's records")
def _assert_entry_count(detail_context):
    response = detail_context["response"]
    assert response.status_code == 200, (
        f"expected a 200 detail response, got {response.status_code} {response.text}"
    )
    body = response.json()
    entries = body["entries"]
    assert len(entries) == len(detail_context["records"]), (
        f"expected one entry per seeded location ({len(detail_context['records'])}), "
        f"got {len(entries)}"
    )


@then("each entry shows its location and quantity")
def _assert_entry_fields(detail_context):
    entries = detail_context["response"].json()["entries"]
    seeded = {(r["location"], r["quantity"]) for r in detail_context["records"]}
    returned = {(e["location"], e["quantity"]) for e in entries}
    assert returned == seeded, (
        f"expected each seeded (location, quantity) to appear in the detail "
        f"entries; seeded={seeded} returned={returned}"
    )


@then("each entry displays the combined inventory_code recorded for that location's stock record")
def _assert_entry_inventory_code(detail_context):
    entries = detail_context["response"].json()["entries"]
    seeded = {
        (r["location"], r["batch_number"], r["serial_number"])
        for r in detail_context["records"]
    }
    returned = {(e["location"], e["batch_number"], e["serial_number"]) for e in entries}
    assert returned == seeded, (
        f"expected each seeded (location, batch_number, serial_number) to "
        f"appear in the detail entries; seeded={seeded} returned={returned}"
    )


@then("the response is a 2xx response")
def _assert_2xx(detail_context):
    response = detail_context["response"]
    assert 200 <= response.status_code < 300, (
        f"expected a 2xx detail response, got {response.status_code} {response.text}"
    )


@then("the par level field is serialized as null or absent")
def _assert_par_level_null_or_absent(detail_context):
    body = detail_context["response"].json()
    assert body.get("par_level") is None, (
        f"expected the par_level field to be null/absent, got "
        f"{body.get('par_level')!r}"
    )
