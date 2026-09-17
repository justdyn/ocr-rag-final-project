"""SPJ accountability draft: one JSON fields snapshot per knowledge base (Phase B2)."""

from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SpjDraft(Base):
    __tablename__ = "spj_draft"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    knowledge_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("knowledge.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fields: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
