"""Message attachment snapshot column.

Revision ID: 002_message_attachments
Revises: 001_initial_schema
Create Date: 2026-09-10

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_message_attachments"
down_revision: Union[str, Sequence[str], None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("message", schema=None) as batch_op:
        batch_op.add_column(sa.Column("attachments", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("message", schema=None) as batch_op:
        batch_op.drop_column("attachments")