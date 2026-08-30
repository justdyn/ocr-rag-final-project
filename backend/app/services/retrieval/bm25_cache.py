"""In-memory BM25 index cache per query scope (PRD §3.3 improvement over rebuild-per-query).

Cache key: ``("file", file_id)`` or ``("knowledge", knowledge_id)``.

Invalidation triggers (call sites documented inline at each call):
1. File added to a knowledge base → ``invalidate_knowledge_scope(kb_id)``
2. File removed from a knowledge base → ``invalidate_knowledge_scope(kb_id)``
3. Knowledge base deleted → ``invalidate_knowledge_scope(kb_id)``
4. File chunks change (ingestion/reprocess completes or clears) →
   ``invalidate_file_scope(file_id)`` + every KB containing that file
5. File deleted → same as (4)

Cold cache: first query after miss/invalidation loads ``document_chunk.text`` for the
scope, builds ``BM25Okapi``, stores it. Warm cache: reuse the stored index + chunk ids.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Literal

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_chunk import DocumentChunk
from app.models.knowledge import KnowledgeFile
from app.services.retrieval.tokenize import tokenize

ScopeKind = Literal["file", "knowledge"]
CacheKey = tuple[ScopeKind, str]


@dataclass(frozen=True)
class Bm25IndexEntry:
    """Cached sparse index + parallel chunk metadata for ranking → id mapping."""

    chunk_ids: list[str]
    file_ids: list[str]
    texts: list[str]
    tokenized_corpus: list[list[str]]
    bm25: BM25Okapi


_lock = threading.Lock()
_cache: dict[CacheKey, Bm25IndexEntry] = {}


def cache_key(scope_type: ScopeKind, scope_id: str) -> CacheKey:
    return (scope_type, scope_id)


def invalidate_file_scope(file_id: str) -> None:
    """Drop the per-file BM25 entry (if any)."""
    with _lock:
        _cache.pop(("file", file_id), None)


def invalidate_knowledge_scope(knowledge_id: str) -> None:
    """Drop the per-knowledge-base BM25 entry (if any)."""
    with _lock:
        _cache.pop(("knowledge", knowledge_id), None)


def clear_all_bm25_cache() -> None:
    """Test helper — wipe the entire process cache."""
    with _lock:
        _cache.clear()


def get_cached(scope_type: ScopeKind, scope_id: str) -> Bm25IndexEntry | None:
    with _lock:
        return _cache.get(cache_key(scope_type, scope_id))


def put_cached(scope_type: ScopeKind, scope_id: str, entry: Bm25IndexEntry) -> None:
    with _lock:
        _cache[cache_key(scope_type, scope_id)] = entry


async def resolve_file_ids_for_scope(
    db: AsyncSession,
    *,
    scope_type: ScopeKind,
    scope_id: str,
) -> list[str]:
    if scope_type == "file":
        return [scope_id]
    rows = await db.scalars(
        select(KnowledgeFile.file_id).where(KnowledgeFile.knowledge_id == scope_id)
    )
    return list(rows.all())


async def load_chunks_for_file_ids(
    db: AsyncSession, file_ids: list[str]
) -> list[DocumentChunk]:
    if not file_ids:
        return []
    result = await db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.file_id.in_(file_ids))
        .order_by(DocumentChunk.file_id, DocumentChunk.chunk_index)
    )
    return list(result.all())


def build_bm25_entry(chunks: list[DocumentChunk]) -> Bm25IndexEntry | None:
    """Build a BM25Okapi entry from chunk rows. Returns None if corpus is empty."""
    if not chunks:
        return None
    texts = [c.text for c in chunks]
    tokenized = [tokenize(t) for t in texts]
    bm25 = BM25Okapi(tokenized)
    return Bm25IndexEntry(
        chunk_ids=[c.id for c in chunks],
        file_ids=[c.file_id for c in chunks],
        texts=texts,
        tokenized_corpus=tokenized,
        bm25=bm25,
    )


async def get_or_build_bm25(
    db: AsyncSession,
    *,
    scope_type: ScopeKind,
    scope_id: str,
    file_ids: list[str] | None = None,
) -> Bm25IndexEntry | None:
    """Return cached BM25 for scope, or build from DB chunks and cache it."""
    cached = get_cached(scope_type, scope_id)
    if cached is not None:
        return cached

    ids = file_ids if file_ids is not None else await resolve_file_ids_for_scope(
        db, scope_type=scope_type, scope_id=scope_id
    )
    chunks = await load_chunks_for_file_ids(db, ids)
    entry = build_bm25_entry(chunks)
    if entry is not None:
        put_cached(scope_type, scope_id, entry)
    return entry


def bm25_rank(
    entry: Bm25IndexEntry,
    query: str,
    *,
    top_n: int,
) -> list[str]:
    """Return chunk_ids ranked by BM25 score (best first). Ties keep corpus order."""
    if top_n <= 0 or not entry.chunk_ids:
        return []
    tokens = tokenize(query)
    if not tokens:
        return []
    scores = entry.bm25.get_scores(tokens)
    ranked = sorted(
        range(len(entry.chunk_ids)),
        key=lambda i: scores[i],
        reverse=True,
    )
    out: list[str] = []
    for i in ranked:
        if scores[i] <= 0:
            break
        out.append(entry.chunk_ids[i])
        if len(out) >= top_n:
            break
    return out
