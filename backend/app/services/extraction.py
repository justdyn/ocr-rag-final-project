"""Text extraction routing: txt/md, text-layer PDF, OCR PDF/images (PRD §3.2)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

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
