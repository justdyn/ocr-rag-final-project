"""FastAPI application entrypoint: `uvicorn app.tensho:app`."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.routers import (
    admin,
    auth,
    chat,
    conversations,
    files,
    health,
    knowledge,
    memory,
    models,
    profile,
    query,
    spj,
)


async def _bootstrap_admin() -> None:
    """If ADMIN_BOOTSTRAP_EMAIL is set and matches a user, set role=admin (idempotent)."""
    email = get_settings().admin_bootstrap_email
    if not email:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email.lower().strip()))
        user = result.scalar_one_or_none()
        if user and user.role != "admin":
            user.role = "admin"
            await db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure data dirs exist on boot; migrations are run via Alembic CLI, not import-time.
    get_settings().ensure_data_dirs()
    await _bootstrap_admin()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )
    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(files.router)
    application.include_router(knowledge.router)
    application.include_router(conversations.router)
    application.include_router(profile.router)
    # P0 user-memory stub: mounted only when flagged on (off → prefix 404s).
    if settings.user_memory_enabled:
        application.include_router(memory.router)
    application.include_router(query.router)
    application.include_router(chat.router)
    application.include_router(models.router)
    application.include_router(spj.router)
    application.include_router(admin.router)
    return application


app = create_app()
