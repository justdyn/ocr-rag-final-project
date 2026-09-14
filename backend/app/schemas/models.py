"""Pydantic schemas for the generalist model catalog (PRD model selector)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ModelListItem(BaseModel):
    id: str
    name: str


class ModelsListResponse(BaseModel):
    items: list[ModelListItem]
    next_offset: int | None = None
    has_more: bool = False
    default_model: str
