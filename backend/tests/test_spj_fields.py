"""Rules-only SPJ field extraction (FR-07–FR-10): line items, money ints, threshold.

Run: backend/.venv/Scripts/python.exe -m pytest backend/tests/test_spj_fields.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.spj_fields import compute_document_total, extract_fields, extract_spby_header, render_accountability_stub

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


def test_idr_comma_decimal_amount():
    """Honor/perjalanan dinas often use Indonesian comma decimals (UTS slide 7)."""
    fields = _extract("Honor narasumber Rp 1.000,50")
    assert len(fields["lines"]) == 1
    assert fields["lines"][0]["unit_price"] == 1001
    assert fields["lines"][0]["line_total"] == 1001


def test_idr_comma_decimal_honor_qty_x_price():
    fields = _extract("Honorarium 2 x Rp 500.000,00")
    line = fields["lines"][0]
    assert line["qty"] == 2
    assert line["unit_price"] == 500000
    assert line["line_total"] == 1000000


def test_spby_header_matches_two_gold_forms():
    honor = (
        "Tanggal :\n"
        "26 Juni 2025\n"
        "Nomor :\n"
        "Kepada\n"
        "Dwitami Sekarini S.Pd\n"
        "Untuk Pembayaran\n"
        "FSTI : Honorarium instruktur Germas - 1 orang\n"
        "Kegiatan / Output/MAK\n"
        "7730.DBA.003.051.S.522151\n"
        "melakukan pembayaran sejumlah\n"
        "310000"
    )
    mr = (
        "Tanggal :\n"
        "9 Februari 2026\n"
        "Nomor :\n"
        "Kepada\n"
        "Dwitami Sekarini S.Pd\n"
        "Untuk Pembayaran\n"
        "FSTI - Sistem Informasi : Open Talk - Frame Foto A4 (2 Pcs)\n"
        "Kegiatan / Output/MAK\n"
        "7730.DBA.002.051.E.521211\n"
        "melakukan pembayaran sejumlah\n"
        "57000"
    )
    h1 = extract_spby_header(honor)
    assert h1["date"] == "26 Juni 2025"
    assert h1["amount_idr"] == 310000
    assert h1["uraian"] == "FSTI : Honorarium instruktur Germas - 1 orang"
    assert h1["payee"] == "Dwitami Sekarini S.Pd"
    assert h1["mak"] == "7730.DBA.003.051.S.522151"
    assert h1["nomor"] is None

    h2 = extract_spby_header(mr)
    assert h2["date"] == "9 Februari 2026"
    assert h2["amount_idr"] == 57000
    assert h2["uraian"] == "FSTI - Sistem Informasi : Open Talk - Frame Foto A4 (2 Pcs)"
    assert h2["payee"] == "Dwitami Sekarini S.Pd"
    assert h2["mak"] == "7730.DBA.002.051.E.521211"
    assert h2["nomor"] is None
