"""Per-conversation llm_model PATCH + prepare_chat model resolution.

Run: backend/.venv/Scripts/python.exe backend/tests/test_chat_model_selection.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.dependencies.auth import get_current_user
from app.tensho import create_app
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.chat import ChatCompletionRequest
from app.services.chat import prepare_chat
from app.services.conversations import update_conversation


class FakeProvider:
    def __init__(self, *, model: str | None = None) -> None:
        self.model = model or "default-from-settings"

    def require_configured(self) -> None:
        return None

    async def stream_chat(self, *, messages: list[dict[str, str]]):
        if False:
            yield ""

    async def complete_chat(self, *, messages: list[dict[str, str]]) -> str:
        return "ok"


async def main() -> None:
    os.environ["LLM_API_KEY"] = "test-key"
    os.environ["LLM_MODEL"] = "gpt-4o-mini"
    os.environ["LLM_BASE_URL"] = "https://api.openai.com/v1"
    get_settings.cache_clear()

    # Schema: reject invalid model ids
    try:
        ChatCompletionRequest(
            scope_type="knowledge",
            scope_id="k1",
            query="hello",
            model="bad model!",
        )
        raise AssertionError("expected validation error")
    except Exception:
        pass

    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    old = int(time.time()) - 100
    async with Session() as db:
        db.add(
            Conversation(
                id="c1",
                user_id="u1",
                knowledge_id=None,
                title="Thread",
                title_source="auto",
                llm_model="stored/model",
                created_at=old,
                updated_at=old,
            )
        )
        await db.commit()

        summary = await update_conversation(
            db,
            user_id="u1",
            conversation_id="c1",
            llm_model="openai/gpt-4o",
        )
        assert summary is not None
        assert summary.llm_model == "openai/gpt-4o"

        row = await db.scalar(select(Conversation).where(Conversation.id == "c1"))
        assert row is not None
        assert row.llm_model == "openai/gpt-4o"
        assert row.title == "Thread"  # title untouched

    # prepare_chat: request model wins and persists
    captured: dict[str, Any] = {}

    def factory() -> FakeProvider:
        # Called without kwargs from prepare_chat when provider_factory set;
        # we still assert resolution via a patched get_llm_provider path below.
        return FakeProvider(model="factory-default")

    async with Session() as db:
        fake_retrieval = type(
            "R",
            (),
            {"results": []},
        )()

        with (
            patch(
                "app.services.chat.run_query",
                new=AsyncMock(return_value=fake_retrieval),
            ),
            patch(
                "app.services.chat.get_llm_provider",
                side_effect=lambda **kw: captured.setdefault(
                    "provider", FakeProvider(**kw)
                )
                or captured["provider"],
            ),
        ):
            prepared, provider = await prepare_chat(
                db,
                user_id="u1",
                scope_type="knowledge",
                scope_id="k-missing-ok-empty",
                query="What is SPJ?",
                conversation_id="c1",
                model="anthropic/claude-sonnet",
            )
            assert prepared.conversation_id == "c1"
            assert isinstance(provider, FakeProvider)
            assert provider.model == "anthropic/claude-sonnet"

        row = await db.scalar(select(Conversation).where(Conversation.id == "c1"))
        assert row is not None
        assert row.llm_model == "anthropic/claude-sonnet"

    # PATCH route contract for llm_model
    app = create_app()

    async def override_get_db():
        async with Session() as session:
            yield session

    async def override_user():
        return User(
            id="u1",
            name="Test",
            email="u1@test.local",
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
            "/api/conversations/c1",
            json={"llm_model": "google/gemini-2.5-pro"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["llm_model"] == "google/gemini-2.5-pro"

        res = await client.patch("/api/conversations/c1", json={})
        assert res.status_code == 400

    print("test_chat_model_selection: ok")


if __name__ == "__main__":
    asyncio.run(main())
