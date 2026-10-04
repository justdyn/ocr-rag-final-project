"""Add llm_config table for runtime LLM settings override (Phase A).

Revision ID: 007_llm_config
Revises: 006_spj_draft
Create Date: 2026-09-30

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_llm_config"
down_revision: Union[str, Sequence[str], None] = "006_spj_draft"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_config",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("llm_api_key", sa.Text(), nullable=True),
        sa.Column("llm_base_url", sa.String(length=512), nullable=True),
        sa.Column("llm_model", sa.String(length=128), nullable=True),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Single-row table: id is fixed "default"
    op.execute("INSERT INTO llm_config (id, llm_api_key, llm_base_url, llm_model, updated_at) VALUES ('default', NULL, NULL, NULL, 0)")


def downgrade() -> None:
    op.drop_table("llm_config")