"""RAG chat orchestration: retrieve → prompt → LLM → persist (PRD §3.4).

Persistence policy:
- User message is written once retrieval + prompt succeed (before LLM streaming).
- On successful completion: assistant message with full content + citation list.
- On mid-stream / LLM error after tokens started: assistant message is still
  persisted with whatever text was generated, and ``sources`` is stored as
  ``{"citations": [...], "incomplete": true, "error": "<message>"}`` so the
  UI can show a partial answer without treating it as a clean completion.
- If the LLM fails before any token, only the user message remains (no empty
  assistant row).
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.file import File
from app.models.message import Message
from app.schemas.chat import ChatCompletionResponse, ChatSource
from app.schemas.query import QueryChunkResult
from app.services.llm.base import LLMConfigError, LLMProvider, LLMProviderError
from app.services.llm.openai_compatible import get_llm_provider
from app.services.llm.prompt import build_rag_messages
from app.services.memory import (
    retrieve_relevant_memories,
    run_memory_extract,
    should_schedule_memory_extract,
)
from app.services.retrieval.query import QueryServiceError, run_query

ProviderFactory = Callable[[], LLMProvider]


class ChatServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass
class ChatPrepared:
    conversation_id: str
    user_message_id: str
    messages: list[dict[str, str]]
    sources: list[dict[str, Any]]
    query: str
    user_id: str


def _title_from_query(query: str) -> str:
    cleaned = " ".join(query.strip().split())
    if len(cleaned) <= 80:
        return cleaned
    return cleaned[:77] + "..."


async def _enrich_source_filenames(
    db: AsyncSession, sources: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Attach ``filename`` from the ``file`` table onto each citation source dict.

    Additive only — existing keys stay unchanged. Missing rows get ``filename: None``
    so older clients and incomplete joins remain safe.
    """
    file_ids = {s["file_id"] for s in sources if isinstance(s.get("file_id"), str)}
    if not file_ids:
        return [{**s, "filename": s.get("filename")} for s in sources]

    rows = (
        await db.execute(select(File.id, File.filename).where(File.id.in_(file_ids)))
    ).all()
    by_id = {row.id: row.filename for row in rows}
    return [{**s, "filename": by_id.get(s["file_id"])} for s in sources]


MAX_MESSAGE_ATTACHMENTS = 12
ATTACHMENT_EXCERPT_CHARS = 400


async def _resolve_message_attachments(
    db: AsyncSession, *, user_id: str, file_ids: list[str] | None
) -> list[dict[str, Any]]:
    """Snapshot owned files for the user message's ``attachments`` payload.

    Request ids are untrusted: dedupe, cap, and ownership-filter — missing or
    foreign rows are silently dropped (same tolerance as _enrich_source_filenames).
    """
    if not file_ids:
        return []
    unique_ids = list(dict.fromkeys(file_ids))[:MAX_MESSAGE_ATTACHMENTS]
    rows = (
        await db.scalars(
            select(File).where(File.id.in_(unique_ids), File.user_id == user_id)
        )
    ).all()
    by_id = {row.id: row for row in rows}
    out: list[dict[str, Any]] = []
    for file_id in unique_ids:
        row = by_id.get(file_id)
        if row is None:
            continue
        meta = row.meta or {}
        data = row.data if isinstance(row.data, dict) else {}
        text = data.get("text")
        excerpt = str(text).strip()[:ATTACHMENT_EXCERPT_CHARS] if text else None
        out.append(
            {
                "file_id": row.id,
                "filename": row.filename,
                "content_type": meta.get("content_type"),
                "extraction_method": row.extraction_method,
                "ocr_confidence": row.ocr_confidence,
                "text_excerpt": excerpt,
            }
        )
    return out


async def _get_or_create_conversation(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: str | None,
    scope_type: str,
    scope_id: str,
    query: str,
) -> Conversation:
    now = int(time.time())
    if conversation_id:
        convo = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        if convo is None:
            raise ChatServiceError("not_found", "Conversation not found", 404)
        convo.updated_at = now
        return convo

    knowledge_id = scope_id if scope_type == "knowledge" else None
    convo = Conversation(
        id=str(uuid.uuid4()),
        user_id=user_id,
        knowledge_id=knowledge_id,
        title=_title_from_query(query),
        created_at=now,
        updated_at=now,
    )
    db.add(convo)
    await db.flush()
    return convo


