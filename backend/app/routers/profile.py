"""Authenticated user profile endpoints (Phase A)."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.dependencies.auth import CurrentUser
from app.models.auth import Auth
from app.models.user import User
from app.schemas.auth import UserResponse
from app.services.files import content_matches_extension, sniff_content_kind

router = APIRouter(prefix="/api/profile", tags=["profile"])

# Avatar constants
AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MiB
ALLOWED_AVATAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_AVATAR_KINDS = {"jpeg", "png", "webp"}


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.patch("", response_model=UserResponse)
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Update authenticated user's name."""
    current_user.name = body.name.strip()
    current_user.updated_at = int(time.time())
    await db.commit()
    await db.refresh(current_user)
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        profile_image_url=current_user.profile_image_url,
    )


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChangeRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Change authenticated user's password (verify current, set new)."""
    result = await db.execute(select(Auth).where(Auth.id == current_user.id))
    auth = result.scalar_one_or_none()
    if auth is None:
        raise HTTPException(status_code=404, detail="Auth record not found")

    if not verify_password(body.current_password, auth.password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        )

    auth.password = hash_password(body.new_password)
    current_user.updated_at = int(time.time())
    await db.commit()


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: Annotated[UploadFile, File(...)],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UserResponse:
    """Upload avatar image (JPEG/PNG/WebP, ≤5 MiB). Replaces existing avatar."""
    # Read and validate size
    contents = await file.read()
    if len(contents) > AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar must be ≤5 MiB",
        )

    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be JPEG, PNG, or WebP",
        )

    # Validate magic bytes
    kind = sniff_content_kind(contents)
    if kind not in ALLOWED_AVATAR_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image format",
        )
    if not content_matches_extension(contents, ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match extension",
        )

    # Ensure avatar directory exists
    avatar_dir = settings.upload_dir / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)

    # Delete prior avatar (any extension)
    for old_ext in ALLOWED_AVATAR_EXTENSIONS:
        old_path = avatar_dir / f"{current_user.id}{old_ext}"
        if old_path.exists():
            old_path.unlink()

    # Save new avatar
    avatar_path = avatar_dir / f"{current_user.id}{ext}"
    avatar_path.write_bytes(contents)

    # Update user record
    current_user.profile_image_url = f"/api/profile/avatar"
    current_user.updated_at = int(time.time())
    await db.commit()
    await db.refresh(current_user)

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        profile_image_url=current_user.profile_image_url,
    )


@router.get("/avatar")
async def get_avatar(
    current_user: CurrentUser,
    settings: Annotated[Settings, Depends(get_settings)],
) -> FileResponse:
    """Serve authenticated user's avatar image."""
    avatar_dir = settings.upload_dir / "avatars"

    # Find avatar file (any allowed extension)
    for ext in ALLOWED_AVATAR_EXTENSIONS:
        avatar_path = avatar_dir / f"{current_user.id}{ext}"
        if avatar_path.exists():
            media_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
            }[ext]
            response = FileResponse(avatar_path, media_type=media_type)
            response.headers["Cache-Control"] = "private, max-age=3600"
            return response

    raise HTTPException(status_code=404, detail="Avatar not found")