"""Stream path emits SSE `title` before `done` on first turn only.

Run: backend/.venv/Scripts/python.exe backend/tests/test_title_stream_sse.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any, AsyncIterator

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.services.chat as chat_mod
from app.models.message import Message
from app.services.chat import ChatPrepared, stream_chat_events


class _StreamProvider:
    async def stream_chat(self, messages):  # noqa: ANN001
        yield "Hello "
        yield "world."

    async def complete_chat(self, messages):  # noqa: ANN001
        return '{"title":"Hello World Title"}'


def _parse_frames(raw: str) -> list[tuple[str, dict[str, Any]]]:
    frames: list[tuple[str, dict[str, Any]]] = []
    for block in raw.strip().split("\n\n"):
        if not block.strip():
            continue
        event = ""
        data_line = ""
        for line in block.split("\n"):
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data_line = line[6:]
        frames.append((event, json.loads(data_line)))
    return frames


async def main() -> None:
    prepared = ChatPrepared(
        conversation_id="c-new",
        user_message_id="m-user",
        messages=[{"role": "user", "content": "hi"}],
        sources=[],
        query="hi there",
        user_id="u1",
        needs_title=True,
        attachment_filenames=None,
    )

    async def fake_persist(db, **kwargs):  # noqa: ANN001
        return Message(
            id="m-asst",
            conversation_id=kwargs["conversation_id"],
            role="assistant",
            content=kwargs["content"],
            sources=kwargs.get("sources"),
            created_at=1,
        )

    class _Ctx:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *args):
            return False

    chat_mod.AsyncSessionLocal = lambda: _Ctx()  # type: ignore[assignment, return-value]
    chat_mod.persist_assistant_message = fake_persist  # type: ignore[assignment]

    async def fake_title(**kwargs):  # noqa: ANN003
        assert kwargs["needs_title"] is True
        return "Hello World Title"

    chat_mod.generate_title_for_chat = fake_title  # type: ignore[assignment]

    chunks: list[str] = []
    async for frame in stream_chat_events(
        prepared=prepared, provider=_StreamProvider()
    ):
        chunks.append(frame)

    frames = _parse_frames("".join(chunks))
    events = [e for e, _ in frames]
    assert "sources" in events
    assert "token" in events
    assert "title" in events
    assert "done" in events
    assert events.index("title") < events.index("done")
    title_payload = next(d for e, d in frames if e == "title")
    assert title_payload["title"] == "Hello World Title"
    assert title_payload["conversation_id"] == "c-new"

    # Resume with title already generated → no title frame
    prepared2 = ChatPrepared(
        conversation_id="c-old",
        user_message_id="m2",
        messages=[{"role": "user", "content": "again"}],
        sources=[],
        query="again",
        user_id="u1",
        needs_title=False,
    )

    async def fake_title_skip(**kwargs):  # noqa: ANN003
        assert kwargs["needs_title"] is False
        return None

    chat_mod.generate_title_for_chat = fake_title_skip  # type: ignore[assignment]
    chunks2: list[str] = []
    async for frame in stream_chat_events(
        prepared=prepared2, provider=_StreamProvider()
    ):
        chunks2.append(frame)
    events2 = [e for e, _ in _parse_frames("".join(chunks2))]
    assert "title" not in events2
    assert "done" in events2

    # Retry path: needs_title True even on resume when title_generated_at still NULL
    prepared3 = ChatPrepared(
        conversation_id="c-retry",
        user_message_id="m3",
        messages=[{"role": "user", "content": "retry"}],
        sources=[],
        query="retry",
        user_id="u1",
        needs_title=True,
    )

    async def fake_title_retry(**kwargs):  # noqa: ANN003
        assert kwargs["needs_title"] is True
        return "Retry Title"

    chat_mod.generate_title_for_chat = fake_title_retry  # type: ignore[assignment]
    chunks3: list[str] = []
    async for frame in stream_chat_events(
        prepared=prepared3, provider=_StreamProvider()
    ):
        chunks3.append(frame)
    events3 = [e for e, _ in _parse_frames("".join(chunks3))]
    assert "title" in events3
    assert events3.index("title") < events3.index("done")

    print("test_title_stream_sse: OK")


if __name__ == "__main__":
    asyncio.run(main())
