"""Pydantic schemas for synchronous hybrid / vector-only query (PRD §6)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ScopeType = Literal["file", "knowledge"]
QueryMode = Literal["hybrid", "vector_only"]


class QueryRequest(BaseModel):
    scope_type: ScopeType
    scope_id: str = Field(min_length=1, max_length=36)
    query: str = Field(min_length=1, max_length=4000)
    k: int = Field(default=5, ge=1, le=50)
    mode: QueryMode = "hybrid"


class QueryChunkResult(BaseModel):
    chunk_id: str
    file_id: str
    text: str
    rrf_score: float | None = Field(
        default=None,
        description="Weighted RRF fusion score; null in vector_only mode",
    )
    rerank_score: float = Field(
        description="Cosine similarity after fusion (or after vector ranks in vector_only)"
    )
    extraction_method: str | None = None
    rank: int = Field(ge=1)


class QueryResponse(BaseModel):
    scope_type: ScopeType
    scope_id: str
    query: str
    mode: QueryMode
    k: int
    results: list[QueryChunkResult]
