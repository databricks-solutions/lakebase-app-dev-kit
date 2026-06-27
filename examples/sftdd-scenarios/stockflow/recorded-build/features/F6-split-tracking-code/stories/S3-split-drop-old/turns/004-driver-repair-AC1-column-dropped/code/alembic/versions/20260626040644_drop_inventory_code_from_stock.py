"""drop_inventory_code_from_stock

Revision ID: 20260626040644
Revises: 20260624142037
Create Date: 2026-06-15 10:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260626040644'
down_revision: Union[str, None] = '20260624142037'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # S3: the inventory_code column is superseded by batch_number / serial_number.
    op.drop_column("stock", "inventory_code")


def downgrade() -> None:
    # Re-add inventory_code and reconstruct it from the split columns so the
    # migration is reversible. NULL segments collapse to an empty segment
    # (e.g. batch NULL -> 'LOC--S001', serial NULL -> 'LOC-B7-').
    op.add_column("stock", sa.Column("inventory_code", sa.String(255), nullable=True))
    op.execute(
        """
        UPDATE stock
           SET inventory_code = concat_ws(
                   '-',
                   coalesce(tracking_code, ''),
                   coalesce(batch_number, ''),
                   coalesce(serial_number, '')
               )
        """
    )
