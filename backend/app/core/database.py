"""Async SQLAlchemy engine and session helpers."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings
from app.core.sqlite import attach_sqlite_pragmas, sqlite_connect_args


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


settings = get_settings()

# Single async engine — this app never introduced a sync twin or SQLCipher.
# WAL/busy_timeout are applied here (connect_args + connect PRAGMA) so both
# request-scoped sessions and background ingestion sessions share them.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=sqlite_connect_args(settings),
)
attach_sqlite_pragmas(engine, settings)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield a request-scoped async session."""
    async with AsyncSessionLocal() as session:
        yield session
