"""Read-only checks against the supplied masked October 6-16 CSV and workbook controls.

Download the two Drive files into data/new-sample-20261006-20261016 as
dataset.zip and summary.xlsx. Raw data stays outside Git. This projection tests
matching after header mapping and cleaning, not the upload/cleaning pipeline.
"""

import csv
import io
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

import pytest
from openpyxl import load_workbook
from test_matching_engine import ID, WITHDRAWAL

from kira.core import analysis, matching

DATA = Path(__file__).resolve().parents[2] / "data/new-sample-20261006-20261016"
NUMBERS = {
    "payment_amount",
    "mdr",
    "nett_after_mdr",
    "transaction_amount",
    "settlement_amount",
    "fee_mdr",
    "fee_withdrawal",
    "fee_handling",
    "promo_amount",
    "kredit",
    "debit",
    "saldo",
}
ALIASES = {
    "pos": {"sales_date_out": "sales_datetime_out"},
    "settlement": {
        "merchant_store_name": "branch",
        "transaction_id": "reference",
        "create_time": "transaction_date",
        "transaction_amount": "gross_amount",
        "settlement_amount": "nett_amount",
    },
    "bank": {},
}


@pytest.fixture(scope="module")
def sample():
    if not all((DATA / name).exists() for name in ("dataset.zip", "summary.xlsx")):
        pytest.skip(
            "Download the new masked sample ZIP and summary workbook; see this test's docstring"
        )
    tables = {a: {"rows": [], "columns": []} for a in ALIASES}
    raw = {a: [] for a in ALIASES}
    control = []
    with ZipFile(DATA / "dataset.zip") as archive:
        for name in sorted(archive.namelist()):
            rows = list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))))
            if name.endswith("CONTROL_SUMMARY.csv"):
                control = rows
                continue
            area = {"POS": "pos", "SET": "settlement", "STA": "bank"}[Path(name).name[:3]]
            for row in rows:
                for key in NUMBERS & row.keys():
                    row[key] = float(row[key]) if row[key] else None
                raw[area].append(row.copy())
                # Closing balances repeat the day's credit totals; they are not deposits.
                if area == "bank" and row["row_type"] != "TRANSACTION":
                    continue
                row.update({dest: row.get(src, "") for src, dest in ALIASES[area].items()})
                tables[area]["rows"].append(row)
    outlets = sorted({r["branch"] for r in tables["pos"]["rows"]})
    names = {}
    for name in {r["branch"] for r in tables["settlement"]["rows"]}:
        # The source spells the same outlet "Riverside Ctr" and "Riverside Center Jogja".
        candidates = [
            o
            for o in outlets
            if matching.norm_branch(name.replace("Ctr", "Center")) in matching.norm_branch(o)
        ]
        assert len(candidates) == 1, (name, candidates)
        names[name] = candidates[0]
    for row in tables["settlement"]["rows"]:
        row["branch"] = names[row["branch"]]
    for table in tables.values():
        table["columns"] = [
            {
                "name": k,
                "type": "number"
                if any(isinstance(r.get(k), (int, float)) for r in table["rows"])
                else "text",
            }
            for k in dict.fromkeys(k for r in table["rows"] for k in r)
        ]
    book = load_workbook(DATA / "summary.xlsx", read_only=True, data_only=True)
    sheets = {}
    for name in ("Matching_Sample", "Edge_Cases", "Summary_Daily"):
        rows = book[name].iter_rows(values_only=True)
        header = next(rows)
        sheets[name] = [dict(zip(header, row)) for row in rows if row and row[0] is not None]
    book.close()
    a = matching.run_l1([ID], tables)
    b = matching.run_l2([WITHDRAWAL], tables)
    final = matching.final_result(tables, a, b)
    return tables, raw, control, sheets, a, b, final


