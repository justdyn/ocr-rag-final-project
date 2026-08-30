"""BM25 tokenization — simple lowercase alphanumeric split (Open WebUI-compatible default)."""

from __future__ import annotations

import re

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Tokenize for BM25: lowercase, extract [a-z0-9]+ runs (whitespace/punct discarded)."""
    if not text:
        return []
    return _TOKEN_RE.findall(text.lower())
