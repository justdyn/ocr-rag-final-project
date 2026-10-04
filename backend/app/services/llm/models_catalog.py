"""OpenAI-compatible model catalog (list + search + paginate).

Uses server ``LLM_API_KEY`` / ``LLM_BASE_URL``. Never exposes secrets.
Caches the upstream list in-process; OpenRouter-shaped bases can forward
``q`` / ``offset`` / ``limit``; others filter/paginate locally.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.llm.base import LLMConfigError, LLMProviderError
from app.services.llm_config import resolve_llm_settings

# Exclude non-generalist ids when detectable from the slug alone.
_NON_CHAT_RE = re.compile(
    r"(embedding|whisper|tts|dall-?e|moderation|realtime|transcribe|speech|"
    r"image|audio|rerank|codec|computer-use)",
    re.IGNORECASE,
)

_CACHE_TTL_SECONDS = 600.0
_DEFAULT_LIMIT = 50
_MAX_LIMIT = 100

# Module-level cache: (expires_at, normalized items)
_cache: tuple[float, list[dict[str, str]]] | None = None


@dataclass(frozen=True)
class ModelsPage:
    items: list[dict[str, str]]
    next_offset: int | None
    has_more: bool


def clear_models_cache() -> None:
    """Test helper — drop the in-process cache."""
    global _cache
    _cache = None


def _is_openrouter(base_url: str) -> bool:
    return "openrouter.ai" in base_url.lower()


def _is_chat_candidate(model_id: str) -> bool:
    return not bool(_NON_CHAT_RE.search(model_id))


def _normalize_item(raw: dict[str, Any]) -> dict[str, str] | None:
    model_id = raw.get("id")
    if not isinstance(model_id, str) or not model_id.strip():
        return None
    model_id = model_id.strip()
    if not _is_chat_candidate(model_id):
        return None
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        name = model_id
    return {"id": model_id, "name": name.strip()}


def _slice_page(
    items: list[dict[str, str]], *, offset: int, limit: int
) -> ModelsPage:
    page = items[offset : offset + limit]
    next_off = offset + limit
    has_more = next_off < len(items)
    return ModelsPage(
        items=page,
        next_offset=next_off if has_more else None,
        has_more=has_more,
    )


def _filter_local(
    items: list[dict[str, str]], *, q: str | None
) -> list[dict[str, str]]:
    if not q or not q.strip():
        return items
    needle = q.strip().lower()
    return [
        item
        for item in items
        if needle in item["id"].lower() or needle in item["name"].lower()
    ]


async def _fetch_upstream_all(
    *, api_key: str, base_url: str, timeout: float
) -> list[dict[str, str]]:
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=30.0)) as client:
        response = await client.get(url, headers=headers)
        if response.status_code >= 400:
            raise LLMProviderError(
                f"Models upstream error {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )
        payload = response.json()
        raw_list = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(raw_list, list):
            raise LLMProviderError("Models upstream returned no data list")
        out: list[dict[str, str]] = []
        for raw in raw_list:
            if not isinstance(raw, dict):
                continue
            item = _normalize_item(raw)
            if item is not None:
                out.append(item)
        return out


async def _fetch_openrouter_page(
    *,
    api_key: str,
    base_url: str,
    timeout: float,
    q: str | None,
    offset: int,
    limit: int,
) -> ModelsPage:
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    params: dict[str, Any] = {"offset": offset, "limit": limit}
    if q and q.strip():
        params["q"] = q.strip()
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=30.0)) as client:
        response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 400:
            raise LLMProviderError(
                f"Models upstream error {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )
        payload = response.json()
        raw_list = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(raw_list, list):
            raise LLMProviderError("Models upstream returned no data list")
        items: list[dict[str, str]] = []
        for raw in raw_list:
            if not isinstance(raw, dict):
                continue
            item = _normalize_item(raw)
            if item is not None:
                items.append(item)
        # OpenRouter may return fewer than limit when exhausted.
        has_more = len(raw_list) >= limit
        next_off = offset + limit if has_more else None
        return ModelsPage(items=items, next_offset=next_off, has_more=has_more)


async def _cached_all(*, api_key: str, base_url: str, timeout: float) -> list[dict[str, str]]:
    global _cache
    now = time.monotonic()
    if _cache is not None and _cache[0] > now:
        return _cache[1]
    items = await _fetch_upstream_all(api_key=api_key, base_url=base_url, timeout=timeout)
    _cache = (now + _CACHE_TTL_SECONDS, items)
    return items


async def list_models(
    db: AsyncSession,
    *,
    q: str | None = None,
    offset: int = 0,
    limit: int = _DEFAULT_LIMIT,
) -> ModelsPage:
    """Return a page of generalist chat models for the configured provider."""
    resolved = await resolve_llm_settings(db)
    api_key = (resolved.api_key or "").strip()
    if not api_key:
        raise LLMConfigError(
            "LLM_API_KEY is not configured. Set it in the environment "
            "(see backend/.env.example) before calling /api/models."
        )
    base_url = resolved.base_url
    timeout = resolved.timeout_seconds
    safe_offset = max(0, offset)
    safe_limit = min(max(1, limit), _MAX_LIMIT)

    if _is_openrouter(base_url):
        return await _fetch_openrouter_page(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            q=q,
            offset=safe_offset,
            limit=safe_limit,
        )

    all_items = await _cached_all(api_key=api_key, base_url=base_url, timeout=timeout)
    filtered = _filter_local(all_items, q=q)
    return _slice_page(filtered, offset=safe_offset, limit=safe_limit)
