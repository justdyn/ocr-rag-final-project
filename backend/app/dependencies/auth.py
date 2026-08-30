"""FastAPI dependencies for authenticated routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import JWTError, decode_access_token
from app.models.auth import Auth
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Resolve `Authorization: Bearer <jwt>` to the active `User` row.

    Remix BFF will read its httpOnly cookie and forward the token in this header.
    Downstream routers (files, knowledge, chat) should Depends(get_current_user)
    and scope queries by `user.id`.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise credentials_exception

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    result = await db.execute(
        select(User, Auth)
        .join(Auth, Auth.id == User.id)
        .where(User.id == user_id)
    )
    row = result.one_or_none()
    if row is None:
        raise credentials_exception

    user, auth = row
    if not auth.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
