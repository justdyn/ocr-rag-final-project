"""Conversation title source + generated_at for LLM titles.

Revision ID: 004_conversation_title_meta
Revises: 003_user_memory
Create Date: 2026-09-12

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_conversation_title_meta"
down_revision: Union[str, Sequence[str], None] = "003_user_memory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("conversation", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "title_source",
                sa.String(length=16),
                nullable=False,
                server_default="auto",
                comment="auto = system may overwrite; manual = user rename lock",
            )
        )
        batch_op.add_column(
            sa.Column(
                "title_generated_at",
                sa.BigInteger(),
                nullable=True,
                comment="Epoch seconds when LLM title was persisted; NULL if never",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("conversation", schema=None) as batch_op:
        batch_op.drop_column("title_generated_at")
        batch_op.drop_column("title_source")
