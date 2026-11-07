import csv
import io

import openpyxl
from test_matching_api import client as client
from test_matching_api import run
from test_matching_engine import ID, WITHDRAWAL, tables

from kira.core import matching


def test_xlsx_preserves_numbers_all_rows_columns_and_literal_formula_text():
    source = tables()
    source["pos"]["rows"][0]["custom_note"] = '=HYPERLINK("https://example.test","click")'
    source["pos"]["rows"][1]["custom_note"] = "\x00@SUM(1,2)"
    source["pos"]["rows"][0]["enabled"] = True
    source["pos"]["rows"][0]["zero"] = 0
    source["pos"]["rows"].append({"sales_number": "unmatched", "payment_amount": -12.5})
    source["bank"]["rows"].append({"id": "B2", "kredit": 25, "keterangan": "+123"})
    final = matching.final_result(
        source, matching.run_l1([ID], source), matching.run_l2([WITHDRAWAL], source)
    )
    book = openpyxl.load_workbook(io.BytesIO(matching.export_xlsx(source, final)), data_only=False)
    sheet = book["Reconciliation"]
    rows = list(sheet.values)
    csv_rows = list(csv.reader(io.StringIO(matching.export_csv(source, final))))
    assert rows[0] == tuple(csv_rows[0])
    assert len(rows) == final["totals"]["rows"] + 1 == len(csv_rows)
    assert sheet.freeze_panes == "A2"
    assert sheet.auto_filter.ref.endswith(str(len(rows)))
    headers = {name: i for i, name in enumerate(rows[0])}
    assert rows[1][headers["pos.payment_amount"]] == 600
    assert rows[1][headers["pos.enabled"]] is True
    assert rows[1][headers["pos.zero"]] == 0
    assert rows[1][headers["pos.custom_note"]].startswith("=HYPERLINK")
    assert rows[2][headers["pos.custom_note"]] == "@SUM(1,2)"
    assert all(cell.data_type != "f" for row in sheet for cell in row)
    assert any(row[headers["pos.payment_amount"]] == -12.5 for row in rows[1:])
    assert any(row[headers["mutation.keterangan"]] == "+123" for row in rows[1:])


def test_xlsx_endpoint_requires_matching_and_isolates_clients(client):
    assert client.get("/api/matching/export.xlsx").status_code == 409
    run(client)
    response = client.get("/api/matching/export.xlsx")
    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert 'filename="kira-results.xlsx"' in response.headers["content-disposition"]
    sheet = openpyxl.load_workbook(io.BytesIO(response.content)).active
    assert sheet.max_row == 3
    assert (
        client.get("/api/matching/export.xlsx", headers={"X-Kira-Client": "other"}).status_code
        == 409
    )
    assert client.get("/api/matching/export").status_code == 200
