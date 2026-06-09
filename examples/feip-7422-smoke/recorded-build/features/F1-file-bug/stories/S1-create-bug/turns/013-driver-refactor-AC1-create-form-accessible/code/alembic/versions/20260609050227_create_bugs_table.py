"""create_bugs_table

Revision ID: 20260609050227
Revises:
Create Date: 2026-06-09 00:02:28.112731
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260609050227'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bugs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="open"),
    )


def downgrade() -> None:
    op.drop_table("bugs")
