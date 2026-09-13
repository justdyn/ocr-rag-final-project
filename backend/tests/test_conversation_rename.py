"""P1 conversation rename: owner-scoped service + PATCH route contract.

Run: backend/.venv/Scripts/python.exe backend/tests/test_conversation_rename.py
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.database import Base, get_db
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.conversation import Conversation
from app.models.user import User
from app.services.conversations import rename_conversation
from app.services.title import persist_generated_title


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    old = int(time.time()) - 1000
    async with Session() as db:
        db.add_all(
            [
                Conversation(
                    id="c1",
                    user_id="u1",
                    knowledge_id=None,
                    title="New chat",
                    title_source="auto",
                    created_at=old,
                    updated_at=old,
                ),
                Conversation(
                    id="c2",
                    user_id="u2",
                    knowledge_id=None,
                    title="Other's thread",
                    title_source="auto",
                    created_at=old,
                    updated_at=old,
                ),
            ]
        )
        await db.commit()

        # --- Service: owner rename persists title + manual lock ---
        summary = await rename_conversation(
            db, user_id="u1", conversation_id="c1", title="My Manual Title"
        )
        assert summary is not None
        assert summary.title == "My Manual Title"
        assert summary.title_source == "manual"
        assert summary.updated_at > old

        row = await db.scalar(select(Conversation).where(Conversation.id == "c1"))
        assert row is not None
        assert row.title_generated_at is None  # rename never touches it

        # --- Service: wrong user / missing id → None (404 at router) ---
        assert (
            await rename_conversation(
                db, user_id="u2", conversation_id="c1", title="x"
            )
            is None
        )
        assert (
            await rename_conversation(
                db, user_id="u1", conversation_id="nope", title="x"
            )
            is None
        )

        # --- Manual rename locks out auto title regeneration ---
        ok = await persist_generated_title(
            db, conversation_id="c1", user_id="u1", title="Auto Overwrite"
        )
        assert ok is False
        await db.refresh(row)
        assert row.title == "My Manual Title"

    # --- PATCH route contract ---
    current = {"id": "u1"}
    app = create_app()

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

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.patch(
            "/api/conversations/c1", json={"title": "  Renamed  "}
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["title"] == "Renamed"  # router strips whitespace
        assert body["title_source"] == "manual"

        # wrong user / missing id → 404
        current["id"] = "u2"
        assert (
            await client.patch("/api/conversations/c1", json={"title": "x"})
        ).status_code == 404
        current["id"] = "u1"
        assert (
            await client.patch("/api/conversations/nope", json={"title": "x"})
        ).status_code == 404

        # blank / whitespace-only → 400 (router strip), not 422
        assert (
            await client.patch("/api/conversations/c1", json={"title": ""})
        ).status_code == 400
        assert (
            await client.patch("/api/conversations/c1", json={"title": "   "})
        ).status_code == 400

        # schema bound: over-long title → 422
        assert (
            await client.patch(
                "/api/conversations/c1", json={"title": "x" * 201}
            )
        ).status_code == 422

    await engine.dispose()
    print("test_conversation_rename: OK")


def test_conversation_rename() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    asyncio.run(main())