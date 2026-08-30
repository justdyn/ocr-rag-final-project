"""LLM provider protocol — thin abstraction; only cloud OpenAI-compatible is implemented."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable


@runtime_checkable
class LLMProvider(Protocol):
    """Streaming chat completions. Implementations must not hardcode secrets."""

    async def stream_chat(
        self,
        *,
        messages: list[dict[str, str]],
    ) -> AsyncIterator[str]:
        """Yield plain-text token deltas from the model."""
        ...

    async def complete_chat(
        self,
        *,
        messages: list[dict[str, str]],
    ) -> str:
        """Return the full assistant text (non-streaming)."""
        ...


class LLMConfigError(Exception):
    """Raised when required LLM configuration is missing."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class LLMProviderError(Exception):
    """Raised when the upstream LLM API fails."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)
