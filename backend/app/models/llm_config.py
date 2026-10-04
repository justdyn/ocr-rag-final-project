"""Runtime LLM configuration override (Phase A). Single row, id="default"."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

if TYPE_CHECKING:
    pass


class LlmConfig(Base):
    __tablename__ = "llm_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    llm_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)