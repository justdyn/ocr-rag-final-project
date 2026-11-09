"""Phase 6 Step 4 verification: KB CRUD + hybrid vs vector_only ranking diverge."""

from __future__ import annotations

import io
import time
import uuid

from fastapi.testclient import TestClient

from app.tensho import app
from app.services.retrieval.bm25_cache import clear_all_bm25_cache

# Ambiguous-term corpus: BM25 prefers animal/fruit sense (A); dense prefers tech/brand (B).
# Probed offline — for query "apple", RRF order differs from vector-only order.
FILE_A = """
apple apple apple apple apple orchard fruit pie cider harvest
"""

FILE_B = """
Apple Inc designs the iPhone and Mac computers in Cupertino California with software services
"""

FILE_C = """
rain clouds umbrella forecast mild temperatures
"""

QUERY = "apple"


def wait_ready(client: TestClient, token: str, file_id: str, timeout: float = 120.0) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/files/{file_id}/status", headers=headers)
        r.raise_for_status()
        body = r.json()
        if body["status"] in ("ready", "failed"):
            return body
        time.sleep(0.5)
    raise TimeoutError(f"file {file_id} not ready")


def main() -> None:
    clear_all_bm25_cache()
    email = f"step4-{uuid.uuid4().hex[:8]}@example.com"
    password = "password123"

    with TestClient(app) as client:
        reg = client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "name": "Step4"},
        )
        assert reg.status_code == 201, reg.text

        login = client.post(
            "/api/auth/login", json={"email": email, "password": password}
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        def upload(name: str, text: str) -> str:
            r = client.post(
                "/api/files",
                headers=headers,
                files={"file": (name, io.BytesIO(text.encode("utf-8")), "text/plain")},
            )
            assert r.status_code == 201, r.text
            return r.json()["id"]

        file_a = upload("apple-orchard.txt", FILE_A)
        file_b = upload("apple-inc.txt", FILE_B)
        file_c = upload("weather.txt", FILE_C)

        for fid in (file_a, file_b, file_c):
            status = wait_ready(client, token, fid)
            assert status["status"] == "ready", status

        # Knowledge CRUD
        created = client.post(
            "/api/knowledge",
            headers=headers,
            json={"name": "HR Policies", "description": "Step4 test KB"},
        )
        assert created.status_code == 201, created.text
        kb_id = created.json()["id"]

        listed = client.get("/api/knowledge", headers=headers)
        assert listed.status_code == 200
        assert any(item["id"] == kb_id for item in listed.json())

        for fid in (file_a, file_b, file_c):
            add = client.post(
                f"/api/knowledge/{kb_id}/files",
                headers=headers,
                json={"file_id": fid},
            )
            assert add.status_code == 200, add.text

        got = client.get(f"/api/knowledge/{kb_id}", headers=headers)
        assert got.status_code == 200
        assert set(got.json()["file_ids"]) == {file_a, file_b, file_c}

        hybrid = client.post(
            "/api/query",
            headers=headers,
            json={
                "scope_type": "knowledge",
                "scope_id": kb_id,
                "query": QUERY,
                "k": 5,
                "mode": "hybrid",
            },
        )
        assert hybrid.status_code == 200, hybrid.text
        vector_only = client.post(
            "/api/query",
            headers=headers,
            json={
                "scope_type": "knowledge",
                "scope_id": kb_id,
                "query": QUERY,
                "k": 5,
                "mode": "vector_only",
            },
        )
        assert vector_only.status_code == 200, vector_only.text

        h_results = hybrid.json()["results"]
        v_results = vector_only.json()["results"]
        assert h_results, "hybrid returned no results"
        assert v_results, "vector_only returned no results"

        h_order = [r["chunk_id"] for r in h_results]
        v_order = [r["chunk_id"] for r in v_results]
        h_files = [r["file_id"] for r in h_results]
        v_files = [r["file_id"] for r in v_results]

        print("HYBRID ranks:")
        for r in h_results:
            print(
                f"  #{r['rank']} file={r['file_id'][:8]}… rrf={r['rrf_score']} "
                f"cos={r['rerank_score']} text={r['text'][:60]!r}"
            )
        print("VECTOR_ONLY ranks:")
        for r in v_results:
            print(
                f"  #{r['rank']} file={r['file_id'][:8]}… rrf={r['rrf_score']} "
                f"cos={r['rerank_score']} text={r['text'][:60]!r}"
            )

        assert h_order != v_order, (
            "hybrid and vector_only returned identical chunk rankings — "
            "fusion is not affecting order"
        )
        # Sanity: hybrid results include rrf_score; vector_only does not
        assert h_results[0]["rrf_score"] is not None
        assert v_results[0]["rrf_score"] is None
        # Lexical/fruit sense (A) should win hybrid via BM25; brand sense (B) wins vector_only
        assert h_files[0] == file_a, f"expected orchard file A at hybrid #1, got {h_files}"
        assert v_files[0] == file_b, f"expected brand file B at vector_only #1, got {v_files}"

        # Delete KB must not delete files
        deleted = client.delete(f"/api/knowledge/{kb_id}", headers=headers)
        assert deleted.status_code == 204
        for fid in (file_a, file_b, file_c):
            assert client.get(f"/api/files/{fid}", headers=headers).status_code == 200

        print("\nVERIFICATION PASSED")
        print(f"  hybrid_order != vector_only_order: {h_order != v_order}")
        print(f"  hybrid_files: {['A' if f==file_a else 'B' if f==file_b else 'C' for f in h_files]}")
        print(f"  vector_files: {['A' if f==file_a else 'B' if f==file_b else 'C' for f in v_files]}")


if __name__ == "__main__":
    main()
