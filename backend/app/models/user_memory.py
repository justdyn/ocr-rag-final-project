"""User-scoped durable memory facts (architecture §4.1).

P0 stub behind ``USER_MEMORY_ENABLED``: owner CRUD only, no embeddings, no
chat-path injection. Timestamps are Unix ms per §4.1 (other tables use s).
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Float, ForeignKey, Index, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserMemory(Base):
    __tablename__ = "user_memory"
    __table_args__ = (
        Index("ix_user_memory_user_id_status", "user_id", "status"),
        Index("ix_user_memory_user_id_updated_at", "user_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # e.g. preference | identity | workflow | other (architecture §4.1)
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    # 0.0–1.0; manual entries default mid. Scoring itself is P1.
    importance: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    # Provenance; SET NULL so deleting a thread never deletes the fact.
    source_conversation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("conversation.id", ondelete="SET NULL"), nullable=True
    )
    source_message_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("message.id", ondelete="SET NULL"), nullable=True
    )
    # P1+; always null in P0 (no embedding work in this phase).
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    # active | soft_deleted (soft delete only; list excludes soft-deleted)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    expires_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
