"""Model catalog: local filter/paginate + OpenRouter forward + auth 503.

Run: backend/.venv/Scripts/python.exe backend/tests/test_models_catalog.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.config import get_settings
from app.core.database import get_db
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.user import User
from app.services.llm import models_catalog as catalog


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response
        self.last_url: str | None = None
        self.last_params: dict | None = None

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def get(self, url: str, headers: dict | None = None, params: dict | None = None):
        self.last_url = url
        self.last_params = params
        return self._response


async def main() -> None:
    catalog.clear_models_cache()
    os.environ["LLM_API_KEY"] = "test-key"
    os.environ["LLM_BASE_URL"] = "https://api.openai.com/v1"
    os.environ["LLM_MODEL"] = "gpt-4o-mini"
    get_settings.cache_clear()

    upstream = {
        "data": [
            {"id": "gpt-4o-mini", "name": "GPT-4o mini"},
            {"id": "text-embedding-3-small"},
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "whisper-1"},
            {"id": "claude-sonnet", "name": "Claude Sonnet"},
        ]
    }
    fake = _FakeClient(_FakeResponse(200, upstream))

    with patch("app.services.llm.models_catalog.httpx.AsyncClient", return_value=fake):
        page = await catalog.list_models(offset=0, limit=2)
        assert len(page.items) == 2
        assert page.items[0]["id"] == "gpt-4o-mini"
        assert page.items[1]["id"] == "gpt-4o"
        assert page.has_more is True
        assert page.next_offset == 2

        page2 = await catalog.list_models(offset=2, limit=2)
        assert [i["id"] for i in page2.items] == ["claude-sonnet"]
        assert page2.has_more is False
        assert page2.next_offset is None

        # Cache: second call must not re-hit upstream (fake still returns same)
        searched = await catalog.list_models(q="claude", offset=0, limit=10)
        assert [i["id"] for i in searched.items] == ["claude-sonnet"]

    # OpenRouter forwards q/offset/limit
    catalog.clear_models_cache()
    os.environ["LLM_BASE_URL"] = "https://openrouter.ai/api/v1"
    get_settings.cache_clear()
    or_fake = _FakeClient(
        _FakeResponse(
            200,
            {"data": [{"id": "openai/gpt-4o", "name": "GPT-4o"}]},
        )
    )
    with patch("app.services.llm.models_catalog.httpx.AsyncClient", return_value=or_fake):
        page = await catalog.list_models(q="gpt", offset=10, limit=25)
        assert or_fake.last_params == {"offset": 10, "limit": 25, "q": "gpt"}
        assert page.items[0]["id"] == "openai/gpt-4o"

    # Router: missing key → 503
    catalog.clear_models_cache()
    os.environ.pop("LLM_API_KEY", None)
    get_settings.cache_clear()

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    import app.models  # noqa: F401
    from app.core.database import Base

    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

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
        res = await client.get("/api/models")
        assert res.status_code == 503, res.text

    # Restore env for other tests in-process
    os.environ["LLM_API_KEY"] = "test-key"
    os.environ["LLM_BASE_URL"] = "https://api.openai.com/v1"
    get_settings.cache_clear()
    catalog.clear_models_cache()
    print("test_models_catalog: ok")


if __name__ == "__main__":
    asyncio.run(main())
