"""add stock records audit fields

Revision ID: 20260711203907
Revises: 20260711203524
Create Date: 2026-07-11 15:39:07.309614
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260711203907'
down_revision: Union[str, None] = '20260711203524'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stock_records",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.add_column(
        "stock_records",
        sa.Column(
            "actor",
            sa.String(length=255),
            nullable=False,
            server_default="system",
        ),
    )


def downgrade() -> None:
    op.drop_column("stock_records", "actor")
    op.drop_column("stock_records", "created_at")
