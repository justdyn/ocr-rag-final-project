"""Synchronous hybrid / vector-only retrieval endpoint (PRD §6) — no SSE."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.query import QueryRequest, QueryResponse
from app.services.retrieval.query import QueryServiceError, run_query

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query_documents(
    body: QueryRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QueryResponse:
    """Non-streaming retrieval for evaluation, Remix loaders, and debugging.

    ``mode=hybrid`` (default) runs BM25 + dense, fused with weighted RRF (c=60); RRF order is final.
    Cosine / ``rerank_score`` is diagnostic only (do not re-sort by cosine).
    ``mode=vector_only`` skips sparse/RRF — evaluation toggle only, not a chat UI setting.
    """
    try:
        return await run_query(
            db,
            user_id=current_user.id,
            scope_type=body.scope_type,
            scope_id=body.scope_id,
            query=body.query,
            k=body.k,
            mode=body.mode,
        )
    except QueryServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
