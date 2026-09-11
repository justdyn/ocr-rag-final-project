"""P1b user-memory checks: extract gate/parse/scrub, upsert dedupe + cap + provenance.

Run: backend/.venv/Scripts/python.exe backend/tests/test_memory_extract_upsert.py
(pytest collects ``test_memory_extract_upsert`` too, if the venv ever gains pytest)
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
import app.services.memory as memory_service
from app.core.database import Base
from app.models.user_memory import UserMemory
from app.services.memory import (
    parse_extract_json,
    scrub_extracted_facts,
    should_schedule_memory_extract,
)


def _blob(vec: list[float]) -> bytes:
    return json.dumps(vec).encode("utf-8")


def _row(
    row_id: str,
    user_id: str,
    *,
    content: str = "fact",
    updated_at: int = 1000,
    embedding: bytes | None = None,
    status: str = "active",
) -> UserMemory:
    return UserMemory(
        id=row_id,
        user_id=user_id,
        content=content,
        category="other",
        importance=0.5,
        embedding=embedding,
        status=status,
        created_at=updated_at,
        updated_at=updated_at,
    )


async def main() -> None:
    # --- gate truth table (plan §8.1) ---
    assert should_schedule_memory_extract(enabled=True, error_message=None, assistant_text="hello")
    assert not should_schedule_memory_extract(enabled=False, error_message=None, assistant_text="hello")
    assert not should_schedule_memory_extract(enabled=True, error_message="boom", assistant_text="hello")
    assert not should_schedule_memory_extract(enabled=True, error_message=None, assistant_text="")
    assert not should_schedule_memory_extract(enabled=True, error_message=None, assistant_text="   \n")

    # --- parse_extract_json (plan §8.2) ---
    assert parse_extract_json('```json\n{"facts":["a","b"]}\n```') == ["a", "b"]
    assert parse_extract_json('["x","y"]') == ["x", "y"]
    assert parse_extract_json('{"facts":[]}') == []
    assert parse_extract_json("not json at all {") == []
    assert parse_extract_json('{"facts":["ok", 7, null, ["nested"]]}') == ["ok", "7"]
    assert parse_extract_json('{"facts":"scalar"}') == []

    # --- scrub (plan §8.3) ---
    assert scrub_extracted_facts(["Uses Bahasa Indonesia"]) == ["Uses Bahasa Indonesia"]
    assert scrub_extracted_facts(["my key is sk-abc12345defgh"]) == []
    assert scrub_extracted_facts(["password = hunter2"]) == []
    assert scrub_extracted_facts(["Bearer eyJhbGciOiJIUzI1NiJ9.x.y"]) == []
    assert scrub_extracted_facts(["api_key: abc123"]) == []
    assert scrub_extracted_facts(["token: abc123"]) == []
    assert len(scrub_extracted_facts(["x" * 500])[0]) == 200
    assert scrub_extracted_facts(["", "   "]) == []
    assert scrub_extracted_facts(["Fact one", "sk-abcdefghijklmnop", "Fact two"]) == ["Fact one", "Fact two"]

    # === slice 2: upsert dedupe + provenance + cap (plan §8.4, §8.5) ===
    from app.services.memory import upsert_extracted_memories

    original_embed = memory_service.embed_texts
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    seq = {"i": 0}

    def fake_embed_seq(texts, **_):
        out = []
        for _ in texts:
            out.append([float(seq["i"]), 1.0])
            seq["i"] += 1
        return out

    memory_service.embed_texts = fake_embed_seq

    async with Session() as db:
        db.add_all(
            [
                _row("m-exact", "u9", content="lives in bandung", embedding=_blob([1.0, 0.0])),
                _row("m-dead", "u9", content="works at campus", status="soft_deleted",
                     embedding=_blob([0.0, 1.0])),
            ]
        )
        await db.commit()

        # exact-normalized duplicate → skip
        await upsert_extracted_memories(
            db, user_id="u9", facts=["  LIVES   in Bandung "],
            conversation_id="c1", assistant_message_id="a1",
        )
        rows = (await db.scalars(select(UserMemory).where(UserMemory.user_id == "u9"))).all()
        assert len(rows) == 2, "exact-normalized duplicate must not create a row"

        # near-duplicate (cosine ≥ 0.92 vs active) → skip
        def fake_embed_near(texts, **_):
            return [[1.0, 0.05] for _ in texts]

        memory_service.embed_texts = fake_embed_near
        await upsert_extracted_memories(
            db, user_id="u9", facts=["lives in bandung region"],
            conversation_id="c1", assistant_message_id="a1",
        )
        memory_service.embed_texts = fake_embed_seq
        rows = (await db.scalars(select(UserMemory).where(UserMemory.user_id == "u9"))).all()
        assert len(rows) == 2, "cosine ≥ 0.92 duplicate must not create a row"

        # soft-deleted duplicate must NOT block; new fact gets provenance
        await upsert_extracted_memories(
            db, user_id="u9", facts=["works at campus", "fresh fact alpha"],
            conversation_id="c1", assistant_message_id="a1",
        )
        rows = (await db.scalars(select(UserMemory).where(UserMemory.user_id == "u9"))).all()
        by_id = {r.id: r for r in rows}
        created = next(
            r for r in rows if r.content == "works at campus" and r.status == "active"
        )
        assert created.source_conversation_id == "c1"
        assert created.source_message_id == "a1"
        assert created.importance == 0.5
        assert created.embedding is not None
        fresh = next(r for r in rows if r.content == "fresh fact alpha")
        assert fresh.source_conversation_id == "c1"
        assert by_id["m-dead"].status == "soft_deleted", "seeded row untouched"

    # --- cap: 51st active soft-deletes the oldest; active count stays 50 ---
    async with Session() as db:
        db.add_all(
            [
                _row(f"m-cap{i}", "u10", content=f"cap fact {i}", updated_at=1000 + i)
                for i in range(50)
            ]
        )
        await db.commit()
        await upsert_extracted_memories(
            db, user_id="u10", facts=["brand new cap fact"],
            conversation_id="c2", assistant_message_id="a2",
        )
        rows = (await db.scalars(select(UserMemory).where(UserMemory.user_id == "u10"))).all()
        active = [r for r in rows if r.status == "active"]
        deleted = [r for r in rows if r.status == "soft_deleted"]
        assert len(active) == 50, f"cap keeps 50 actives, got {len(active)}"
        assert len(deleted) == 1 and deleted[0].id == "m-cap0", "oldest is soft-deleted"

    # === slice 3: run_memory_extract (plan §8.6) ===
    from app.services.memory import run_memory_extract

    class FakeProvider:
        def __init__(self, reply: str | Exception) -> None:
            self.reply = reply
            self.calls: list[list[dict[str, str]]] = []

        async def complete_chat(self, *, messages):
            self.calls.append(messages)
            if isinstance(self.reply, Exception):
                raise self.reply
            return self.reply

    memory_service.embed_texts = fake_embed_seq
    memory_service.AsyncSessionLocal = Session

    async def active_for(user_id: str) -> list[UserMemory]:
        async with Session() as db:
            rows = (
                await db.scalars(
                    select(UserMemory).where(
                        UserMemory.user_id == user_id, UserMemory.status == "active"
                    )
                )
            ).all()
            return list(rows)

    good = FakeProvider(
        '```json\n{"facts":["likes durian coffee", "my key is sk-zzzzzzzzzzzz1234"]}\n```'
    )
    await run_memory_extract(
        user_id="u11", conversation_id="c3", assistant_message_id="a3",
        user_text="what should I drink?", assistant_text="maybe durian coffee?",
        provider=good,
    )
    rows = await active_for("u11")
    assert [r.content for r in rows] == ["likes durian coffee"], "secret fact dropped"
    assert rows[0].source_conversation_id == "c3" and rows[0].source_message_id == "a3"
    assert len(good.calls) == 1
    assert good.calls[0][0]["role"] == "system"
    exchange = good.calls[0][1]["content"]
    assert good.calls[0][1]["role"] == "user"
    assert "what should I drink?" in exchange and "maybe durian coffee?" in exchange

    for label, provider in [
        ("llm raises", FakeProvider(RuntimeError("llm down"))),
        ("llm garbage", FakeProvider("garbage {")),
        ("llm empty", FakeProvider('{"facts":[]}')),
    ]:
        await run_memory_extract(
            user_id="u11", conversation_id="c3", assistant_message_id="a3",
            user_text="q", assistant_text="a", provider=provider,
        )
        assert len(await active_for("u11")) == 1, f"{label}: no raise, no new rows"

    memory_service.embed_texts = original_embed
    memory_service.AsyncSessionLocal = None
    await engine.dispose()

    print("P1b slice 3: run_memory_extract — all passed")


def test_memory_extract_upsert() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