def test_new_sample_input_controls_and_balances(sample):
    tables, raw, controls, sheets, *_ = sample
    assert len(controls) == 11
    assert len(raw["bank"]) - len(tables["bank"]["rows"]) == 22
    for c in controls:
        date = c["transaction_date"]
        pos = [r for r in raw["pos"] if r["sales_date_out"].startswith(date)]
        pay = [
            r
            for r in raw["settlement"]
            if r["transaction_type"] == "Payment" and r["create_time"].startswith(date)
        ]
        wd = [
            r
            for r in raw["settlement"]
            if r["transaction_type"] == "Withdrawal" and r["create_time"].startswith(date)
        ]
        bank = [r for r in tables["bank"]["rows"] if r["tanggal_transaksi"] == c["statement_date"]]
        actual = {
            "pos_count": len(pos),
            "pos_amount": sum(r["payment_amount"] for r in pos),
            "set_payment_count": len(pay),
            "set_gross": sum(r["transaction_amount"] for r in pay),
            "set_mdr": sum(r["fee_mdr"] or 0 for r in pay),
            "set_promo": sum(r["promo_amount"] or 0 for r in pay),
            "set_net": sum(r["settlement_amount"] for r in pay),
            "set_withdrawal": sum(abs(r["settlement_amount"]) for r in wd),
            "sta_credit": sum(r["kredit"] or 0 for r in bank),
            "sta_debit": sum(r["debit"] or 0 for r in bank),
        }
        assert actual == {k: float(c[k]) for k in actual}, date
        assert float(c["wallet_opening"]) + actual["set_net"] - actual["set_withdrawal"] == float(
            c["wallet_closing"]
        )
        assert float(c["sta_opening"]) + actual["sta_credit"] - actual["sta_debit"] == float(
            c["sta_closing"]
        )
    totals = next(r for r in sheets["Summary_Daily"] if r["transaction_date"] == "TOTAL")
    assert len(tables["pos"]["rows"]) == totals["pos_count"] == 14859
    assert sum(r["kredit"] or 0 for r in tables["bank"]["rows"]) == totals["sta_credit_posted"]


def test_new_sample_every_pos_settlement_pair_matches_workbook(sample):
    t, _, _, sheets, a, _, _ = sample
    links = {
        t["pos"]["rows"][x["left"][0]]["sales_number"]: t["settlement"]["rows"][x["right"][0]][
            "reference"
        ]
        for x in a["links"]
    }
    expected = {
        r["pos_sales_number"]: r["set_transaction_id"]
        for r in sheets["Matching_Sample"]
        if r["pos_sales_number"]
    }
    assert len(expected) == 14859
    assert links == {k: v for k, v in expected.items() if v}
    assert a["matched"] == 14857
    assert a["unmatched_left"] == a["unmatched_right"] == 2
    assert len({x["right"][0] for x in a["links"]}) == len(a["links"])


@pytest.mark.parametrize("tolerance,linked,full", [(0, 109, 14736), (2500, 110, 14736)])
def test_new_sample_every_bank_link_and_explicit_tolerance(sample, tolerance, linked, full):
    t, _, _, sheets, a, _, _ = sample
    rule = {**WITHDRAWAL, "params": {**WITHDRAWAL["params"], "amountTol": tolerance}}
    b = matching.run_l2([rule], t)
    actual = {
        t["settlement"]["rows"][j]["reference"]: t["bank"]["rows"][x["right"][0]]
        for x in b["links"]
        for j in x["left"]
    }
    expected = [
        r
        for r in sheets["Matching_Sample"]
        if r["set_transaction_id"] and (tolerance or r["match_status"] != "STA_AMOUNT_DIFF")
    ]
    assert len(actual) == len(expected)
    for row in expected:
        bank = actual[row["set_transaction_id"]]
        assert bank["keterangan"].strip() == row["sta_keterangan"].strip()
        assert bank["kredit"] == row["sta_kredit"]
        assert bank["tanggal_transaksi"] == row["sta_tanggal"].date().isoformat()
    final = matching.final_result(t, a, b)
    assert final["totals"]["credits"] == 110
    assert final["totals"]["credits_linked"] == linked
    assert final["totals"]["full"] == full
    assert len({x["right"][0] for x in b["links"]}) == len(b["links"])
    assert sum(len(x["left"]) for x in b["links"]) == len(actual)
    if tolerance:
        recs = analysis.records(t, final)
        kinds = {x["kind"]: x for x in analysis.gaps(recs, recs, t)["kinds"]}
        # The source's Rp2,500 withdrawal shortage also has Rp467 rounding from net to withdrawal.
        assert kinds["payout_diff"]["count"] == 1
        assert kinds["payout_diff"]["amount"] == 2500


