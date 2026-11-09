"""Owner-scoped user-memory CRUD + P1a scored retrieve (architecture §4.1 / §7–8 / §11).

The route mount is flag-gated in ``app.tensho`` (flag off → 404). Chat-path use is
flag-gated in ``prepare_chat`` — this module never checks the flag itself.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.user_memory import UserMemory
from app.schemas.memory import MemoryCreate, MemoryUpdate
from app.services.embeddings import embed_texts
from app.services.retrieval.query import _cosine

logger = logging.getLogger(__name__)

ACTIVE = "active"
SOFT_DELETED = "soft_deleted"

RETRIEVE_TOP_K = 5
RETRIEVE_CHAR_BUDGET = 2000
_W_COSINE = 0.7
_W_IMPORTANCE = 0.2
_W_RECENCY = 0.1

EXTRACT_FACT_MAX_CHARS = 200
EXTRACT_DEDUPE_COSINE = 0.92
EXTRACT_ACTIVE_CAP = 50

EXTRACT_SYSTEM_PROMPT = (
    "You extract durable facts about the user from a conversation turn. "
    'Return ONLY JSON: {"facts":["..."]} — each fact one short third-person '
    f"statement, at most {EXTRACT_FACT_MAX_CHARS} characters. Never include "
    'passwords, API keys, or tokens. If nothing durable, return {"facts":[]}.'
)

_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"\bbearer\s+\S", re.IGNORECASE),
    re.compile(r"\b(?:api[_\- ]?key|token|password|passwd|secret)\s*[:=]", re.IGNORECASE),
)


def should_schedule_memory_extract(
    *, enabled: bool, error_message: str | None, assistant_text: str
) -> bool:
    """P1b gate: extract only for a successful, non-empty assistant turn."""
    return bool(enabled and not error_message and assistant_text.strip())


def parse_extract_json(raw: str) -> list[str]:
    """Parse the extract LLM output into facts. Any failure → ``[]`` (never raises)."""
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            end = text.rfind("```")
            if end != -1:
                text = text[:end]
        data = json.loads(text.strip())
        if isinstance(data, dict):
            data = data.get("facts")
        if not isinstance(data, list):
            return []
        # Keep scalar facts only; dict/list/None entries are junk from a bad parse.
        return [
            str(f).strip()
            for f in data
            if isinstance(f, (str, int, float)) and not isinstance(f, bool)
        ]
    except Exception:
        return []


def scrub_extracted_facts(facts: list[str]) -> list[str]:
    """Drop secret-like facts and strip-empties; truncate to the extract limit."""
    out: list[str] = []
    for fact in facts:
        text = fact.strip()[:EXTRACT_FACT_MAX_CHARS]
        if not text or any(p.search(text) for p in _SECRET_PATTERNS):
            continue
        out.append(text)
    return out


def _now_ms() -> int:
    return int(time.time() * 1000)


def _embed_fact(content: str) -> bytes | None:
    """Best-effort fact embedding: JSON list[float] as UTF-8 bytes, else ``None``.

    Never raises — an embedding outage must not block saving the text itself.
    """
    try:
        return json.dumps(embed_texts([content])[0]).encode("utf-8")
    except Exception:
        return None


def _decode_vec(blob: bytes) -> list[float] | None:
    try:
        return json.loads(blob.decode("utf-8"))
    except Exception:
        return None


def _recency_scores(rows: list[UserMemory]) -> list[float]:
    """Min-max normalized ``updated_at`` (newer → higher) within the candidate set."""
    times = [row.updated_at for row in rows]
    lo, hi = min(times), max(times)
    if lo == hi:
        return [0.0] * len(rows)
    return [(t - lo) / (hi - lo) for t in times]


async def list_memories(db: AsyncSession, *, user_id: str) -> list[UserMemory]:
    """Active facts for the owner, newest update first (soft-deleted excluded)."""
    rows = (
        await db.scalars(
            select(UserMemory)
            .where(UserMemory.user_id == user_id, UserMemory.status == ACTIVE)
            .order_by(UserMemory.updated_at.desc())
        )
    ).all()
    return list(rows)


async def get_memory_for_user(
    db: AsyncSession, *, user_id: str, memory_id: str
) -> UserMemory | None:
    """Active memory owned by ``user_id``; soft-deleted / foreign rows → ``None``.

    404-not-403 at the router: other users' facts must not leak.
    """
    memory = await db.scalar(select(UserMemory).where(UserMemory.id == memory_id))
    if memory is None or memory.user_id != user_id or memory.status != ACTIVE:
        return None
    return memory


async def create_memory(
    db: AsyncSession,
    *,
    user_id: str,
    data: MemoryCreate,
    source_conversation_id: str | None = None,
    source_message_id: str | None = None,
) -> UserMemory:
    now = _now_ms()
    memory = UserMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        content=data.content,
        category=data.category,
        importance=data.importance,
        # Embed before the write so no DB transaction is held across embed_texts.
        embedding=_embed_fact(data.content),
        status=ACTIVE,
        source_conversation_id=source_conversation_id,
        source_message_id=source_message_id,
        created_at=now,
        updated_at=now,
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return memory


def _normalize_fact(text: str) -> str:
    return " ".join(text.split()).casefold()


async def upsert_extracted_memories(
    db: AsyncSession,
    *,
    user_id: str,
    facts: list[str],
    conversation_id: str,
    assistant_message_id: str,
) -> None:
    """P1b write path: dedupe (exact-normalize, then cosine ≥ 0.92), then cap.

    Exact match wins before embedding so an embedding outage still dedupes
    verbatim repeats. Cosine compares against actives that have a usable
    vector; facts without one are stored.
    """
    # ponytail: O(n) cosine scan of ≤50 actives per turn — fine until the
    # store grows unbounded; then an ANN index.
    actives = list(
        (
            await db.scalars(
                select(UserMemory).where(
                    UserMemory.user_id == user_id, UserMemory.status == ACTIVE
                )
            )
        ).all()
    )
    by_normalized = {_normalize_fact(row.content): row for row in actives}
    active_vectors = [
        v for v in (_decode_vec(row.embedding) for row in actives) if v is not None
    ]

    for fact in facts:
        normalized = _normalize_fact(fact)
        if normalized in by_normalized:
            continue
        vector = _decode_vec(_embed_fact(fact))
        if vector is not None and any(
            _cosine(vector, existing) >= EXTRACT_DEDUPE_COSINE
            for existing in active_vectors
        ):
            continue
        memory = await create_memory(
            db,
            user_id=user_id,
            data=MemoryCreate(content=fact),
            source_conversation_id=conversation_id,
            source_message_id=assistant_message_id,
        )
        by_normalized[normalized] = memory
        if vector is not None:
            active_vectors.append(vector)

    oldest_first = list(
        (
            await db.scalars(
                select(UserMemory)
                .where(UserMemory.user_id == user_id, UserMemory.status == ACTIVE)
                .order_by(UserMemory.updated_at.asc(), UserMemory.created_at.asc())
            )
        ).all()
    )
    overflow = oldest_first[: max(0, len(oldest_first) - EXTRACT_ACTIVE_CAP)]
    if overflow:
        now = _now_ms()
        for row in overflow:
            row.status = SOFT_DELETED
            row.updated_at = now
        await db.commit()


async def update_memory(
    db: AsyncSession, memory: UserMemory, data: MemoryUpdate
) -> UserMemory:
    updates = data.model_dump(exclude_unset=True)
    if "content" in updates:
        # Re-embed on content change, before the commit (a stale vector is worse
        # than none — failed embed clears the old one too).
        updates["embedding"] = _embed_fact(updates["content"])
    for field, value in updates.items():
        setattr(memory, field, value)
    memory.updated_at = _now_ms()
    await db.commit()
    await db.refresh(memory)
    return memory


async def soft_delete_memory(db: AsyncSession, memory: UserMemory) -> None:
    memory.status = SOFT_DELETED
    memory.updated_at = _now_ms()
    await db.commit()


async def retrieve_relevant_memories(
    db: AsyncSession, *, user_id: str, query: str
) -> list[UserMemory]:
    """P1a scored retrieval for chat injection. Best-effort: never raises into chat.

    Score = 0.7*cosine(query, fact) + 0.2*importance + 0.1*recency (recency is
    min-max normalized within the candidate set). Facts without a usable
    embedding fall back to importance+recency. Top-k facts within a total
    content char budget; active + not-expired + owner-scoped only.
    """
    try:
        rows = list(
            (
                await db.scalars(
                    select(UserMemory).where(
                        UserMemory.user_id == user_id,
                        UserMemory.status == ACTIVE,
                        or_(
                            UserMemory.expires_at.is_(None),
                            UserMemory.expires_at > _now_ms(),
                        ),
                    )
                )
            ).all()
        )
        if not rows:
            return []

        try:
            query_vec = embed_texts([query])[0]
        except Exception:
            query_vec = None  # degrade to importance+recency, never fail the chat

        scored: list[tuple[float, UserMemory]] = []
        for row, recency in zip(rows, _recency_scores(rows), strict=True):
            cosine = 0.0
            if query_vec is not None and row.embedding is not None:
                vector = _decode_vec(row.embedding)
                if vector is not None:
                    cosine = _cosine(query_vec, vector)
            score = (
                _W_COSINE * cosine
                + _W_IMPORTANCE * row.importance
                + _W_RECENCY * recency
            )
            scored.append((score, row))
        # Stable sort: equal scores keep the updated_at DESC query order.
        scored.sort(key=lambda pair: pair[0], reverse=True)

        picked: list[UserMemory] = []
        budget = 0
        for _, row in scored[:RETRIEVE_TOP_K]:
            if budget + len(row.content) > RETRIEVE_CHAR_BUDGET:
                continue
            picked.append(row)
            budget += len(row.content)
        return picked
    except Exception:
        return []  # retrieval must never break streaming chat


async def run_memory_extract(
    *,
    user_id: str,
    conversation_id: str,
    assistant_message_id: str,
    user_text: str,
    assistant_text: str,
    provider: Any,
) -> None:
    """P1b fire-and-forget body (scheduled via asyncio.create_task in chat.py).

    Opens its own fresh ``AsyncSessionLocal`` — never reuses the request/stream
    session. Any failure (LLM, parse, DB) is logged and swallowed: extract must
    never affect the chat turn that scheduled it.
    """
    try:
        raw = await provider.complete_chat(
            messages=[
                {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"User: {user_text}\n\nAssistant: {assistant_text}",
                },
            ]
        )
        facts = scrub_extracted_facts(parse_extract_json(str(raw)))
        if not facts:
            return
        async with AsyncSessionLocal() as db:
            await upsert_extracted_memories(
                db,
                user_id=user_id,
                facts=facts,
                conversation_id=conversation_id,
                assistant_message_id=assistant_message_id,
            )
    except Exception:
        logger.exception(
            "user memory extract failed (conversation=%s, assistant_message=%s)",
            conversation_id,
            assistant_message_id,
        )
