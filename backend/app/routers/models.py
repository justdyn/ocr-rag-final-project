"""Authenticated generalist model catalog — proxy of upstream ``/models``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import get_settings
from app.dependencies.auth import CurrentUser
from app.schemas.models import ModelListItem, ModelsListResponse
from app.services.llm.base import LLMConfigError, LLMProviderError
from app.services.llm.models_catalog import list_models

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=ModelsListResponse)
async def get_models(
    _current_user: CurrentUser,
    q: Annotated[str | None, Query(max_length=200)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ModelsListResponse:
    """List chat-capable models available via the server ``LLM_*`` credentials."""
    try:
        page = await list_models(q=q, offset=offset, limit=limit)
    except LLMConfigError as exc:
        raise HTTPException(status_code=503, detail=exc.message) from exc
    except LLMProviderError as exc:
        status = exc.status_code if exc.status_code and exc.status_code >= 400 else 502
        raise HTTPException(status_code=status, detail=exc.message) from exc

    settings = get_settings()
    return ModelsListResponse(
        items=[ModelListItem(id=i["id"], name=i["name"]) for i in page.items],
        next_offset=page.next_offset,
        has_more=page.has_more,
        default_model=settings.llm_model,
    )
