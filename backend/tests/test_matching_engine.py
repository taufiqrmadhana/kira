import copy
import csv
from pathlib import Path

import pytest

from kira.core import matching


def tables():
    return {
        "pos": {
            "rows": [
                {
                    "sales_number": "P1",
                    "trace_number": "a",
                    "branch": "Harbor",
                    "payment_amount": 600,
                    "sales_datetime_out": "2026-10-24T12:00:00+07:00",
                },
                {
                    "sales_number": "P2",
                    "trace_number": "b",
                    "branch": "Harbor",
                    "payment_amount": 400,
                    "sales_datetime_out": "2026-10-24T13:00:00+07:00",
                },
            ]
        },
        "settlement": {
            "rows": [
                {
                    "reference": "S1",
                    "external_reference_id": "a",
                    "entity_id": "12345678",
                    "transaction_type": "Payment",
                    "branch": "Harbor",
                    "transaction_date": "2026-10-24",
                    "gross_amount": 600,
                    "nett_amount": 600,
                },
                {
                    "reference": "S2",
                    "external_reference_id": "b",
                    "entity_id": "12345678",
                    "transaction_type": "Payment",
                    "branch": "Harbor",
                    "transaction_date": "2026-10-24",
                    "gross_amount": 400,
                    "nett_amount": 400,
                },
                {
                    "reference": "W1",
                    "entity_id": "12345678",
                    "transaction_type": "Withdrawal",
                    "transaction_date": "2026-10-24",
                    "nett_amount": -1000,
                },
                {"transaction_type": "Closing Balance", "nett_amount": 0},
            ]
        },
        "bank": {
            "rows": [
                {
                    "id": "B1",
                    "keterangan": "AIRPAY 45678",
                    "tanggal_transaksi": "2026-10-25",
                    "kredit": 1000,
                }
            ]
        },
    }


ID = {
    "id": "PS1",
    "stage": "l1",
    "kind": "id",
    "params": {"posCol": "trace_number", "stlCol": "external_reference_id"},
}
WITHDRAWAL = {
    "id": "SM1",
    "stage": "l2",
    "kind": "withdrawal",
    "params": {"groupBy": "entity_id", "requireId": True, "amountTol": 0, "maxDays": 3},
}


def test_two_stages_preserve_evidence_and_do_not_mutate_inputs():
    t = tables()
    before = copy.deepcopy(t)
    l1 = matching.run_l1([ID], t)
    l2 = matching.run_l2([WITHDRAWAL], t)
    result = matching.final_result(t, l1, l2)
    assert l1["matched"] == l2["matched"] == 2
    assert l1["unmatched_right"] == 0
    assert l2["links"][0]["via"] == 2
    assert result["totals"]["full"] == 2
    assert result["totals"]["credits_linked"] == 1
    assert result["totals"]["cash"] == 1000
    assert result["totals"]["many_to_one"] == 1
    assert t == before


def test_empty_ids_never_match_and_each_row_is_used_once():
    t = tables()
    t["pos"]["rows"] += [{"trace_number": "a"}, {"trace_number": ""}, {"trace_number": None}]
    t["settlement"]["rows"] += [{"external_reference_id": ""}, {"external_reference_id": None}]
    result = matching.run_l1([ID, {**ID, "id": "PS2"}], t)
    assert result["matched"] == 2
    assert result["hits"] == {"PS1": 2, "PS2": 0}
    assert result["ambiguous"] == []
    assert [link["left"] for link in result["links"]] == [[0], [1]]


@pytest.mark.parametrize(
    "change",
    [
        {"kredit": 999},
        {"tanggal_transaksi": "2026-10-23"},
        {"tanggal_transaksi": "2026-10-28"},
        {"keterangan": "AIRPAY 99999"},
    ],
)
def test_withdrawal_requires_amount_date_and_store(change):
    t = tables()
    t["bank"]["rows"][0].update(change)
    assert matching.run_l2([WITHDRAWAL], t)["matched"] == 0


def test_missing_payout_and_unassigned_credit_are_not_full_matches():
    t = tables()
    t["bank"]["rows"][0]["keterangan"] = "another store"
    result = matching.final_result(t, matching.run_l1([ID], t), matching.run_l2([WITHDRAWAL], t))
    assert result["totals"]["full"] == 0
    assert result["totals"]["mismatched"] == 3
    assert {r["reason"] for g in result["groups"] for r in g["rows"]} == {
        "No approved bank link",
        "Credit with no settlement",
    }


