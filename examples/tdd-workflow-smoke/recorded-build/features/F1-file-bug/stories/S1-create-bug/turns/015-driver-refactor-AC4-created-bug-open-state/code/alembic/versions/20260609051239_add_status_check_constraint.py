"""add_status_check_constraint

Revision ID: 20260609051239
Revises: 20260609050227
Create Date: 2026-06-09 00:12:40.307241
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260609051239'
down_revision: Union[str, None] = '20260609050227'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_RECOGNIZED_STATUSES = ("open",)
_CONSTRAINT_NAME = "bugs_status_recognized"


def upgrade() -> None:
    status_list = ", ".join(f"'{s}'" for s in _RECOGNIZED_STATUSES)
    op.execute(
        f"ALTER TABLE bugs ADD CONSTRAINT {_CONSTRAINT_NAME} "
        f"CHECK (status IN ({status_list}))"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE bugs DROP CONSTRAINT IF EXISTS {_CONSTRAINT_NAME}")
