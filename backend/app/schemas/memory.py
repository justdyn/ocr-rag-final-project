"""Pydantic schemas for the user-memory stub (architecture §4.1 / §8.3)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    """Manual create (tests); extract-based creation is P1."""

    content: str = Field(min_length=1, max_length=2000)
    category: str = Field(default="other", max_length=32)
    importance: float = Field(default=0.5, ge=0.0, le=1.0)


class MemoryUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=2000)
    category: str | None = Field(default=None, max_length=32)
    importance: float | None = Field(default=None, ge=0.0, le=1.0)


class MemoryFact(BaseModel):
    id: str
    content: str
    category: str
    importance: float
    status: str
    source_conversation_id: str | None = None
    source_message_id: str | None = None
    expires_at: int | None = None
    created_at: int
    updated_at: int

    model_config = {"from_attributes": True}
