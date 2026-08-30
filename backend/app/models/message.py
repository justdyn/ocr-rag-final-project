"""Individual chat messages within a conversation (PRD §3.4 / §5)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class Message(Base):
    __tablename__ = "message"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # user | assistant | system
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Structured citation payload for assistant turns (chunk ids, scores, etc.)
    sources: Mapped[list[dict[str, Any]] | dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
