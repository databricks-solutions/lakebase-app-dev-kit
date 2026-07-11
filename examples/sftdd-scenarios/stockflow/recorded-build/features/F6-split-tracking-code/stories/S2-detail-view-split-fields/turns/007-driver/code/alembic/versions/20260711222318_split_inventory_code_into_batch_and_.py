"""split inventory code into batch and serial

Revision ID: 20260711222318
Revises: 20260711203907
Create Date: 2026-07-11 17:23:18.988257

Splits the combined `inventory_code` column on `stock_records` into
first-class `batch_number` / `serial_number` columns (NFR-F6-durability-
migration). A row is "conforming" when its inventory_code splits on '-'
into exactly 3 non-empty segments (location-batch-serial); its second and
third segments backfill batch_number/serial_number. A nonconforming code
(any other shape) leaves both columns NULL rather than being dropped or
erroring (AC2). `location` stays the canonical addressing column throughout
(PI3, R3): it is never derived from the code's leading segment.

Additive rollout (NFR-F6-additive-migration-rollout): the new columns are
added and backfilled BEFORE inventory_code is dropped, so old reads keep
working until the final step. The whole revision runs inside Alembic's one
transactional DDL block, so a mid-migration failure leaves the branch
exactly as it was before the migration ran (PI2/AC3, no half-migrated
state).

down() reverses by reconstructing inventory_code as
`location-batch_number-serial_number` for conforming rows (batch_number and
serial_number both present); nonconforming rows (both NULL) have no
segments to reconstruct, so they fall back to `location` alone (best-
effort; PI1 defines exact round-trip only for conforming rows).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '20260711222318'
down_revision: Union[str, None] = '20260711203907'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stock_records", sa.Column("batch_number", sa.String(length=255), nullable=True))
    op.add_column("stock_records", sa.Column("serial_number", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE stock_records
            SET batch_number = (string_to_array(inventory_code, '-'))[2],
                serial_number = (string_to_array(inventory_code, '-'))[3]
            WHERE cardinality(string_to_array(inventory_code, '-')) = 3
              AND (string_to_array(inventory_code, '-'))[1] <> ''
              AND (string_to_array(inventory_code, '-'))[2] <> ''
              AND (string_to_array(inventory_code, '-'))[3] <> ''
            """
        )
    )

    op.drop_column("stock_records", "inventory_code")


def downgrade() -> None:
    op.add_column("stock_records", sa.Column("inventory_code", sa.String(length=255), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE stock_records
            SET inventory_code = CASE
                WHEN batch_number IS NOT NULL AND serial_number IS NOT NULL
                    THEN location || '-' || batch_number || '-' || serial_number
                ELSE location
            END
            """
        )
    )

    op.alter_column("stock_records", "inventory_code", nullable=False)
    op.drop_column("stock_records", "batch_number")
    op.drop_column("stock_records", "serial_number")
