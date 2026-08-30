"""Verify DELETE /api/files/{id} full cleanup (file, chunks, Chroma, membership, BM25)."""

from __future__ import annotations

import asyncio
import io
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.main import app
from app.models.document_chunk import DocumentChunk
from app.models.file import File
from app.models.knowledge import KnowledgeFile
from app.services.chroma_store import collection_name_for_file, get_chroma_client
from app.services.retrieval.bm25_cache import get_cached, get_or_build_bm25


def wait_ready(client: TestClient, token: str, file_id: str, timeout: float = 120.0) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.time() + timeout
    while time.time() < deadline:
        response = client.get(f"/api/files/{file_id}/status", headers=headers)
        response.raise_for_status()
        body = response.json()
        if body["status"] in ("ready", "failed"):
            return body
        time.sleep(0.4)
    raise TimeoutError(file_id)


def chroma_has_collection(file_id: str) -> bool:
    name = collection_name_for_file(file_id)
    names = {item.name for item in get_chroma_client().list_collections()}
    return name in names


async def counts_for(file_id: str) -> tuple[int, int, int]:
    async with AsyncSessionLocal() as db:
        files = await db.scalar(select(func.count()).select_from(File).where(File.id == file_id))
        chunks = await db.scalar(
            select(func.count()).select_from(DocumentChunk).where(DocumentChunk.file_id == file_id)
        )
        links = await db.scalar(
            select(func.count()).select_from(KnowledgeFile).where(KnowledgeFile.file_id == file_id)
        )
        return int(files or 0), int(chunks or 0), int(links or 0)


async def warm_bm25(file_id: str, knowledge_id: str) -> None:
    async with AsyncSessionLocal() as db:
        file_entry = await get_or_build_bm25(db, scope_type="file", scope_id=file_id)
        kb_entry = await get_or_build_bm25(db, scope_type="knowledge", scope_id=knowledge_id)
        assert file_entry is not None, "expected a per-file BM25 index before delete"
        assert kb_entry is not None, "expected a per-KB BM25 index before delete"


def main() -> None:
    email = f"delete-cleanup-{uuid.uuid4().hex[:8]}@example.com"
    password = "password123"

    with TestClient(app) as client:
        reg = client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "name": "DeleteCleanup"},
        )
        assert reg.status_code == 201, reg.text
        login = client.post("/api/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        upload = client.post(
            "/api/files",
            headers=headers,
            files={
                "file": (
                    "orchard.txt",
                    io.BytesIO(b"apple apple apple orchard fruit pie cider harvest\n" * 8),
                    "text/plain",
                )
            },
        )
        assert upload.status_code == 201, upload.text
        file_id = upload.json()["id"]
        status = wait_ready(client, token, file_id)
        assert status["status"] == "ready", status

        kb = client.post("/api/knowledge", headers=headers, json={"name": "Delete cleanup KB"})
        assert kb.status_code == 201, kb.text
        kb_id = kb.json()["id"]
        added = client.post(
            f"/api/knowledge/{kb_id}/files",
            headers=headers,
            json={"file_id": file_id},
        )
        assert added.status_code == 200, added.text

        files_n, chunks_n, links_n = asyncio.run(counts_for(file_id))
        assert files_n == 1, files_n
        assert chunks_n >= 1, chunks_n
        assert links_n == 1, links_n
        assert chroma_has_collection(file_id), "expected Chroma collection before delete"
        asyncio.run(warm_bm25(file_id, kb_id))
        assert get_cached("file", file_id) is not None
        assert get_cached("knowledge", kb_id) is not None
        print("OK preconditions: file, chunks, Chroma, membership, BM25 cache")

        deleted = client.delete(f"/api/files/{file_id}", headers=headers)
        assert deleted.status_code == 204, deleted.text

        listed = client.get("/api/files", headers=headers)
        assert listed.status_code == 200, listed.text
        assert all(row["id"] != file_id for row in listed.json())

        missing = client.get(f"/api/files/{file_id}", headers=headers)
        assert missing.status_code == 404, missing.text

        files_n, chunks_n, links_n = asyncio.run(counts_for(file_id))
        assert files_n == 0, files_n
        assert chunks_n == 0, chunks_n
        assert links_n == 0, links_n
        assert not chroma_has_collection(file_id), "Chroma collection survived delete"
        assert get_cached("file", file_id) is None, "file BM25 cache survived delete"
        assert get_cached("knowledge", kb_id) is None, "KB BM25 cache survived delete"
        print("OK DELETE /api/files/{id}: file, chunks, Chroma, membership, BM25 gone")

    print("\nFILE DELETE CLEANUP PASSED")


if __name__ == "__main__":
    main()
