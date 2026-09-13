"""Conversation title generation — short LLM task, decoupled from RAG.

MVP: once after the first successful assistant turn on a new conversation.
Context = user message + attachment filenames + short assistant snippet.
No BM25/Chroma retrieval. Fail soft: keep query-truncation placeholder.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.sqlite import run_with_lock_retry
from app.models.conversation import Conversation

logger = logging.getLogger(__name__)

TITLE_TIMEOUT_SECONDS = 5.0
ASSISTANT_SNIPPET_CHARS = 400
MAX_TITLE_CHARS = 60
MAX_TITLE_WORDS = 7
MIN_TITLE_WORDS = 1

TITLE_SYSTEM_PROMPT = """You generate concise conversation titles.

Rules:
1. Prefer 3–6 words; maximum 7 words.
2. Describe the user's primary objective or topic.
3. Ignore greetings and conversational filler.
4. Include the most important technical/entity term when useful.
5. Do not answer the question.
6. Do not include quotation marks.
7. Do not start with "Title:".
8. Use the conversation's language.
9. Return JSON only: {"title":"..."}
"""

_REJECT_TITLES = frozenset(
    {
        "new chat",
        "untitled",
        "untitled chat",
        "title",
        "conversation",
    }
)


def should_generate_title(
    *,
    needs_title: bool,
    error_message: str | None,
    assistant_text: str,
) -> bool:
    """Gate: auto title still pending, successful non-empty assistant turn."""
    if not needs_title:
        return False
    if error_message:
        return False
    return bool(assistant_text and assistant_text.strip())


def build_title_user_prompt(
    *,
    user_text: str,
    assistant_text: str,
    attachment_filenames: list[str] | None = None,
) -> str:
    """Condensed title-generation context (not full history, not RAG chunks)."""
    parts = [f"User:\n{user_text.strip()}"]
    names = [n.strip() for n in (attachment_filenames or []) if n and n.strip()]
    if names:
        parts.append("Attachments:\n" + "\n".join(f"- {n}" for n in names))
    snippet = " ".join(assistant_text.strip().split())[:ASSISTANT_SNIPPET_CHARS]
    if snippet:
        parts.append(f"Assistant (excerpt):\n{snippet}")
    return "\n\n".join(parts)


def parse_title_json(raw: str) -> str | None:
    """Extract title string from model output; tolerate fenced JSON."""
    text = raw.strip()
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Last resort: find a {"title": "..."} substring
        match = re.search(r'\{\s*"title"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}', text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    title = data.get("title")
    if not isinstance(title, str):
        return None
    return title


def validate_title(raw: str | None) -> str | None:
    """Normalize and reject empty / banned / oversized titles."""
    if raw is None:
        return None
    cleaned = " ".join(raw.strip().split())
    if cleaned.lower().startswith("title:"):
        cleaned = cleaned[6:].strip()
    cleaned = cleaned.strip("\"'`")
    if not cleaned:
        return None
    if cleaned.lower() in _REJECT_TITLES:
        return None
    words = cleaned.split()
    if len(words) < MIN_TITLE_WORDS or len(words) > MAX_TITLE_WORDS:
        # Soft: truncate words rather than reject a good-but-long title
        if len(words) > MAX_TITLE_WORDS:
            cleaned = " ".join(words[:MAX_TITLE_WORDS])
        else:
            return None
    if len(cleaned) > MAX_TITLE_CHARS:
        cleaned = cleaned[: MAX_TITLE_CHARS - 1].rstrip() + "…"
    if cleaned.lower() in _REJECT_TITLES:
        return None
    return cleaned


async def persist_generated_title(
    db: AsyncSession,
    *,
    conversation_id: str,
    user_id: str,
    title: str,
) -> bool:
    """Conditional UPDATE — only when title_source is still auto.

    Returns True if a row was updated.
    """
    now = int(time.time())
    updated = {"ok": False}

    async def _work() -> None:
        result = await db.execute(
            update(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
                Conversation.title_source == "auto",
            )
            .values(title=title, title_generated_at=now)
        )
        await db.commit()
        updated["ok"] = (result.rowcount or 0) > 0

    await run_with_lock_retry(db, _work)
    return updated["ok"]


async def run_title_generate(
    *,
    user_id: str,
    conversation_id: str,
    user_text: str,
    assistant_text: str,
    attachment_filenames: list[str] | None,
    provider: Any,
) -> str | None:
    """LLM title + validate + conditional persist. Never raises into chat.

    Returns the persisted title, or None on skip/failure.
    """
    try:
        raw = await provider.complete_chat(
            messages=[
                {"role": "system", "content": TITLE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": build_title_user_prompt(
                        user_text=user_text,
                        assistant_text=assistant_text,
                        attachment_filenames=attachment_filenames,
                    ),
                },
            ]
        )
        title = validate_title(parse_title_json(str(raw)))
        if title is None:
            return None
        async with AsyncSessionLocal() as db:
            ok = await persist_generated_title(
                db,
                conversation_id=conversation_id,
                user_id=user_id,
                title=title,
            )
        return title if ok else None
    except Exception:
        logger.exception(
            "conversation title generate failed (conversation=%s)",
            conversation_id,
        )
        return None


async def generate_title_for_chat(
    *,
    needs_title: bool,
    error_message: str | None,
    user_id: str,
    conversation_id: str,
    user_text: str,
    assistant_text: str,
    attachment_filenames: list[str] | None,
    provider: Any,
    timeout_seconds: float = TITLE_TIMEOUT_SECONDS,
) -> str | None:
    """Chat-path helper: gate + timeout-wrapped generate. Returns title or None."""
    if not should_generate_title(
        needs_title=needs_title,
        error_message=error_message,
        assistant_text=assistant_text,
    ):
        return None
    try:
        return await asyncio.wait_for(
            run_title_generate(
                user_id=user_id,
                conversation_id=conversation_id,
                user_text=user_text,
                assistant_text=assistant_text,
                attachment_filenames=attachment_filenames,
                provider=provider,
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "conversation title generate timed out (conversation=%s)",
            conversation_id,
        )
        return None
