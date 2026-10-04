"""Phase A account-surfaces tests: require_admin 404, LLM config resolve, profile updates.

Run: backend/.venv/Scripts/python.exe backend/tests/test_account_surfaces_phase_a.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.core.security import hash_password, verify_password
from app.dependencies.auth import get_current_user, require_admin
from app.main import create_app
from app.models.llm_config import LlmConfig
from app.models.auth import Auth
from app.models.user import User
from app.services.llm_config import resolve_llm_settings, update_llm_config
from app.services.llm.models_catalog import clear_models_cache


@asynccontextmanager
async def shared_session(Session):
    """Create a session that both get_db and get_current_user will use."""
    async with Session() as session:
        yield session


async def main() -> None:
    os.environ["LLM_API_KEY"] = "sk-env-test-key-1234"
    os.environ["LLM_MODEL"] = "gpt-4o-mini"
    os.environ["LLM_BASE_URL"] = "https://api.openai.com/v1"
    os.environ["ADMIN_BOOTSTRAP_EMAIL"] = "admin@example.com"
    get_settings.cache_clear()
    clear_models_cache()

    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    
    # Setup: create two users - admin and regular
    async with Session() as db:
        admin_user = User(
            id="u-admin",
            name="Admin User",
            email="admin@example.com",
            role="admin",
            created_at=int(time.time()),
            updated_at=int(time.time()),
        )
        regular_user = User(
            id="u-regular",
            name="Regular User",
            email="regular@example.com",
            role="user",
            created_at=int(time.time()),
            updated_at=int(time.time()),
        )
        db.add_all([admin_user, regular_user])
        # Create Auth records for both users
        admin_auth = Auth(id="u-admin", email="admin@example.com", password=hash_password("adminpass"))
        regular_auth = Auth(id="u-regular", email="regular@example.com", password=hash_password("regularpass"))
        db.add_all([admin_auth, regular_auth])
        await db.commit()

    # 1. Test require_admin returns 404 for non-admin
    app = create_app()

    # Create a shared session for this test phase
    async with Session() as shared_db:
        # Override get_db to use our shared session
        async def override_get_db_shared():
            yield shared_db

        # Override get_current_user to fetch from the same shared session
        async def override_user_regular():
            result = await shared_db.execute(select(User).where(User.id == "u-regular"))
            return result.scalar_one()

        app.dependency_overrides[get_db] = override_get_db_shared
        app.dependency_overrides[get_current_user] = override_user_regular

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            # GET /api/admin/llm-config should return 404 for non-admin
            res = await client.get("/api/admin/llm-config")
            assert res.status_code == 404, f"Expected 404 for non-admin, got {res.status_code}: {res.text}"

            # PUT /api/admin/llm-config should return 404 for non-admin
            res = await client.put("/api/admin/llm-config", json={"api_key": "sk-new-key"})
            assert res.status_code == 404, f"Expected 404 for non-admin, got {res.status_code}: {res.text}"

    # 2. Test GET /api/admin/llm-config has no full key substring (only last-4)
    async with Session() as shared_db:
        async def override_get_db_shared():
            yield shared_db

        async def override_user_admin():
            result = await shared_db.execute(select(User).where(User.id == "u-admin"))
            return result.scalar_one()

        app.dependency_overrides[get_db] = override_get_db_shared
        app.dependency_overrides[get_current_user] = override_user_admin

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            res = await client.get("/api/admin/llm-config")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["configured"] is True
            assert body["source"] == "env"
            assert body["key_suffix"] == "1234"
            assert "sk-env-test-key-1234" not in str(body), "Full key must not appear in response"
            assert body["default_model"] == "gpt-4o-mini"
            assert body["base_url"] == "https://api.openai.com/v1"

    # 3. Test resolve_llm_settings uses DB after PUT
    async with Session() as db:
        # First verify env resolution
        resolved = await resolve_llm_settings(db)
        assert resolved.source == "env"
        assert resolved.api_key == "sk-env-test-key-1234"
        assert resolved.model == "gpt-4o-mini"

        # Now update via admin PUT
        await update_llm_config(db, api_key="sk-db-override-5678", base_url="https://custom.api/v1", model="custom/model")

        # Verify DB resolution
        resolved = await resolve_llm_settings(db)
        assert resolved.source == "db"
        assert resolved.api_key == "sk-db-override-5678"
        assert resolved.model == "custom/model"
        assert resolved.base_url == "https://custom.api/v1"

    # 4. Test profile name update
    async with Session() as shared_db:
        async def override_get_db_shared():
            yield shared_db

        async def override_user_regular():
            result = await shared_db.execute(select(User).where(User.id == "u-regular"))
            return result.scalar_one()

        app.dependency_overrides[get_db] = override_get_db_shared
        app.dependency_overrides[get_current_user] = override_user_regular

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            res = await client.patch("/api/profile", json={"name": "New Name"})
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["name"] == "New Name"
            assert body["email"] == "regular@example.com"
            assert body["role"] == "user"

            # Verify in DB
            async with Session() as db:
                row = await db.scalar(select(User).where(User.id == "u-regular"))
                assert row is not None
                assert row.name == "New Name"

    # 5. Test profile password change

    async with Session() as db:
        # Set a known password hash for the user
        auth = await db.get(Auth, "u-regular")
        if auth:
            auth.password = hash_password("old-password")
            await db.commit()

    async with Session() as shared_db:
        async def override_get_db_shared():
            yield shared_db

        async def override_user_regular():
            result = await shared_db.execute(select(User).where(User.id == "u-regular"))
            return result.scalar_one()

        app.dependency_overrides[get_db] = override_get_db_shared
        app.dependency_overrides[get_current_user] = override_user_regular

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            res = await client.post("/api/profile/password", json={
                "current_password": "old-password",
                "new_password": "new-password-123"
            })
            assert res.status_code == 204, res.text

            # Verify new password works
            async with Session() as db:
                auth = await db.get(Auth, "u-regular")
                assert auth is not None
                assert verify_password("new-password-123", auth.password)
                assert not verify_password("old-password", auth.password)

            # 6. Test wrong current password rejected
            res = await client.post("/api/profile/password", json={
                "current_password": "wrong-password",
                "new_password": "another-new-password"
            })
            assert res.status_code == 403, f"Expected 403 for wrong password, got {res.status_code}"

    # 7. Test partial PUT preserves existing fields (advisor bug fix)
    async with Session() as db:
        # Set up DB row with api_key
        await update_llm_config(db, api_key="sk-original-key", base_url="https://original.api/v1", model="original/model")

    async with Session() as db:
        # PUT with only model — should preserve api_key and base_url
        await update_llm_config(db, api_key=None, base_url=None, model="new/model")

        resolved = await resolve_llm_settings(db)
        assert resolved.api_key == "sk-original-key", f"Partial PUT with None api_key must preserve existing key, got {resolved.api_key}"
        assert resolved.base_url == "https://original.api/v1", f"Partial PUT with None base_url must preserve existing base_url, got {resolved.base_url}"
        assert resolved.model == "new/model", f"Partial PUT with model must update model, got {resolved.model}"

    # 8. Test empty string clears field (falls back to env)
    async with Session() as db:
        await update_llm_config(db, api_key="sk-to-clear", base_url="https://to-clear.api/v1", model="to-clear/model")

    async with Session() as db:
        # PUT with empty string for api_key — should clear override, fall back to env
        await update_llm_config(db, api_key="", base_url=None, model=None)

        resolved = await resolve_llm_settings(db)
        assert resolved.api_key == "sk-env-test-key-1234", f"Empty string api_key must clear override and fall back to env, got {resolved.api_key}"
        assert resolved.base_url == "https://to-clear.api/v1", f"None base_url must preserve existing, got {resolved.base_url}"
        assert resolved.model == "to-clear/model", f"None model must preserve existing, got {resolved.model}"

    print("test_account_surfaces_phase_a: ok")
    print("Partial PUT preservation tests: ok")


if __name__ == "__main__":
    asyncio.run(main())