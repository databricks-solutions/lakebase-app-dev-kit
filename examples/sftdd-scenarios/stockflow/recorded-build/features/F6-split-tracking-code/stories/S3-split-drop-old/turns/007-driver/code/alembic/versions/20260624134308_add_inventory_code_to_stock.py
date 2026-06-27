"""add_inventory_code_to_stock

Revision ID: 20260624134308
Revises: 20260624131321
Create Date: 2026-06-15 09:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260624134308'
down_revision: Union[str, None] = '20260624131321'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock",
        sa.Column("inventory_code", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stock", "inventory_code")
