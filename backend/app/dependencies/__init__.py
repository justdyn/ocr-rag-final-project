"""FastAPI dependency package."""

from app.dependencies.auth import CurrentUser, get_current_user

__all__ = ["CurrentUser", "get_current_user"]
