"""Auth domain service: register + authenticate against user/auth tables."""

from __future__ import annotations

import time
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.auth import Auth
from app.models.user import User
from app.schemas.auth import TokenResponse, UserResponse


class AuthError(Exception):
    """Domain error translated to HTTP by the router."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, name=user.name, role=user.role)


async def register_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    name: str,
) -> UserResponse:
    """Create matching `user` + `auth` rows (same id). Raises AuthError on conflict."""
    normalized = _normalize_email(email)
    existing = await db.scalar(select(User.id).where(User.email == normalized))
    if existing is not None:
        raise AuthError("email_taken", "Email already registered")

    now = int(time.time())
    user_id = str(uuid.uuid4())
    password_hash = hash_password(password)

    user = User(
        id=user_id,
        name=name.strip(),
        email=normalized,
        role="user",
        profile_image_url=None,
        created_at=now,
        updated_at=now,
        last_active_at=now,
    )
    auth = Auth(
        id=user_id,
        email=normalized,
        password=password_hash,
        active=True,
    )
    db.add(user)
    db.add(auth)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AuthError("email_taken", "Email already registered") from exc

    await db.refresh(user)
    return _user_response(user)


async def authenticate_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
) -> TokenResponse:
    """Verify credentials and return a bearer JWT + user profile."""
    normalized = _normalize_email(email)
    result = await db.execute(
        select(Auth, User)
        .join(User, User.id == Auth.id)
        .where(Auth.email == normalized)
    )
    row = result.one_or_none()
    if row is None:
        raise AuthError("invalid_credentials", "Invalid email or password")

    auth, user = row
    if not auth.active:
        raise AuthError("inactive", "Account is inactive")

    if not verify_password(password, auth.password):
        raise AuthError("invalid_credentials", "Invalid email or password")

    now = int(time.time())
    user.last_active_at = now
    user.updated_at = now
    await db.commit()
    await db.refresh(user)

    token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=_user_response(user),
    )
