"""Authenticated conversation history reads (PRD §3.4 persistence UX)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.chat import MessageResponse
from app.services.conversations import list_messages_for_conversation

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


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
