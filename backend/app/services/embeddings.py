"""Sentence-transformers embedding singleton (PRD §2 — all-MiniLM-L6-v2)."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from app.core.config import get_settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_lock = threading.Lock()
_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    """Load the embedding model once per process (not per request/file)."""
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is None:
            from sentence_transformers import SentenceTransformer

            settings = get_settings()
            _model = SentenceTransformer(settings.embedding_model)
        return _model


def embed_texts(texts: list[str], *, batch_size: int = 32) -> list[list[float]]:
    """Embed many texts in batches. Returns one vector per input string."""
    if not texts:
        return []
    model = get_embedding_model()
    vectors = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return [vector.tolist() for vector in vectors]
