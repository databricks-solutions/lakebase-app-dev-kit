"""add_actor_column_to_stock

Revision ID: 20260624131321
Revises: 20260624124618
Create Date: 2026-06-15 09:15:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260624131321'
down_revision: Union[str, None] = '20260624124618'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock",
        sa.Column(
            "actor",
            sa.String(length=255),
            nullable=False,
            server_default="system",
        ),
    )


def downgrade() -> None:
    op.drop_column("stock", "actor")
