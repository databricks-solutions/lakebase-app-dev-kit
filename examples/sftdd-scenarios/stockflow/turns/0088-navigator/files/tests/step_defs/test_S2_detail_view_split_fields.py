"""Step definitions for S2-detail-view-split-fields.feature
(T11/AC1, T13/AC2, T15/AC3, T17/AC4).

Real-branch integration: exercises the SPA -> JSON api boundary
(app/routes/) -> service (app/services/) -> repository (app/repositories/)
-> stock_records read path against the paired Lakebase branch. Never mocked
(NFR-F6-real-branch-tests).
"""

import uuid

import pytest
from pytest_bdd import given, scenarios, then, when
from sqlalchemy import text

scenarios("../features/S2-detail-view-split-fields.feature")


@pytest.fixture()
def split_detail_context():
    return {
        "sku": f"SKU-{uuid.uuid4().hex[:8]}",
        "seeded_batch_number": None,
        "seeded_serial_number": None,
    }


@pytest.fixture(autouse=True)
def _cleanup(split_detail_context, db_session):
    yield
    db_session.rollback()
    try:
        db_session.execute(
            text("DELETE FROM stock_records WHERE sku = :sku"),
            {"sku": split_detail_context["sku"]},
        )
        db_session.commit()
    except Exception:
        db_session.rollback()


def _seed(split_detail_context, client, location, quantity, batch_number, serial_number):
    response = client.post(
        "/api/stock-records",
        json={
            "sku": split_detail_context["sku"],
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
    split_detail_context["seeded_batch_number"] = batch_number
    split_detail_context["seeded_serial_number"] = serial_number


@given("a SKU seeded with a stock row carrying both a batch_number and a serial_number")
def _seed_both(split_detail_context, client):
    _seed(split_detail_context, client, f"LOC-{uuid.uuid4().hex[:8]}", 6, "B-100", "S-200")


@given("a SKU seeded with a stock row whose batch_number is NULL and serial_number is set")
def _seed_null_batch(split_detail_context, client):
    _seed(split_detail_context, client, f"LOC-{uuid.uuid4().hex[:8]}", 4, None, "S-300")


@given("a SKU seeded with a stock row whose serial_number is NULL and batch_number is set")
def _seed_null_serial(split_detail_context, client):
    _seed(split_detail_context, client, f"LOC-{uuid.uuid4().hex[:8]}", 9, "B-400", None)


@when("the SKU detail view is requested for that SKU through the api boundary")
def _request_detail(split_detail_context, client):
    split_detail_context["response"] = client.get(
        f"/api/stock-records/{split_detail_context['sku']}/detail"
    )


@then("the response's entry shows the seeded batch_number and serial_number as two separate fields")
def _assert_two_distinct_fields(split_detail_context):
    response = split_detail_context["response"]
    assert response.status_code == 200, (
        f"expected a 200 detail response, got {response.status_code} {response.text}"
    )
    entries = response.json()["entries"]
    assert len(entries) == 1, f"expected exactly one seeded entry, got {len(entries)}"
    entry = entries[0]
    assert entry["batch_number"] == split_detail_context["seeded_batch_number"], (
        f"expected batch_number {split_detail_context['seeded_batch_number']!r}, "
        f"got {entry['batch_number']!r}"
    )
    assert entry["serial_number"] == split_detail_context["seeded_serial_number"], (
        f"expected serial_number {split_detail_context['seeded_serial_number']!r}, "
        f"got {entry['serial_number']!r}"
    )
    assert entry["batch_number"] != entry["serial_number"], (
        "expected batch_number and serial_number to be two distinct field values, "
        "not a single merged value"
    )


@then("the response's entry contains no inventory_code key")
def _assert_no_inventory_code_key(split_detail_context):
    entries = split_detail_context["response"].json()["entries"]
    entry = entries[0]
    assert "inventory_code" not in entry, (
        f"expected the retired inventory_code key to be absent from the detail "
        f"entry, got keys {sorted(entry.keys())}"
    )


@then("the response's entry shows batch_number as JSON null and serial_number unaffected")
def _assert_null_batch(split_detail_context):
    entries = split_detail_context["response"].json()["entries"]
    entry = entries[0]
    assert entry["batch_number"] is None, (
        f"expected batch_number to serialize as JSON null, got {entry['batch_number']!r}"
    )
    assert entry["serial_number"] == split_detail_context["seeded_serial_number"], (
        f"expected serial_number to pass through unaffected as "
        f"{split_detail_context['seeded_serial_number']!r}, got {entry['serial_number']!r}"
    )


@then("the response's entry shows serial_number as JSON null and batch_number unaffected")
def _assert_null_serial(split_detail_context):
    entries = split_detail_context["response"].json()["entries"]
    entry = entries[0]
    assert entry["serial_number"] is None, (
        f"expected serial_number to serialize as JSON null, got {entry['serial_number']!r}"
    )
    assert entry["batch_number"] == split_detail_context["seeded_batch_number"], (
        f"expected batch_number to pass through unaffected as "
        f"{split_detail_context['seeded_batch_number']!r}, got {entry['batch_number']!r}"
    )
