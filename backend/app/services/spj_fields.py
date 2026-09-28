"""Rules-only SPJ field extraction (FR-07–FR-10). stdlib `re`; no LLM, no Azure."""

from __future__ import annotations

import html
import re
from pathlib import Path
from string import Template
from typing import Any

# ponytail: naive IDR regex — no comma-decimals, negatives or paren amounts;
# tighten when real SPJ fixtures break it (e.g. accept "1.000,50").
_AMOUNT = r"(?:Rp\s?)?(\d{1,3}(?:\.\d{3})+|\d+)"
_TOTAL_LINE = re.compile(r"^(total|jumlah|grand total)\b", re.IGNORECASE)
_QTY_X_PRICE = re.compile(r"^(\D*?)\s*(\d+)\s*[xX×]\s*" + _AMOUNT, re.IGNORECASE)
_ANY_AMOUNT = re.compile(_AMOUNT)


def _to_int(raw: str) -> int:
    return int(raw.replace(".", ""))


def _line_confidence(qty_x_price: bool) -> float:
    return 0.8 if qty_x_price else 0.6


def extract_fields(
    text: str,
    *,
    extraction_method: str,
    file_id: str,
    min_confidence: float,
) -> dict[str, Any]:
    """Extract SPJ line items from raw text with rules only; total is Python sum."""
    lines: list[dict[str, Any]] = []
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped or _TOTAL_LINE.match(stripped):
            continue  # total-labeled lines are the document total, never a line item
        qty = 1
        qty_x_price = False
        match = _QTY_X_PRICE.match(stripped)
        if match:
            desc, qty_raw, price_raw = match.groups()
            qty, unit_price = int(qty_raw), _to_int(price_raw)
            qty_x_price = True
        else:
            matches = list(_ANY_AMOUNT.finditer(stripped))
            if not matches:
                continue  # no money on this line — not a line item
            last = matches[-1]
            unit_price = _to_int(last.group(1))
            desc = re.sub(r"(?i)\s*Rp\s*$", "", stripped[: last.start()])
        desc = desc.strip(" \t:-–—") or stripped
        lines.append(
            {
                "desc": desc,
                "qty": qty,
                "unit_price": unit_price,
                "line_total": qty * unit_price,  # arithmetic is code, not model text
                "chunk_id": None,  # no chunk mapping this slice
                "confidence": _line_confidence(qty_x_price),
            }
        )

    confidence = round(sum(l["confidence"] for l in lines) / len(lines), 4) if lines else 0
    return {
        "vendor": None,  # reserved for later phases
        "date": None,
        "currency": "IDR",
        "lines": lines,
        "document_total_stored": None,
        "document_total_computed": sum(l["line_total"] for l in lines),
        "extraction_method": extraction_method,
        "file_id": file_id,
        "confidence": confidence,
        "below_threshold": confidence < min_confidence,
    }


def with_threshold(fields: dict[str, Any], min_confidence: float) -> dict[str, Any]:
    """Return a new fields dict annotated with mean line confidence and below_threshold.

    Immutable: does not mutate the input dict. Confidence is 0 when no lines.
    Lines without a confidence field (legacy data) default to 1.0 so they don't
    drag down the mean — only newly extracted lines carry explicit scores.
    """
    lines = fields.get("lines") if isinstance(fields.get("lines"), list) else []
    if lines:
        confidence = round(
            sum(float(l.get("confidence", 1.0)) for l in lines) / len(lines), 4
        )
    else:
        confidence = 0
    out = dict(fields)
    out["confidence"] = confidence
    out["below_threshold"] = confidence < min_confidence
    return out


def compute_document_total(fields: dict[str, Any]) -> int:
    """Always sum line totals in Python — never ask an LLM to sum."""
    return sum(l["line_total"] for l in fields["lines"])


_STUB_TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "templates" / "spj" / "accountability_stub.html"


def _esc(value: Any) -> str:
    return html.escape(str(value))


def render_accountability_stub(fields: dict[str, Any], document_total: int | None) -> str:
    """Fill the static stub letter with Phase A fields; `document_total` must be the
    recomputed value from `compute_document_total` — stored totals are never rendered."""
    rows = "\n".join(
        "<tr><td>{desc}</td><td>{qty}</td><td>{unit_price}</td><td>{line_total}</td></tr>".format(
            desc=_esc(line.get("desc")),
            qty=_esc(line.get("qty")),
            unit_price=_esc(line.get("unit_price")),
            line_total=_esc(line.get("line_total")),
        )
        for line in fields.get("lines", [])
    )
    return Template(_STUB_TEMPLATE_PATH.read_text(encoding="utf-8")).safe_substitute(
        vendor=_esc(fields.get("vendor") or "(not found)"),
        date=_esc(fields.get("date") or "(not found)"),
        rows=rows,
        document_total=document_total if document_total is not None else "-",
    )