async def _load_history(
    db: AsyncSession, *, conversation_id: str, limit: int = 12
) -> list[dict[str, str]]:
    rows = list(
        (
            await db.scalars(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.asc())
            )
        ).all()
    )
    # Keep the most recent `limit` turns for context window hygiene
    recent = rows[-limit:] if len(rows) > limit else rows
    return [{"role": m.role, "content": m.content} for m in recent if m.role in ("user", "assistant")]


async def prepare_chat(
    db: AsyncSession,
    *,
    user_id: str,
    scope_type: str,
    scope_id: str,
    query: str,
    conversation_id: str | None = None,
    k: int | None = None,
    attachment_file_ids: list[str] | None = None,
    provider_factory: ProviderFactory | None = None,
) -> tuple[ChatPrepared, LLMProvider]:
    """Retrieve chunks, build prompt, ensure conversation + user message exist.

    Validates LLM config up front so streaming handlers fail before the SSE
    body starts when the key is missing.
    """
    factory = provider_factory or get_llm_provider
    provider = factory()
    # Fail fast on missing key (OpenAICompatibleProvider.require_configured)
    require = getattr(provider, "require_configured", None)
    if callable(require):
        try:
            require()
        except LLMConfigError as exc:
            raise ChatServiceError("llm_not_configured", exc.message, 503) from exc

    settings = get_settings()
    top_k = k if k is not None else settings.chat_retrieval_k

    try:
        retrieval = await run_query(
            db,
            user_id=user_id,
            scope_type=scope_type,  # type: ignore[arg-type]
            scope_id=scope_id,
            query=query,
            k=top_k,
            mode="hybrid",
        )
    except QueryServiceError as exc:
        raise ChatServiceError(exc.code, exc.message, exc.status_code) from exc

    chunks: list[QueryChunkResult] = retrieval.results
    convo = await _get_or_create_conversation(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        scope_type=scope_type,
        scope_id=scope_id,
        query=query,
    )
    history = await _load_history(db, conversation_id=convo.id)
    memory_facts: list[str] | None = None
    if settings.user_memory_enabled:
        # retrieve_relevant_memories never raises — embedding/DB failure degrades
        # to [] so the chat still streams.
        facts = await retrieve_relevant_memories(db, user_id=user_id, query=query)
        memory_facts = [fact.content for fact in facts]
    bundle = build_rag_messages(
        user_query=query, chunks=chunks, history=history, memory_facts=memory_facts
    )
    # Same list is emitted on SSE `sources`, non-streaming JSON, and message.sources.
    sources = await _enrich_source_filenames(db, bundle.sources)
    attachments = await _resolve_message_attachments(
        db, user_id=user_id, file_ids=attachment_file_ids
    )

    now = int(time.time())
    user_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=convo.id,
        role="user",
        content=query,
        sources=None,
        attachments=attachments or None,
        created_at=now,
    )
    db.add(user_msg)
    convo.updated_at = now
    await db.commit()

    prepared = ChatPrepared(
        conversation_id=convo.id,
        user_message_id=user_msg.id,
        messages=bundle.messages,
        sources=sources,
        query=query,
        user_id=user_id,
    )
    return prepared, provider


