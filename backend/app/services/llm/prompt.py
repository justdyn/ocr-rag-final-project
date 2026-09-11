"""RAG prompt construction — source-tagged chunk injection + citation instruction."""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.query import QueryChunkResult

SYSTEM_PROMPT = """You are a document intelligence assistant. Answer the user's question \
using only the provided source excerpts.

Citation rules:
- Each source is wrapped as <source id="N">...</source>.
- When you use information from a source, cite it inline with [N] matching that id \
(for example [1] or [2]).
- You may cite multiple sources, e.g. [1][3].
- If the sources do not contain enough information, say so clearly and do not invent facts.
- Do not invent source ids that were not provided.
"""

MEMORY_SYSTEM_PROMPT = """User memory: durable preferences and facts about this user, \
recalled from previous conversations. This is context about the user — NOT document \
sources. Do not cite memories as [N]; [N] is only for the <source> excerpts below. \
If a memory conflicts with the Sources, prefer the Sources."""


@dataclass(frozen=True)
class PromptBundle:
    messages: list[dict[str, str]]
    sources: list[dict]
    """Structured sources for the SSE/JSON `sources` event (1-based citation ids)."""


def build_source_blocks(chunks: list[QueryChunkResult]) -> tuple[str, list[dict]]:
    """Wrap chunks as <source id="N"> and build the structured citation list."""
    blocks: list[str] = []
    sources: list[dict] = []
    for index, chunk in enumerate(chunks, start=1):
        blocks.append(f'<source id="{index}">\n{chunk.text}\n</source>')
        sources.append(
            {
                "id": index,
                "chunk_id": chunk.chunk_id,
                "file_id": chunk.file_id,
                "text": chunk.text,
                "rrf_score": chunk.rrf_score,
                "rerank_score": chunk.rerank_score,
                "extraction_method": chunk.extraction_method,
                "rank": chunk.rank,
            }
        )
    return "\n\n".join(blocks), sources


def build_rag_messages(
    *,
    user_query: str,
    chunks: list[QueryChunkResult],
    history: list[dict[str, str]] | None = None,
    memory_facts: list[str] | None = None,
) -> PromptBundle:
    """Build system + optional memory adjunct + history + user message with sources.

    ``history`` is prior conversation turns (role/content only), excluding the
    current user query (which is appended last with sources). ``memory_facts``
    (flag-gated, from retrieve_relevant_memories) becomes a second system
    message right after SYSTEM_PROMPT, labeled as user context — not document
    sources, never cited as [N]. ``None``/empty keeps the pre-P1a shape.
    """
    source_text, sources = build_source_blocks(chunks)
    if source_text:
        user_content = (
            f"Sources:\n{source_text}\n\n"
            f"Question: {user_query}"
        )
    else:
        user_content = (
            "Sources: (none retrieved)\n\n"
            f"Question: {user_query}"
        )

    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if memory_facts:
        bullets = "\n".join(f"- {fact}" for fact in memory_facts)
        messages.append(
            {
                "role": "system",
                "content": f"{MEMORY_SYSTEM_PROMPT}\n\nUser memory:\n{bullets}",
            }
        )
    if history:
        for turn in history:
            role = turn.get("role")
            content = turn.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_content})
    return PromptBundle(messages=messages, sources=sources)
