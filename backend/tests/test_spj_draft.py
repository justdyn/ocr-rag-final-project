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
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.dependencies.auth import get_current_user
from app.tensho import create_app
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


def _file_with_confidence(fid: str, user_id: str, lines: list[dict], confidence: float, below_threshold: bool) -> File:
    """Helper to create a file with specific confidence/below_threshold in fields."""
    return File(
        id=fid,
        user_id=user_id,
        filename=f"{fid}.pdf",
        path=f"/tmp/{fid}.pdf",
        hash=fid,
        status="ready",
        extraction_method="text_layer",
        ocr_confidence=None,
        meta={},
        data={
            "fields": {
                "vendor": None,
                "date": None,
                "currency": "IDR",
                "lines": lines,
                "confidence": confidence,
                "below_threshold": below_threshold,
            }
        },
        created_at=NOW,
        updated_at=NOW,
    )


async def _setup_confidence_test():
    """Setup with two KBs: one with high-confidence files, one with low-confidence files."""
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # KB with high-confidence lines (confidence 0.8, threshold 0.5)
        db.add(Knowledge(id="k_high", user_id="u1", name="High Conf", created_at=NOW, updated_at=NOW))
        # KB with low-confidence lines (confidence 0.3, threshold 0.5)
        db.add(Knowledge(id="k_low", user_id="u1", name="Low Conf", created_at=NOW, updated_at=NOW))

        # High confidence file: lines with qty x price -> confidence 0.8 each
        db.add(_file_with_confidence(
            "f_high1", "u1",
            [{"desc": "Item A", "qty": 2, "unit_price": 5000, "line_total": 10000, "confidence": 0.8}],
            confidence=0.8, below_threshold=False
        ))
        # Low confidence file: lines with low confidence (0.3 < 0.5 threshold)
        db.add(_file_with_confidence(
            "f_low1", "u1",
            [{"desc": "Item B", "qty": 1, "unit_price": 3000, "line_total": 3000, "confidence": 0.3}],
            confidence=0.3, below_threshold=True
        ))

        db.add(KnowledgeFile(id="kf_high", knowledge_id="k_high", file_id="f_high1", created_at=NOW))
        db.add(KnowledgeFile(id="kf_low", knowledge_id="k_low", file_id="f_low1", created_at=NOW))
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


def test_confirm_low_confidence_draft_returns_422():
    """Below-threshold draft: confirm returns 422 Confidence below threshold."""
    async def run():
        client, _, _ = await _setup_confidence_test()
        async with client as c:
            # Create draft from low-confidence KB
            res = await c.post("/api/knowledge/k_low/spj/draft")
            assert res.status_code == 200, res.text
            body = res.json()
            draft_id = body["id"]
            assert body["fields"]["below_threshold"] is True
            assert body["confirmed"] is False

            # Confirm should fail with 422
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 422, res.text
            assert res.json()["detail"] == "Confidence below threshold"

            # Draft should remain unconfirmed
            res = await c.get(f"/api/spj/drafts/{draft_id}")
            assert res.status_code == 200
            assert res.json()["confirmed"] is False

    asyncio.run(run())


