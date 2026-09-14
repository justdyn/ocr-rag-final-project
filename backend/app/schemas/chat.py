"""Pydantic schemas for RAG chat completions (PRD §3.4 / §6)."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ScopeType = Literal["file", "knowledge"]

_MODEL_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-/:]*$")


def normalize_model_id(value: str | None) -> str | None:
    """Return a sanitized model id or None when empty/invalid."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > 128 or not _MODEL_ID_RE.match(cleaned):
        raise ValueError("Invalid model id")
    return cleaned


class ChatCompletionRequest(BaseModel):
    scope_type: ScopeType
    scope_id: str = Field(min_length=1, max_length=36)
    query: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = Field(default=None, max_length=36)
    # Optional per-message attachment record: file ids uploaded by the same user,
    # resolved into a snapshot on the persisted user message (untrusted → filtered).
    attachment_file_ids: list[str] | None = Field(default=None, max_length=12)
    stream: bool = True
    k: int | None = Field(
        default=None,
        ge=1,
        le=50,
        description="Retrieval top-k; defaults to CHAT_RETRIEVAL_K",
    )
    # Optional generalist model override (generation layer only).
    model: str | None = Field(default=None, max_length=128)

    @field_validator("model")
    @classmethod
    def _validate_model(cls, value: str | None) -> str | None:
        return normalize_model_id(value)



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
    title_source: str = "auto"
    title_generated_at: int | None = None
    knowledge_id: str | None = None
    llm_model: str | None = None
    created_at: int
    updated_at: int

    model_config = {"from_attributes": True}


class ConversationUpdate(BaseModel):
    """PATCH /api/conversations/{id} — at least one field required at the router."""

    title: str | None = Field(default=None, max_length=200)
    llm_model: str | None = Field(default=None, max_length=128)

    @field_validator("llm_model")
    @classmethod
    def _validate_llm_model(cls, value: str | None) -> str | None:
        return normalize_model_id(value)


# Backward-compatible alias used by older imports/tests.
ConversationTitleUpdate = ConversationUpdate


class KnowledgeConversationItem(BaseModel):
    """Lightweight KB conversation list row (no message bodies)."""

    id: str
    title: str | None = None
    title_source: str = "auto"
    title_generated_at: int | None = None
    created_at: int
    updated_at: int

    model_config = {"from_attributes": True}


class LastConversationScope(BaseModel):
    """Sidebar hydrate scope: KB of the user's most recent conversation.

    Not the composer scope — that only ever comes from `?knowledge=`.
    """

    knowledge_id: str
    knowledge_name: str


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources: list[dict[str, Any]] | dict[str, Any] | None = None
    # Attachment snapshot for user turns (additive — None for assistant/legacy rows).
    attachments: list[dict[str, Any]] | None = None
    created_at: int

    model_config = {"from_attributes": True}
