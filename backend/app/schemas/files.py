"""Pydantic schemas for file upload / status endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FileResponse(BaseModel):
    id: str
    filename: str
    status: str
    extraction_method: str | None = None
    ocr_confidence: float | None = None
    hash: str | None = None
    meta: dict[str, Any] | None = None
    created_at: int
    updated_at: int

    model_config = {"from_attributes": True}


class FileListResponse(BaseModel):
    items: list[FileResponse]
    page: int
    limit: int
    total: int
    has_more: bool


class FileFieldsResponse(BaseModel):
    id: str
    status: str
    fields: dict[str, Any] | None = None
    document_total_computed: int | None = None


class FileStatusResponse(BaseModel):
    id: str
    status: str
    extraction_method: str | None = None
    error: str | None = Field(
        default=None,
        description="Machine-readable failure code from file.meta.error when status=failed",
    )