def test_export_low_confidence_draft_returns_422():
    """Below-threshold draft: export returns 422 even if somehow confirmed."""
    async def run():
        client, _, Session = await _setup_confidence_test()
        async with client as c:
            res = await c.post("/api/knowledge/k_low/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]
            assert res.json()["fields"]["below_threshold"] is True

            # Export unconfirmed low-confidence draft -> 422 (threshold checked first)
            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 422, res.text
            assert res.json()["detail"] == "Confidence below threshold"

            # Manually confirm in DB (simulate bypass), then export should still be 422
            async with Session() as db:
                from app.models.spj_draft import SpjDraft
                draft = await db.get(SpjDraft, draft_id)
                draft.confirmed = True
                await db.commit()

            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 422, res.text
            assert res.json()["detail"] == "Confidence below threshold"

    asyncio.run(run())


def test_confirm_high_confidence_draft_succeeds():
    """Above-threshold draft: confirm returns 200, confirmed=true."""
    async def run():
        client, _, _ = await _setup_confidence_test()
        async with client as c:
            res = await c.post("/api/knowledge/k_high/spj/draft")
            assert res.status_code == 200, res.text
            body = res.json()
            draft_id = body["id"]
            assert body["fields"]["below_threshold"] is False
            assert body["confirmed"] is False

            # Confirm should succeed
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["id"] == draft_id
            assert body["confirmed"] is True
            assert body["document_total_computed"] == 10000

            # Idempotent
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200
            assert res.json()["confirmed"] is True

    asyncio.run(run())


def test_export_high_confidence_draft_after_confirm_returns_html():
    """Above-threshold confirmed draft: export returns 200 HTML attachment."""
    async def run():
        client, _, _ = await _setup_confidence_test()
        async with client as c:
            res = await c.post("/api/knowledge/k_high/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]
            assert res.json()["fields"]["below_threshold"] is False

            # Unconfirmed export still 409
            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 409
            assert res.json()["detail"] == "Draft not confirmed"

            # Confirm then export
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200

            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 200, res.text
            assert res.headers["content-type"].startswith("text/html")
            assert res.headers["content-disposition"] == f'attachment; filename="spj-{draft_id}.html"'
            assert "10,000" in res.text or "10000" in res.text

    asyncio.run(run())


def test_empty_lines_draft_below_threshold():
    """Empty lines => confidence 0 => below_threshold => cannot confirm/export."""
    async def run():
        engine = create_async_engine("sqlite+aiosqlite://")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)

        async with Session() as db:
            db.add(Knowledge(id="k_empty", user_id="u1", name="Empty Lines", created_at=NOW, updated_at=NOW))
            # File with empty lines array
            db.add(_file_with_confidence(
                "f_empty", "u1",
                [],
                confidence=0.0, below_threshold=True
            ))
            db.add(KnowledgeFile(id="kf_empty", knowledge_id="k_empty", file_id="f_empty", created_at=NOW))
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

        async with client as c:
            res = await c.post("/api/knowledge/k_empty/spj/draft")
            assert res.status_code == 200, res.text
            body = res.json()
            draft_id = body["id"]
            assert body["fields"]["lines"] == []
            assert body["fields"]["confidence"] == 0
            assert body["fields"]["below_threshold"] is True

            # Confirm should fail
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 422
            assert res.json()["detail"] == "Confidence below threshold"

            # Export should fail
            res = await c.get(f"/api/spj/drafts/{draft_id}/export")
            assert res.status_code == 422
            assert res.json()["detail"] == "Confidence below threshold"

    asyncio.run(run())


def test_patch_draft_updates_lines_and_recomputes_total():
    """PATCH replaces lines, recomputes line_total from qty*unit_price, returns updated total."""
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]

            # Original total = 25000 (10000 + 5000 + 10000)
            # Patch: change first line qty from 1 to 2, unit_price stays 10000 -> line_total 20000
            # Second line qty 1, unit_price 5000 -> 5000
            # Third line qty 1, unit_price 10000 -> 10000
            # New total = 20000 + 5000 + 10000 = 35000
            patch_body = {
                "lines": [
                    {"desc": "Line 1", "qty": 2, "unit_price": 10000},
                    {"desc": "Line 2", "qty": 1, "unit_price": 5000},
                    {"desc": "Line 3", "qty": 1, "unit_price": 10000},
                ]
            }
            res = await c.patch(f"/api/spj/drafts/{draft_id}", json=patch_body)
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["id"] == draft_id
            assert body["knowledge_id"] == "k1"
            assert body["confirmed"] is False
            # document_total_computed must match sum of recomputed line_total
            assert body["document_total_computed"] == 35000
            lines = body["fields"]["lines"]
            assert len(lines) == 3
            assert lines[0]["line_total"] == 20000
            assert lines[1]["line_total"] == 5000
            assert lines[2]["line_total"] == 10000
            # Confirm still works after patch
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200
            assert res.json()["confirmed"] is True

    asyncio.run(run())


def test_patch_draft_confirmed_returns_409():
    """PATCH on confirmed draft returns 409 Draft already confirmed."""
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]

            # Confirm first
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 200
            assert res.json()["confirmed"] is True

            # Now PATCH should fail with 409
            res = await c.patch(f"/api/spj/drafts/{draft_id}", json={"lines": []})
            assert res.status_code == 409, res.text
            assert res.json()["detail"] == "Draft already confirmed"

    asyncio.run(run())


