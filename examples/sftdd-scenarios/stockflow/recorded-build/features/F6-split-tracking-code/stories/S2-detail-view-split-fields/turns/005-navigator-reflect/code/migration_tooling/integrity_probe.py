"""Read-only integrity probe for the split migration (AC5).

Run for review BEFORE the split migration's up() has necessarily executed
(architecture.md: "a separate diagnostic query run for review, decoupled
from the mutating migration"): it parses the pre-split `inventory_code`
column directly, using the same conforming rule as the migration's backfill
(exactly 3 non-empty '-'-delimited segments), and reports how many of the
given rows would NOT parse. Read-only; it never writes.
"""

from sqlalchemy import text

# A row conforms when inventory_code splits on '-' into exactly 3 non-empty
# segments (location-batch-serial); this must mirror the split migration's
# own backfill predicate exactly.
_NONCONFORMING_PREDICATE = """
    (
        cardinality(string_to_array(inventory_code, '-')) <> 3
        OR (string_to_array(inventory_code, '-'))[1] = ''
        OR (string_to_array(inventory_code, '-'))[2] = ''
        OR (string_to_array(inventory_code, '-'))[3] = ''
    )
"""


def count_nonconforming_inventory_codes(db_session, skus: list[str]) -> int:
    """Count rows among `skus` whose inventory_code does not conform to
    location-batch-serial (i.e. the split migration's backfill would leave
    batch_number/serial_number NULL for that row)."""
    if not skus:
        return 0
    result = db_session.execute(
        text(
            "SELECT COUNT(*) FROM stock_records "
            f"WHERE sku = ANY(:skus) AND {_NONCONFORMING_PREDICATE}"
        ),
        {"skus": list(skus)},
    ).scalar_one()
    db_session.rollback()
    return int(result)
