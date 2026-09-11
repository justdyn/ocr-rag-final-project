"""Owner-only user-memory endpoints (P0 stub, architecture §8.3).

Mounted only when ``USER_MEMORY_ENABLED`` is on (see ``app.main``); when off
the whole prefix 404s like any unknown route. Cross-user access is 404, not
403 — same rule as conversations.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.memory import MemoryCreate, MemoryFact, MemoryUpdate
from app.services import memory as memory_service

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("", response_model=list[MemoryFact])
async def list_memories(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MemoryFact]:
    """Active memory facts for the current user."""
    rows = await memory_service.list_memories(db, user_id=current_user.id)
    return [MemoryFact.model_validate(row) for row in rows]


@router.post("", response_model=MemoryFact)
async def create_memory(
    data: MemoryCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemoryFact:
    """Manual create (extract-based creation arrives in P1)."""
    memory = await memory_service.create_memory(db, user_id=current_user.id, data=data)
    return MemoryFact.model_validate(memory)


@router.patch("/{memory_id}", response_model=MemoryFact)
async def update_memory(
    memory_id: str,
    data: MemoryUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemoryFact:
    memory = await memory_service.get_memory_for_user(
        db, user_id=current_user.id, memory_id=memory_id
    )
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    updated = await memory_service.update_memory(db, memory, data)
    return MemoryFact.model_validate(updated)


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(
    memory_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Soft delete: status → ``soft_deleted``, list stops returning the row."""
    memory = await memory_service.get_memory_for_user(
        db, user_id=current_user.id, memory_id=memory_id
    )
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    await memory_service.soft_delete_memory(db, memory)
