"""Add spj_draft table for SPJ accountability drafts (Phase B2).

Revision ID: 006_spj_draft
Revises: 005_conversation_llm_model
Create Date: 2026-09-16

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_spj_draft"
down_revision: Union[str, Sequence[str], None] = "005_conversation_llm_model"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "spj_draft",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "knowledge_id",
            sa.String(length=36),
            sa.ForeignKey("knowledge.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fields", sa.JSON(), nullable=False),
        sa.Column("confirmed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_spj_draft_user_id", "spj_draft", ["user_id"])
    op.create_index("ix_spj_draft_knowledge_id", "spj_draft", ["knowledge_id"])


def downgrade() -> None:
    op.drop_index("ix_spj_draft_knowledge_id", table_name="spj_draft")
    op.drop_index("ix_spj_draft_user_id", table_name="spj_draft")
    op.drop_table("spj_draft")
