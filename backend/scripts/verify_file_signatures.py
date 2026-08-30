"""Stdlib magic-byte checks — no FastAPI, no python-magic."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.files import (
    FileServiceError,
    content_matches_extension,
    create_file_from_upload,
    sniff_content_kind,
)


class _FakeUpload:
    def __init__(self, filename: str, data: bytes) -> None:
        self.filename = filename
        self.content_type = "application/octet-stream"
        self._data = data

    async def read(self) -> bytes:
        return self._data


async def _assert_create_rejects(filename: str, data: bytes, code: str) -> None:
    try:
        await create_file_from_upload(
            MagicMock(),
            user_id="verify-user",
            upload=_FakeUpload(filename, data),  # type: ignore[arg-type]
        )
    except FileServiceError as exc:
        assert exc.code == code, f"{filename}: expected {code}, got {exc.code}"
        return
    raise AssertionError(f"{filename}: expected FileServiceError {code}")


def main() -> int:
    pdf = b"%PDF-1.4\n1 0 obj"
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    jpeg = b"\xff\xd8\xff\xe0" + b"JFIF"
    text = b"hello corpus\n"

    assert sniff_content_kind(pdf) == "pdf"
    assert sniff_content_kind(png) == "png"
    assert sniff_content_kind(jpeg) == "jpeg"
    assert sniff_content_kind(text) is None

    assert content_matches_extension(pdf, ".pdf")
    assert content_matches_extension(png, ".png")
    assert content_matches_extension(jpeg, ".jpg")
    assert content_matches_extension(jpeg, ".jpeg")
    assert content_matches_extension(text, ".txt")
    assert content_matches_extension(text, ".md")

    # Declared extension disagrees with bytes (rename bypass).
    assert not content_matches_extension(text, ".pdf")
    assert not content_matches_extension(pdf, ".txt")
    assert not content_matches_extension(png, ".jpg")
    assert not content_matches_extension(jpeg, ".png")

    asyncio.run(_assert_create_rejects("spoof.pdf", text, "file_content_mismatch"))
    asyncio.run(_assert_create_rejects("payload.exe", b"MZ", "unsupported_type"))
    asyncio.run(_assert_create_rejects("empty.txt", b"", "empty_upload"))
    print("file signature checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
