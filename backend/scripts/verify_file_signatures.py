"""Stdlib magic-byte checks — no FastAPI, no python-magic."""

from __future__ import annotations

import asyncio
import io
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import files as files_module
from app.services.files import (
    SUPPORTED_EXTENSIONS,
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


def _minimal_docx_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document '
            'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>hello office</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


async def _assert_create_rejects(filename: str, data: bytes, code: str) -> None:
    try:
        await create_file_from_upload(
            _stub_db(),
            user_id="verify-user",
            upload=_FakeUpload(filename, data),  # type: ignore[arg-type]
        )
    except FileServiceError as exc:
        assert exc.code == code, f"{filename}: expected {code}, got {exc.code}"
        return
    raise AssertionError(f"{filename}: expected FileServiceError {code}")


def _stub_db() -> MagicMock:
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


async def _assert_create_accepts(filename: str, data: bytes) -> None:
    row = await create_file_from_upload(
        _stub_db(),
        user_id="verify-user",
        upload=_FakeUpload(filename, data),  # type: ignore[arg-type]
    )
    assert row.status == "pending", f"{filename}: expected pending, got {row.status}"
    suffix = Path(row.filename).suffix.lower()
    assert suffix in SUPPORTED_EXTENSIONS, f"{filename}: {suffix} not allowlisted"


def main() -> int:
    pdf = b"%PDF-1.4\n1 0 obj"
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    jpeg = b"\xff\xd8\xff\xe0" + b"JFIF"
    text = b"hello corpus\n"
    docx = _minimal_docx_bytes()

    assert sniff_content_kind(pdf) == "pdf"
    assert sniff_content_kind(png) == "png"
    assert sniff_content_kind(jpeg) == "jpeg"
    assert sniff_content_kind(text) is None
    assert sniff_content_kind(docx) == "zip"

    # Empty-archive and spanned-set ZIP markers at byte 0 are still ZIP.
    local_zip = b"PK\x03\x04" + b"\x00" * 50
    empty_zip = b"PK\x05\x06" + b"\x00" * 50
    spanned_zip = b"PK\x07\x08" + b"\x00" * 50
    assert sniff_content_kind(local_zip) == "zip"
    assert sniff_content_kind(empty_zip) == "zip"
    assert sniff_content_kind(spanned_zip) == "zip"

    assert content_matches_extension(pdf, ".pdf")
    assert content_matches_extension(png, ".png")
    assert content_matches_extension(jpeg, ".jpg")
    assert content_matches_extension(jpeg, ".jpeg")
    assert content_matches_extension(text, ".txt")
    assert content_matches_extension(text, ".md")
    assert content_matches_extension(docx, ".docx")

    # Declared extension disagrees with bytes (rename bypass).
    assert not content_matches_extension(text, ".pdf")
    assert not content_matches_extension(pdf, ".txt")
    assert not content_matches_extension(png, ".jpg")
    assert not content_matches_extension(jpeg, ".png")
    # ZIP bytes never count as text or PDF.
    assert not content_matches_extension(docx, ".txt")
    assert not content_matches_extension(docx, ".md")
    assert not content_matches_extension(docx, ".pdf")
    # Empty/spanned ZIP markers under a text extension still mismatch.
    assert not content_matches_extension(empty_zip, ".txt")
    assert not content_matches_extension(spanned_zip, ".md")

    # Successful create needs a real (temp) upload dir + awaitable db methods.
    tmp_dir = Path(tempfile.mkdtemp(prefix="verify-signatures-"))
    original_get_settings = files_module.get_settings
    files_module.get_settings = (  # type: ignore[assignment]
        lambda: SimpleNamespace(max_upload_bytes=25 * 1024 * 1024, upload_dir=tmp_dir)
    )
    try:
        asyncio.run(_assert_create_accepts("report.docx", docx))
        asyncio.run(_assert_create_rejects("spoof.pdf", text, "file_content_mismatch"))
        asyncio.run(_assert_create_rejects("payload.exe", b"MZ", "unsupported_type"))
        asyncio.run(_assert_create_rejects("empty.txt", b"", "empty_upload"))
        asyncio.run(_assert_create_rejects("weird.txt", docx, "file_content_mismatch"))
        asyncio.run(_assert_create_rejects("weird.md", empty_zip, "file_content_mismatch"))
    finally:
        files_module.get_settings = original_get_settings
        shutil.rmtree(tmp_dir, ignore_errors=True)
    print("file signature checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
