"""Verify conversation/message read endpoints (ownership + empty history).

Uses TestClient against the app DB (same pattern as verify_step5_chat.py).
Does not require LLM_API_KEY — seeds conversation/message rows directly.
"""

from __future__ import annotations

import time
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.tensho import app
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User


def _run_async(coro):
    import asyncio

    return asyncio.run(coro)


async def _seed_conversation(
    *,
    user_id: str,
    knowledge_id: str | None,
    with_messages: bool,
) -> str:
    now = int(time.time())
    convo_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        db.add(
            Conversation(
                id=convo_id,
                user_id=user_id,
                knowledge_id=knowledge_id,
                title="Seeded chat",
                created_at=now,
                updated_at=now,
            )
        )
        if with_messages:
            db.add(
                Message(
                    id=str(uuid.uuid4()),
                    conversation_id=convo_id,
                    role="user",
                    content="Hello?",
                    sources=None,
                    created_at=now,
                )
            )
            db.add(
                Message(
                    id=str(uuid.uuid4()),
                    conversation_id=convo_id,
                    role="assistant",
                    content="Hi [1].",
                    sources=[
                        {
                            "id": 1,
                            "chunk_id": "c1",
                            "file_id": "f1",
                            "text": "chunk",
                            "rrf_score": 0.1,
                            "rerank_score": 0.9,
                            "extraction_method": "text_layer",
                            "rank": 1,
                        }
                    ],
                    created_at=now + 1,
                )
            )
        await db.commit()
    return convo_id


def main() -> None:
    email_a = f"hist-a-{uuid.uuid4().hex[:8]}@example.com"
    email_b = f"hist-b-{uuid.uuid4().hex[:8]}@example.com"
    password = "password123"

    with TestClient(app) as client:
        for email, name in ((email_a, "UserA"), (email_b, "UserB")):
            reg = client.post(
                "/api/auth/register",
                json={"email": email, "password": password, "name": name},
            )
            assert reg.status_code == 201, reg.text

        login_a = client.post(
            "/api/auth/login", json={"email": email_a, "password": password}
        )
        assert login_a.status_code == 200, login_a.text
        token_a = login_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        login_b = client.post(
            "/api/auth/login", json={"email": email_b, "password": password}
        )
        assert login_b.status_code == 200, login_b.text
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Unauthenticated → 401
        unauth = client.get("/api/knowledge/does-not-matter/conversations")
        assert unauth.status_code == 401, unauth.text
        print("OK unauthenticated -> 401")

        # Create KB for user A
        kb = client.post(
            "/api/knowledge",
            headers=headers_a,
            json={"name": "History KB"},
        )
        assert kb.status_code == 201, kb.text
        kb_id = kb.json()["id"]

        # Empty history → [] not error
        empty = client.get(
            f"/api/knowledge/{kb_id}/conversations",
            headers=headers_a,
        )
        assert empty.status_code == 200, empty.text
        assert empty.json() == []
        print("OK empty conversation list")

        # Missing KB → 404
        missing_kb = client.get(
            f"/api/knowledge/{uuid.uuid4()}/conversations",
            headers=headers_a,
        )
        assert missing_kb.status_code == 404, missing_kb.text
        print("OK missing knowledge -> 404")

        # User B cannot list user A's KB conversations
        other_list = client.get(
            f"/api/knowledge/{kb_id}/conversations",
            headers=headers_b,
        )
        assert other_list.status_code == 404, other_list.text
        print("OK other user KB list -> 404")

        # Resolve user A id for seeding
        async def user_id_for(email: str) -> str:
            async with AsyncSessionLocal() as db:
                user = await db.scalar(select(User).where(User.email == email))
                assert user is not None
                return user.id

        user_a_id = _run_async(user_id_for(email_a))
        user_b_id = _run_async(user_id_for(email_b))

        convo_empty = _run_async(
            _seed_conversation(
                user_id=user_a_id, knowledge_id=kb_id, with_messages=False
            )
        )
        convo_full = _run_async(
            _seed_conversation(
                user_id=user_a_id, knowledge_id=kb_id, with_messages=True
            )
        )
        convo_b = _run_async(
            _seed_conversation(
                user_id=user_b_id, knowledge_id=None, with_messages=True
            )
        )

        listed = client.get(
            f"/api/knowledge/{kb_id}/conversations",
            headers=headers_a,
        )
        assert listed.status_code == 200, listed.text
        items = listed.json()
        assert len(items) == 2
        assert {row["id"] for row in items} == {convo_empty, convo_full}
        assert all(
            set(row.keys()) >= {"id", "title", "created_at", "updated_at"}
            for row in items
        )
        # Newest-first by updated_at (both seeded at nearly the same time — order stable enough)
        print("OK list conversations for owned KB")

        # Empty conversation messages → []
        empty_msgs = client.get(
            f"/api/conversations/{convo_empty}/messages",
            headers=headers_a,
        )
        assert empty_msgs.status_code == 200, empty_msgs.text
        assert empty_msgs.json() == []
        print("OK empty message list")

        # Own conversation with sources
        msgs = client.get(
            f"/api/conversations/{convo_full}/messages",
            headers=headers_a,
        )
        assert msgs.status_code == 200, msgs.text
        body = msgs.json()
        assert len(body) == 2
        assert body[0]["role"] == "user"
        assert body[1]["role"] == "assistant"
        assert body[1]["sources"][0]["id"] == 1
        assert body[0]["created_at"] <= body[1]["created_at"]
        print("OK own conversation messages + sources")

        # Other user's conversation → 404 (not 403)
        other = client.get(
            f"/api/conversations/{convo_b}/messages",
            headers=headers_a,
        )
        assert other.status_code == 404, other.text
        print("OK other user conversation -> 404")

        # Missing conversation → 404
        missing = client.get(
            f"/api/conversations/{uuid.uuid4()}/messages",
            headers=headers_a,
        )
        assert missing.status_code == 404, missing.text
        print("OK missing conversation -> 404")

    print("ALL conversation history read checks passed")


if __name__ == "__main__":
    main()
