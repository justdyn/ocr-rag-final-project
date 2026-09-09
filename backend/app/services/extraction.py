"""Text extraction routing: txt/md, text-layer PDF, OCR PDF/images (PRD §3.2)."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

from app.core.config import get_settings
from app.services.ocr import TesseractNotAvailableError, ocr_image, ocr_image_path

# Average characters per page below this → treat PDF as scanned / OCR fallback.
TEXT_LAYER_MIN_CHARS_PER_PAGE = 20

ExtractionMethod = str  # text_layer | ocr:tesseract


@dataclass
class ExtractionResult:
    text: str
    extraction_method: ExtractionMethod
    page_count: int | None = None
    ocr_confidence: float | None = None
    meta: dict | None = None


class ExtractionError(Exception):
    """Extraction failed for a specific file (maps to file.status=failed)."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def extract_file(path: Path, *, extension: str) -> ExtractionResult:
    """Route by extension. Raises ExtractionError on recoverable per-file failures."""
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"

    if ext in {".txt", ".md"}:
        return _extract_plain_text(path)
    if ext == ".pdf":
        return _extract_pdf(path)
    if ext in {".png", ".jpg", ".jpeg"}:
        return _extract_image(path)
    if ext in {".docx", ".pptx", ".xlsx"}:
        return _extract_ooxml(path, ext)
    raise ExtractionError("unsupported_type", f"Unsupported file type: {ext}")


def _extract_plain_text(path: Path) -> ExtractionResult:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ExtractionError("decode_error", "Could not decode text file")

    if not text.strip():
        raise ExtractionError("empty_content", "File contains no extractable text")

    return ExtractionResult(
        text=text,
        extraction_method="text_layer",
        page_count=1,
        meta={"encoding": encoding},
    )


def _extract_pdf(path: Path) -> ExtractionResult:
    try:
        reader = PdfReader(str(path))
    except Exception as exc:
        raise ExtractionError("pdf_read_error", f"Failed to read PDF: {exc}") from exc

    page_count = len(reader.pages)
    if page_count == 0:
        raise ExtractionError("empty_pdf", "PDF has no pages")

    page_texts: list[str] = []
    for page in reader.pages:
        try:
            page_texts.append(page.extract_text() or "")
        except Exception:
            page_texts.append("")

    combined = "\n".join(page_texts)
    avg_chars = len(combined.strip()) / page_count

    if avg_chars >= TEXT_LAYER_MIN_CHARS_PER_PAGE:
        return ExtractionResult(
            text=combined,
            extraction_method="text_layer",
            page_count=page_count,
            meta={
                "text_layer_avg_chars_per_page": round(avg_chars, 2),
                "text_layer_threshold": TEXT_LAYER_MIN_CHARS_PER_PAGE,
            },
        )

    # Scanned / near-empty text layer → OCR fallback
    return _ocr_pdf_pages(path, page_count=page_count, text_layer_avg=avg_chars)


def _ocr_pdf_pages(
    path: Path,
    *,
    page_count: int,
    text_layer_avg: float,
) -> ExtractionResult:
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:
        raise ExtractionError(
            "pdf_render_unavailable",
            "pypdfium2 is required to OCR scanned PDFs",
        ) from exc

    try:
        from app.services.ocr import require_tesseract

        require_tesseract()
    except TesseractNotAvailableError as exc:
        raise ExtractionError(exc.code, str(exc)) from exc

    texts: list[str] = []
    confidences: list[float] = []
    try:
        pdf = pdfium.PdfDocument(str(path))
        try:
            for index in range(len(pdf)):
                page = pdf[index]
                # ~150 DPI is enough for Latin OCR demos without huge bitmaps
                bitmap = page.render(scale=150 / 72)
                pil_image = bitmap.to_pil()
                result = ocr_image(pil_image)
                texts.append(result.text)
                if result.confidence is not None:
                    confidences.append(result.confidence)
        finally:
            pdf.close()
    except TesseractNotAvailableError as exc:
        raise ExtractionError(exc.code, str(exc)) from exc
    except ExtractionError:
        raise
    except Exception as exc:
        raise ExtractionError("ocr_pdf_failed", f"PDF OCR failed: {exc}") from exc

    text = "\n".join(texts)
    if not text.strip():
        raise ExtractionError("empty_ocr", "OCR produced no text")

    avg_conf = sum(confidences) / len(confidences) if confidences else None
    return ExtractionResult(
        text=text,
        extraction_method="ocr:tesseract",
        page_count=page_count,
        ocr_confidence=avg_conf,
        meta={
            "text_layer_avg_chars_per_page": round(text_layer_avg, 2),
            "text_layer_threshold": TEXT_LAYER_MIN_CHARS_PER_PAGE,
            "ocr_fallback": True,
        },
    )


def _extract_image(path: Path) -> ExtractionResult:
    try:
        result = ocr_image_path(str(path))
    except TesseractNotAvailableError as exc:
        raise ExtractionError(exc.code, str(exc)) from exc
    except Exception as exc:
        raise ExtractionError("ocr_image_failed", f"Image OCR failed: {exc}") from exc

    if not result.text.strip():
        raise ExtractionError("empty_ocr", "OCR produced no text")

    return ExtractionResult(
        text=result.text,
        extraction_method="ocr:tesseract",
        page_count=1,
        ocr_confidence=result.confidence,
        meta={"source": "image"},
    )


