"""Pydantic schemas for knowledge-base CRUD and membership."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class KnowledgeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    description: str | None = Field(default=None, max_length=4000)
    meta: dict[str, Any] | None = None


class KnowledgeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=512)
    description: str | None = Field(default=None, max_length=4000)
    meta: dict[str, Any] | None = None


class KnowledgeFileAdd(BaseModel):
    file_id: str = Field(min_length=1, max_length=36)


class KnowledgeFileMember(BaseModel):
    file_id: str
    filename: str
    status: str
    extraction_method: str | None = None
    created_at: int  # membership created_at


class KnowledgeResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    meta: dict[str, Any] | None = None
    created_at: int
    updated_at: int
    file_ids: list[str] = Field(default_factory=list)
    files: list[KnowledgeFileMember] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class KnowledgeListItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    created_at: int
    updated_at: int
    file_count: int = 0

    model_config = {"from_attributes": True}
