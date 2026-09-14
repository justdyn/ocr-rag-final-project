"""Add nullable conversation.llm_model for per-thread generalist selection.

Revision ID: 005_conversation_llm_model
Revises: 004_conversation_title_meta
Create Date: 2026-09-13

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_conversation_llm_model"
down_revision: Union[str, Sequence[str], None] = "004_conversation_title_meta"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("conversation", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "llm_model",
                sa.String(length=128),
                nullable=True,
                comment="Per-conversation generalist model id; null uses LLM_MODEL",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("conversation", schema=None) as batch_op:
        batch_op.drop_column("llm_model")
