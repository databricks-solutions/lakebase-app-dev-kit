"""AC2-file-new-stock-confirmed / AC3-refile-updates-not-duplicates: real-branch
fitness tests for the stock_records persistence invariants declared in
architecture.json (PI2 not_null, PI3 check quantity >= 0, PI1 unique). Each
test seeds and asserts against ONLY its own (sku, location) rows, never a
whole-table aggregate, so it stays honest once other stories' rows share the
table.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def _unique_pair():
    return f"SKU-PI-{uuid.uuid4().hex[:8]}", f"LOC-PI-{uuid.uuid4().hex[:8]}"


@pytest.fixture()
def _seeded_pairs(db_session):
    seeded: list[tuple[str, str]] = []
    yield seeded
    db_session.rollback()
    try:
        for sku, location in seeded:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
                {"sku": sku, "location": location},
            )
        db_session.commit()
    except Exception:
        db_session.rollback()


# T6 / PI2-required-fields-not-null: inserting a stock_records row with a
# NULL sku, location, quantity, or inventory_code is rejected.
@pytest.mark.parametrize("null_column", ["sku", "location", "quantity", "inventory_code"])
def test_not_null_constraints_reject_null_column(db_session, _seeded_pairs, null_column):
    sku, location = _unique_pair()
    _seeded_pairs.append((sku, location))
    values = {"sku": sku, "location": location, "quantity": 1, "inventory_code": "INV-NN"}
    values[null_column] = None

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, :quantity, :inventory_code)"
            ),
            values,
        )
        db_session.commit()


# T7 / PI3-quantity-non-negative: inserting a negative quantity is rejected by
# the CHECK quantity >= 0 constraint.
def test_quantity_check_constraint_rejects_negative_quantity(db_session, _seeded_pairs):
    sku, location = _unique_pair()
    _seeded_pairs.append((sku, location))

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, -1, 'INV-NEG')"
            ),
            {"sku": sku, "location": location},
        )
        db_session.commit()


# T10 / PI1-sku-location-unique: a second row for a (sku, location) pair that
# already exists raises an IntegrityError from the composite UNIQUE constraint.
def test_unique_constraint_rejects_duplicate_sku_location(db_session, _seeded_pairs):
    sku, location = _unique_pair()
    _seeded_pairs.append((sku, location))

    db_session.execute(
        text(
            "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
            "VALUES (:sku, :location, 5, 'INV-FIRST')"
        ),
        {"sku": sku, "location": location},
    )
    db_session.commit()

    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO stock_records (sku, location, quantity, inventory_code) "
                "VALUES (:sku, :location, 9, 'INV-SECOND')"
            ),
            {"sku": sku, "location": location},
        )
        db_session.commit()
