"""Rules-only SPJ field extraction (FR-07–FR-10): line items, money ints, threshold.

Run: backend/.venv/Scripts/python.exe -m pytest backend/tests/test_spj_fields.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.spj_fields import compute_document_total, extract_fields, render_accountability_stub

PARSEABLE = """Kwitansi Pembelian ATK
Buku tulis Rp 10.000
Transportasi 5000
Total: 20000
"""

UNPARSEABLE = "surat tanpa angka apapun di sini"


def _extract(text: str, **overrides):
    kwargs = {
        "extraction_method": "text_layer",
        "file_id": "f1",
        "min_confidence": 0.5,
    }
    kwargs.update(overrides)
    return extract_fields(text, **kwargs)


def test_parseable_fixture_contract():
    fields = _extract(PARSEABLE)
    assert set(fields) == {
        "vendor",
        "date",
        "currency",
        "lines",
        "document_total_stored",
        "document_total_computed",
        "extraction_method",
        "file_id",
        "confidence",
        "below_threshold",
    }
    assert fields["vendor"] is None
    assert fields["date"] is None
    assert fields["currency"] == "IDR"
    assert fields["extraction_method"] == "text_layer"
    assert fields["file_id"] == "f1"
    assert fields["document_total_stored"] is None

    lines = fields["lines"]
    assert len(lines) == 2
    for line in lines:
        assert set(line) == {"desc", "qty", "unit_price", "line_total", "chunk_id", "confidence"}
        assert line["chunk_id"] is None

    by_desc = {line["desc"]: line for line in lines}
    buku = by_desc["Buku tulis"]
    assert buku["qty"] == 1
    assert buku["unit_price"] == 10000
    assert buku["line_total"] == 10000

    transport = by_desc["Transportasi"]
    assert transport["qty"] == 1
    assert transport["unit_price"] == 5000
    assert transport["line_total"] == 5000


def test_qty_x_price_line_total_is_product():
    fields = _extract("Buku tulis 3 x 5000")
    line = fields["lines"][0]
    assert line["qty"] == 3
    assert line["unit_price"] == 5000
    # line_total is computed in code, never taken from model text
    assert line["line_total"] == line["qty"] * line["unit_price"] == 15000
    assert compute_document_total(fields) == 15000


def test_computed_total_ignores_wrong_stored_total():
    fields = _extract(PARSEABLE)
    # Decoy "Total: 20000" must not become a line item; computed = sum of lines only.
    assert compute_document_total(fields) == 15000
    assert fields["document_total_computed"] == sum(l["line_total"] for l in fields["lines"])
    assert fields["below_threshold"] is False


def test_unparseable_text_zero_state():
    fields = _extract(UNPARSEABLE)
    assert fields["lines"] == []
    assert fields["confidence"] == 0
    assert fields["below_threshold"] is True
    assert fields["document_total_computed"] == 0


def test_below_threshold_when_min_confidence_high():
    fields = _extract(PARSEABLE, min_confidence=0.9)
    assert fields["lines"] != []
    assert fields["below_threshold"] is True


def test_stub_renders_computed_total_and_escapes_ocr_text():
    fields = _extract(PARSEABLE)  # lines 10000 + 5000
    fields["document_total_computed"] = 999999  # decoy: stored total must never be rendered
    fields["lines"][0]["desc"] = "Buku <script>alert(1)</script>"
    out = render_accountability_stub(fields, compute_document_total(fields))
    assert "15000" in out  # recomputed total, not the stored decoy
    assert "999999" not in out
    assert "<script>" not in out
    assert "&lt;script&gt;" in out


def test_stub_null_vendor_date_and_stub_letterhead():
    fields = _extract(PARSEABLE)  # Phase A leaves vendor/date null
    out = render_accountability_stub(fields, compute_document_total(fields))
    assert "CAMPUS LETTERHEAD TBD" in out
    assert out.count("(not found)") == 2  # vendor + date placeholders


def test_stub_empty_lines_renders_no_rows():
    out = render_accountability_stub(_extract(UNPARSEABLE), 0)
    assert "<tr><td>" not in out
    assert "Document Total: 0" in out  # document total of an empty doc is 0
