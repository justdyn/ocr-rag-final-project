"""Tesseract OCR provider with runtime binary availability check (PRD §3.2)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from PIL import Image


class TesseractNotAvailableError(RuntimeError):
    """Raised when the Tesseract binary is missing or unusable."""

    code = "tesseract_not_found"


@dataclass(frozen=True)
class OcrPageResult:
    text: str
    confidence: float | None  # 0–100 average from Tesseract, if available


@lru_cache(maxsize=1)
def is_tesseract_available() -> bool:
    """Probe once per process. Never assume the binary is installed."""
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def require_tesseract() -> None:
    if not is_tesseract_available():
        raise TesseractNotAvailableError(
            "Tesseract OCR binary is not installed or not on PATH"
        )


def ocr_image(image: Image.Image) -> OcrPageResult:
    """Run Tesseract on a single PIL image. Raises TesseractNotAvailableError."""
    require_tesseract()
    import pytesseract

    data: dict[str, Any] = pytesseract.image_to_data(
        image, output_type=pytesseract.Output.DICT
    )
    text = pytesseract.image_to_string(image) or ""

    confidences: list[float] = []
    for raw in data.get("conf", []):
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            confidences.append(value)

    confidence = sum(confidences) / len(confidences) if confidences else None
    return OcrPageResult(text=text, confidence=confidence)


def ocr_image_path(path: str) -> OcrPageResult:
    with Image.open(path) as img:
        return ocr_image(img.convert("RGB"))
