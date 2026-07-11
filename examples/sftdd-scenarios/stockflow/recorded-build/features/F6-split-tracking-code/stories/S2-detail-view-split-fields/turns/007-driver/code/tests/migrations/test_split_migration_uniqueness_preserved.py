"""S1-split-schema-migration / T7 / AC4-combined-column-dropped /
PI3-sku-location-unique-preserved: after the split migration, the composite
UNIQUE(sku, location) constraint on stock_records still rejects a duplicate
(sku, location) pair, confirming the column split does not touch the
addressing key (R3). Real-branch integration against the paired branch; no
schema mutation here, so it runs safely on the shared verify database.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests._split_migration_helpers import upgrade_to_head


def _unique_pair():
    return f"SKU-SPLIT-UNIQ-{uuid.uuid4().hex[:8]}", f"LOC-SPLIT-UNIQ-{uuid.uuid4().hex[:8]}"


def test_unique_constraint_survives_the_split_migration(db_session):
    upgrade_to_head(db_session)
    sku, location = _unique_pair()

    try:
        db_session.execute(
            text("INSERT INTO stock_records (sku, location, quantity) VALUES (:sku, :location, 5)"),
            {"sku": sku, "location": location},
        )
        db_session.commit()

        with pytest.raises(IntegrityError):
            db_session.execute(
                text(
                    "INSERT INTO stock_records (sku, location, quantity) "
                    "VALUES (:sku, :location, 9)"
                ),
                {"sku": sku, "location": location},
            )
            db_session.commit()
    finally:
        db_session.rollback()
        try:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
                {"sku": sku, "location": location},
            )
            db_session.commit()
        except Exception:
            db_session.rollback()
