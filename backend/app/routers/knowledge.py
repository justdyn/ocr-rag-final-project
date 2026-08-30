"""Authenticated knowledge-base CRUD and file membership (PRD §6)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.chat import KnowledgeConversationItem
from app.schemas.knowledge import (
    KnowledgeCreate,
    KnowledgeFileAdd,
    KnowledgeListItem,
    KnowledgeResponse,
    KnowledgeUpdate,
)
from app.services.conversations import list_conversations_for_knowledge
from app.services.knowledge import (
    KnowledgeServiceError,
    add_file_to_knowledge,
    create_knowledge,
    delete_knowledge,
    get_knowledge_response,
    list_knowledge_for_user,
    remove_file_from_knowledge,
    update_knowledge,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("", response_model=KnowledgeResponse, status_code=status.HTTP_201_CREATED)
async def create_kb(
    body: KnowledgeCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeResponse:
    return await create_knowledge(
        db,
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        meta=body.meta,
    )


@router.get("", response_model=list[KnowledgeListItem])
async def list_kbs(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[KnowledgeListItem]:
    return await list_knowledge_for_user(db, user_id=current_user.id)


@router.get("/{knowledge_id}", response_model=KnowledgeResponse)
async def get_kb(
    knowledge_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeResponse:
    result = await get_knowledge_response(
        db, user_id=current_user.id, knowledge_id=knowledge_id
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return result


@router.get(
    "/{knowledge_id}/conversations",
    response_model=list[KnowledgeConversationItem],
)
async def list_kb_conversations(
    knowledge_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[KnowledgeConversationItem]:
    """List the current user's conversations for this knowledge base (newest first).

    Empty list when the KB exists but has no chats yet — not an error.
    """
    result = await list_conversations_for_knowledge(
        db, user_id=current_user.id, knowledge_id=knowledge_id
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return result


@router.patch("/{knowledge_id}", response_model=KnowledgeResponse)
async def patch_kb(
    knowledge_id: str,
    body: KnowledgeUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeResponse:
    # Distinguish "meta omitted" vs "meta explicitly set to null"
    provided = body.model_fields_set
    result = await update_knowledge(
        db,
        user_id=current_user.id,
        knowledge_id=knowledge_id,
        name=body.name,
        description=body.description,
        meta=body.meta,
        meta_provided="meta" in provided,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return result


@router.delete("/{knowledge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kb(
    knowledge_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    deleted = await delete_knowledge(
        db, user_id=current_user.id, knowledge_id=knowledge_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Knowledge base not found")


@router.post(
    "/{knowledge_id}/files",
    response_model=KnowledgeResponse,
    status_code=status.HTTP_200_OK,
)
async def add_file(
    knowledge_id: str,
    body: KnowledgeFileAdd,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeResponse:
    try:
        return await add_file_to_knowledge(
            db,
            user_id=current_user.id,
            knowledge_id=knowledge_id,
            file_id=body.file_id,
        )
    except KnowledgeServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.delete("/{knowledge_id}/files/{file_id}", response_model=KnowledgeResponse)
async def remove_file(
    knowledge_id: str,
    file_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeResponse:
    try:
        return await remove_file_from_knowledge(
            db,
            user_id=current_user.id,
            knowledge_id=knowledge_id,
            file_id=file_id,
        )
    except KnowledgeServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
