"""User memory table (P0 stub, architecture §4.1).

Revision ID: 003_user_memory
Revises: 002_message_attachments
Create Date: 2026-09-11

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_user_memory"
down_revision: Union[str, Sequence[str], None] = "002_message_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_memory",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("importance", sa.Float(), nullable=False),
        sa.Column("source_conversation_id", sa.String(length=36), nullable=True),
        sa.Column("source_message_id", sa.String(length=36), nullable=True),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_conversation_id"], ["conversation.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["source_message_id"], ["message.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_memory_user_id_status", "user_memory", ["user_id", "status"]
    )
    op.create_index(
        "ix_user_memory_user_id_updated_at", "user_memory", ["user_id", "updated_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_user_memory_user_id_updated_at", table_name="user_memory")
    op.drop_index("ix_user_memory_user_id_status", table_name="user_memory")
    op.drop_table("user_memory")
