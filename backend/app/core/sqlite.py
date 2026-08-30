"""SQLite connection pragmas and bounded retry for writer lock contention.

This project has a single async engine (no sync twin, no SQLCipher). WAL +
busy_timeout must still be applied on every aiosqlite connection because
busy_timeout is per-connection and journal_mode is only sticky after the
first successful WAL pragma.
"""

from __future__ import annotations

import asyncio
import sqlite3
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import event
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import Settings, get_settings

# 1 try + 3 retries. Backoff is 50ms, 100ms, 200ms — busy_timeout already waits
# several seconds per attempt; this only covers residual races after the wait.
SQLITE_LOCK_RETRY_ATTEMPTS = 4
SQLITE_LOCK_RETRY_BASE_SECONDS = 0.05

_LOCKED_MARKERS = ("database is locked", "database is busy")


def is_sqlite_url(url: str) -> bool:
    return url.startswith("sqlite")


def is_sqlite_locked(exc: BaseException) -> bool:
    parts = [str(exc)]
    orig = getattr(exc, "orig", None)
    if orig is not None:
        parts.append(str(orig))
    if exc.__cause__ is not None:
        parts.append(str(exc.__cause__))
    text = " ".join(parts).lower()
    return any(marker in text for marker in _LOCKED_MARKERS)


def sqlite_connect_args(settings: Settings | None = None) -> dict[str, Any]:
    """Passed to sqlite3/aiosqlite connect. `timeout` is seconds."""
    settings = settings or get_settings()
    if not is_sqlite_url(settings.database_url):
        return {}
    return {"timeout": settings.sqlite_busy_timeout_ms / 1000.0}


def attach_sqlite_pragmas(
    engine: AsyncEngine, settings: Settings | None = None
) -> None:
    """Run journal_mode + busy_timeout on every new DBAPI connection.

    WAL creates sibling `-wal` / `-shm` files next to the DB and needs a
    writable local filesystem (not NFS). This codebase has no SQLCipher path;
    if one is added later, `PRAGMA journal_mode` must run *after* `PRAGMA key`.
    """
    settings = settings or get_settings()
    if not is_sqlite_url(str(engine.url)):
        return

    enable_wal = settings.database_enable_sqlite_wal
    timeout_ms = int(settings.sqlite_busy_timeout_ms)

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_on_connect(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        try:
            if enable_wal:
                cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute(f"PRAGMA busy_timeout={timeout_ms}")
        finally:
            cursor.close()


async def run_with_lock_retry(
    session: AsyncSession,
    work: Callable[[], Awaitable[None]],
    *,
    max_attempts: int = SQLITE_LOCK_RETRY_ATTEMPTS,
) -> None:
    """Re-run a mutate+commit unit after `database is locked`.

    `work` must include both the mutations and `await session.commit()` so a
    rollback can re-apply changes (rollback expires ORM objects).
    """
    delay = SQLITE_LOCK_RETRY_BASE_SECONDS
    for attempt in range(1, max_attempts + 1):
        try:
            await work()
            return
        except (OperationalError, sqlite3.OperationalError) as exc:
            if not is_sqlite_locked(exc) or attempt >= max_attempts:
                raise
            await session.rollback()
            await asyncio.sleep(delay)
            delay *= 2
