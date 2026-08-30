"""WAL/busy_timeout + bounded lock-retry checks — no FastAPI required."""

from __future__ import annotations

import asyncio
import sqlite3
import sys
import tempfile
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings, get_settings
from app.core.sqlite import (
    attach_sqlite_pragmas,
    is_sqlite_locked,
    run_with_lock_retry,
    sqlite_connect_args,
)


class _FakeSession:
    def __init__(self, fail_times: int) -> None:
        self.fail_times = fail_times
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1
        if self.commits <= self.fail_times:
            raise OperationalError(
                "INSERT",
                {},
                sqlite3.OperationalError("database is locked"),
            )

    async def rollback(self) -> None:
        self.rollbacks += 1


async def _assert_retry_succeeds() -> None:
    session = _FakeSession(fail_times=2)

    async def work() -> None:
        await session.commit()

    await run_with_lock_retry(session, work)
    assert session.commits == 3, session.commits
    assert session.rollbacks == 2, session.rollbacks


async def _assert_retry_is_bounded() -> None:
    session = _FakeSession(fail_times=99)

    async def work() -> None:
        await session.commit()

    try:
        await run_with_lock_retry(session, work, max_attempts=4)
    except OperationalError:
        pass
    else:
        raise AssertionError("expected OperationalError after retry cap")
    assert session.commits == 4, session.commits
    assert session.rollbacks == 3, session.rollbacks


async def _assert_engine_pragmas() -> None:
    settings = get_settings()
    from app.core.database import engine

    async with engine.connect() as conn:
        journal = (await conn.execute(text("PRAGMA journal_mode"))).scalar()
        timeout = (await conn.execute(text("PRAGMA busy_timeout"))).scalar()
    assert str(journal).lower() == "wal", f"journal_mode={journal!r}"
    assert int(timeout) == settings.sqlite_busy_timeout_ms, f"busy_timeout={timeout!r}"
    print(f"engine pragmas: journal_mode={journal} busy_timeout={timeout}")


async def _assert_concurrent_writers() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "locktest.db"
        url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
        cfg = Settings(
            database_url=url,
            database_enable_sqlite_wal=True,
            sqlite_busy_timeout_ms=8000,
        )
        engine = create_async_engine(
            url,
            connect_args=sqlite_connect_args(cfg),
            pool_pre_ping=True,
        )
        attach_sqlite_pragmas(engine, cfg)
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)"))

        async def writer(i: int) -> None:
            async with engine.begin() as conn:
                await conn.execute(text("INSERT INTO t (v) VALUES (:v)"), {"v": str(i)})

        await asyncio.gather(*[writer(i) for i in range(12)])
        async with engine.connect() as conn:
            count = (await conn.execute(text("SELECT COUNT(*) FROM t"))).scalar()
            journal = (await conn.execute(text("PRAGMA journal_mode"))).scalar()
        await engine.dispose()
        assert count == 12, count
        assert str(journal).lower() == "wal", journal


def main() -> int:
    assert is_sqlite_locked(sqlite3.OperationalError("database is locked"))
    assert is_sqlite_locked(
        OperationalError("x", {}, sqlite3.OperationalError("database is locked"))
    )
    assert not is_sqlite_locked(sqlite3.OperationalError("no such table: t"))

    asyncio.run(_assert_retry_succeeds())
    asyncio.run(_assert_retry_is_bounded())
    asyncio.run(_assert_engine_pragmas())
    asyncio.run(_assert_concurrent_writers())
    print("sqlite lock retry + WAL checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
