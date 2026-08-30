"""Initial schema: user, auth, file, knowledge, knowledge_file, document_chunk, conversation, message.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-08-21

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("profile_image_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.Column("last_active_at", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_email"), ["email"], unique=True)

    op.create_table(
        "auth",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("auth", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_auth_email"), ["email"], unique=True)

    op.create_table(
        "file",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("path", sa.Text(), nullable=True),
        sa.Column("hash", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("extraction_method", sa.String(length=64), nullable=True),
        sa.Column("ocr_confidence", sa.Float(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("file", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_file_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_file_user_id"), ["user_id"], unique=False)

    op.create_table(
        "knowledge",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("knowledge", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_knowledge_user_id"), ["user_id"], unique=False)

    op.create_table(
        "conversation",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("knowledge_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["knowledge_id"], ["knowledge.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("conversation", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_conversation_knowledge_id"), ["knowledge_id"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_conversation_user_id"), ["user_id"], unique=False)

    op.create_table(
        "document_chunk",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("chroma_collection", sa.String(length=255), nullable=False),
        sa.Column("chroma_id", sa.String(length=255), nullable=False),
        sa.Column("extraction_method", sa.String(length=64), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["file.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id", "chunk_index", name="uq_document_chunk_file_index"),
    )
    with op.batch_alter_table("document_chunk", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_document_chunk_file_id"), ["file_id"], unique=False)

    op.create_table(
        "knowledge_file",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("knowledge_id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["file.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["knowledge_id"], ["knowledge.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("knowledge_id", "file_id", name="uq_knowledge_file"),
    )
    with op.batch_alter_table("knowledge_file", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_knowledge_file_file_id"), ["file_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_knowledge_file_knowledge_id"), ["knowledge_id"], unique=False
        )

    op.create_table(
        "message",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversation.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("message", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_message_conversation_id"), ["conversation_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("message", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_message_conversation_id"))
    op.drop_table("message")

    with op.batch_alter_table("knowledge_file", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_knowledge_file_knowledge_id"))
        batch_op.drop_index(batch_op.f("ix_knowledge_file_file_id"))
    op.drop_table("knowledge_file")

    with op.batch_alter_table("document_chunk", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_document_chunk_file_id"))
    op.drop_table("document_chunk")

    with op.batch_alter_table("conversation", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conversation_user_id"))
        batch_op.drop_index(batch_op.f("ix_conversation_knowledge_id"))
    op.drop_table("conversation")

    with op.batch_alter_table("knowledge", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_knowledge_user_id"))
    op.drop_table("knowledge")

    with op.batch_alter_table("file", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_file_user_id"))
        batch_op.drop_index(batch_op.f("ix_file_status"))
    op.drop_table("file")

    with op.batch_alter_table("auth", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_auth_email"))
    op.drop_table("auth")

    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_email"))
    op.drop_table("user")