# --- OOXML (.docx/.pptx/.xlsx), stdlib only: zipfile + ElementTree ---

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_S_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _extract_ooxml(path: Path, ext: str) -> ExtractionResult:
    try:
        with zipfile.ZipFile(path) as zf:
            max_bytes = get_settings().max_upload_bytes
            # ponytail: zip-bomb ceiling — declared total uncompressed size vs
            # the 25 MiB upload cap checked before any read, plus per-member
            # capped streaming reads so a lying central directory cannot
            # materialize more bytes than the budget during decompression.
            total = sum(info.file_size for info in zf.infolist())
            if total > max_bytes:
                raise ExtractionError(
                    "ooxml_read_error",
                    f"Uncompressed document XML ({total} bytes) exceeds the {max_bytes}-byte cap",
                )
            budget = [max_bytes]
            if ext == ".docx":
                text, page_count = _docx_text(zf, budget)
            elif ext == ".pptx":
                text, page_count = _pptx_text(zf, budget)
            else:
                text, page_count = _xlsx_text(zf, budget)
    except zipfile.BadZipFile as exc:
        raise ExtractionError("ooxml_read_error", f"Not a valid Office document: {exc}") from exc
    except (ET.ParseError, KeyError, IndexError, ValueError, RuntimeError) as exc:
        raise ExtractionError("ooxml_read_error", f"Could not read Office document: {exc}") from exc

    if not text.strip():
        raise ExtractionError("empty_content", "File contains no extractable text")

    return ExtractionResult(
        text=text,
        extraction_method="text_layer",
        page_count=page_count,
        meta={"ooxml": ext},
    )


_OOXML_READ_CHUNK = 64 * 1024


def _read_member(zf: zipfile.ZipFile, name: str, budget: list[int]) -> bytes:
    """Materialize a member's uncompressed bytes inside the shared budget.

    ``budget`` is a one-element counter decremented by bytes actually read
    across all members; one probe byte after exhaustion tells a clean EOF
    apart from a header that lied about sizes (zip-bomb guard).
    """
    parts: list[bytes] = []
    with zf.open(name) as raw:
        while True:
            allowed = min(_OOXML_READ_CHUNK, budget[0])
            if allowed <= 0:
                if raw.read(1):
                    raise ExtractionError(
                        "ooxml_read_error",
                        f"Member {name!r} exceeds the remaining uncompressed-byte budget",
                    )
                break
            chunk = raw.read(allowed)
            if not chunk:
                break
            parts.append(chunk)
            budget[0] -= len(chunk)
    return b"".join(parts)


def _parse_member(zf: zipfile.ZipFile, name: str, budget: list[int]) -> ET.Element:
    return ET.fromstring(_read_member(zf, name, budget))


def _member_number(name: str) -> int:
    """Natural sort key for slide1.xml / sheet12.xml style names."""
    return int(re.search(r"(\d+)\.xml$", name).group(1))


def _docx_text(zf: zipfile.ZipFile, budget: list[int]) -> tuple[str, int | None]:
    # ponytail: runs joined verbatim — tabs, line breaks, and field results
    # inside w:fldSimple/w:instrText are dropped. Add w:tab/w:br mapping if
    # spacing ever matters to retrieval.
    root = _parse_member(zf, "word/document.xml", budget)
    paragraphs = [
        "".join(t.text or "" for t in para.iter(f"{_W_NS}t"))
        for para in root.iter(f"{_W_NS}p")
    ]
    return "\n".join(paragraphs), None


def _pptx_text(zf: zipfile.ZipFile, budget: list[int]) -> tuple[str, int | None]:
    slide_names = sorted(
        (n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
        key=_member_number,
    )
    parts = []
    for name in slide_names:
        root = _parse_member(zf, name, budget)
        parts.append("".join(t.text or "" for t in root.iter(f"{_A_NS}t")))
    return "\n".join(parts), len(slide_names)


def _xlsx_text(zf: zipfile.ZipFile, budget: list[int]) -> tuple[str, int | None]:
    shared: list[str] = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = _parse_member(zf, "xl/sharedStrings.xml", budget)
        for si in root.iter(f"{_S_NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{_S_NS}t")))

    sheet_names = sorted(
        (n for n in zf.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)),
        key=_member_number,
    )
    rows_out = []
    for name in sheet_names:
        root = _parse_member(zf, name, budget)
        for row in root.iter(f"{_S_NS}row"):
            cells = [value for cell in row.iter(f"{_S_NS}c") if (value := _cell_value(cell, shared))]
            if cells:
                rows_out.append(" ".join(cells))
    return "\n".join(rows_out), None


def _cell_value(cell: ET.Element, shared: list[str]) -> str:
    # ponytail: naive cells — no number/date formats, merged cells, or
    # formula-only values (f without cached v). Switch to openpyxl if cell
    # fidelity matters.
    kind = cell.get("t")
    if kind == "s":  # shared-string index
        v = cell.find(f"{_S_NS}v")
        if v is None or v.text is None:
            return ""
        return shared[int(v.text)]
    if kind == "inlineStr":
        inline = cell.find(f"{_S_NS}is")
        if inline is None:
            return ""
        return "".join(t.text or "" for t in inline.iter(f"{_S_NS}t"))
    v = cell.find(f"{_S_NS}v")
    return v.text if v is not None and v.text else ""
