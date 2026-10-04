"""Runtime LLM settings resolver (Phase A).

Priority: DB override (llm_config table) > environment variables (Settings).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.llm_config import LlmConfig

if TYPE_CHECKING:
    pass


@dataclass(frozen=True)
class ResolvedLLMSettings:
    api_key: str | None
    base_url: str
    model: str
    timeout_seconds: float
    source: str  # "db" | "env"

    def to_dict(self) -> dict[str, str | None]:
        return {
            "api_key": self.api_key,
            "base_url": self.base_url,
            "model": self.model,
            "timeout_seconds": str(self.timeout_seconds),
            "source": self.source,
        }


async def resolve_llm_settings(db: AsyncSession) -> ResolvedLLMSettings:
    """Return effective LLM settings: DB override if present, else env defaults.

    - api_key: DB value if non-empty, else env (may be None/empty)
    - base_url: DB value if non-empty, else env
    - model: DB value if non-empty, else env
    - timeout_seconds: always from env (no DB override)
    """
    settings = get_settings()
    result = await db.execute(select(LlmConfig).where(LlmConfig.id == "default"))
    row = result.scalar_one_or_none()

    if row is not None:
        api_key = row.llm_api_key if row.llm_api_key else (settings.llm_api_key or None)
        base_url = row.llm_base_url if row.llm_base_url else settings.llm_base_url
        model = row.llm_model if row.llm_model else settings.llm_model
        source = "db" if (row.llm_api_key or row.llm_base_url or row.llm_model) else "env"
    else:
        api_key = settings.llm_api_key
        base_url = settings.llm_base_url
        model = settings.llm_model
        source = "env"

    return ResolvedLLMSettings(
        api_key=api_key,
        base_url=base_url.rstrip("/"),
        model=model,
        timeout_seconds=settings.llm_timeout_seconds,
        source=source,
    )


async def update_llm_config(
    db: AsyncSession,
    *,
    api_key: str | None,
    base_url: str | None,
    model: str | None,
) -> LlmConfig:
    """Update the single-row llm_config.

    Field semantics:
    - None (field omitted) → leave existing DB value unchanged
    - "" (empty/whitespace string) → clear that field to NULL
    - non-empty string → set override
    Applies to api_key, base_url, and model.
    """
    result = await db.execute(select(LlmConfig).where(LlmConfig.id == "default"))
    row = result.scalar_one_or_none()
    if row is None:
        row = LlmConfig(id="default", llm_api_key=None, llm_base_url=None, llm_model=None, updated_at=0)
        db.add(row)

    # None = omit/unchanged; "" = clear to NULL; non-empty = set override
    if api_key is not None:
        row.llm_api_key = api_key.strip() if api_key.strip() else None
    if base_url is not None:
        row.llm_base_url = base_url.strip() if base_url.strip() else None
    if model is not None:
        row.llm_model = model.strip() if model.strip() else None
    row.updated_at = int(time.time())

    await db.commit()
    await db.refresh(row)
    return row


async def get_llm_config_row(db: AsyncSession) -> LlmConfig | None:
    """Fetch the single config row (for admin GET)."""
    result = await db.execute(select(LlmConfig).where(LlmConfig.id == "default"))
    return result.scalar_one_or_none()