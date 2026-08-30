"""Chroma persistence helpers — one collection per file (`file-{id}`)."""

from __future__ import annotations

import threading
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from app.core.config import get_settings

_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_chroma_client() -> ClientAPI:
    """Persistent Chroma client. Creates CHROMA_PERSIST_DIR if missing."""
    settings = get_settings()
    settings.chroma_persist_dir.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(settings.chroma_persist_dir))


def collection_name_for_file(file_id: str) -> str:
    return f"file-{file_id}"


def get_or_create_file_collection(file_id: str) -> Collection:
    client = get_chroma_client()
    name = collection_name_for_file(file_id)
    with _lock:
        return client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine", "file_id": file_id},
        )


def upsert_chunks(
    *,
    file_id: str,
    chunk_ids: list[str],
    texts: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict[str, Any]],
) -> str:
    """Upsert all chunk vectors for a file. Returns the collection name."""
    if not (len(chunk_ids) == len(texts) == len(embeddings) == len(metadatas)):
        raise ValueError("chunk_ids, texts, embeddings, and metadatas length mismatch")
    collection = get_or_create_file_collection(file_id)
    if chunk_ids:
        collection.upsert(
            ids=chunk_ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )
    return collection_name_for_file(file_id)


def delete_file_collection(file_id: str) -> None:
    """Best-effort delete of a per-file collection (missing is OK)."""
    client = get_chroma_client()
    name = collection_name_for_file(file_id)
    with _lock:
        try:
            client.delete_collection(name)
        except Exception:
            # Collection may not exist yet (upload failed before upsert)
            pass


def query_file_collections(
    *,
    file_ids: list[str],
    query_embedding: list[float],
    n_results: int,
) -> list[dict[str, Any]]:
    """Dense search across the union of per-file Chroma collections (PRD §3.5).

    Returns a best-first list of hit dicts with keys:
    ``chunk_id`` (Chroma id), ``file_id``, ``distance``, ``document``.
    Chroma cosine space: smaller distance = more similar.
    """
    if not file_ids or n_results <= 0:
        return []

    hits: list[dict[str, Any]] = []
    # Over-fetch per collection so the merged top-n is meaningful
    per_collection = max(n_results, 1)

    for file_id in file_ids:
        try:
            collection = get_or_create_file_collection(file_id)
            if collection.count() == 0:
                continue
            raw = collection.query(
                query_embeddings=[query_embedding],
                n_results=min(per_collection, collection.count()),
                include=["documents", "distances", "metadatas"],
            )
        except Exception:
            continue

        ids = (raw.get("ids") or [[]])[0]
        distances = (raw.get("distances") or [[]])[0]
        documents = (raw.get("documents") or [[]])[0]
        metadatas = (raw.get("metadatas") or [[]])[0]

        for idx, chroma_id in enumerate(ids):
            meta = metadatas[idx] if idx < len(metadatas) and metadatas[idx] else {}
            hits.append(
                {
                    "chunk_id": chroma_id,  # temporary — remapped to DB id by query service
                    "chroma_id": chroma_id,
                    "file_id": meta.get("file_id", file_id),
                    "distance": float(distances[idx]) if idx < len(distances) else 1.0,
                    "document": documents[idx] if idx < len(documents) else "",
                }
            )

    hits.sort(key=lambda h: h["distance"])
    return hits[:n_results]