def test_new_sample_all_edge_cases_and_amount_warnings(sample):
    t, _, _, sheets, _, _, final = sample
    recs = analysis.records(t, final)
    by_trace = {
        (analysis.source(r, t, "pos") or {}).get("trace_number")
        or (analysis.source(r, t, "settlement") or {}).get("external_reference_id"): r
        for r in recs
    }
    edges = [r for r in sheets["Edge_Cases"] if r.get("edge_case")]
    assert len(edges) == 13
    kinds = {x["kind"]: x for x in analysis.gaps(recs, recs, t)["kinds"]}
    for edge in edges:
        kind = edge["edge_case"]
        if kind in {"STA_H+2", "STA_AMOUNT_DIFF"}:
            source_date = edge["transaction_date"].date().isoformat()
            group = [
                r
                for r in recs
                if (analysis.source(r, t, "settlement") or {}).get("entity_id") == edge["entity_id"]
                and str(
                    (analysis.source(r, t, "settlement") or {}).get("transaction_date", "")
                ).startswith(source_date)
            ]
            assert group
            if kind == "STA_H+2":
                assert all(
                    analysis.source(r, t, "bank")["tanggal_transaksi"]
                    == edge["sta_date_actual"].date().isoformat()
                    for r in group
                )
            else:
                assert len(group) == 119
                assert all(r["reason"] == "No approved bank link" for r in group)
        else:
            rec = by_trace[edge["trace_number"]]
            if kind == "POS_ONLY":
                assert rec["reason"] == "No settlement"
            elif kind == "SET_ONLY":
                assert rec["reason"] == "No POS sale"
            elif kind == "SET_H+1":
                assert rec["status"] == "Matched"
                assert analysis.source(rec, t, "settlement")["transaction_date"].startswith(
                    edge["set_date_actual"].date().isoformat()
                )
            elif kind == "AMOUNT_MISMATCH":
                evidence = next(x for x in kinds["sale_diff"]["samples"] if x["key"] == rec["key"])
                assert evidence["amount"] == edge["amount_difference"]
    assert kinds["sale_diff"]["amount"] == 38000
    assert kinds["pos_no_settlement"]["amount"] == 250000
    assert kinds["stl_no_pos"]["amount"] == 141000
    assert Counter(r["match_status"] for r in sheets["Matching_Sample"])["MATCH_STA_H+2"] == 720


def test_new_sample_suggestions_keep_exact_ids_and_withdrawal(sample):
    t, *_ = sample
    assert matching.suggest("l1", [], t)[0]["params"] == ID["params"]
    assert matching.suggest("l2", [], t)[0]["params"] == WITHDRAWAL["params"]


def test_approved_layers_reproduce_every_answer_key_status(sample):
    t, _, _, sheets, *_ = sample
    base = {
        "outlet": True,
        "method": False,
        "amountTol": 0,
        "window": "day",
        "posCol": "trace_number",
        "stlCol": "external_reference_id",
        "requireId": True,
    }
    rules = [
        {"id": f"PS{i}", "kind": "composite", "params": base | p}
        for i, p in enumerate(
            [
                {},
                {"requireId": False},
                {"requireId": False, "window": 4320},
                {"requireId": False, "window": 4320, "amountTol": 20000},
            ],
            1,
        )
    ]
    a = matching.run_l1(rules, t)
    assert a["hits"] == {"PS1": 14854, "PS2": 0, "PS3": 1, "PS4": 2}
    bank_rules = [
        {**WITHDRAWAL, "id": f"SM{i}", "params": WITHDRAWAL["params"] | p}
        for i, p in enumerate(
            [
                {"maxDays": 0},
                {"requireId": False, "maxDays": 0},
                {"requireId": False},
                {"requireId": False, "amountTol": 2500},
            ],
            1,
        )
    ]
    b = matching.run_l2(bank_rules, t)
    final = matching.final_result(t, a, b)
    recs = analysis.records(t, final)
    by_pos = {analysis.source(r, t, "pos")["sales_number"]: r for r in recs if r["pos"] is not None}
    by_stl = {
        analysis.source(r, t, "settlement")["reference"]: r for r in recs if r["stl"] is not None
    }
    expected = {
        "POS_ONLY": ("Mismatched", "No settlement"),
        "SET_ONLY": ("Mismatched", "No POS sale"),
        "AMOUNT_MISMATCH": ("Mismatched", "Sale and settlement amounts differ"),
        "STA_AMOUNT_DIFF": ("Mismatched", "Bank payout amount differs"),
    }
    for row in sheets["Matching_Sample"]:
        rec = (
            by_pos[row["pos_sales_number"]]
            if row["pos_sales_number"]
            else by_stl[row["set_transaction_id"]]
        )
        assert (rec["status"], rec["reason"]) == expected.get(row["match_status"], ("Matched", ""))
        if row["set_transaction_id"]:
            assert analysis.source(rec, t, "settlement")["reference"] == row["set_transaction_id"]
            bank = analysis.source(rec, t, "bank")
            assert bank["keterangan"].strip() == row["sta_keterangan"].strip()
            assert bank["kredit"] == row["sta_kredit"]
            assert bank["tanggal_transaksi"] == row["sta_tanggal"].date().isoformat()
    assert final["totals"]["full"] == 14736
    assert final["totals"]["linked"] == 14857
    assert final["totals"]["mismatched"] == 125
    assert final["totals"]["credits_linked"] == 110