def test_composite_suggestion_uses_only_remaining_pairable_sales():
    t = tables()
    t["settlement"]["rows"][0]["transaction_date"] = "2026-10-24T12:00:30+07:00"
    t["settlement"]["rows"][1]["transaction_date"] = "2026-10-24T13:04:00+07:00"
    # The ID rule already takes P1. P2 is the only remaining pair and needs five minutes.
    t["settlement"]["rows"][1]["external_reference_id"] = "different"
    t["pos"]["rows"].extend({"payment_amount": 1} for _ in range(8))
    proposals = matching.suggest("l1", [ID], t)
    exact = next(r for r in proposals if r["kind"] == "composite" and not r["params"]["amountTol"])
    assert exact["params"]["window"] == 5
    assert exact["extra_after_saved"] == 1


def demo_tables(dataset, day8=False):
    """Test-only projection of supplied CSV fixtures into the agreed clean-table interface."""
    root = Path(__file__).resolve().parents[2] / "data" / dataset / dataset
    if not root.exists():
        pytest.skip("Download the Drive demo data into data/<dataset>/<dataset> first")
    areas = {"POS": "pos", "SET": "settlement", "STA": "bank"}
    aliases = {
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
    numeric = {
        "payment_amount",
        "mdr",
        "nett_after_mdr",
        "gross_amount",
        "nett_amount",
        "transaction_amount",
        "settlement_amount",
        "fee_mdr",
        "fee_withdrawal",
        "fee_handling",
        "kredit",
        "debit",
        "saldo",
        "promo_amount",
    }
    t = {a: {"rows": [], "columns": []} for a in areas.values()}
    seen = {a: set() for a in areas.values()}
    for file in sorted(root.glob("day-*/*.csv")):
        if ("day-08" in str(file)) != day8:
            continue
        area = areas[file.name[:3]]
        for row in csv.DictReader(file.open(encoding="utf-8-sig", newline="")):
            row.update({dst: row.get(src, "") for src, dst in aliases[area].items()})
            for key in numeric & row.keys():
                row[key] = float(row[key]) if row[key] else None
            if area == "bank" and not (
                (row.get("kredit") or 0) > 0 and "AIRPAY" in row["keterangan"]
            ):
                continue
            fingerprint = tuple(sorted(row.items()))
            if fingerprint not in seen[area]:
                seen[area].add(fingerprint)
                t[area]["rows"].append(row)
    outlets = {row["branch"] for row in t["pos"]["rows"]}
    for row in t["settlement"]["rows"]:
        words = set(row["branch"].replace("-", "").lower().split()) - {"zestly"}
        row["branch"] = max(outlets, key=lambda outlet: len(words & set(outlet.lower().split())))
    for table in t.values():
        table["columns"] = [
            {"name": k, "type": "number" if k in numeric else "text"}
            for k in dict.fromkeys(k for r in table["rows"] for k in r)
        ]
    return t, root


@pytest.mark.parametrize(
    "dataset,full,l1n,l2n,credits",
    [("clean-100", 8784, 8784, 8784, 70), ("with-exceptions", 8639, 8781, 8641, 69)],
)
def test_demo_answer_key(dataset, full, l1n, l2n, credits):
    t, root = demo_tables(dataset)
    rules1 = matching.suggest("l1", [], t)
    rules2 = matching.suggest("l2", [], t)
    assert rules1[0]["name"] == "ID: trace_number = external_reference_id"
    assert rules2[0]["name"] == "Withdrawal payout by entity_id"
    r1, r2 = matching.run_l1([ID], t), matching.run_l2([WITHDRAWAL], t)
    final = matching.final_result(t, r1, r2)
    assert (
        r1["matched"],
        r2["matched"],
        final["totals"]["linked"],
        final["totals"]["credits_linked"],
    ) == (l1n, l2n, full, credits)
    # The older key counted linked sales as matched, including these two known amount errors.
    differences = (
        {"ZRC1792537680": 58000, "ZRC1792545067": 10000} if dataset == "with-exceptions" else {}
    )
    assert final["totals"]["full"] == full - len(differences)
    by_sale = {
        t["pos"]["rows"][r["pos"]]["sales_number"]: (r, g)
        for g in final["groups"]
        for r in g["rows"]
        if r["pos"] is not None
    }
    for expected in csv.DictReader((root / "answer_key.csv").open(encoding="utf-8-sig")):
        if expected["kind"] != "POS sale" or expected["sales_date"] == "2026-10-27":
            continue
        record, group = by_sale[expected["sales_number"]]
        actual = record["status"] if record["status"] == "Matched" else record["reason"]
        wanted = (
            "No approved bank link"
            if expected["expected"] == "Not in bank yet"
            else expected["expected"]
        )
        if expected["sales_number"] in differences:
            wanted = "Sale and settlement amounts differ"
            assert (
                t["pos"]["rows"][record["pos"]]["payment_amount"]
                - t["settlement"]["rows"][record["stl"]]["gross_amount"]
                == differences[expected["sales_number"]]
            )
        assert actual == wanted, expected["sales_number"]
        if group["bank"] is not None:
            assert (
                t["bank"]["rows"][group["bank"]]["keterangan"].strip()
                == expected["bank_keterangan"].strip()
            )
