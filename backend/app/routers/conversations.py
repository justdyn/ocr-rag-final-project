"""Authenticated conversation history reads (PRD §3.4 persistence UX)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.chat import (
    ConversationSummary,
    ConversationUpdate,
    LastConversationScope,
    MessageResponse,
)
from app.services.conversations import (
    get_conversation_for_user,
    get_last_conversation_scope,
    list_messages_for_conversation,
    update_conversation,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("/last", response_model=LastConversationScope | None)
async def get_last_conversation(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LastConversationScope | None:
    """KB of the user's most recent conversation (sidebar hydrate only)."""
    return await get_last_conversation_scope(db, user_id=current_user.id)


@router.get("/{conversation_id}", response_model=ConversationSummary)
async def get_conversation(
    conversation_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConversationSummary:
    """Conversation metadata for path hydrate (404 if missing/not owned)."""
    summary = await get_conversation_for_user(
        db,
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
    if summary is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return summary


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MessageResponse]:
    """Full message history for an owned conversation (404 if missing/not owned)."""
    messages = await list_messages_for_conversation(
        db,
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
    if messages is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return messages


@router.patch("/{conversation_id}", response_model=ConversationSummary)
async def patch_conversation(
    conversation_id: str,
    body: ConversationUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConversationSummary:
    """Update title and/or llm_model on an owned conversation."""
    title = body.title.strip() if body.title is not None else None
    if body.title is not None and not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if title is None and body.llm_model is None:
        raise HTTPException(
            status_code=400, detail="Provide title and/or llm_model"
        )
    summary = await update_conversation(
        db,
        user_id=current_user.id,
        conversation_id=conversation_id,
        title=title,
        llm_model=body.llm_model,
    )
    if summary is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return summary
