"""Character-level text splitter approximating LangChain RecursiveCharacterTextSplitter."""

from __future__ import annotations

DEFAULT_SEPARATORS = ("\n\n", "\n", " ", "")


def split_text(
    text: str,
    *,
    chunk_size: int = 1000,
    chunk_overlap: int = 100,
    separators: tuple[str, ...] = DEFAULT_SEPARATORS,
) -> list[str]:
    """Split text into overlapping chunks of at most `chunk_size` characters.

    Strategy (LangChain-style recursive character split):
    1. Prefer splitting on coarser separators (`\\n\\n`, then `\\n`, then space).
    2. Merge small pieces until near `chunk_size`.
    3. Carry `chunk_overlap` characters from the previous chunk into the next.
    4. Fall back to hard character cuts only when a piece has no separators.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be >= 0 and < chunk_size")

    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    if not cleaned.strip():
        return []

    return [
        chunk
        for chunk in _split(cleaned, list(separators), chunk_size, chunk_overlap)
        if chunk.strip()
    ]


def _split(
    text: str,
    separators: list[str],
    chunk_size: int,
    chunk_overlap: int,
) -> list[str]:
    if len(text) <= chunk_size:
        return [text]

    separator = separators[-1]
    remaining = separators[1:] if separators else []
    for index, candidate in enumerate(separators):
        if candidate == "":
            separator = ""
            remaining = []
            break
        if candidate in text:
            separator = candidate
            remaining = separators[index + 1 :]
            break

    raw_parts = text.split(separator) if separator else list(text)
    # Re-attach separator to parts (except the first) so joins reconstruct cleanly
    parts: list[str] = []
    for index, part in enumerate(raw_parts):
        if index == 0:
            parts.append(part)
        elif separator:
            parts.append(separator + part)
        else:
            parts.append(part)

    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current:
            chunks.append(current)
            # Keep overlap tail for the next chunk
            if chunk_overlap and len(current) > chunk_overlap:
                current = current[-chunk_overlap:]
            else:
                current = current if chunk_overlap else ""

    for part in parts:
        if not part:
            continue
        if len(part) > chunk_size:
            if current:
                flush()
                current = ""
            if remaining:
                chunks.extend(_split(part, remaining, chunk_size, chunk_overlap))
            else:
                # Hard cut
                start = 0
                while start < len(part):
                    end = min(start + chunk_size, len(part))
                    chunks.append(part[start:end])
                    if end >= len(part):
                        break
                    start = max(0, end - chunk_overlap)
            current = ""
            continue

        if len(current) + len(part) <= chunk_size:
            current += part
        else:
            flush()
            # After flush, current may hold overlap; append part if it fits
            if len(current) + len(part) <= chunk_size:
                current += part
            else:
                current = part

    if current:
        # Avoid duplicating a pure-overlap remnant as a final chunk when it was
        # already included at the end of the previous chunk.
        if not chunks or current != chunks[-1][-len(current) :]:
            if current.strip():
                chunks.append(current)

    return chunks
