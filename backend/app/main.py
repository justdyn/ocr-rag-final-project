"""FastAPI application entrypoint: `uvicorn app.main:app`."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.routers import (
    auth,
    chat,
    conversations,
    files,
    health,
    knowledge,
    memory,
    models,
    query,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure data dirs exist on boot; migrations are run via Alembic CLI, not import-time.
    get_settings().ensure_data_dirs()
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
    # P0 user-memory stub: mounted only when flagged on (off → prefix 404s).
    if settings.user_memory_enabled:
        application.include_router(memory.router)
    application.include_router(query.router)
    application.include_router(chat.router)
    application.include_router(models.router)
    return application


app = create_app()
