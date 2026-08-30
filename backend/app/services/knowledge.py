"""Knowledge-base CRUD and file membership (PRD §3.5 / §6).

Deleting a knowledge base removes the `knowledge` row and its `knowledge_file`
membership rows only — underlying `file` rows are never deleted (files may exist
independently or belong to other knowledge bases).
"""

from __future__ import annotations

import time
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.file import File
from app.models.knowledge import Knowledge, KnowledgeFile
from app.schemas.knowledge import (
    KnowledgeFileMember,
    KnowledgeListItem,
    KnowledgeResponse,
)
from app.services.retrieval.bm25_cache import (
    invalidate_file_scope,
    invalidate_knowledge_scope,
)


class KnowledgeServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _to_response(kb: Knowledge) -> KnowledgeResponse:
    members: list[KnowledgeFileMember] = []
    file_ids: list[str] = []
    for link in kb.file_links:
        file_ids.append(link.file_id)
        if link.file is not None:
            members.append(
                KnowledgeFileMember(
                    file_id=link.file_id,
                    filename=link.file.filename,
                    status=link.file.status,
                    extraction_method=link.file.extraction_method,
                    created_at=link.created_at,
                )
            )
        else:
            members.append(
                KnowledgeFileMember(
                    file_id=link.file_id,
                    filename="",
                    status="unknown",
                    extraction_method=None,
                    created_at=link.created_at,
                )
            )
    return KnowledgeResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        meta=kb.meta,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        file_ids=file_ids,
        files=members,
    )


async def create_knowledge(
    db: AsyncSession,
    *,
    user_id: str,
    name: str,
    description: str | None = None,
    meta: dict | None = None,
) -> KnowledgeResponse:
    now = int(time.time())
    kb = Knowledge(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=name.strip(),
        description=description,
        meta=meta,
        created_at=now,
        updated_at=now,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    # Empty membership — no BM25 cache yet
    return KnowledgeResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        meta=kb.meta,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        file_ids=[],
        files=[],
    )


