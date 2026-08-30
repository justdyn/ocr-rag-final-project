"""Ensure one known local-dev test user exists.

Manual only — not imported by app startup or Alembic.
Safe to re-run: existing email is skipped, not duplicated.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine
from app.models.user import User
from app.services.auth import AuthError, register_user

DEV_EMAIL = "dev@example.com"
DEV_PASSWORD = "devpassword123"
DEV_NAME = "Dev User"


async def seed() -> int:
    email = DEV_EMAIL.strip().lower()
    settings = get_settings()
    print(f"database: {settings.database_url}")

    async with AsyncSessionLocal() as db:
        existing_id = await db.scalar(select(User.id).where(User.email == email))
        if existing_id is not None:
            print(f"already exists: {email} (id={existing_id})")
            return 0

        try:
            user = await register_user(
                db,
                email=DEV_EMAIL,
                password=DEV_PASSWORD,
                name=DEV_NAME,
            )
        except AuthError as exc:
            if exc.code == "email_taken":
                print(f"already exists: {email}")
                return 0
            raise

        print(f"created: {user.email} (id={user.id})")
        return 0


async def main() -> int:
    try:
        return await seed()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
