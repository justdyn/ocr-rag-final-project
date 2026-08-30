"""OCR package — Tesseract provider with graceful missing-binary handling."""

from app.services.ocr.tesseract import (
    OcrPageResult,
    TesseractNotAvailableError,
    is_tesseract_available,
    ocr_image,
    ocr_image_path,
    require_tesseract,
)

__all__ = [
    "OcrPageResult",
    "TesseractNotAvailableError",
    "is_tesseract_available",
    "ocr_image",
    "ocr_image_path",
    "require_tesseract",
]
