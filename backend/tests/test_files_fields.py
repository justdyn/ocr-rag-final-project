"""GET /api/files/{file_id}/fields: owner-scoped stored SPJ fields + recomputed total.

Run: backend/.venv/Scripts/python.exe -m pytest backend/tests/test_files_fields.py
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.database import Base, get_db
from app.dependencies.auth import get_current_user
from app.tensho import create_app
from app.models.file import File
from app.models.user import User

NOW = int(time.time())


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        db.add(
            File(
                id="f1",
                user_id="u1",
                filename="spj.pdf",
                path="/tmp/f1.pdf",
                hash="x",
                status="ready",
                extraction_method="ocr:tesseract",
                ocr_confidence=None,
                meta={},
                data={
                    "text": "secret body text",
                    "fields": {
                        "lines": [
                            {"line_total": 10000},
                            {"line_total": 5000},
                        ],
                        "document_total": 999,  # stale stored value
                    },
                },
                created_at=NOW,
                updated_at=NOW,
            )
        )
        db.add(
            File(
                id="legacy",
                user_id="u1",
                filename="old.pdf",
                path="/tmp/legacy.pdf",
                hash="y",
                status="ready",
                extraction_method="text_layer",
                ocr_confidence=None,
                meta={},
                data=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        db.add(
            File(
                id="nofields",
                user_id="u1",
                filename="bare.pdf",
                path="/tmp/bare.pdf",
                hash="z",
                status="ready",
                extraction_method="text_layer",
                ocr_confidence=None,
                meta={},
                data={"text": "only text"},
                created_at=NOW,
                updated_at=NOW,
            )
        )
        db.add(
            File(
                id="u2file",
                user_id="u2",
                filename="other.pdf",
                path="/tmp/u2.pdf",
                hash="w",
                status="ready",
                extraction_method="text_layer",
                ocr_confidence=None,
                meta={},
                data={"fields": {"lines": [{"line_total": 1}]}},
                created_at=NOW,
                updated_at=NOW,
            )
        )
        await db.commit()

    current = {"id": "u1"}
    app = create_app()

    async def override_get_db():
        async with Session() as session:
            yield session

    async def override_user():
        return User(
            id=current["id"],
            name="Test",
            email=f"{current['id']}@test.local",
            role="user",
            created_at=1,
            updated_at=1,
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user

    client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )
    return client, current


def test_fields_happy_path_recomputes_total():
    async def run():
        client, _ = await _setup()
        async with client as c:
            res = await c.get("/api/files/f1/fields")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["id"] == "f1"
            assert body["status"] == "ready"
            assert body["fields"]["lines"] == [
                {"line_total": 10000},
                {"line_total": 5000},
            ]
            # recomputed from lines, stale stored 999 must not win
            assert body["document_total_computed"] == 15000
            assert "text" not in body["fields"]
            assert "data" not in body

    asyncio.run(run())


def test_fields_legacy_and_missing_fields_are_null():
    async def run():
        client, _ = await _setup()
        async with client as c:
            for file_id in ("legacy", "nofields"):
                res = await c.get(f"/api/files/{file_id}/fields")
                assert res.status_code == 200, res.text
                body = res.json()
                assert body["fields"] is None
                assert body["document_total_computed"] is None

    asyncio.run(run())


def test_fields_owner_scoped_and_missing_file_404():
    async def run():
        client, current = await _setup()
        async with client as c:
            current["id"] = "u2"
            res = await c.get("/api/files/u2file/fields")
            assert res.status_code == 200
            assert res.json()["document_total_computed"] == 1

            current["id"] = "u1"
            res = await c.get("/api/files/u2file/fields")
            assert res.status_code == 404
            assert res.json()["detail"] == "File not found"

            res = await c.get("/api/files/missing/fields")
            assert res.status_code == 404
            assert res.json()["detail"] == "File not found"

    asyncio.run(run())
