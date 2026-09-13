"""Conversation title generation — unit + persist checks (MVP).

Run: backend/.venv/Scripts/python.exe backend/tests/test_title_generation.py
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all tables on Base.metadata
from app.core.database import Base
from app.models.conversation import Conversation
from app.services.title import (
    build_title_user_prompt,
    generate_title_for_chat,
    parse_title_json,
    persist_generated_title,
    should_generate_title,
    validate_title,
)


def test_gate() -> None:
    assert should_generate_title(
        needs_title=True, error_message=None, assistant_text="hello"
    )
    assert not should_generate_title(
        needs_title=False, error_message=None, assistant_text="hello"
    )
    assert not should_generate_title(
        needs_title=True, error_message="boom", assistant_text="hello"
    )
    assert not should_generate_title(
        needs_title=True, error_message=None, assistant_text=""
    )
    assert not should_generate_title(
        needs_title=True, error_message=None, assistant_text="   \n"
    )


def test_parse_and_validate() -> None:
    assert parse_title_json('{"title":"BM25 Hybrid RAG"}') == "BM25 Hybrid RAG"
    assert parse_title_json('```json\n{"title":"Fix Sidebar Scroll"}\n```') == (
        "Fix Sidebar Scroll"
    )
    assert parse_title_json("not json") is None
    assert parse_title_json('{"title": 7}') is None

    assert validate_title("  BM25 Hybrid RAG Chatbot  ") == "BM25 Hybrid RAG Chatbot"
    assert validate_title('Title: "RAG Architecture"') == "RAG Architecture"
    assert validate_title("New chat") is None
    assert validate_title("Untitled") is None
    assert validate_title("") is None
    assert validate_title(None) is None
    # Soft truncate over-long word lists
    long = "One Two Three Four Five Six Seven Eight Nine"
    out = validate_title(long)
    assert out is not None
    assert len(out.split()) == 7


def test_prompt_includes_attachments() -> None:
    prompt = build_title_user_prompt(
        user_text="Summarize this audit.",
        assistant_text="Here is the summary of the CBS audit.",
        attachment_filenames=["CBS_Audit.pdf", "notes.txt"],
    )
    assert "Summarize this audit." in prompt
    assert "- CBS_Audit.pdf" in prompt
    assert "- notes.txt" in prompt
    assert "Assistant (excerpt):" in prompt


class _FakeProvider:
    def __init__(self, raw: str) -> None:
        self.raw = raw
        self.calls = 0

    async def complete_chat(self, messages):  # noqa: ANN001
        self.calls += 1
        return self.raw


async def _db_roundtrip() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    now = int(time.time())
    async with Session() as db:
        db.add(
            Conversation(
                id="c1",
                user_id="u1",
                knowledge_id=None,
                title="How can I implement BM25...",
                title_source="auto",
                created_at=now,
                updated_at=now,
            )
        )
        await db.commit()

        ok = await persist_generated_title(
            db, conversation_id="c1", user_id="u1", title="BM25 Hybrid RAG"
        )
        assert ok is True
        convo = await db.scalar(select(Conversation).where(Conversation.id == "c1"))
        assert convo is not None
        assert convo.title == "BM25 Hybrid RAG"
        assert convo.title_source == "auto"
        assert convo.title_generated_at is not None

        # Manual lock — must not overwrite
        convo.title_source = "manual"
        convo.title = "My Locked Title"
        await db.commit()

        ok2 = await persist_generated_title(
            db, conversation_id="c1", user_id="u1", title="Should Not Win"
        )
        assert ok2 is False
        await db.refresh(convo)
        assert convo.title == "My Locked Title"

    # End-to-end generate on a fresh auto row (patch session factory → in-memory DB)
    import app.services.title as title_mod

    title_mod.AsyncSessionLocal = Session

    async with Session() as db:
        db.add(
            Conversation(
                id="c2",
                user_id="u1",
                knowledge_id=None,
                title="placeholder",
                title_source="auto",
                created_at=now,
                updated_at=now,
            )
        )
        await db.commit()

    provider = _FakeProvider('{"title":"Hybrid RAG Architecture"}')
    title = await generate_title_for_chat(
        needs_title=True,
        error_message=None,
        user_id="u1",
        conversation_id="c2",
        user_text="Help me design hybrid RAG",
        assistant_text="You should use BM25 plus dense embeddings.",
        attachment_filenames=["paper.pdf"],
        provider=provider,
    )
    assert title == "Hybrid RAG Architecture"
    assert provider.calls == 1

    async with Session() as db:
        c2 = await db.scalar(select(Conversation).where(Conversation.id == "c2"))
        assert c2 is not None
        assert c2.title == "Hybrid RAG Architecture"
        assert c2.title_generated_at is not None

    # Skip when needs_title is false
    provider2 = _FakeProvider('{"title":"Ignored"}')
    skipped = await generate_title_for_chat(
        needs_title=False,
        error_message=None,
        user_id="u1",
        conversation_id="c2",
        user_text="x",
        assistant_text="y",
        attachment_filenames=None,
        provider=provider2,
    )
    assert skipped is None
    assert provider2.calls == 0

    await engine.dispose()


def test_sse_title_frame_shape() -> None:
    from app.services.chat import format_sse

    frame = format_sse("title", {"conversation_id": "c1", "title": "BM25 Hybrid RAG"})
    assert frame.startswith("event: title\n")
    assert '"conversation_id": "c1"' in frame or '"conversation_id":"c1"' in frame
    assert "BM25 Hybrid RAG" in frame


async def main() -> None:
    test_gate()
    test_parse_and_validate()
    test_prompt_includes_attachments()
    test_sse_title_frame_shape()
    await _db_roundtrip()
    print("test_title_generation: OK")


if __name__ == "__main__":
    asyncio.run(main())
