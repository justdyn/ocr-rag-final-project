"""Admin-only endpoints (Phase A)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.dependencies.auth import AdminUser
from app.models.llm_config import LlmConfig
from app.services.llm_config import get_llm_config_row, update_llm_config

router = APIRouter(prefix="/api/admin", tags=["admin"])


class LlmConfigResponse(BaseModel):
    configured: bool
    key_suffix: str | None = None
    base_url: str | None = None
    default_model: str | None = None
    source: str  # "db" | "env"
    updated_at: int | None = None


class LlmConfigUpdateRequest(BaseModel):
    api_key: str | None = Field(default=None, description="Empty string clears override")
    base_url: str | None = Field(default=None)
    model: str | None = Field(default=None)


@router.get("/llm-config", response_model=LlmConfigResponse)
async def get_llm_config(
    _admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LlmConfigResponse:
    """Return runtime LLM config (masked, never plaintext key)."""
    row = await get_llm_config_row(db)
    settings = get_settings()

    if row is not None and (row.llm_api_key or row.llm_base_url or row.llm_model):
        configured = bool(row.llm_api_key)
        key_suffix = row.llm_api_key[-4:] if row.llm_api_key else None
        base_url = row.llm_base_url
        default_model = row.llm_model
        source = "db"
        updated_at = row.updated_at
    else:
        configured = bool(settings.llm_api_key)
        key_suffix = settings.llm_api_key[-4:] if settings.llm_api_key else None
        base_url = settings.llm_base_url
        default_model = settings.llm_model
        source = "env"
        updated_at = None

    return LlmConfigResponse(
        configured=configured,
        key_suffix=key_suffix,
        base_url=base_url,
        default_model=default_model,
        source=source,
        updated_at=updated_at,
    )


@router.put("/llm-config", response_model=LlmConfigResponse)
async def put_llm_config(
    body: LlmConfigUpdateRequest,
    _admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LlmConfigResponse:
    """Update runtime LLM config (admin only). Empty api_key clears override."""
    row = await update_llm_config(
        db,
        api_key=body.api_key,
        base_url=body.base_url,
        model=body.model,
    )
    configured = bool(row.llm_api_key)
    key_suffix = row.llm_api_key[-4:] if row.llm_api_key else None
    return LlmConfigResponse(
        configured=configured,
        key_suffix=key_suffix,
        base_url=row.llm_base_url,
        default_model=row.llm_model,
        source="db",
        updated_at=row.updated_at,
    )