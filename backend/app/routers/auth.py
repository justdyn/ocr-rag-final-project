"""Auth HTTP surface: register, login, me, logout (PRD §6)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import CurrentUser
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth import AuthError, authenticate_user, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    try:
        return await register_user(
            db,
            email=str(body.email),
            password=body.password,
            name=body.name,
        )
    except AuthError as exc:
        if exc.code == "email_taken":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=exc.message,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        ) from exc


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Return JWT in JSON body for the Remix BFF to store as an httpOnly cookie."""
    try:
        return await authenticate_user(
            db,
            email=str(body.email),
            password=body.password,
        )
    except AuthError as exc:
        status_code = (
            status.HTTP_403_FORBIDDEN
            if exc.code == "inactive"
            else status.HTTP_401_UNAUTHORIZED
        )
        raise HTTPException(status_code=status_code, detail=exc.message) from exc


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser) -> UserResponse:
    """Prove `get_current_user` — also the permanent current-user endpoint."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        profile_image_url=current_user.profile_image_url,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    """Stateless JWT: no server-side revoke. Remix BFF should clear the httpOnly cookie.

    This endpoint is a no-op acknowledgment — the token remains valid until `exp`.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)
