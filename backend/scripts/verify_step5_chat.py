"""Phase 6 Step 5 verification — mock LLM (no live API key required).

Verifies:
- missing LLM_API_KEY → 503 with clear detail
- prompt construction wraps sources with citation ids
- SSE sequence: sources → token+ → done
- non-streaming JSON shape
- conversation/message persistence (including incomplete-on-error)

Does NOT verify live OpenAI streaming (LLM_API_KEY unset in this environment).
"""

from __future__ import annotations

import io
import json
import time
import uuid
from collections.abc import AsyncIterator

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.tensho import app
from app.models.message import Message
from app.services import chat as chat_service
from app.services.llm.prompt import SYSTEM_PROMPT, build_rag_messages
from app.schemas.query import QueryChunkResult


class MockLLMProvider:
    """Deterministic cloud-provider stand-in for verification."""

    def __init__(self, *, fail_after: int | None = None) -> None:
        self.fail_after = fail_after
        self.last_messages: list[dict[str, str]] | None = None

    def require_configured(self) -> None:
        return None

    async def stream_chat(
        self, *, messages: list[dict[str, str]]
    ) -> AsyncIterator[str]:
        self.last_messages = messages
        parts = ["The orchard ", "grows apples [1]."]
        for index, part in enumerate(parts):
            if self.fail_after is not None and index >= self.fail_after:
                raise RuntimeError("simulated upstream failure")
            yield part

    async def complete_chat(self, *, messages: list[dict[str, str]]) -> str:
        self.last_messages = messages
        return "The orchard grows apples [1]."


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    event_name = "message"
    data_lines: list[str] = []
    for line in body.splitlines():
        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].strip())
        elif line == "":
            if data_lines:
                payload = json.loads("\n".join(data_lines))
                events.append((event_name, payload))
            event_name = "message"
            data_lines = []
    if data_lines:
        events.append((event_name, json.loads("\n".join(data_lines))))
    return events


def wait_ready(client: TestClient, token: str, file_id: str, timeout: float = 120.0) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/files/{file_id}/status", headers=headers)
        r.raise_for_status()
        body = r.json()
        if body["status"] in ("ready", "failed"):
            return body
        time.sleep(0.4)
    raise TimeoutError(file_id)


