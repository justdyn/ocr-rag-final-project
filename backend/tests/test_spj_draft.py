"""SPJ draft POST/GET (Phase B2): persist fields snapshot, recompute total.

Run: backend/.venv/Scripts/python.exe -m pytest backend/tests/test_spj_draft.py
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
from app.main import create_app
from app.models.file import File
from app.models.knowledge import Knowledge, KnowledgeFile
from app.models.user import User

NOW = int(time.time())


def _file(fid: str, user_id: str, data) -> File:
    return File(
        id=fid,
        user_id=user_id,
        filename=f"{fid}.pdf",
        path=f"/tmp/{fid}.pdf",
        hash=fid,
        status="ready",
        extraction_method="ocr:tesseract",
        ocr_confidence=None,
        meta={},
        data=data,
        created_at=NOW,
        updated_at=NOW,
    )


async def _setup():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        db.add(Knowledge(id="k1", user_id="u1", name="SPJ", created_at=NOW, updated_at=NOW))
        db.add(Knowledge(id="k2", user_id="u1", name="Empty", created_at=NOW, updated_at=NOW))
        db.add(Knowledge(id="k_oth", user_id="u2", name="Other", created_at=NOW, updated_at=NOW))
        db.add(_file("f1", "u1", {"fields": {"vendor": None, "date": None, "lines": [
            {"line_total": 10000}, {"line_total": 5000},
        ]}}))
        db.add(_file("f2", "u1", {"fields": {"vendor": "PT X", "date": "2026-01-05", "lines": [
            {"line_total": 10000},
        ]}}))
        db.add(_file("f_bare", "u1", {"text": "no fields"}))
        db.add(_file("f_oth", "u2", {"fields": {"lines": [{"line_total": 1}]}}))
        # order matters: f1 first, then f2, then a fields-less member that must be skipped
        db.add(KnowledgeFile(id="kf1", knowledge_id="k1", file_id="f1", created_at=NOW))
        db.add(KnowledgeFile(id="kf2", knowledge_id="k1", file_id="f2", created_at=NOW + 1))
        db.add(KnowledgeFile(id="kf3", knowledge_id="k1", file_id="f_bare", created_at=NOW + 2))
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
    return client, current, Session


def test_post_draft_concatenates_member_lines():
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["knowledge_id"] == "k1"
            assert body["confirmed"] is False
            assert body["fields"]["vendor"] == "PT X"  # first non-null wins
            assert body["fields"]["date"] == "2026-01-05"
            assert body["fields"]["lines"] == [
                {"line_total": 10000}, {"line_total": 5000}, {"line_total": 10000},
            ]
            assert body["document_total_computed"] == 25000

    asyncio.run(run())


def test_post_draft_empty_membership_total_is_zero():
    """Choice: empty/no-parseable membership → fields with empty lines, total 0 (int, never null)."""
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k2/spj/draft")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["fields"]["lines"] == []
            assert body["document_total_computed"] == 0

    asyncio.run(run())


def test_get_draft_recomputes_total_ignoring_stored():
    async def run():
        client, _, Session = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            draft_id = res.json()["id"]

            # tamper: stale total inside stored JSON must be ignored on read
            async with Session() as db:
                from app.models.spj_draft import SpjDraft

                draft = await db.get(SpjDraft, draft_id)
                draft.fields["document_total"] = 999
                await db.commit()

            res = await c.get(f"/api/spj/drafts/{draft_id}")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["id"] == draft_id
            assert body["knowledge_id"] == "k1"
            assert body["confirmed"] is False
            assert body["document_total_computed"] == 25000

    asyncio.run(run())


def test_confirm_sets_confirmed_and_recomputes_total():
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            draft_id = res.json()["id"]

            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["id"] == draft_id
            assert body["knowledge_id"] == "k1"
            assert body["confirmed"] is True
            assert body["document_total_computed"] == 25000
            assert body["fields"]["lines"][-1] == {"line_total": 10000}

            # idempotent
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200, res.text
            assert res.json()["confirmed"] is True

    asyncio.run(run())


def test_export_gated_on_confirm_returns_html():
    async def run():
        client, current, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            draft_id = res.json()["id"]

            # unconfirmed → 409
            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 409, res.text
            assert res.json()["detail"] == "Draft not confirmed"

            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200, res.text

            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 200, res.text
            assert res.headers["content-type"].startswith("text/html")
            assert res.headers["content-disposition"] == f'attachment; filename="spj-{draft_id}.html"'
            assert "25,000" in res.text or "25000" in res.text  # recomputed total, not decoy

            # cross-user → 404
            current["id"] = "u2"
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 404
            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 404
            assert res.json()["detail"] == "Draft not found"

    asyncio.run(run())


def test_spj_owner_scoped_404():
    async def run():
        client, current, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/missing/spj/draft")
            assert res.status_code == 404
            assert res.json()["detail"] == "Knowledge not found"

            current["id"] = "u2"
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 404  # other user's knowledge, never 403

            # back to u1 for a valid draft, then read it as u2
            current["id"] = "u1"
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]

            current["id"] = "u2"
            res = await c.get(f"/api/spj/drafts/{draft_id}")
            assert res.status_code == 404
            assert res.json()["detail"] == "Draft not found"

            res = await c.get("/api/spj/drafts/missing")
            assert res.status_code == 404
            assert res.json()["detail"] == "Draft not found"

    asyncio.run(run())
