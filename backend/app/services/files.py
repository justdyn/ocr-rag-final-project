"""File upload / listing / ownership-scoped CRUD helpers."""

from __future__ import annotations

import hashlib
import time
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.sqlite import run_with_lock_retry
from app.models.document_chunk import DocumentChunk
from app.models.file import File
from app.models.knowledge import KnowledgeFile
from app.services.chroma_store import delete_file_collection
from app.services.knowledge import invalidate_caches_for_file

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".md",
    ".png",
    ".jpg",
    ".jpeg",
    ".docx",
    ".pptx",
    ".xlsx",
}

MIME_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# Stdlib magic-byte sniffing — no python-magic. Not an antivirus scan.
PDF_MAGIC = b"%PDF-"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
# OOXML (.docx/.pptx/.xlsx) are ZIP containers; the empty-archive and
# spanned-set markers are also ZIP and must not fall through to "text".
ZIP_MAGICS = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")

KIND_BY_EXTENSION = {
    ".pdf": "pdf",
    ".png": "png",
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".txt": "text",
    ".md": "text",
    ".docx": "ooxml",
    ".pptx": "ooxml",
    ".xlsx": "ooxml",
}

# Mirror frontend libraryFileIsImage filename suffixes (+ meta.content_type image/*).
IMAGE_FILENAME_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp")
FileListType = str  # "all" | "images" | "documents"


class FileServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _extension_for(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def sniff_content_kind(data: bytes) -> str | None:
    """Return a coarse kind from well-known signatures, or None if unknown."""
    # ponytail: signatures checked at byte 0 only (no offset scan, no libmagic,
    # not an antivirus). Upgrade to python-magic if padded/polyglot uploads become a threat.
    if data.startswith(PDF_MAGIC):
        return "pdf"
    if data.startswith(PNG_MAGIC):
        return "png"
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    if any(data.startswith(magic) for magic in ZIP_MAGICS):
        return "zip"
    return None


def content_matches_extension(data: bytes, extension: str) -> bool:
    """True when sniffed bytes agree with the declared extension.

    Text/markdown have no required magic; they are rejected if they look like
    PDF/PNG/JPEG/ZIP. Image/PDF extensions must match their signatures.
    OOXML (.docx/.pptx/.xlsx) are ZIP containers, so expected "ooxml"
    matches sniffed "zip".
    """
    expected = KIND_BY_EXTENSION.get(extension)
    if expected is None:
        return False
    sniffed = sniff_content_kind(data)
    if expected == "text":
        return sniffed is None
    if expected == "ooxml":
        return sniffed == "zip"
    return sniffed == expected


async def create_file_from_upload(
    db: AsyncSession,
    *,
    user_id: str,
    upload: UploadFile,
) -> File:
    settings = get_settings()
    filename = upload.filename or "upload.bin"
    extension = _extension_for(filename)

    if extension not in SUPPORTED_EXTENSIONS:
        raise FileServiceError(
            "unsupported_type",
            f"Unsupported file type '{extension}'. Allowed: {sorted(SUPPORTED_EXTENSIONS)}",
            status_code=400,
        )

    raw = await upload.read()
    size = len(raw)
    if size == 0:
        raise FileServiceError("empty_upload", "Uploaded file is empty", status_code=400)
    if size > settings.max_upload_bytes:
        raise FileServiceError(
            "file_too_large",
            f"File exceeds max size of {settings.max_upload_bytes} bytes",
            status_code=413,
        )
    if not content_matches_extension(raw, extension):
        raise FileServiceError(
            "file_content_mismatch",
            "File content does not match the declared extension",
            status_code=400,
        )

    file_id = str(uuid.uuid4())
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.upload_dir / f"{file_id}{extension}"
    dest.write_bytes(raw)

    digest = hashlib.sha256(raw).hexdigest()
    now = int(time.time())
    content_type = upload.content_type or MIME_BY_EXTENSION.get(extension)

    file_row = File(
        id=file_id,
        user_id=user_id,
        filename=filename,
        path=str(dest),
        hash=digest,
        status="pending",
        extraction_method=None,
        ocr_confidence=None,
        meta={
            "size_bytes": size,
            "content_type": content_type,
            "extension": extension,
            "original_filename": filename,
        },
        data=None,
        created_at=now,
        updated_at=now,
    )
    async def _insert() -> None:
        db.add(file_row)
        await db.commit()

    await run_with_lock_retry(db, _insert)
    await db.refresh(file_row)
    return file_row


def _image_predicate():
    """SQL predicate matching frontend libraryFileIsImage heuristics.

    Null/missing meta.content_type must be boolean-false for the image branch
    so ``~predicate`` still classifies those rows as documents.
    """
    suffix_clauses = [File.filename.ilike(f"%{suffix}") for suffix in IMAGE_FILENAME_SUFFIXES]
    content_type = File.meta["content_type"].as_string()
    return or_(
        *suffix_clauses,
        and_(content_type.is_not(None), content_type.like("image/%")),
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_files_for_user(db: AsyncSession, *, user_id: str) -> list[File]:
    """Full owner list (legacy). Prefer list_files_for_user_paginated for Library."""
    result = await db.scalars(
        select(File).where(File.user_id == user_id).order_by(File.updated_at.desc())
    )
    return list(result.all())


async def list_files_for_user_paginated(
    db: AsyncSession,
    *,
    user_id: str,
    q: str | None = None,
    file_type: FileListType = "all",
    page: int = 1,
    limit: int = 10,
) -> tuple[list[File], int]:
    """Owner-scoped file page ordered by updated_at DESC.

    Returns (rows, total_matching). file_type: all | images | documents.
    """
    if page < 1:
        page = 1
    if limit < 1:
        limit = 10

    filters = [File.user_id == user_id]
    if q and (needle := q.strip()):
        filters.append(
            File.filename.ilike(f"%{_escape_like(needle)}%", escape="\\")
        )

    if file_type == "images":
        filters.append(_image_predicate())
    elif file_type == "documents":
        filters.append(~_image_predicate())

    where = and_(*filters)
    total = await db.scalar(select(func.count()).select_from(File).where(where))
    total_n = int(total or 0)

    result = await db.scalars(
        select(File)
        .where(where)
        .order_by(File.updated_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    return list(result.all()), total_n


async def get_file_for_user(
    db: AsyncSession,
    *,
    user_id: str,
    file_id: str,
) -> File | None:
    return await db.scalar(
        select(File).where(File.id == file_id, File.user_id == user_id)
    )


async def delete_file_for_user(
    db: AsyncSession,
    *,
    user_id: str,
    file_id: str,
) -> bool:
    file_row = await get_file_for_user(db, user_id=user_id, file_id=file_id)
    if file_row is None:
        return False

    blob_path = Path(file_row.path) if file_row.path else None
    kb_ids = list(
        (
            await db.scalars(
                select(KnowledgeFile.knowledge_id).where(KnowledgeFile.file_id == file_id)
            )
        ).all()
    )
    delete_file_collection(file_id)
    invalidate_caches_for_file(file_id, kb_ids)

    async def _delete() -> None:
        # Explicit child deletes — do not rely only on ORM/FK cascade.
        await db.execute(delete(DocumentChunk).where(DocumentChunk.file_id == file_id))
        await db.execute(delete(KnowledgeFile).where(KnowledgeFile.file_id == file_id))
        db.expire(file_row, ["chunks", "knowledge_links"])
        await db.delete(file_row)
        await db.commit()

    await run_with_lock_retry(db, _delete)

    if blob_path is not None:
        try:
            blob_path.unlink(missing_ok=True)
        except OSError:
            pass
    return True


async def mark_pending_for_reprocess(
    db: AsyncSession,
    *,
    user_id: str,
    file_id: str,
) -> File | None:
    file_row = await get_file_for_user(db, user_id=user_id, file_id=file_id)
    if file_row is None:
        return None
    async def _mark_pending() -> None:
        file_row.status = "pending"
        file_row.updated_at = int(time.time())
        await db.commit()

    await run_with_lock_retry(db, _mark_pending)
    await db.refresh(file_row)
    return file_row
