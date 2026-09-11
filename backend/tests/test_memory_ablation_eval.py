"""P2a memory ablation eval (architecture §10): flag off vs on, one seeded state.

Run: backend/.venv/Scripts/python.exe backend/tests/test_memory_ablation_eval.py
(pytest collects ``test_memory_ablation_eval`` too, if the venv ever gains pytest)

Named ablation entrypoint — mirrors the seams of ``test_memory_retrieve_inject.py``
as a single off-vs-on protocol: service layer only, in-memory aiosqlite, fake
embeddings, no live server, no real LLM, no HTTP, no JWT.
"""
from __future__ import annotations

import asyncio
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
from app.schemas.memory import MemoryCreate
from app.schemas.query import QueryChunkResult, QueryResponse
from app.services.chat import prepare_chat
from app.services.llm.prompt import SYSTEM_PROMPT
from app.services.memory import create_memory, soft_delete_memory

FACT_1 = "Owner prefers Bahasa Indonesia."
FACT_2 = "Owner deadline is June 30."
FOREIGN_FACT = "Foreign user private fact."
DELETED_FACT = "Soft deleted stale fact."
CHUNK_TEXT = "Campus SPJ accountability memo text."


def fake_embed(texts, **_):
    """Vector [1.0, 0.0] for everything → cosine 1.0 vs every fact and the query."""
    return [[1.0, 0.0] for _ in texts]


def _chunk() -> QueryChunkResult:
    return QueryChunkResult(
        chunk_id="c1",
        file_id="f1",
        text=CHUNK_TEXT,
        rrf_score=0.01,
        rerank_score=0.5,
        extraction_method="text_layer",
        rank=1,
    )


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    real_embed = memory_service.embed_texts
    real_run_query = chat_service.run_query
    memory_service.embed_texts = fake_embed

    async def fake_run_query(db, **_):
        """Same stub as P1a: skip scope authorization, return one deterministic chunk."""
        return QueryResponse(
            scope_type="knowledge",
            scope_id="kb1",
            query="q",
            mode="hybrid",
            k=2,
            results=[_chunk()],
        )

    chat_service.run_query = fake_run_query
    try:
        # Seed via create_memory: owner actives, a foreign fact, a soft-deleted fact.
        async with Session() as db:
            await create_memory(db, user_id="u1", data=MemoryCreate(content=FACT_1, importance=0.8))
            await create_memory(db, user_id="u1", data=MemoryCreate(content=FACT_2, importance=0.6))
            await create_memory(db, user_id="u2", data=MemoryCreate(content=FOREIGN_FACT, importance=1.0))
            deleted = await create_memory(db, user_id="u1", data=MemoryCreate(content=DELETED_FACT, importance=1.0))
            await soft_delete_memory(db, deleted)

        async def run_once():
            async with Session() as db:
                prepared, _ = await prepare_chat(
                    db,
                    user_id="u1",
                    scope_type="knowledge",
                    scope_id="kb1",
                    query="q",
                    provider_factory=lambda: SimpleNamespace(),
                )
            return prepared

        # --- Ablation A: flag OFF ---
        os.environ["USER_MEMORY_ENABLED"] = "0"
        get_settings.cache_clear()
        off = await run_once()

        assert off.messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
        assert all(m["role"] != "system" for m in off.messages[1:]), "flag off: no memory adjunct"
        assert [s["text"] for s in off.sources] == [CHUNK_TEXT], "flag off: sources shape unchanged"

        # --- Ablation B: flag ON, identical seeded state ---
        os.environ["USER_MEMORY_ENABLED"] = "1"
        get_settings.cache_clear()
        on = await run_once()

        assert len(on.messages) == len(off.messages) + 1, "flag on: exactly one memory adjunct"
        assert on.messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
        adjunct = on.messages[1]
        assert adjunct["role"] == "system" and "User memory" in adjunct["content"]
        assert FACT_1 in adjunct["content"] and FACT_2 in adjunct["content"], "owner actives inject"

        # Citation firewall: memory text never lands in sources; sources unchanged.
        assert on.sources == off.sources, "memory inject must not change sources"
        source_text = " ".join(s["text"] for s in on.sources)
        for fact in (FACT_1, FACT_2, FOREIGN_FACT, DELETED_FACT):
            assert fact not in source_text, "memory text must never enter sources/citations"

        # Exclusions: foreign-user and soft-deleted facts never inject.
        assert FOREIGN_FACT not in adjunct["content"], "foreign-user fact must not inject"
        assert DELETED_FACT not in adjunct["content"], "soft-deleted fact must not inject"

        print(
            "P2a memory ablation: flag off = no adjunct, flag on = adjunct present "
            "+ citation firewall held, foreign/soft-deleted excluded - passed"
        )
    finally:
        memory_service.embed_texts = real_embed
        chat_service.run_query = real_run_query
        os.environ.pop("USER_MEMORY_ENABLED", None)
        get_settings.cache_clear()
        await engine.dispose()


def test_memory_ablation_eval() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
