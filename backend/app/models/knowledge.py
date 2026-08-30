"""Knowledge base and many-to-many file membership (PRD §3.5 / §5)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.file import File
    from app.models.user import User


class Knowledge(Base):
    __tablename__ = "knowledge"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    user: Mapped[User] = relationship(back_populates="knowledge_bases")
    file_links: Mapped[list[KnowledgeFile]] = relationship(
        back_populates="knowledge", cascade="all, delete-orphan"
    )
    conversations: Mapped[list[Conversation]] = relationship(back_populates="knowledge")


class KnowledgeFile(Base):
    """Junction table — deliberately not a JSON `file_ids` array (PRD §3.5 / §5)."""

    __tablename__ = "knowledge_file"
    __table_args__ = (
        UniqueConstraint("knowledge_id", "file_id", name="uq_knowledge_file"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    knowledge_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    knowledge: Mapped[Knowledge] = relationship(back_populates="file_links")
    file: Mapped[File] = relationship(back_populates="knowledge_links")
