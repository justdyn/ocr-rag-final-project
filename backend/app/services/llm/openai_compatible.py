"""OpenAI-compatible chat completions client (httpx streaming).

Works with OpenAI and any OpenAI-compatible endpoint that accepts
``POST {base}/chat/completions`` with ``Authorization: Bearer`` and SSE
``data:`` lines containing ``choices[0].delta.content``.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.services.llm.base import LLMConfigError, LLMProviderError
from app.services.llm_config import ResolvedLLMSettings


class OpenAICompatibleProvider:
    """Cloud-only provider for this step — no Ollama/local path."""

    def __init__(
        self,
        *,
        settings: ResolvedLLMSettings,
        model: str | None = None,
    ) -> None:
        self.api_key = settings.api_key or ""
        self.base_url = settings.base_url
        self.model = model or settings.model
        self.timeout = settings.timeout_seconds

    def require_configured(self) -> None:
        if not self.api_key.strip():
            raise LLMConfigError(
                "LLM_API_KEY is not configured. Set it in the environment "
                "(see backend/.env.example) before calling /api/chat/completions."
            )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _payload(self, messages: list[dict[str, str]], *, stream: bool) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": messages,
            "stream": stream,
        }

    async def stream_chat(
        self,
        *,
        messages: list[dict[str, str]],
    ) -> AsyncIterator[str]:
        self.require_configured()
        url = f"{self.base_url}/chat/completions"
        timeout = httpx.Timeout(self.timeout, connect=30.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                url,
                headers=self._headers(),
                json=self._payload(messages, stream=True),
            ) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", errors="replace")
                    raise LLMProviderError(
                        f"LLM upstream error {response.status_code}: {body[:500]}",
                        status_code=response.status_code,
                    )
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith(":"):
                        # SSE comment / keepalive
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        payload = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = payload.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
                    if content:
                        yield content

    async def complete_chat(
        self,
        *,
        messages: list[dict[str, str]],
    ) -> str:
        self.require_configured()
        url = f"{self.base_url}/chat/completions"
        timeout = httpx.Timeout(self.timeout, connect=30.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                headers=self._headers(),
                json=self._payload(messages, stream=False),
            )
            if response.status_code >= 400:
                raise LLMProviderError(
                    f"LLM upstream error {response.status_code}: {response.text[:500]}",
                    status_code=response.status_code,
                )
            payload = response.json()
            choices = payload.get("choices") or []
            if not choices:
                raise LLMProviderError("LLM upstream returned no choices")
            message = choices[0].get("message") or {}
            content = message.get("content")
            if not isinstance(content, str):
                raise LLMProviderError("LLM upstream returned empty content")
            return content


def get_llm_provider(*, model: str | None = None, settings: ResolvedLLMSettings) -> OpenAICompatibleProvider:
    """Factory used by the chat service. Swap here to add future providers."""
    return OpenAICompatibleProvider(settings=settings, model=model)
