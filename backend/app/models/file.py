"""Uploaded document metadata, extraction provenance, and extracted payload (PRD §3.2 / §5)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.document_chunk import DocumentChunk
    from app.models.knowledge import KnowledgeFile
    from app.models.user import User


class File(Base):
    __tablename__ = "file"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)  # local blob path
    hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    # pending | processing | ready | failed — pollable via /api/files/{id}/status
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    # text_layer | ocr:tesseract | ocr:cloud (PRD §3.2)
    extraction_method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Descriptive meta: page count, MIME, size, etc.
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Extracted content payload (text / structured extract)
    data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    user: Mapped[User] = relationship(back_populates="files")
    chunks: Mapped[list[DocumentChunk]] = relationship(
        back_populates="file", cascade="all, delete-orphan"
    )
    knowledge_links: Mapped[list[KnowledgeFile]] = relationship(
        back_populates="file", cascade="all, delete-orphan"
    )
