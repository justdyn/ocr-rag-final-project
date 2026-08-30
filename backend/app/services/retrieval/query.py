"""Hybrid / vector-only retrieval orchestration (PRD §3.3).

Flow:
1. Authorize scope (file or knowledge owned by current user).
2. Resolve member file_ids (KB → knowledge_file union).
3. Embed query once.
4. Dense search: union-query per-file Chroma collections → vector rank list.
5. If mode=hybrid: BM25 get-or-build cache → sparse rank list → weighted RRF;
   final order follows RRF (cosine similarity is computed and returned as
   ``rerank_score`` for evaluation, but does not reorder — a cosine re-sort
   would erase fusion on near-swap ties). Cross-encoder deferred (PRD §8).
6. If mode=vector_only: rank by cosine similarity (evaluation baseline).
7. Return top-k with rrf_score / rerank_score / extraction_method.
"""

from __future__ import annotations

import math
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.document_chunk import DocumentChunk
from app.models.file import File
from app.models.knowledge import Knowledge
from app.schemas.query import QueryChunkResult, QueryResponse
from app.services.chroma_store import query_file_collections
from app.services.embeddings import embed_texts
from app.services.retrieval.bm25_cache import (
    bm25_rank,
    get_or_build_bm25,
    resolve_file_ids_for_scope,
)
from app.services.retrieval.rrf import weighted_rrf

ScopeType = Literal["file", "knowledge"]
QueryMode = Literal["hybrid", "vector_only"]


class QueryServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


async def _authorize_scope(
    db: AsyncSession,
    *,
    user_id: str,
    scope_type: ScopeType,
    scope_id: str,
) -> None:
    if scope_type == "file":
        row = await db.scalar(
            select(File.id).where(File.id == scope_id, File.user_id == user_id)
        )
        if row is None:
            raise QueryServiceError("not_found", "File not found", 404)
        return

    row = await db.scalar(
        select(Knowledge.id).where(
            Knowledge.id == scope_id, Knowledge.user_id == user_id
        )
    )
    if row is None:
        raise QueryServiceError("not_found", "Knowledge base not found", 404)


async def _chunk_maps(
    db: AsyncSession, file_ids: list[str]
) -> tuple[dict[str, DocumentChunk], dict[str, str]]:
    """Return (by_id, chroma_id → chunk_id)."""
    if not file_ids:
        return {}, {}
    chunks = list(
        (
            await db.scalars(
                select(DocumentChunk).where(DocumentChunk.file_id.in_(file_ids))
            )
        ).all()
    )
    by_id = {c.id: c for c in chunks}
    chroma_to_id = {c.chroma_id: c.id for c in chunks}
    return by_id, chroma_to_id


async def run_query(
    db: AsyncSession,
    *,
    user_id: str,
    scope_type: ScopeType,
    scope_id: str,
    query: str,
    k: int = 5,
    mode: QueryMode = "hybrid",
) -> QueryResponse:
    settings = get_settings()
    await _authorize_scope(
        db, user_id=user_id, scope_type=scope_type, scope_id=scope_id
    )

    file_ids = await resolve_file_ids_for_scope(
        db, scope_type=scope_type, scope_id=scope_id
    )
    if not file_ids:
        return QueryResponse(
            scope_type=scope_type,
            scope_id=scope_id,
            query=query,
            mode=mode,
            k=k,
            results=[],
        )

    by_id, chroma_to_id = await _chunk_maps(db, file_ids)
    if not by_id:
        return QueryResponse(
            scope_type=scope_type,
            scope_id=scope_id,
            query=query,
            mode=mode,
            k=k,
            results=[],
        )

    # Candidate pool larger than k so fusion/rerank have headroom
    pool = max(k * 4, 20)

    query_embedding = embed_texts([query])[0]
    vector_hits = query_file_collections(
        file_ids=file_ids,
        query_embedding=query_embedding,
        n_results=pool,
    )
    vector_ranked: list[str] = []
    for hit in vector_hits:
        chunk_id = chroma_to_id.get(hit["chroma_id"])
        if chunk_id and chunk_id not in vector_ranked:
            vector_ranked.append(chunk_id)

    rrf_scores: dict[str, float] = {}
    candidate_ids: list[str]

    if mode == "vector_only":
        candidate_ids = vector_ranked
    else:
        entry = await get_or_build_bm25(
            db,
            scope_type=scope_type,
            scope_id=scope_id,
            file_ids=file_ids,
        )
        bm25_ranked: list[str] = []
        if entry is not None:
            bm25_ranked = bm25_rank(entry, query, top_n=pool)

        fused = weighted_rrf(
            [bm25_ranked, vector_ranked],
            [settings.bm25_weight, settings.vector_weight],
            c=settings.rrf_constant,
        )
        rrf_scores = {doc_id: score for doc_id, score in fused}
        candidate_ids = [doc_id for doc_id, _ in fused]

    # Attach cosine (MVP rerank score) for reporting. Hybrid keeps RRF order so
    # tied fused scores (common on near-swaps) are not collapsed back to pure
    # vector order by a cosine tiebreak. vector_only ranks by cosine.
    window_n = max(k * 2, 10)
    window_ids = [cid for cid in candidate_ids if cid in by_id][:window_n]
    candidates = [by_id[cid] for cid in window_ids]
    if not candidates:
        return QueryResponse(
            scope_type=scope_type,
            scope_id=scope_id,
            query=query,
            mode=mode,
            k=k,
            results=[],
        )

    candidate_embeddings = embed_texts([c.text for c in candidates])
    cosines = [
        _cosine(query_embedding, emb)
        for emb in candidate_embeddings
    ]

    if mode == "hybrid":
        ordered = list(
            zip(candidates, cosines, [rrf_scores.get(c.id) for c in candidates], strict=True)
        )
        # Already in RRF order from candidate_ids — do not re-sort by cosine
    else:
        ordered = sorted(
            zip(candidates, cosines, [None] * len(candidates), strict=True),
            key=lambda row: row[1],
            reverse=True,
        )

    top = ordered[:k]

    results = [
        QueryChunkResult(
            chunk_id=chunk.id,
            file_id=chunk.file_id,
            text=chunk.text,
            rrf_score=round(rrf, 6) if rrf is not None else None,
            rerank_score=round(cosine, 6),
            extraction_method=chunk.extraction_method,
            rank=rank,
        )
        for rank, (chunk, cosine, rrf) in enumerate(top, start=1)
    ]

    return QueryResponse(
        scope_type=scope_type,
        scope_id=scope_id,
        query=query,
        mode=mode,
        k=k,
        results=results,
    )
