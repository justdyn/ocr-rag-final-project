"""Profile avatar upload/retrieve tests (Phase B/C).

Run: backend/.venv/Scripts/python.exe -m pytest backend/tests/test_profile_avatar.py
"""

from __future__ import annotations

import asyncio
import io
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.config import get_settings, Settings
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.auth import Auth
from app.models.user import User

NOW = int(time.time())

# Minimal valid image bytes (1x1 pixel)
PNG_1X1 = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\xd7c\xf8\x0f\x00\x01\x01\x01\x00\xf0\xf5\xf4\xf3\x00\x00\x00\x00IEND\xaeB`\x82"
JPEG_1X1 = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xd2\xcf \xff\xd9"
WEBP_1X1 = b"RIFF\x1e\x00\x00\x00WEBPVP8 \x14\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"

AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MiB
USER_ID = "u1"


@asynccontextmanager
async def _app_context(tmp_dir: Path):
    """Create test app with isolated settings, DB, and a test user.

    Yields (client, settings, Session) where Session is the shared session factory.
    The caller should create a shared session and run the test within its context.
    """
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    # Override settings to use temp dir
    test_settings = Settings(
        data_dir=tmp_dir / "data",
        upload_dir=tmp_dir / "data" / "uploads",
        chroma_persist_dir=tmp_dir / "data" / "chroma",
        database_url="sqlite+aiosqlite://",
        jwt_secret="test-secret",
        user_memory_enabled=False,
    )
    test_settings.ensure_data_dirs()
    get_settings.cache_clear()

    # Create user in DB
    async with Session() as db:
        user = User(
            id=USER_ID,
            email="avatar_test@example.com",
            name="Avatar Test User",
            role="user",
            created_at=NOW,
            updated_at=NOW,
        )
        db.add(user)
        auth = Auth(
            id=USER_ID,
            email="avatar_test@example.com",
            password=hash_password("testpass123"),
            active=True,
        )
        db.add(auth)
        await db.commit()

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: test_settings

    yield app, test_settings, Session


@asynccontextmanager
async def _client_with_user(app, Session, user_id: str = USER_ID):
    """Create a test client with shared session and user override."""
    async with Session() as shared_db:
        async def override_get_db():
            yield shared_db

        async def override_user():
            result = await shared_db.execute(select(User).where(User.id == user_id))
            return result.scalar_one()

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_user

        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        async with client as c:
            yield c, shared_db

        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@asynccontextmanager
async def _client_no_auth(app, Session):
    """Create a test client without user override (for 401 tests)."""
    async with Session() as shared_db:
        async def override_get_db():
            yield shared_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides.pop(get_current_user, None)

        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        async with client as c:
            yield c

        app.dependency_overrides.pop(get_db, None)


async def _run_test(test_func):
    """Run an async test function with temporary directory."""
    with TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        async with _app_context(tmp_path) as (app, settings, Session):
            await test_func(app, settings, Session)


class TestAvatarUpload:
    """POST /api/profile/avatar tests."""

    def test_upload_png_happy_path(self):
        """Valid PNG ≤5 MiB → 200, file on disk, URL in response."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                )
                assert response.status_code == 200, response.text
                data = response.json()
                assert data["profile_image_url"] == "/api/profile/avatar"
                assert data["id"] == USER_ID
                assert data["email"] == "avatar_test@example.com"
                assert data["name"] == "Avatar Test User"

                # File exists on disk
                avatar_dir = settings.upload_dir / "avatars"
                png_path = avatar_dir / f"{USER_ID}.png"
                assert png_path.exists(), f"Expected avatar at {png_path}"
                assert png_path.read_bytes() == PNG_1X1

        asyncio.run(_run_test(run))

    def test_upload_jpeg_happy_path(self):
        """Valid JPEG ≤5 MiB → 200, file on disk."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.jpg", io.BytesIO(JPEG_1X1), "image/jpeg")},
                )
                assert response.status_code == 200
                avatar_dir = settings.upload_dir / "avatars"
                jpg_path = avatar_dir / f"{USER_ID}.jpg"
                assert jpg_path.exists()
                assert jpg_path.read_bytes() == JPEG_1X1

        asyncio.run(_run_test(run))

    def test_upload_webp_happy_path(self):
        """Valid WebP ≤5 MiB → 200, file on disk."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.webp", io.BytesIO(WEBP_1X1), "image/webp")},
                )
                assert response.status_code == 200
                avatar_dir = settings.upload_dir / "avatars"
                webp_path = avatar_dir / f"{USER_ID}.webp"
                assert webp_path.exists()
                assert webp_path.read_bytes() == WEBP_1X1

        asyncio.run(_run_test(run))

    def test_upload_replaces_existing(self):
        """Second upload replaces first (different ext)."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                # Upload PNG first
                await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                )
                png_path = settings.upload_dir / "avatars" / f"{USER_ID}.png"
                assert png_path.exists()

                # Upload JPEG second
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.jpg", io.BytesIO(JPEG_1X1), "image/jpeg")},
                )
                assert response.status_code == 200

                # PNG deleted, JPEG exists
                assert not png_path.exists()
                jpg_path = settings.upload_dir / "avatars" / f"{USER_ID}.jpg"
                assert jpg_path.exists()
                assert jpg_path.read_bytes() == JPEG_1X1

        asyncio.run(_run_test(run))

    def test_upload_over_5mib_rejected(self):
        """File >5 MiB → 413."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                large_content = b"x" * (AVATAR_MAX_BYTES + 1)
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("large.png", io.BytesIO(large_content), "image/png")},
                )
                assert response.status_code == 413
                assert "5 MiB" in response.json()["detail"]

        asyncio.run(_run_test(run))

    def test_upload_non_image_rejected(self):
        """PDF masquerading as PNG → 400 (magic bytes)."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                pdf_content = b"%PDF-1.4\n%Test PDF"
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("fake.png", io.BytesIO(pdf_content), "image/png")},
                )
                assert response.status_code == 400
                assert "Invalid image format" in response.json()["detail"]

        asyncio.run(_run_test(run))

    def test_upload_extension_mismatch_rejected(self):
        """JPEG content with .png extension → 400."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("mismatch.png", io.BytesIO(JPEG_1X1), "image/png")},
                )
                assert response.status_code == 400
                assert "does not match extension" in response.json()["detail"]

        asyncio.run(_run_test(run))

    def test_upload_unsupported_extension_rejected(self):
        """GIF extension → 400."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.gif", io.BytesIO(PNG_1X1), "image/gif")},
                )
                assert response.status_code == 400
                assert "JPEG, PNG, or WebP" in response.json()["detail"]

        asyncio.run(_run_test(run))

    def test_upload_unauthenticated_rejected(self):
        """No auth → 401."""
        async def run(app, settings, Session):
            async with _client_no_auth(app, Session) as c:
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                )
                assert response.status_code == 401

        asyncio.run(_run_test(run))


class TestAvatarGet:
    """GET /api/profile/avatar tests."""

    def test_get_avatar_owner_ok(self):
        """Owner GET → 200, image bytes, correct Content-Type."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                # Upload first
                await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                )

                # GET avatar
                response = await c.get("/api/profile/avatar")
                assert response.status_code == 200
                assert response.content == PNG_1X1
                assert response.headers["content-type"] == "image/png"
                assert "private, max-age=3600" in response.headers.get("cache-control", "")

        asyncio.run(_run_test(run))

    def test_get_avatar_jpeg_content_type(self):
        """JPEG avatar → image/jpeg Content-Type."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.jpg", io.BytesIO(JPEG_1X1), "image/jpeg")},
                )

                response = await c.get("/api/profile/avatar")
                assert response.headers["content-type"] == "image/jpeg"

        asyncio.run(_run_test(run))

    def test_get_avatar_webp_content_type(self):
        """WebP avatar → image/webp Content-Type."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.webp", io.BytesIO(WEBP_1X1), "image/webp")},
                )

                response = await c.get("/api/profile/avatar")
                assert response.headers["content-type"] == "image/webp"

        asyncio.run(_run_test(run))

    def test_get_avatar_not_found(self):
        """No avatar uploaded → 404."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.get("/api/profile/avatar")
                assert response.status_code == 404

        asyncio.run(_run_test(run))

    def test_get_avatar_unauthenticated_rejected(self):
        """No auth → 401."""
        async def run(app, settings, Session):
            async with _client_no_auth(app, Session) as c:
                response = await c.get("/api/profile/avatar")
                assert response.status_code == 401

        asyncio.run(_run_test(run))


class TestAvatarInUserResponse:
    """profile_image_url appears in UserResponse from /api/auth/me, /api/profile, /api/profile/avatar."""

    def test_me_returns_profile_image_url(self):
        """GET /api/auth/me includes profile_image_url."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.get("/api/auth/me")
                assert response.status_code == 200
                data = response.json()
                assert "profile_image_url" in data
                assert data["profile_image_url"] is None

        asyncio.run(_run_test(run))

    def test_update_profile_returns_profile_image_url(self):
        """PATCH /api/profile returns profile_image_url."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.patch(
                    "/api/profile",
                    json={"name": "New Name"},
                )
                assert response.status_code == 200
                data = response.json()
                assert "profile_image_url" in data
                assert data["profile_image_url"] is None
                assert data["name"] == "New Name"

        asyncio.run(_run_test(run))

    def test_upload_avatar_returns_profile_image_url(self):
        """POST /api/profile/avatar returns profile_image_url."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                response = await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                )
                assert response.status_code == 200
                data = response.json()
                assert data["profile_image_url"] == "/api/profile/avatar"

        asyncio.run(_run_test(run))

    def test_me_returns_profile_image_url_after_upload(self):
        """GET /api/auth/me reflects uploaded avatar URL."""
        async def run(app, settings, Session):
            async with _client_with_user(app, Session) as (c, _):
                await c.post(
                    "/api/profile/avatar",
                    files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                )

                response = await c.get("/api/auth/me")
                assert response.status_code == 200
                data = response.json()
                assert data["profile_image_url"] == "/api/profile/avatar"

        asyncio.run(_run_test(run))


if __name__ == "__main__":
    # Allow running as standalone script
    async def run_all():
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            async with _app_context(tmp_path) as (app, settings, Session):
                # Upload tests
                async with _client_with_user(app, Session) as (c, _):
                    # PNG
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert data["profile_image_url"] == "/api/profile/avatar"
                    avatar_dir = settings.upload_dir / "avatars"
                    assert (avatar_dir / f"{USER_ID}.png").read_bytes() == PNG_1X1

                    # JPEG
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.jpg", io.BytesIO(JPEG_1X1), "image/jpeg")},
                    )
                    assert response.status_code == 200
                    assert (avatar_dir / f"{USER_ID}.jpg").read_bytes() == JPEG_1X1

                    # WebP
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.webp", io.BytesIO(WEBP_1X1), "image/webp")},
                    )
                    assert response.status_code == 200
                    assert (avatar_dir / f"{USER_ID}.webp").read_bytes() == WEBP_1X1

                    # Replace
                    await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                    )
                    assert (avatar_dir / f"{USER_ID}.png").exists()
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.jpg", io.BytesIO(JPEG_1X1), "image/jpeg")},
                    )
                    assert not (avatar_dir / f"{USER_ID}.png").exists()
                    assert (avatar_dir / f"{USER_ID}.jpg").read_bytes() == JPEG_1X1

                    # Over 5 MiB
                    large_content = b"x" * (AVATAR_MAX_BYTES + 1)
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("large.png", io.BytesIO(large_content), "image/png")},
                    )
                    assert response.status_code == 413

                    # Non-image
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("fake.png", io.BytesIO(b"%PDF-1.4\n%Test PDF"), "image/png")},
                    )
                    assert response.status_code == 400

                    # Extension mismatch
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("mismatch.png", io.BytesIO(JPEG_1X1), "image/png")},
                    )
                    assert response.status_code == 400

                    # Unsupported extension
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.gif", io.BytesIO(PNG_1X1), "image/gif")},
                    )
                    assert response.status_code == 400

                # No auth
                async with _client_no_auth(app, Session) as c:
                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                    )
                    assert response.status_code == 401

                # GET tests
                async with _client_with_user(app, Session) as (c, _):
                    await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                    )
                    response = await c.get("/api/profile/avatar")
                    assert response.status_code == 200
                    assert response.content == PNG_1X1
                    assert response.headers["content-type"] == "image/png"

                    await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.jpg", io.BytesIO(JPEG_1X1), "image/jpeg")},
                    )
                    response = await c.get("/api/profile/avatar")
                    assert response.headers["content-type"] == "image/jpeg"

                    await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.webp", io.BytesIO(WEBP_1X1), "image/webp")},
                    )
                    response = await c.get("/api/profile/avatar")
                    assert response.headers["content-type"] == "image/webp"

                    response = await c.get("/api/profile/avatar")
                    assert response.status_code == 404

                # No auth GET
                async with _client_no_auth(app, Session) as c:
                    response = await c.get("/api/profile/avatar")
                    assert response.status_code == 401

                # UserResponse tests
                async with _client_with_user(app, Session) as (c, _):
                    response = await c.get("/api/auth/me")
                    assert response.status_code == 200
                    data = response.json()
                    assert "profile_image_url" in data
                    assert data["profile_image_url"] is None

                    response = await c.patch("/api/profile", json={"name": "New Name"})
                    assert response.status_code == 200
                    data = response.json()
                    assert "profile_image_url" in data
                    assert data["profile_image_url"] is None
                    assert data["name"] == "New Name"

                    response = await c.post(
                        "/api/profile/avatar",
                        files={"file": ("test.png", io.BytesIO(PNG_1X1), "image/png")},
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert data["profile_image_url"] == "/api/profile/avatar"

                    response = await c.get("/api/auth/me")
                    assert response.status_code == 200
                    data = response.json()
                    assert data["profile_image_url"] == "/api/profile/avatar"

    asyncio.run(run_all())
    print("All tests passed!")