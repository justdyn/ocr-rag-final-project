"""User profile — credentials live on `auth` (PRD §5 / Open WebUI split)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.auth import Auth
    from app.models.conversation import Conversation
    from app.models.file import File
    from app.models.knowledge import Knowledge


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")
    profile_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    last_active_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    auth: Mapped[Auth | None] = relationship(back_populates="user", uselist=False)
    files: Mapped[list[File]] = relationship(back_populates="user")
    knowledge_bases: Mapped[list[Knowledge]] = relationship(back_populates="user")
    conversations: Mapped[list[Conversation]] = relationship(back_populates="user")