async def list_knowledge_for_user(
    db: AsyncSession, *, user_id: str
) -> list[KnowledgeListItem]:
    count_subq = (
        select(
            KnowledgeFile.knowledge_id,
            func.count(KnowledgeFile.id).label("file_count"),
        )
        .group_by(KnowledgeFile.knowledge_id)
        .subquery()
    )
    stmt = (
        select(Knowledge, func.coalesce(count_subq.c.file_count, 0))
        .outerjoin(count_subq, count_subq.c.knowledge_id == Knowledge.id)
        .where(Knowledge.user_id == user_id)
        .order_by(Knowledge.updated_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        KnowledgeListItem(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
            file_count=int(file_count),
        )
        for kb, file_count in rows
    ]


async def get_knowledge_for_user(
    db: AsyncSession, *, user_id: str, knowledge_id: str
) -> Knowledge | None:
    return await db.scalar(
        select(Knowledge)
        .where(Knowledge.id == knowledge_id, Knowledge.user_id == user_id)
        .options(selectinload(Knowledge.file_links).selectinload(KnowledgeFile.file))
    )


async def get_knowledge_response(
    db: AsyncSession, *, user_id: str, knowledge_id: str
) -> KnowledgeResponse | None:
    kb = await get_knowledge_for_user(db, user_id=user_id, knowledge_id=knowledge_id)
    if kb is None:
        return None
    return _to_response(kb)


async def update_knowledge(
    db: AsyncSession,
    *,
    user_id: str,
    knowledge_id: str,
    name: str | None = None,
    description: str | None = None,
    meta: dict | None = None,
    meta_provided: bool = False,
) -> KnowledgeResponse | None:
    kb = await get_knowledge_for_user(db, user_id=user_id, knowledge_id=knowledge_id)
    if kb is None:
        return None
    if name is not None:
        kb.name = name.strip()
    if description is not None:
        kb.description = description
    if meta_provided:
        kb.meta = meta
    kb.updated_at = int(time.time())
    await db.commit()
    # Reload with memberships
    refreshed = await get_knowledge_for_user(
        db, user_id=user_id, knowledge_id=knowledge_id
    )
    assert refreshed is not None
    return _to_response(refreshed)


async def delete_knowledge(
    db: AsyncSession, *, user_id: str, knowledge_id: str
) -> bool:
    """Delete KB + membership rows only. Does not delete underlying files."""
    kb = await db.scalar(
        select(Knowledge).where(Knowledge.id == knowledge_id, Knowledge.user_id == user_id)
    )
    if kb is None:
        return False
    invalidate_knowledge_scope(knowledge_id)
    await db.delete(kb)  # cascades to knowledge_file via ORM relationship
    await db.commit()
    return True


async def add_file_to_knowledge(
    db: AsyncSession,
    *,
    user_id: str,
    knowledge_id: str,
    file_id: str,
) -> KnowledgeResponse:
    kb = await get_knowledge_for_user(db, user_id=user_id, knowledge_id=knowledge_id)
    if kb is None:
        raise KnowledgeServiceError("not_found", "Knowledge base not found", 404)

    file_row = await db.scalar(
        select(File).where(File.id == file_id, File.user_id == user_id)
    )
    if file_row is None:
        raise KnowledgeServiceError("file_not_found", "File not found", 404)

    existing = await db.scalar(
        select(KnowledgeFile).where(
            KnowledgeFile.knowledge_id == knowledge_id,
            KnowledgeFile.file_id == file_id,
        )
    )
    if existing is not None:
        raise KnowledgeServiceError(
            "already_member",
            "File is already in this knowledge base",
            409,
        )

    now = int(time.time())
    db.add(
        KnowledgeFile(
            id=str(uuid.uuid4()),
            knowledge_id=knowledge_id,
            file_id=file_id,
            created_at=now,
        )
    )
    kb.updated_at = now
    await db.commit()

    # Membership change → invalidate KB BM25 cache (PRD §3.3)
    invalidate_knowledge_scope(knowledge_id)

    refreshed = await get_knowledge_for_user(
        db, user_id=user_id, knowledge_id=knowledge_id
    )
    assert refreshed is not None
    return _to_response(refreshed)


async def remove_file_from_knowledge(
    db: AsyncSession,
    *,
    user_id: str,
    knowledge_id: str,
    file_id: str,
) -> KnowledgeResponse:
    kb = await get_knowledge_for_user(db, user_id=user_id, knowledge_id=knowledge_id)
    if kb is None:
        raise KnowledgeServiceError("not_found", "Knowledge base not found", 404)

    link = await db.scalar(
        select(KnowledgeFile).where(
            KnowledgeFile.knowledge_id == knowledge_id,
            KnowledgeFile.file_id == file_id,
        )
    )
    if link is None:
        raise KnowledgeServiceError(
            "membership_not_found",
            "File is not in this knowledge base",
            404,
        )

    await db.delete(link)
    kb.updated_at = int(time.time())
    await db.commit()

    invalidate_knowledge_scope(knowledge_id)

    refreshed = await get_knowledge_for_user(
        db, user_id=user_id, knowledge_id=knowledge_id
    )
    assert refreshed is not None
    return _to_response(refreshed)


async def list_knowledge_ids_for_file(
    db: AsyncSession, *, file_id: str
) -> list[str]:
    """Used by ingestion/delete to invalidate every KB cache that includes this file."""
    result = await db.scalars(
        select(KnowledgeFile.knowledge_id).where(KnowledgeFile.file_id == file_id)
    )
    return list(result.all())


def invalidate_caches_for_file(file_id: str, knowledge_ids: list[str]) -> None:
    """Invalidate file-scoped BM25 plus every knowledge scope that includes the file."""
    invalidate_file_scope(file_id)
    for kid in knowledge_ids:
        invalidate_knowledge_scope(kid)
