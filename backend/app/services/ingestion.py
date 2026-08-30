"""End-to-end file ingestion: extract → chunk → embed → Chroma + DB rows."""

from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.sqlite import run_with_lock_retry
from app.models.document_chunk import DocumentChunk
from app.models.file import File
from app.models.knowledge import KnowledgeFile
from app.services.chunking import split_text
from app.services.chroma_store import delete_file_collection, upsert_chunks
from app.services.embeddings import embed_texts
from app.services.extraction import ExtractionError, extract_file
from app.services.knowledge import invalidate_caches_for_file


async def process_file_by_id(file_id: str) -> None:
    """Background entrypoint — opens its own DB session (request session is closed)."""
    async with AsyncSessionLocal() as db:
        await run_ingestion(db, file_id)


async def run_ingestion(db: AsyncSession, file_id: str) -> None:
    """Process one file through the full ingestion pipeline."""
    file_row = await db.scalar(select(File).where(File.id == file_id))
    if file_row is None:
        return

    settings = get_settings()
    now = int(time.time())

    async def _mark_processing() -> None:
        file_row.status = "processing"
        file_row.updated_at = now
        await db.commit()

    await run_with_lock_retry(db, _mark_processing)

    try:
        if not file_row.path:
            raise ExtractionError("missing_path", "File has no stored blob path")

        path = Path(file_row.path)
        if not path.is_file():
            raise ExtractionError("missing_blob", f"Blob not found at {file_row.path}")

        extension = Path(file_row.filename).suffix.lower()
        extracted = extract_file(path, extension=extension)

        chunks = split_text(
            extracted.text,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        if not chunks:
            raise ExtractionError("empty_chunks", "No chunks produced from extracted text")

        # Clear previous vectors / chunk rows (reprocess-safe)
        delete_file_collection(file_id)

        async def _clear_chunks() -> None:
            await db.execute(delete(DocumentChunk).where(DocumentChunk.file_id == file_id))
            await db.commit()

        await run_with_lock_retry(db, _clear_chunks)

        # Chunks changed → invalidate file BM25 + every KB that includes this file
        kb_ids = list(
            (
                await db.scalars(
                    select(KnowledgeFile.knowledge_id).where(
                        KnowledgeFile.file_id == file_id
                    )
                )
            ).all()
        )
        # Release the read snapshot before embed/Chroma — holding it across
        # MiniLM would keep a SQLite lock open for seconds (the original lock).
        await db.commit()
        invalidate_caches_for_file(file_id, kb_ids)

        chroma_ids = [f"{file_id}:{index}" for index in range(len(chunks))]
        embeddings = embed_texts(chunks)
        metadatas: list[dict[str, Any]] = [
            {
                "file_id": file_id,
                "chunk_index": index,
                "extraction_method": extracted.extraction_method,
            }
            for index in range(len(chunks))
        ]
        collection_name = upsert_chunks(
            file_id=file_id,
            chunk_ids=chroma_ids,
            texts=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        now = int(time.time())
        chunk_rows = [
            DocumentChunk(
                id=str(uuid.uuid4()),
                file_id=file_id,
                chunk_index=index,
                text=chunk_text,
                chroma_collection=collection_name,
                chroma_id=chroma_ids[index],
                extraction_method=extracted.extraction_method,
                meta={"char_count": len(chunk_text)},
                created_at=now,
                updated_at=now,
            )
            for index, chunk_text in enumerate(chunks)
        ]

        async def _persist_ready() -> None:
            ready_row = await db.scalar(select(File).where(File.id == file_id))
            if ready_row is None:
                # Deleted while embedding — drop the collection we just upserted.
                delete_file_collection(file_id)
                return
            db.add_all(chunk_rows)
            meta = dict(ready_row.meta or {})
            meta.update(extracted.meta or {})
            meta["chunk_count"] = len(chunks)
            meta["char_count"] = len(extracted.text)
            meta.pop("error", None)
            meta.pop("error_message", None)
            ready_row.status = "ready"
            ready_row.extraction_method = extracted.extraction_method
            ready_row.ocr_confidence = extracted.ocr_confidence
            ready_row.data = {"text": extracted.text}
            ready_row.meta = meta
            ready_row.updated_at = now
            await db.commit()

        await run_with_lock_retry(db, _persist_ready)

    except ExtractionError as exc:
        await db.rollback()
        await _mark_failed(db, file_id, code=exc.code, message=exc.message)
    except Exception as exc:
        await db.rollback()
        await _mark_failed(
            db,
            file_id,
            code="processing_error",
            message=str(exc) or exc.__class__.__name__,
        )


async def _mark_failed(
    db: AsyncSession,
    file_id: str,
    *,
    code: str,
    message: str,
) -> None:
    file_row = await db.scalar(select(File).where(File.id == file_id))
    if file_row is None:
        return
    meta = dict(file_row.meta or {})
    meta["error"] = code
    meta["error_message"] = message

    async def _persist_failed() -> None:
        file_row.status = "failed"
        file_row.meta = meta
        file_row.updated_at = int(time.time())
        await db.commit()

    await run_with_lock_retry(db, _persist_failed)
