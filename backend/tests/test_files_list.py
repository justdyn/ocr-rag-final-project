"""Paginated GET /api/files: default limit 10, type filter, q search, owner isolation.

Run: backend/.venv/Scripts/python.exe backend/tests/test_files_list.py
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.database import Base, get_db
from app.dependencies.auth import get_current_user
from app.main import create_app
from app.models.file import File
from app.models.user import User


async def _seed_files(Session, *, user_id: str, rows: list[tuple[str, str, int]]) -> None:
    """Insert (id, filename, updated_at) rows for user_id."""
    async with Session() as db:
        now = int(time.time())
        for file_id, filename, updated_at in rows:
            ext = Path(filename).suffix.lower()
            content_type = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".webp": "image/webp",
                ".pdf": "application/pdf",
                ".txt": "text/plain",
                ".md": "text/markdown",
                ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }.get(ext, "application/octet-stream")
            db.add(
                File(
                    id=file_id,
                    user_id=user_id,
                    filename=filename,
                    path=f"/tmp/{file_id}{ext}",
                    hash="x",
                    status="ready",
                    extraction_method="text_layer",
                    ocr_confidence=None,
                    meta={
                        "size_bytes": 1,
                        "content_type": content_type,
                        "extension": ext,
                        "original_filename": filename,
                    },
                    data=None,
                    created_at=updated_at,
                    updated_at=updated_at,
                )
            )
        await db.commit()


async def main() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    current = {"id": "u1"}

    app = create_app()

    async def override_get_db():
        async with Session() as session:
            yield session

    async def override_user():
        uid = current["id"]
        return User(
            id=uid,
            name="Test",
            email=f"{uid}@test.local",
            role="user",
            created_at=1,
            updated_at=1,
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user

    base = 1_700_000_000
    # 12 files for u1: mix of images + docs, newest first by updated_at
    u1_rows = [
        (f"f{i:02d}", name, base + (12 - i))
        for i, name in enumerate(
            [
                "report.pdf",
                "notes.txt",
                "slide.md",
                "photo.png",
                "scan.jpg",
                "memo.docx",
                "chart.webp",
                "brief.pdf",
                "logo.gif",
                "readme.md",
                "shot.jpeg",
                "extra.pdf",
            ]
        )
    ]
    await _seed_files(Session, user_id="u1", rows=u1_rows)
    await _seed_files(
        Session,
        user_id="u2",
        rows=[("other-1", "secret.pdf", base + 100)],
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Default: page 1, limit 10, envelope with total/has_more
        res = await client.get("/api/files")
        assert res.status_code == 200, res.text
        body = res.json()
        assert isinstance(body, dict), "expected paginated envelope, not bare array"
        assert body["page"] == 1
        assert body["limit"] == 10
        assert body["total"] == 12
        assert body["has_more"] is True
        assert len(body["items"]) == 10
        # Sort updated_at DESC → f00 (newest) first
        assert body["items"][0]["filename"] == "report.pdf"
        assert body["items"][0]["id"] == "f00"

        # Page 2
        res = await client.get("/api/files", params={"page": 2, "limit": 10})
        assert res.status_code == 200
        page2 = res.json()
        assert page2["page"] == 2
        assert page2["total"] == 12
        assert page2["has_more"] is False
        assert len(page2["items"]) == 2
        assert {r["id"] for r in page2["items"]} == {"f10", "f11"}

        # type=images
        res = await client.get("/api/files", params={"type": "images", "limit": 50})
        assert res.status_code == 200
        images = res.json()
        names = {r["filename"] for r in images["items"]}
        assert names == {"photo.png", "scan.jpg", "chart.webp", "logo.gif", "shot.jpeg"}
        assert images["total"] == 5
        assert all(
            r["filename"].lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))
            for r in images["items"]
        )

        # type=documents
        res = await client.get("/api/files", params={"type": "documents", "limit": 50})
        assert res.status_code == 200
        docs = res.json()
        doc_names = {r["filename"] for r in docs["items"]}
        assert doc_names == {
            "report.pdf",
            "notes.txt",
            "slide.md",
            "memo.docx",
            "brief.pdf",
            "readme.md",
            "extra.pdf",
        }
        assert docs["total"] == 7

        # q search (case-insensitive substring)
        res = await client.get("/api/files", params={"q": "READ", "limit": 50})
        assert res.status_code == 200
        found = res.json()
        assert found["total"] == 1
        assert found["items"][0]["filename"] == "readme.md"

        # Owner isolation: u2's secret.pdf never appears for u1
        res = await client.get("/api/files", params={"q": "secret", "limit": 50})
        assert res.status_code == 200
        assert res.json()["total"] == 0

        # Null / empty meta: still classifies as documents via filename
        async with Session() as db:
            db.add(
                File(
                    id="null-meta",
                    user_id="u1",
                    filename="orphan.pdf",
                    path="/tmp/orphan.pdf",
                    hash="y",
                    status="ready",
                    extraction_method=None,
                    ocr_confidence=None,
                    meta=None,
                    data=None,
                    created_at=base + 200,
                    updated_at=base + 200,
                )
            )
            db.add(
                File(
                    id="empty-meta",
                    user_id="u1",
                    filename="plain.txt",
                    path="/tmp/plain.txt",
                    hash="z",
                    status="ready",
                    extraction_method=None,
                    ocr_confidence=None,
                    meta={},
                    data=None,
                    created_at=base + 201,
                    updated_at=base + 201,
                )
            )
            await db.commit()

        res = await client.get("/api/files", params={"type": "documents", "limit": 50})
        assert res.status_code == 200
        doc_ids = {r["id"] for r in res.json()["items"]}
        assert "null-meta" in doc_ids
        assert "empty-meta" in doc_ids

        res = await client.get("/api/files", params={"type": "images", "limit": 50})
        assert res.status_code == 200
        img_ids = {r["id"] for r in res.json()["items"]}
        assert "null-meta" not in img_ids
        assert "empty-meta" not in img_ids

        # LIKE wildcards in q are treated literally
        res = await client.get("/api/files", params={"q": "report%", "limit": 50})
        assert res.status_code == 200
        assert res.json()["total"] == 0

        current["id"] = "u2"
        res = await client.get("/api/files")
        assert res.status_code == 200
        other = res.json()
        assert other["total"] == 1
        assert other["items"][0]["filename"] == "secret.pdf"
        assert other["limit"] == 10

    print("test_files_list: ok")


if __name__ == "__main__":
    asyncio.run(main())
