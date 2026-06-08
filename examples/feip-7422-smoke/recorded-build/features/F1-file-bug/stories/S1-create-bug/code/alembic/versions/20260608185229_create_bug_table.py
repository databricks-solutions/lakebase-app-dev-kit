"""create_bug_table

Revision ID: 20260608185229
Revises: 
Create Date: 2026-06-08 13:52:30.066399
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260608185229'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bug",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), server_default="open", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('open', 'in_progress', 'closed')",
            name="ck_bug_status_valid",
        ),
    )


def downgrade() -> None:
    op.drop_table("bug")
