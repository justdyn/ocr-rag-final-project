"""Normalized chunk rows for BM25 caching and citation auditability (PRD §3.3 / §5)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.file import File


class DocumentChunk(Base):
    __tablename__ = "document_chunk"
    __table_args__ = (
        UniqueConstraint("file_id", "chunk_index", name="uq_document_chunk_file_index"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Primary ownership is per-file; knowledge membership is via knowledge_file
    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Chroma collection name, typically `file-{file_id}`
    chroma_collection: Mapped[str] = mapped_column(String(255), nullable=False)
    chroma_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # Denormalized from file for evaluation splits (PRD §3.2)
    extraction_method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    file: Mapped[File] = relationship(back_populates="chunks")
