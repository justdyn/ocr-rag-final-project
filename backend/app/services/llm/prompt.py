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
) -> PromptBundle:
    """Build system + optional history + user message with injected sources.

    ``history`` is prior conversation turns (role/content only), excluding the
    current user query (which is appended last with sources).
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
    if history:
        for turn in history:
            role = turn.get("role")
            content = turn.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_content})
    return PromptBundle(messages=messages, sources=sources)