async def persist_assistant_message(
    db: AsyncSession,
    *,
    conversation_id: str,
    content: str,
    sources: list[dict[str, Any]],
    error: str | None = None,
) -> Message:
    now = int(time.time())
    if error:
        sources_payload: list[dict[str, Any]] | dict[str, Any] = {
            "citations": sources,
            "incomplete": True,
            "error": error,
        }
    else:
        sources_payload = sources

    msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role="assistant",
        content=content,
        sources=sources_payload,
        created_at=now,
    )
    db.add(msg)
    convo = await db.scalar(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    if convo is not None:
        convo.updated_at = now
    await db.commit()
    await db.refresh(msg)
    return msg


def format_sse(event: str, data: dict[str, Any]) -> str:
    """One SSE event frame (event name + JSON data)."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


_MEMORY_TASKS: set[asyncio.Task[None]] = set()


def _schedule_memory_extract(
    *,
    prepared: ChatPrepared,
    assistant_message_id: str,
    assistant_text: str,
    error_message: str | None,
    provider: LLMProvider,
) -> None:
    """P1b: fire-and-forget post-turn user-memory extract (never awaited).

    Runs only when the flag is on and the assistant turn was successful and
    non-empty. Task keeps a reference until done so asyncio cannot GC it
    mid-flight; copies of ids/strings only — no ORM objects, no session.
    """
    if not should_schedule_memory_extract(
        enabled=get_settings().user_memory_enabled,
        error_message=error_message,
        assistant_text=assistant_text,
    ):
        return
    task = asyncio.create_task(
        run_memory_extract(
            user_id=prepared.user_id,
            conversation_id=prepared.conversation_id,
            assistant_message_id=assistant_message_id,
            user_text=prepared.query,
            assistant_text=assistant_text,
            provider=provider,
        )
    )
    _MEMORY_TASKS.add(task)
    task.add_done_callback(_MEMORY_TASKS.discard)


async def stream_chat_events(
    *,
    prepared: ChatPrepared,
    provider: LLMProvider,
) -> AsyncIterator[str]:
    """Yield SSE frames: sources → token* → done (or error).

    Uses a fresh DB session for assistant persistence because the request-scoped
    session may already be closed by the time StreamingResponse is consumed.
    """
    # conversation_id is known before the first token (prepare_chat commits the
    # user turn first). Emit it on `sources` so the client can pin ?conversation=
    # in the URL before `done` — otherwise F5 mid-stream drops the thread.
    yield format_sse(
        "sources",
        {
            "sources": prepared.sources,
            "conversation_id": prepared.conversation_id,
        },
    )

    parts: list[str] = []
    error_message: str | None = None
    try:
        async for delta in provider.stream_chat(messages=prepared.messages):
            parts.append(delta)
            yield format_sse("token", {"delta": delta})
    except LLMConfigError as exc:
        error_message = exc.message
        yield format_sse("error", {"detail": exc.message, "code": "llm_not_configured"})
    except LLMProviderError as exc:
        error_message = exc.message
        yield format_sse("error", {"detail": exc.message, "code": "llm_upstream"})
    except Exception as exc:
        error_message = str(exc) or exc.__class__.__name__
        yield format_sse("error", {"detail": error_message, "code": "llm_error"})

    full_text = "".join(parts)
    assistant: Message | None = None

    async with AsyncSessionLocal() as db:
        if full_text:
            assistant = await persist_assistant_message(
                db,
                conversation_id=prepared.conversation_id,
                content=full_text,
                sources=prepared.sources,
                error=error_message,
            )
        elif not error_message:
            assistant = await persist_assistant_message(
                db,
                conversation_id=prepared.conversation_id,
                content="",
                sources=prepared.sources,
                error=None,
            )

    if error_message and not full_text:
        return

    assert assistant is not None
    # P1b: scheduled before `done` but never awaited — the stream finishes first.
    _schedule_memory_extract(
        prepared=prepared,
        assistant_message_id=assistant.id,
        assistant_text=full_text,
        error_message=error_message,
        provider=provider,
    )
    yield format_sse(
        "done",
        {
            "conversation_id": prepared.conversation_id,
            "message_id": assistant.id,
            "incomplete": bool(error_message),
        },
    )


async def complete_chat_json(
    db: AsyncSession,
    *,
    prepared: ChatPrepared,
    provider: LLMProvider,
) -> ChatCompletionResponse:
    """Non-streaming path for evaluation harness."""
    try:
        content = await provider.complete_chat(messages=prepared.messages)
    except LLMConfigError as exc:
        raise ChatServiceError("llm_not_configured", exc.message, 503) from exc
    except LLMProviderError as exc:
        raise ChatServiceError("llm_upstream", exc.message, 502) from exc

    assistant = await persist_assistant_message(
        db,
        conversation_id=prepared.conversation_id,
        content=content,
        sources=prepared.sources,
        error=None,
    )
    # P1b: scheduled before return, never awaited.
    _schedule_memory_extract(
        prepared=prepared,
        assistant_message_id=assistant.id,
        assistant_text=content,
        error_message=None,
        provider=provider,
    )
    return ChatCompletionResponse(
        conversation_id=prepared.conversation_id,
        message_id=assistant.id,
        content=content,
        sources=[ChatSource.model_validate(s) for s in prepared.sources],
    )
