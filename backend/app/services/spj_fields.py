"""Rules-only SPJ field extraction (FR-07–FR-10). stdlib `re`; no LLM, no Azure."""

from __future__ import annotations

import html
import re
from pathlib import Path
from string import Template
from typing import Any

# ponytail: no negatives/paren amounts yet; IDR thousands "." + decimal "," supported.
_AMOUNT = (
    r"(?:Rp\s?)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)"
)
_TOTAL_LINE = re.compile(r"^(total|jumlah|grand total)\b", re.IGNORECASE)
_QTY_X_PRICE = re.compile(r"^(\D*?)\s*(\d+)\s*[xX×]\s*" + _AMOUNT, re.IGNORECASE)
_ANY_AMOUNT = re.compile(_AMOUNT)


def _parse_idr_amount(raw: str) -> int:
    """Parse Indonesian IDR token to whole rupiah (sen rounded)."""
    s = raw.strip()
    if "," in s:
        whole, frac = s.rsplit(",", 1)
        whole_digits = whole.replace(".", "")
        frac = (frac + "00")[:2]
        cents = int(whole_digits) * 100 + int(frac)
        return (cents + 50) // 100
    return int(s.replace(".", ""))


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
            qty, unit_price = int(qty_raw), _parse_idr_amount(price_raw)
            qty_x_price = True
        else:
            matches = list(_ANY_AMOUNT.finditer(stripped))
            if not matches:
                continue  # no money on this line — not a line item
            last = matches[-1]
            unit_price = _parse_idr_amount(last.group(1))
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


def extract_spby_header(text: str) -> dict:
    # ponytail: next-line labels, widen the patterns when a real text-layer SPBY differs
    import re
    m_date = re.search(r"Tanggal\s*:\s*([0-9]+\s+[A-Za-z]+\s+[0-9]{4})", text)
    date = m_date.group(1) if m_date else None
    m_payee = re.search(r"Kepada\s*\n\s*([\w\s\.]+?)\n", text)
    payee = m_payee.group(1).strip() if m_payee else None
    m_uraian = re.search(r"Untuk Pembayaran\n(.+?)\nKegiatan", text, re.S)
    uraian = m_uraian.group(1).strip() if m_uraian else None
    m_mak = re.search(r"Kegiatan / Output/MAK\n([0-9A-Z\.]+)", text)
    mak = m_mak.group(1).strip() if m_mak else None
    nomor = None
    for line in text.splitlines():
        if line.startswith("Nomor"):
            rest = line.split(":", 1)[1].strip()
            nomor = rest if rest else None
            break
    m_amount = re.search(r"melakukan pembayaran sejumlah\s*([0-9]+)", text)
    amount_idr = int(m_amount.group(1)) if m_amount else None
    return {"date": date, "amount_idr": amount_idr, "uraian": uraian, "payee": payee, "mak": mak, "nomor": nomor}