def test_patch_draft_cross_user_returns_404():
    """PATCH by non-owner returns 404 (never 403)."""
    async def run():
        client, current, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]

            # Switch to other user
            current["id"] = "u2"
            res = await c.patch(f"/api/spj/drafts/{draft_id}", json={"lines": []})
            assert res.status_code == 404
            assert res.json()["detail"] == "Draft not found"

    asyncio.run(run())


def test_patch_draft_missing_returns_404():
    """PATCH non-existent draft returns 404."""
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.patch("/api/spj/drafts/missing", json={"lines": []})
            assert res.status_code == 404
            assert res.json()["detail"] == "Draft not found"

    asyncio.run(run())


def test_patch_draft_below_threshold_still_editable():
    """Below-threshold draft can still be edited; confirm gate unchanged."""
    async def run():
        client, _, _ = await _setup_confidence_test()
        async with client as c:
            res = await c.post("/api/knowledge/k_low/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]
            assert res.json()["fields"]["below_threshold"] is True

            # PATCH should succeed even when below_threshold
            res = await c.patch(f"/api/spj/drafts/{draft_id}", json={
                "lines": [{"desc": "Edited", "qty": 5, "unit_price": 1000}]
            })
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["document_total_computed"] == 5000
            assert body["fields"]["below_threshold"] is True  # unchanged

            # Confirm should still fail with 422
            res = await c.post(f"/api/spj/drafts/{draft_id}/confirm")
            assert res.status_code == 422
            assert res.json()["detail"] == "Confidence below threshold"

    asyncio.run(run())


def test_patch_draft_coerces_numbers_safely():
    """PATCH coerces qty/unit_price to int; invalid values default safely."""
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]

            # String numbers, missing fields, invalid values
            res = await c.patch(f"/api/spj/drafts/{draft_id}", json={
                "lines": [
                    {"desc": "A", "qty": "3", "unit_price": "2000"},  # string -> int
                    {"desc": "B", "qty": None, "unit_price": "abc"},  # None/invalid -> default 1, 0
                    {"desc": "C"},  # missing qty/unit_price -> defaults
                ]
            })
            assert res.status_code == 200, res.text
            body = res.json()
            lines = body["fields"]["lines"]
            assert lines[0]["line_total"] == 6000    # 3 * 2000
            assert lines[1]["line_total"] == 0       # 1 * 0
            assert lines[2]["line_total"] == 0       # 1 * 0
            assert body["document_total_computed"] == 6000
            # Stored qty/unit_price are coerced ints (clamped >= 0)
            assert lines[0]["qty"] == 3
            assert lines[0]["unit_price"] == 2000
            assert lines[1]["qty"] == 1
            assert lines[1]["unit_price"] == 0
            assert lines[2]["qty"] == 1
            assert lines[2]["unit_price"] == 0

    asyncio.run(run())


def test_patch_draft_preserves_confidence_and_extra_fields():
    """PATCH preserves confidence and other line fields; server recomputes line_total."""
    async def run():
        client, _, _ = await _setup()
        async with client as c:
            res = await c.post("/api/knowledge/k1/spj/draft")
            assert res.status_code == 200, res.text
            draft_id = res.json()["id"]

            # Send lines with confidence and extra fields
            res = await c.patch(f"/api/spj/drafts/{draft_id}", json={
                "lines": [
                    {"desc": "A", "qty": 2, "unit_price": 5000, "confidence": 0.9, "extra": "keep"},
                    {"desc": "B", "qty": 1, "unit_price": 3000, "confidence": 0.7},
                ]
            })
            assert res.status_code == 200, res.text
            body = res.json()
            lines = body["fields"]["lines"]
            # Server recomputes line_total
            assert lines[0]["line_total"] == 10000
            assert lines[1]["line_total"] == 3000
            # Confidence and extra fields preserved
            assert lines[0]["confidence"] == 0.9
            assert lines[0]["extra"] == "keep"
            assert lines[1]["confidence"] == 0.7
            # Stored qty/unit_price are ints
            assert lines[0]["qty"] == 2
            assert lines[0]["unit_price"] == 5000

    asyncio.run(run())
