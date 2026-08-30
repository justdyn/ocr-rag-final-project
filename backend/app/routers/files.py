"""Authenticated file upload, listing, status polling, and deletion (PRD §6)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.files import FileResponse, FileStatusResponse
from app.services.files import (
    FileServiceError,
    create_file_from_upload,
    delete_file_for_user,
    get_file_for_user,
    list_files_for_user,
    mark_pending_for_reprocess,
)
from app.services.ingestion import process_file_by_id

router = APIRouter(prefix="/api/files", tags=["files"])


def _to_response(file_row) -> FileResponse:
    return FileResponse.model_validate(file_row)


def _status_response(file_row) -> FileStatusResponse:
    meta = file_row.meta or {}
    error = meta.get("error") if file_row.status == "failed" else None
    return FileStatusResponse(
        id=file_row.id,
        status=file_row.status,
        extraction_method=file_row.extraction_method,
        error=error,
    )


@router.post("", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File(description="Document to ingest")],
) -> FileResponse | JSONResponse:
    """Store blob + pending row, then enqueue background ingestion."""
    try:
        file_row = await create_file_from_upload(
            db, user_id=current_user.id, upload=file
        )
    except FileServiceError as exc:
        if exc.code == "file_content_mismatch":
            return JSONResponse(
                status_code=400,
                content={"error": "file_content_mismatch"},
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    background_tasks.add_task(process_file_by_id, file_row.id)
    return _to_response(file_row)


@router.get("", response_model=list[FileResponse])
async def list_files(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FileResponse]:
    rows = await list_files_for_user(db, user_id=current_user.id)
    return [_to_response(row) for row in rows]


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    file_row = await get_file_for_user(db, user_id=current_user.id, file_id=file_id)
    if file_row is None:
        raise HTTPException(status_code=404, detail="File not found")
    return _to_response(file_row)


@router.get("/{file_id}/status", response_model=FileStatusResponse)
async def get_file_status(
    file_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileStatusResponse:
    file_row = await get_file_for_user(db, user_id=current_user.id, file_id=file_id)
    if file_row is None:
        raise HTTPException(status_code=404, detail="File not found")
    return _status_response(file_row)


@router.post("/{file_id}/process", response_model=FileResponse)
async def reprocess_file(
    file_id: str,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    """Re-enqueue ingestion (e.g. after fixing Tesseract or a failed run)."""
    file_row = await mark_pending_for_reprocess(
        db, user_id=current_user.id, file_id=file_id
    )
    if file_row is None:
        raise HTTPException(status_code=404, detail="File not found")
    background_tasks.add_task(process_file_by_id, file_row.id)
    return _to_response(file_row)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    deleted = await delete_file_for_user(db, user_id=current_user.id, file_id=file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
