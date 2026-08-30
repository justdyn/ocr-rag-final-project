"""Pydantic schemas for RAG chat completions (PRD §3.4 / §6)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ScopeType = Literal["file", "knowledge"]


class ChatCompletionRequest(BaseModel):
    scope_type: ScopeType
    scope_id: str = Field(min_length=1, max_length=36)
    query: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = Field(default=None, max_length=36)
    stream: bool = True
    k: int | None = Field(
        default=None,
        ge=1,
        le=50,
        description="Retrieval top-k; defaults to CHAT_RETRIEVAL_K",
    )


class ChatSource(BaseModel):
    id: int
    chunk_id: str
    file_id: str
    text: str
    # Additive — join from `file.filename` at chat prepare time (no schema migration).
    filename: str | None = None
    rrf_score: float | None = None
    rerank_score: float | None = None
    extraction_method: str | None = None
    rank: int | None = None


class ChatCompletionResponse(BaseModel):
    """Non-streaming JSON body."""

    conversation_id: str
    message_id: str
    role: Literal["assistant"] = "assistant"
    content: str
    sources: list[ChatSource]


class ConversationSummary(BaseModel):
    id: str
    title: str | None = None
    knowledge_id: str | None = None
    created_at: int
    updated_at: int

    model_config = {"from_attributes": True}


class KnowledgeConversationItem(BaseModel):
    """Lightweight KB conversation list row (no message bodies)."""

    id: str
    title: str | None = None
    created_at: int
    updated_at: int

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources: list[dict[str, Any]] | dict[str, Any] | None = None
    created_at: int

    model_config = {"from_attributes": True}
