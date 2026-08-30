"""Live: 6 parallel uploads against a running API (reproduces the lock race)."""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = "http://127.0.0.1:8000"
FILE_COUNT = 6
POLL_SECONDS = 90


async def _poll_until_terminal(client: httpx.AsyncClient, headers: dict[str, str], file_id: str) -> str:
    deadline = asyncio.get_event_loop().time() + POLL_SECONDS
    last = "unknown"
    while asyncio.get_event_loop().time() < deadline:
        response = await client.get(f"{BASE}/api/files/{file_id}/status", headers=headers)
        if response.status_code != 200:
            return f"status_http_{response.status_code}"
        last = str(response.json().get("status") or "unknown")
        if last in {"ready", "failed"}:
            return last
        await asyncio.sleep(1)
    return last


async def main() -> int:
    email = f"locktest-{uuid.uuid4().hex[:8]}@example.com"
    password = "locktest-pass-1"
    bodies = [
        (f"locktest-{i}.txt", f"Corpus document {i} for concurrent upload.\n" * 30)
        for i in range(FILE_COUNT)
    ]

    async with httpx.AsyncClient(timeout=120.0) as client:
        register = await client.post(
            f"{BASE}/api/auth/register",
            json={"email": email, "password": password, "name": "Lock Test"},
        )
        if register.status_code not in {201, 409}:
            print(f"register failed: {register.status_code} {register.text}")
            return 1
        login = await client.post(
            f"{BASE}/api/auth/login",
            json={"email": email, "password": password},
        )
        if login.status_code != 200:
            print(f"login failed: {login.status_code} {login.text}")
            return 1
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        async def upload(name: str, body: str) -> tuple[str, int, str]:
            response = await client.post(
                f"{BASE}/api/files",
                headers=headers,
                files={"file": (name, body.encode("utf-8"), "text/plain")},
            )
            return name, response.status_code, response.text

        print(f"posting {FILE_COUNT} files in parallel as {email}")
        uploaded = await asyncio.gather(*[upload(name, body) for name, body in bodies])
        locked = [row for row in uploaded if "database is locked" in row[2].lower()]
        for name, status, text in uploaded:
            print(f"  upload {name}: {status} {text[:180]}")
        if locked:
            print("FAIL: database is locked in upload response")
            return 1

        ids: list[str] = []
        for name, status, text in uploaded:
            if status != 201:
                print(f"FAIL: {name} did not return 201")
                return 1
            ids.append(json.loads(text)["id"])

        terminals = await asyncio.gather(
            *[_poll_until_terminal(client, headers, file_id) for file_id in ids]
        )
        for file_id, state in zip(ids, terminals, strict=True):
            print(f"  ingest {file_id}: {state}")
        if any(state not in {"ready", "failed"} for state in terminals):
            print("FAIL: not all files reached a terminal status")
            return 1
        print("concurrent upload live check passed")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
