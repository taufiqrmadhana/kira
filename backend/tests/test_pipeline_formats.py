"""Full Drive R1/R2 format and sample requirements, beyond the hackathon CSV subset."""

from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from test_pipeline_files import client as client
from test_pipeline_files import upload

from kira.core import parsing
from kira.core.pdf import pdf_tables


def workbook_bytes():
    book = Workbook()
    sheet = book.active
    sheet.title = "Sales"
    sheet.append(["Daily sales report"])
    sheet.append([])
    sheet.append(["id", "branch", "payment_amount", "sales_datetime_out"])
    sheet.append(["001", "Menteng", 100, datetime(2026, 10, 20, 13, 5)])
    second = book.create_sheet("Dates")
    second.append(["id", "date"])
    second.append(["002", date(2026, 10, 21)])
    book.create_sheet("Notes").append(["No table here"])
    result = BytesIO()
    book.save(result)
    return result.getvalue()


def pdf_bytes(pages, grid=True):
    """Make a tiny text PDF with actual ruled tables; no PDF generation dependency."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for rows in pages:
        commands = []
        width = max((len(row) for row in rows), default=2)
        if grid:
            for i in range(len(rows) + 1):
                commands.append(f"40 {750 - i * 25} m {40 + width * 150} {750 - i * 25} l S")
            for i in range(width + 1):
                commands.append(f"{40 + i * 150} 750 m {40 + i * 150} {750 - len(rows) * 25} l S")
        for i, row in enumerate(rows):
            for j, cell in enumerate(row):
                value = cell.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                commands.append(f"BT /F1 10 Tf {45 + j * 150} {733 - i * 25} Td ({value}) Tj ET")
        stream = "\n".join(commands).encode()
        stream_id = len(objects) + 2
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 650 800] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>".encode()
        )
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(len(pages)))
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode()
    result = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    start = len(result)
    result += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    result += b"".join(f"{offset:010} 00000 n \n".encode() for offset in offsets)
    return (
        result
        + f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF".encode()
    )


def test_excel_sheets_skip_titles_and_single_column_sheets():
    sheets = parsing.excel_sheets(workbook_bytes())
    assert [s["sheet"] for s in sheets] == ["Sales", "Dates"]
    assert sheets[0]["skipped"] == 2
    rows = parsing.parse_csv(sheets[0]["csv"], ",")
    assert rows[0] == ["id", "branch", "payment_amount", "sales_datetime_out"]
    assert rows[1] == ["001", "Menteng", "100", "2026-10-20T13:05:00"]
    assert "2026-10-21" in sheets[1]["csv"]


def test_excel_upload_download_all_sheets_and_duplicates(client):
    data = workbook_bytes()
    result = upload(client, content=data, name="sales.xlsx")
    assert result.status_code == 200
    ids = result.json()[0]["ids"]
    assert len(ids) == 2
    metadata = client.get("/api/files").json()
    assert [r["sheet"] for r in metadata] == ["Sales", "Dates"]
    assert [r["rows"] for r in metadata] == [1, 1]
    for file_id in ids:
        download = client.get(f"/api/files/{file_id}/download")
        assert download.content == data
        assert "spreadsheetml.sheet" in download.headers["content-type"]
    duplicate = upload(client, content=data, name="copy.xlsx", area="bank").json()[0]
    assert duplicate == {"name": "copy.xlsx", "status": "duplicate", "ids": ids}
    # Removing one sheet must allow re-uploading it without duplicating the surviving sheet.
    client.delete(f"/api/files/{ids[0]}")
    restored = upload(client, content=data, name="restored.xlsx").json()[0]
    assert restored["status"] == "added"
    assert len(client.get("/api/files").json()) == 2


def test_pdf_joins_pages_drops_repeated_header_and_reads_text_fallback():
    data = pdf_bytes(
        [
            [["id", "keterangan", "kredit"], ["001", "DANA", "100"]],
            [["id", "keterangan", "kredit"], ["002", "GOPAY", "200"]],
            [["003", "AIRPAY", "300"]],
        ]
    )
    tables = pdf_tables(data)
    assert len(tables) == 1
    assert tables[0]["sheet"] == "Table 1"
    rows = parsing.parse_csv(tables[0]["csv"], ",")
    assert len(rows) == 4
    assert rows[-1] == ["003", "AIRPAY", "300"]
    unruled = pdf_tables(
        pdf_bytes(
            [[["id", "keterangan", "kredit"], ["001", "DANA", "100"], ["002", "GOPAY", "200"]]],
            grid=False,
        )
    )
    assert len(parsing.parse_csv(unruled[0]["csv"], ",")) == 3


def test_pdf_upload_and_scanned_or_malformed_input(client):
    data = pdf_bytes([[["id", "keterangan", "kredit"], ["001", "DANA", "100"]]])
    response = upload(client, content=data, name="statement.pdf", area="bank")
    assert response.status_code == 200
    file_id = response.json()[0]["ids"][0]
    downloaded = client.get(f"/api/files/{file_id}/download")
    assert downloaded.content == data
    assert downloaded.headers["content-type"] == "application/pdf"
    assert (
        upload(client, content=data, name="copy.pdf", area="bank").json()[0]["status"]
        == "duplicate"
    )
    scanned = upload(client, content=pdf_bytes([[]]), name="scan.pdf")
    assert scanned.status_code == 400
    assert "OCR" in scanned.json()["detail"]
    for name in ["broken.xlsx", "broken.xlsm", "broken.pdf"]:
        assert upload(client, content=b"not a document", name=name).status_code == 400
    assert len(client.get("/api/files").json()) == 1


def test_samples_without_source_files_fail_explicitly(client, tmp_path, monkeypatch):
    from kira.services import files

    monkeypatch.setattr(files, "SAMPLES", tmp_path)
    client.headers["X-Kira-Client"] = "zestly-demo"
    response = client.post("/api/files/samples/1")
    assert response.status_code == 409
    assert "not installed" in response.json()["detail"]
    assert client.get("/api/files").json() == []
    assert client.post("/api/files/samples/99").status_code == 400


def test_sample_endpoint_uses_only_installed_source_files(client, tmp_path, monkeypatch):
    from test_pipeline_convert import SETTLEMENT
    from test_pipeline_files import BANK, POS

    from kira.services import files

    monkeypatch.setattr(files, "SAMPLES", tmp_path)
    client.headers["X-Kira-Client"] = "zestly-demo"
    directory = tmp_path / "day-01-20261020"
    directory.mkdir()
    for prefix, content in [("POS", POS), ("SET", SETTLEMENT), ("STA", BANK)]:
        (directory / f"{prefix}_20261020.csv").write_bytes(content)
    first = client.post("/api/files/samples/1")
    assert first.status_code == 200
    assert len(first.json()) == 3
    assert all(item["status"] == "added" for item in first.json())
    assert all(item["status"] == "duplicate" for item in client.post("/api/files/samples/1").json())
    assert {r["folder"] for r in client.get("/api/files").json()} == {"day-01-20261020"}


def test_invalid_second_sheet_rolls_back_entire_workbook(client):
    from sqlalchemy import select

    from kira import db
    from kira.models import AuditLog

    book = Workbook()
    book.active.append(["id", "branch"])
    book.active.append(["001", "Menteng"])
    second = book.create_sheet("Invalid")
    second.append(["id", "ID"])
    second.append(["002", "003"])
    stream = BytesIO()
    book.save(stream)
    result = upload(client, content=stream.getvalue(), name="bad-second-sheet.xlsx")
    assert result.status_code == 400
    assert client.get("/api/files").json() == []
    with db.session_scope(write=False) as s:
        assert s.scalar(select(AuditLog)) is None


def test_pdf_tables_on_same_page_remain_separate(monkeypatch):
    from contextlib import nullcontext
    from types import SimpleNamespace

    from kira.core import pdf

    page = SimpleNamespace(
        chars=[{}],
        extract_tables=lambda _: [
            [["id", "amount"], ["1", "100"]],
            [["code", "credit"], ["2", "200"]],
        ],
    )
    monkeypatch.setattr(
        pdf.pdfplumber, "open", lambda _: nullcontext(SimpleNamespace(pages=[page]))
    )
    tables = pdf.pdf_tables(b"test")
    assert len(tables) == 2
    assert parsing.parse_csv(tables[1]["csv"], ",") == [["code", "credit"], ["2", "200"]]
