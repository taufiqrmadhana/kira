"""Extract text PDF tables; join continuations and remove repeated page headers."""

import csv
import io

import pdfplumber

LINES = {"vertical_strategy": "lines", "horizontal_strategy": "lines"}
TEXT = {"vertical_strategy": "text", "horizontal_strategy": "text"}


def _clean(rows: list[list]) -> list[list[str]]:
    cleaned = [[" ".join(str(cell or "").split()) for cell in row] for row in rows]
    return [row for row in cleaned if any(row)]


def pdf_tables(data: bytes) -> list[dict]:
    """Return CSV tables; image-only PDFs have no text tables and need external OCR."""
    tables = []
    with pdfplumber.open(io.BytesIO(data)) as document:
        for page_no, page in enumerate(document.pages):
            if not page.chars:
                continue
            extracted = page.extract_tables(LINES) or page.extract_tables(TEXT)
            for raw in extracted:
                rows = _clean(raw)
                if not rows or len(rows[0]) < 2:
                    continue
                previous = tables[-1] if tables else None
                if (
                    previous
                    and previous["page"] == page_no - 1
                    and len(rows[0]) == len(previous["rows"][0])
                ):
                    header = previous["rows"][0]
                    previous["rows"].extend(row for row in rows if row != header)
                    previous["page"] = page_no
                else:
                    tables.append({"rows": rows, "page": page_no})
    result = []
    for i, table in enumerate(tables, 1):
        out = io.StringIO()
        csv.writer(out).writerows(table["rows"])
        result.append({"sheet": f"Table {i}", "csv": out.getvalue(), "skipped": 0})
    return result
