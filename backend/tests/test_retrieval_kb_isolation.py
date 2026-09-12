"""Self-contained check: KB-scoped retrieval isolation through run_query.

A file attached only to kb-a must NOT be retrieved for kb-b until it is
attached there (PRD Library isolation acceptance). Membership resolution,
chunk maps, BM25 build/rank and weighted RRF run real; only the embedding
model and Chroma are stubbed (the two external boundaries).

Run: backend/.venv/Scripts/python.exe backend/tests/test_retrieval_kb_isolation.py
(also pytest-collectable via test_kb_isolation)
"""
from __future__ import annotations

import asyncio
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.database import Base
from app.models.document_chunk import DocumentChunk
from app.models.file import File
from app.models.knowledge import Knowledge, KnowledgeFile
from app.services.retrieval import query as query_mod
from app.services.retrieval.query import run_query


def fake_embed_texts(texts: list[str]) -> list[list[float]]:
    """Deterministic pseudo-vectors — cosine is nonzero and stable, ranking is not asserted."""
    return [
        [float(b) / 255.0 for b in hashlib.md5(t.encode("utf-8")).digest()[:8]]
        for t in texts
    ]


chroma_calls: list[list[str]] = []


def fake_query_file_collections(
    *, file_ids: list[str], query_embedding: list[float], n_results: int
) -> list[dict[str, str]]:
    """Record which files Chroma was asked about; return a hit per member file."""
    chroma_calls.append(list(file_ids))
    # file-1 owns exactly one chunk with chroma_id "ch-1"
    return [{"chroma_id": "ch-1"} for _ in file_ids if "file-1" in file_ids][:n_results]


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    query_mod.embed_texts = fake_embed_texts
    query_mod.query_file_collections = fake_query_file_collections

    async with Session() as db:
        db.add_all(
            [
                Knowledge(id="kb-a", user_id="u1", name="Chat A", created_at=1, updated_at=1),
                Knowledge(id="kb-b", user_id="u1", name="Chat B", created_at=1, updated_at=1),
                File(
                    id="file-1", user_id="u1", filename="spj-letter.pdf", status="ready",
                    created_at=1, updated_at=1,
                ),
                DocumentChunk(
                    id="chunk-1", file_id="file-1", chunk_index=0,
                    text="SPJ accountability letter 2024 budget review",
                    chroma_collection="file-file-1", chroma_id="ch-1",
                    extraction_method="text_layer", created_at=1, updated_at=1,
                ),
                # Only kb-a knows about file-1.
                KnowledgeFile(id="kf-1", knowledge_id="kb-a", file_id="file-1", created_at=1),
            ]
        )
        await db.commit()

        # 1. Positive control — the harness detects presence when the file IS a member.
        response = await run_query(
            db, user_id="u1", scope_type="knowledge", scope_id="kb-a",
            query="budget", mode="hybrid",
        )
        assert [r.file_id for r in response.results] == ["file-1"], (
            "positive control: kb-a member file must be retrievable"
        )
        assert chroma_calls == [["file-1"]], "Chroma is queried per member file only"

        # 2. Isolation — kb-b must not retrieve (or even query) a kb-a-only file.
        calls_before = len(chroma_calls)
        response = await run_query(
            db, user_id="u1", scope_type="knowledge", scope_id="kb-b",
            query="budget", mode="hybrid",
        )
        assert response.results == [], "kb-b must not retrieve a file it does not own"
        assert len(chroma_calls) == calls_before, "kb-b must not send file-1 to Chroma"

        # 3. Attach to kb-b — now the file is retrievable there.
        db.add(KnowledgeFile(id="kf-2", knowledge_id="kb-b", file_id="file-1", created_at=2))
        await db.commit()
        response = await run_query(
            db, user_id="u1", scope_type="knowledge", scope_id="kb-b",
            query="budget", mode="hybrid",
        )
        assert [r.file_id for r in response.results] == ["file-1"], (
            "after attach, kb-b retrieves the file"
        )
        assert chroma_calls[-1] == ["file-1"], "kb-b now queries file-1's collection"

    await engine.dispose()
    print("retrieval kb isolation: all assertions passed")


def test_kb_isolation() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