def main() -> None:
    # --- unit: prompt construction ---
    chunks = [
        QueryChunkResult(
            chunk_id="c1",
            file_id="f1",
            text="Apples grow in orchards.",
            rrf_score=0.02,
            rerank_score=0.9,
            extraction_method="text_layer",
            rank=1,
        )
    ]
    bundle = build_rag_messages(user_query="Where do apples grow?", chunks=chunks)
    assert bundle.messages[0]["role"] == "system"
    assert "[1]" in SYSTEM_PROMPT or "cite" in SYSTEM_PROMPT.lower()
    assert '<source id="1">' in bundle.messages[-1]["content"]
    assert bundle.sources[0]["id"] == 1
    assert "Where do apples grow?" in bundle.messages[-1]["content"]
    print("OK prompt construction")

    # --- missing API key (real provider factory) ---
    get_settings.cache_clear()
    settings = get_settings()
    assert not settings.llm_api_key, "expected no LLM_API_KEY for this verification"

    email = f"step5-{uuid.uuid4().hex[:8]}@example.com"
    password = "password123"
    mock = MockLLMProvider()

    original_factory = chat_service.get_llm_provider

    with TestClient(app) as client:
        reg = client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "name": "Step5"},
        )
        assert reg.status_code == 201, reg.text
        login = client.post(
            "/api/auth/login", json={"email": email, "password": password}
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Upload + KB for retrieval scope
        up = client.post(
            "/api/files",
            headers=headers,
            files={
                "file": (
                    "orchard.txt",
                    io.BytesIO(
                        b"apple apple apple apple apple orchard fruit pie cider harvest\n"
                    ),
                    "text/plain",
                )
            },
        )
        assert up.status_code == 201, up.text
        file_id = up.json()["id"]
        status = wait_ready(client, token, file_id)
        assert status["status"] == "ready", status

        kb = client.post(
            "/api/knowledge",
            headers=headers,
            json={"name": "Step5 KB"},
        )
        assert kb.status_code == 201, kb.text
        kb_id = kb.json()["id"]
        add = client.post(
            f"/api/knowledge/{kb_id}/files",
            headers=headers,
            json={"file_id": file_id},
        )
        assert add.status_code == 200, add.text

        # Missing key → 503 (do not patch factory)
        missing = client.post(
            "/api/chat/completions",
            headers=headers,
            json={
                "scope_type": "knowledge",
                "scope_id": kb_id,
                "query": "Where do apples grow?",
                "stream": False,
            },
        )
        assert missing.status_code == 503, missing.text
        assert "LLM_API_KEY" in missing.json()["detail"]
        print("OK missing LLM_API_KEY -> 503")

        # Patch provider for streaming / JSON paths
        chat_service.get_llm_provider = lambda: mock  # type: ignore[assignment]
        # prepare_chat imports get_llm_provider from openai_compatible by default
        # via default arg — patch prepare_chat's factory by wrapping router calls
        # through prepare with explicit factory in a direct service test below.
        # For HTTP, patch chat.prepare_chat's default by monkeypatching module used in router.
        from app.services import chat as chat_mod
        from app.routers import chat as chat_router_mod

        async def prepare_with_mock(*args, **kwargs):
            kwargs.setdefault("provider_factory", lambda: mock)
            return await chat_mod.prepare_chat(*args, **kwargs)

        chat_router_mod.prepare_chat = prepare_with_mock  # type: ignore[assignment]

        # Non-streaming
        json_resp = client.post(
            "/api/chat/completions",
            headers=headers,
            json={
                "scope_type": "knowledge",
                "scope_id": kb_id,
                "query": "Where do apples grow?",
                "stream": False,
                "k": 3,
            },
        )
        assert json_resp.status_code == 200, json_resp.text
        body = json_resp.json()
        assert body["content"] == "The orchard grows apples [1]."
        assert body["conversation_id"]
        assert body["message_id"]
        assert isinstance(body["sources"], list)
        assert body["sources"][0]["id"] == 1
        assert body["sources"][0].get("filename"), body["sources"][0]
        assert '<source id="1">' in (mock.last_messages or [])[-1]["content"]
        convo_id = body["conversation_id"]
        msg_id = body["message_id"]

        import asyncio

        async def load_message(message_id: str) -> Message:
            async with AsyncSessionLocal() as db:
                row = await db.scalar(select(Message).where(Message.id == message_id))
                assert row is not None
                return row

        persisted = asyncio.run(load_message(msg_id))
        assert isinstance(persisted.sources, list)
        assert persisted.sources[0].get("filename"), persisted.sources[0]
        print("OK non-streaming JSON (sources include filename, persisted too)")

        # Streaming SSE
        mock2 = MockLLMProvider()

        async def prepare_with_mock2(*args, **kwargs):
            kwargs.setdefault("provider_factory", lambda: mock2)
            return await chat_mod.prepare_chat(*args, **kwargs)

        chat_router_mod.prepare_chat = prepare_with_mock2  # type: ignore[assignment]

        stream_resp = client.post(
            "/api/chat/completions",
            headers=headers,
            json={
                "scope_type": "knowledge",
                "scope_id": kb_id,
                "query": "Tell me about apples",
                "conversation_id": convo_id,
                "stream": True,
                "k": 3,
            },
        )
        assert stream_resp.status_code == 200, stream_resp.text
        assert "text/event-stream" in stream_resp.headers.get("content-type", "")
        events = _parse_sse(stream_resp.text)
        names = [name for name, _ in events]
        assert names[0] == "sources", names
        assert "token" in names
        assert names[-1] == "done", names
        assert events[0][1]["sources"][0]["chunk_id"]
        assert events[0][1]["sources"][0].get("filename"), events[0][1]["sources"][0]
        token_text = "".join(e[1]["delta"] for e in events if e[0] == "token")
        assert token_text == "The orchard grows apples [1]."
        assert events[-1][1]["conversation_id"] == convo_id
        print("OK SSE sources -> token -> done (filename present)")

        # Mid-stream error → incomplete assistant persistence
        mock_fail = MockLLMProvider(fail_after=1)

        async def prepare_with_fail(*args, **kwargs):
            kwargs.setdefault("provider_factory", lambda: mock_fail)
            return await chat_mod.prepare_chat(*args, **kwargs)

        chat_router_mod.prepare_chat = prepare_with_fail  # type: ignore[assignment]

        fail_resp = client.post(
            "/api/chat/completions",
            headers=headers,
            json={
                "scope_type": "file",
                "scope_id": file_id,
                "query": "force fail",
                "stream": True,
                "k": 2,
            },
        )
        assert fail_resp.status_code == 200
        fail_events = _parse_sse(fail_resp.text)
        fail_names = [n for n, _ in fail_events]
        assert "sources" in fail_names
        assert "error" in fail_names
        assert "done" in fail_names
        done = next(p for n, p in fail_events if n == "done")
        assert done["incomplete"] is True

        import asyncio

        async def load_assistant(message_id: str) -> Message:
            async with AsyncSessionLocal() as db:
                row = await db.scalar(select(Message).where(Message.id == message_id))
                assert row is not None
                return row

        assistant = asyncio.run(load_assistant(done["message_id"]))
        assert assistant.content == "The orchard "
        assert isinstance(assistant.sources, dict)
        assert assistant.sources.get("incomplete") is True
        print("OK incomplete persistence on stream error")

    # restore
    chat_service.get_llm_provider = original_factory  # type: ignore[assignment]
    print("\nVERIFICATION PASSED (mock LLM only - live API key path not tested)")


if __name__ == "__main__":
    main()
