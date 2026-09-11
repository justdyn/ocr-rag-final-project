"""Self-contained check for get_last_conversation_scope (backend has no pytest).

Run: backend/.venv/Scripts/python.exe backend/tests/test_last_conversation_scope.py
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
from app.services.conversations import get_last_conversation_scope


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        db.add_all(
            [
                Knowledge(
                    id="kb-u1", user_id="u1", name="Alpha",
                    created_at=1, updated_at=1,
                ),
                Knowledge(
                    id="kb-u2", user_id="u2", name="Beta",
                    created_at=1, updated_at=1,
                ),
                Conversation(
                    id="c-old", user_id="u1", knowledge_id="kb-u1",
                    title="old", created_at=100, updated_at=100,
                ),
                Conversation(
                    id="c-unscoped", user_id="u1", knowledge_id=None,
                    title="ad-hoc", created_at=300, updated_at=300,
                ),
                Conversation(
                    id="c-new", user_id="u1", knowledge_id="kb-u1",
                    title="new", created_at=200, updated_at=200,
                ),
                # Newest for u1 overall, but its KB belongs to u2 → excluded.
                Conversation(
                    id="c-foreign", user_id="u1", knowledge_id="kb-u2",
                    title="foreign", created_at=400, updated_at=400,
                ),
                Conversation(
                    id="c-u2", user_id="u2", knowledge_id="kb-u2",
                    title="u2 thread", created_at=100, updated_at=100,
                ),
                # u3 only has an unscoped (ad-hoc) conversation → no scope.
                Conversation(
                    id="c-u3", user_id="u3", knowledge_id=None,
                    title="u3 ad-hoc", created_at=100, updated_at=100,
                ),
            ]
        )
        await db.commit()

        scope = await get_last_conversation_scope(db, user_id="u1")
        assert scope is not None, "u1 has scoped conversations"
        assert (scope.knowledge_id, scope.knowledge_name) == ("kb-u1", "Alpha"), (
            "NULL knowledge_id rows and foreign KBs are skipped, most recent wins"
        )

        scope_u2 = await get_last_conversation_scope(db, user_id="u2")
        assert scope_u2 is not None and scope_u2.knowledge_id == "kb-u2"

        scope_none = await get_last_conversation_scope(db, user_id="u3")
        assert scope_none is None, "only unscoped conversations → no hydrate scope"

    await engine.dispose()
    print("get_last_conversation_scope: all assertions passed")


if __name__ == "__main__":
    asyncio.run(main())
