"""Self-contained check for get_conversation_for_user (backend has no pytest).

Run: backend/.venv/Scripts/python.exe backend/tests/test_get_conversation.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.database import Base
from app.models.conversation import Conversation
from app.models.knowledge import Knowledge
from app.services.conversations import get_conversation_for_user


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        db.add_all(
            [
                Knowledge(
                    id="kb-1",
                    user_id="u1",
                    name="Alpha",
                    created_at=1,
                    updated_at=1,
                ),
                Conversation(
                    id="c-owned",
                    user_id="u1",
                    knowledge_id="kb-1",
                    title="Research on RAG",
                    created_at=100,
                    updated_at=200,
                ),
                Conversation(
                    id="c-unscoped",
                    user_id="u1",
                    knowledge_id=None,
                    title="ad-hoc",
                    created_at=50,
                    updated_at=50,
                ),
                Conversation(
                    id="c-other",
                    user_id="u2",
                    knowledge_id=None,
                    title="secret",
                    created_at=1,
                    updated_at=1,
                ),
            ]
        )
        await db.commit()

        owned = await get_conversation_for_user(
            db, user_id="u1", conversation_id="c-owned"
        )
        assert owned is not None
        assert owned.id == "c-owned"
        assert owned.knowledge_id == "kb-1"
        assert owned.title == "Research on RAG"
        assert owned.created_at == 100
        assert owned.updated_at == 200

        unscoped = await get_conversation_for_user(
            db, user_id="u1", conversation_id="c-unscoped"
        )
        assert unscoped is not None
        assert unscoped.knowledge_id is None

        missing = await get_conversation_for_user(
            db, user_id="u1", conversation_id="c-missing"
        )
        assert missing is None

        foreign = await get_conversation_for_user(
            db, user_id="u1", conversation_id="c-other"
        )
        assert foreign is None, "other users' threads must not leak"

    await engine.dispose()
    print("get_conversation_for_user: all assertions passed")


if __name__ == "__main__":
    asyncio.run(main())
