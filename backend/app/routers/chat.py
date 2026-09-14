"""RAG-grounded chat completions — SSE streaming or JSON (PRD §3.4 / §6)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.chat import ChatCompletionRequest, ChatCompletionResponse
from app.services.chat import (
    ChatServiceError,
    complete_chat_json,
    prepare_chat,
    stream_chat_events,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/completions", response_model=None)
async def chat_completions(
    body: ChatCompletionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse | ChatCompletionResponse:
    """Retrieve hybrid chunks, inject into LLM prompt, stream or return JSON.

    SSE event order when ``stream=true``:
    1. ``sources`` — structured citation list (before any tokens)
    2. ``token`` — one or more ``{"delta": "..."}`` frames
    3. ``done`` — ``conversation_id`` / ``message_id``
    On failure: ``error`` (and optionally ``done`` with ``incomplete`` if partial text).
    """
    try:
        prepared, provider = await prepare_chat(
            db,
            user_id=current_user.id,
            scope_type=body.scope_type,
            scope_id=body.scope_id,
            query=body.query,
            conversation_id=body.conversation_id,
            k=body.k,
            attachment_file_ids=body.attachment_file_ids,
            model=body.model,
        )
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if not body.stream:
        try:
            return await complete_chat_json(db, prepared=prepared, provider=provider)
        except ChatServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return StreamingResponse(
        stream_chat_events(prepared=prepared, provider=provider),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
