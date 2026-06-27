"""add_batch_number_serial_number_to_stock

Revision ID: 20260624142037
Revises: 20260624134308
Create Date: 2026-06-15 09:45:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260624142037'
down_revision: Union[str, None] = '20260624134308'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stock", sa.Column("batch_number", sa.String(255), nullable=True))
    op.add_column("stock", sa.Column("serial_number", sa.String(255), nullable=True))

    op.execute(
        """
        UPDATE stock
           SET batch_number  = NULLIF(split_part(inventory_code, '-', 2), ''),
               serial_number = NULLIF(split_part(inventory_code, '-', 3), '')
         WHERE inventory_code IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("stock", "serial_number")
    op.drop_column("stock", "batch_number")
