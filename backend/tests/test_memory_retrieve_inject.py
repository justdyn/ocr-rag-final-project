"""P1a user-memory checks: embed-on-write, scored retrieve, flag-gated inject.

Run: backend/.venv/Scripts/python.exe backend/tests/test_memory_retrieve_inject.py
(pytest collects ``test_memory_retrieve_inject`` too, if the venv ever gains pytest)
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
import app.services.chat as chat_service
import app.services.memory as memory_service
from app.core.config import get_settings
from app.core.database import Base
from app.models.user_memory import UserMemory
from app.schemas.memory import MemoryCreate, MemoryUpdate
from app.schemas.query import QueryChunkResult, QueryResponse
from app.services.chat import prepare_chat
from app.services.llm.prompt import SYSTEM_PROMPT, build_rag_messages
from app.services.memory import create_memory, retrieve_relevant_memories, update_memory


def _blob(vec: list[float]) -> bytes:
    return json.dumps(vec).encode("utf-8")


def fake_embed_by_len(texts, **_):
    """Deterministic per-content vector so re-embeds are observable."""
    return [[float(len(t)), 1.0] for t in texts]


def fake_embed_query(texts, **_):
    return [[1.0, 0.0] for _ in texts]


def raising_embed(texts, **_):
    raise RuntimeError("embedding backend down")


def _row(
    row_id: str,
    user_id: str = "u1",
    *,
    content: str = "fact",
    importance: float = 0.5,
    updated_at: int = 1000,
    embedding: bytes | None = None,
    status: str = "active",
    expires_at: int | None = None,
) -> UserMemory:
    return UserMemory(
        id=row_id,
        user_id=user_id,
        content=content,
        category="other",
        importance=importance,
        embedding=embedding,
        status=status,
        expires_at=expires_at,
        created_at=updated_at,
        updated_at=updated_at,
    )


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    original_embed = memory_service.embed_texts

    # --- embed-on-write: JSON bytes stored; re-embed on content change; failure → null ---
    async with Session() as db:
        memory_service.embed_texts = fake_embed_by_len
        fact = await create_memory(
            db,
            user_id="u1",
            data=MemoryCreate(content="Prefers Bahasa Indonesia.", importance=0.7),
        )
        assert fact.embedding == _blob([float(len("Prefers Bahasa Indonesia.")), 1.0])

        await update_memory(db, fact, MemoryUpdate(content="Prefers Indonesian."))
        assert fact.embedding == _blob([float(len("Prefers Indonesian.")), 1.0])

        before = fact.embedding
        await update_memory(db, fact, MemoryUpdate(importance=0.9))
        assert fact.embedding == before, "non-content patch must not touch embedding"

        memory_service.embed_texts = raising_embed
        failed = await create_memory(db, user_id="u1", data=MemoryCreate(content="no embed"))
        assert failed.embedding is None and failed.content == "no embed"
        await update_memory(db, failed, MemoryUpdate(content="updated text"))
        assert failed.embedding is None, "failed embed must clear stale vector"
        memory_service.embed_texts = original_embed

    # --- retrieve: scoring, exclusions (fresh user u5 — embed-on-write rows above must not pollute) ---
    memory_service.embed_texts = fake_embed_query  # query vector [1.0, 0.0]
    async with Session() as db:
        db.add_all(
            [
                _row("m-match", user_id="u5", content="indonesian preference", importance=0.5,
                     updated_at=1000, embedding=_blob([1.0, 0.0])),
                _row("m-weak", user_id="u5", content="weakly related", importance=0.5,
                     updated_at=1500, embedding=_blob([0.6, 0.8])),
                _row("m-other", user_id="u5", content="unrelated", importance=1.0,
                     updated_at=2000, embedding=_blob([0.0, 1.0])),
                _row("m-noemb", user_id="u5", content="no embedding", importance=0.9, updated_at=2000),
                _row("m-deleted", user_id="u5", content="soft deleted", importance=1.0, updated_at=2000,
                     embedding=_blob([1.0, 0.0]), status="soft_deleted"),
                _row("m-expired", user_id="u5", content="expired", importance=1.0, updated_at=2000,
                     embedding=_blob([1.0, 0.0]), expires_at=1),
                _row("m-foreign", user_id="u2", content="foreign", importance=1.0,
                     updated_at=2000, embedding=_blob([1.0, 0.0])),
            ]
        )
        await db.commit()

    async with Session() as db:
        rows = await retrieve_relevant_memories(db, user_id="u5", query="q")
        # 0.7*1.0+0.1*0.0=0.80 | 0.7*0.6+0.1*0.5+0.05=0.57 | 0.2+0.1=0.30 | 0.18+0.1=0.28
        assert [r.id for r in rows] == ["m-match", "m-weak", "m-other", "m-noemb"]

    # --- k=5 cap ---
    async with Session() as db:
        db.add_all([_row(f"m-k{i}", user_id="u6", updated_at=1000) for i in range(6)])
        await db.commit()
        rows = await retrieve_relevant_memories(db, user_id="u6", query="q")
        assert len(rows) == 5, "top-k cap"

    # --- ~2000 char budget: skip oversized, keep fitting smaller facts ---
    async with Session() as db:
        db.add_all(
            [
                _row("m-big1", user_id="u3", content="x" * 1500, importance=1.0, updated_at=1000),
                _row("m-big2", user_id="u3", content="y" * 1500, importance=0.9, updated_at=1000),
                _row("m-small", user_id="u3", content="z" * 40, importance=0.8, updated_at=1000),
            ]
        )
        await db.commit()
        rows = await retrieve_relevant_memories(db, user_id="u3", query="q")
        assert [r.id for r in rows] == ["m-big1", "m-small"]

    # --- embed failure degrades to importance+recency, still returns rows ---
    async with Session() as db:
        db.add_all(
            [
                _row("m-e1", user_id="u4", content="alpha", importance=0.9, updated_at=1000),
                _row("m-e2", user_id="u4", content="beta", importance=0.5, updated_at=1000),
            ]
        )
        await db.commit()
        memory_service.embed_texts = raising_embed
        rows = await retrieve_relevant_memories(db, user_id="u4", query="q")
        memory_service.embed_texts = fake_embed_query
        assert [r.id for r in rows] == ["m-e1", "m-e2"]

    # --- inject: flag-off shape identical, flag-on adds labeled system adjunct ---
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    chunk = QueryChunkResult(
        chunk_id="c1",
        file_id="f1",
        text="Campus memo text",
        rrf_score=0.01,
        rerank_score=0.5,
        extraction_method="text_layer",
        rank=1,
    )

    off = build_rag_messages(user_query="q", chunks=[chunk], history=history)
    assert off.messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
    assert all(m["role"] != "system" for m in off.messages[1:])
    assert off.messages[-1]["role"] == "user"
    assert off.messages[-1]["content"].startswith("Sources:")
    assert '<source id="1">' in off.messages[-1]["content"]

    on = build_rag_messages(
        user_query="q",
        chunks=[chunk],
        history=history,
        memory_facts=["Prefers Bahasa Indonesia.", "Deadline is June 30."],
    )
    assert len(on.messages) == len(off.messages) + 1
    mem = on.messages[1]
    assert mem["role"] == "system"
    assert "NOT document sources" in mem["content"]
    assert "prefer the Sources" in mem["content"]
    assert "- Prefers Bahasa Indonesia." in mem["content"]
    assert on.messages[-1]["role"] == "user" and '<source id="1">' in on.messages[-1]["content"]
    assert on.sources == off.sources, "memory never enters sources/citations"

    # --- prepare_chat: flag off → no retrieve + no memory message; flag on → adjunct ---
    real_run_query = chat_service.run_query
    real_retrieve = chat_service.retrieve_relevant_memories

    async def fake_run_query(db, **kwargs):
        return QueryResponse(
            scope_type="knowledge",
            scope_id="kb1",
            query="q",
            mode="hybrid",
            k=2,
            results=[chunk],
        )

    called: list[str] = []

    async def spy_retrieve(db, *, user_id, query):
        called.append(user_id)
        return [SimpleNamespace(content="Prefers Bahasa Indonesia.")]

    chat_service.run_query = fake_run_query
    chat_service.retrieve_relevant_memories = spy_retrieve
    try:
        async with Session() as db:
            os.environ["USER_MEMORY_ENABLED"] = "0"
            get_settings.cache_clear()
            prepared, _ = await prepare_chat(
                db,
                user_id="u1",
                scope_type="knowledge",
                scope_id="kb1",
                query="q",
                provider_factory=lambda: SimpleNamespace(),
            )
            assert called == [], "flag off must not retrieve memories"
            assert prepared.user_id == "u1"
            assert prepared.messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
            assert all(m["role"] != "system" for m in prepared.messages[1:]), "flag off: no memory message"

            os.environ["USER_MEMORY_ENABLED"] = "1"
            get_settings.cache_clear()
            prepared, _ = await prepare_chat(
                db,
                user_id="u1",
                scope_type="knowledge",
                scope_id="kb1",
                query="q",
                provider_factory=lambda: SimpleNamespace(),
            )
            assert called == ["u1"]
            assert prepared.messages[1]["role"] == "system"
            assert "User memory" in prepared.messages[1]["content"]
            assert '<source id="1">' in prepared.messages[-1]["content"]
            assert prepared.sources, "sources payload unchanged by memory inject"
    finally:
        chat_service.run_query = real_run_query
        chat_service.retrieve_relevant_memories = real_retrieve
        memory_service.embed_texts = original_embed

    # --- never raises: dead session → [] ---
    await engine.dispose()
    async with Session() as db:
        assert await retrieve_relevant_memories(db, user_id="u1", query="q") == []

    print("user_memory P1a: embed-on-write, scored retrieve, k/budget, flag-gated inject — all passed")


def test_memory_retrieve_inject() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
