"""P0 user-memory checks: flag gate, AuthZ (404 not 403), CRUD, soft delete, P1a retrieve basics.

Run: backend/.venv/Scripts/python.exe backend/tests/test_memory_api.py
(pytest collects ``test_memory_api`` too, if the venv ever gains pytest)
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.user import User
from app.services import memory as memory_service
from app.services.memory import retrieve_relevant_memories

# P1a: create/update embed on write — pin a deterministic fake so these checks
# never load the real sentence-transformers model.
memory_service.embed_texts = lambda texts, **_: [[0.0, 0.0] for _ in texts]


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    current = {"id": "u1"}

    def build_app(flag_on: bool):
        os.environ["USER_MEMORY_ENABLED"] = "1" if flag_on else "0"
        get_settings.cache_clear()
        app = create_app()
        os.environ["USER_MEMORY_ENABLED"] = "1"
        get_settings.cache_clear()

        async def override_get_db():
            async with Session() as session:
                yield session

        async def override_user():
            uid = current["id"]
            return User(
                id=uid,
                name="Test",
                email=f"{uid}@test.local",
                role="user",
                created_at=1,
                updated_at=1,
            )

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_user
        return app

    app_on = build_app(flag_on=True)
    app_off = build_app(flag_on=False)

    # --- Flag off: every memory endpoint is 404 (feature invisible) ---
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app_off), base_url="http://test"
    ) as client:
        assert (await client.get("/api/memory")).status_code == 404
        assert (
            await client.post("/api/memory", json={"content": "x"})
        ).status_code == 404
        assert (await client.patch("/api/memory/m-1", json={})).status_code == 404
        assert (await client.delete("/api/memory/m-1")).status_code == 404

    # --- Flag on: happy-path CRUD ---
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app_on), base_url="http://test"
    ) as client, Session() as db:
        res = await client.post(
            "/api/memory",
            json={
                "content": "User prefers answers in Indonesian.",
                "category": "preference",
                "importance": 0.7,
            },
        )
        assert res.status_code == 200, res.text
        fact_a = res.json()
        assert fact_a["content"] == "User prefers answers in Indonesian."
        assert fact_a["category"] == "preference"
        assert fact_a["importance"] == 0.7
        assert fact_a["status"] == "active"

        res = await client.post("/api/memory", json={"content": "Owns an FYP repo."})
        assert res.status_code == 200
        fact_b = res.json()
        assert fact_b["category"] == "other"
        assert fact_b["importance"] == 0.5

        # P1a retrieve: active facts only, scored — zero fake vectors → pure
        # importance+recency, so fact_b (newest, recency 1.0) edges out fact_a
        rows = await retrieve_relevant_memories(db, user_id="u1", query="anything")
        assert [m.id for m in rows] == [fact_b["id"], fact_a["id"]]

        res = await client.get("/api/memory")
        assert res.status_code == 200
        listed = res.json()
        assert {row["id"] for row in listed} == {fact_a["id"], fact_b["id"]}

        res = await client.patch(
            f"/api/memory/{fact_a['id']}",
            json={"content": "User prefers Bahasa Indonesia.", "importance": 0.9},
        )
        assert res.status_code == 200
        patched = res.json()
        assert patched["content"] == "User prefers Bahasa Indonesia."
        assert patched["importance"] == 0.9
        assert patched["category"] == "preference"

        # --- AuthZ: another user gets 404, not 403, and sees no list rows ---
        current["id"] = "u2"
        res = await client.get("/api/memory")
        assert res.status_code == 200 and res.json() == []
        assert (
            await client.patch(f"/api/memory/{fact_a['id']}", json={"content": "x"})
        ).status_code == 404
        assert (await client.delete(f"/api/memory/{fact_a['id']}")).status_code == 404

        # --- Soft delete: hidden from list, further access reads as gone ---
        current["id"] = "u1"
        res = await client.delete(f"/api/memory/{fact_a['id']}")
        assert res.status_code == 204
        res = await client.get("/api/memory")
        assert [row["id"] for row in res.json()] == [fact_b["id"]]
        assert (
            await client.patch(f"/api/memory/{fact_a['id']}", json={"content": "x"})
        ).status_code == 404
        assert (await client.delete(f"/api/memory/{fact_a['id']}")).status_code == 404

    await engine.dispose()
    print("user_memory P0+P1a: flag gate, AuthZ, CRUD, soft delete, retrieve — all passed")


def test_memory_api() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())
