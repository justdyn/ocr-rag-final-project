"""Conversation / message read helpers (history for Remix loaders).

Write path remains in ``app.services.chat``; this module only exposes scoped reads.
No schema migration — uses existing ``conversation`` / ``message`` tables.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.models.knowledge import Knowledge
from app.models.message import Message
from app.schemas.chat import KnowledgeConversationItem, MessageResponse


async def _owned_knowledge(
    db: AsyncSession, *, user_id: str, knowledge_id: str
) -> Knowledge | None:
    return await db.scalar(
        select(Knowledge).where(
            Knowledge.id == knowledge_id,
            Knowledge.user_id == user_id,
        )
    )


async def list_conversations_for_knowledge(
    db: AsyncSession,
    *,
    user_id: str,
    knowledge_id: str,
) -> list[KnowledgeConversationItem] | None:
    """Return conversation summaries for a KB, or ``None`` if KB missing/not owned.

    Empty list means the KB exists but has no conversations yet (not an error).
    """
    kb = await _owned_knowledge(db, user_id=user_id, knowledge_id=knowledge_id)
    if kb is None:
        return None

    rows = (
        await db.scalars(
            select(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.knowledge_id == knowledge_id,
            )
            .order_by(Conversation.updated_at.desc())
        )
    ).all()

    return [
        KnowledgeConversationItem(
            id=row.id,
            title=row.title,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


async def list_messages_for_conversation(
    db: AsyncSession,
    *,
    user_id: str,
    conversation_id: str,
) -> list[MessageResponse] | None:
    """Return ordered messages, or ``None`` if conversation missing/not owned.

    Uses 404-not-403 semantics at the router: existence of other users' threads
    must not leak. Empty list is a valid owned conversation with no messages.
    """
    convo = await db.scalar(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    if convo is None or convo.user_id != user_id:
        return None

    rows = (
        await db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
    ).all()

    return [
        MessageResponse(
            id=row.id,
            conversation_id=row.conversation_id,
            role=row.role,
            content=row.content,
            sources=row.sources,
            created_at=row.created_at,
        )
        for row in rows
    ]
