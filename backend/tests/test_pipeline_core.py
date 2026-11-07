"""R1 acceptance checks from Drive documents 03, 09 and 12."""

from copy import deepcopy
from pathlib import Path

import pytest

from kira.core import cleaning, parsing
from kira.standard import REQUIRED_COLUMNS


def table(rows):
    return {"columns": [{"name": k, "type": "text"} for k in rows[0]], "rows": rows}


def rule(prof):
    return {
        "columns": prof["proposed"],
        "delimiter": prof["delimiter"],
        "rename": {k: v["to"] for k, v in prof["rename"].items()},
        "version": 1,
    }


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Rp 2.000.000,50", 2000000.5),
        ("2,000,000.50", 2000000.5),
        ("1.250.000", 1250000),
        ("1,250,000", 1250000),
        ("12,5", 12.5),
        ("0", 0),
        ("", None),
        ("12abc", None),
        ("1.2.3", None),
    ],
)
def test_numbers(raw, expected):
    assert parsing.parse_number(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-10-20", ("date", "2026-10-20")),
        ("20/10/26 13.05", ("datetime", "2026-10-20T13:05:00+07:00")),
        ("20-10-2026 13:05:07", ("datetime", "2026-10-20T13:05:07+07:00")),
        ("2026-10-20T06:05:07Z", ("datetime", "2026-10-20T13:05:07+07:00")),
        ("31/02/26", None),
        ("not a date", None),
    ],
)
def test_dates(raw, expected):
    assert parsing.parse_date(raw) == expected


def test_csv_and_type_inference():
    text = '\ufeff\n Merchant Store Name ;Amount;Account\n"Store; One";12,5;00123\n;;\n'
    assert parsing.detect_delimiter(text) == ";"
    assert len(parsing.parse_csv(text, ";")) == 2
    assert parsing.norm_header(" Merchant Store Name ") == "merchant_store_name"
    p = parsing.profile("pos", [text])
    types = {c["name"]: c["type"] for c in p["proposed"]}
    assert types["account"] == "text"
    assert types["amount"] == "number"
    assert parsing.infer_type(["", "ya", "false"]) == "bool"
    assert parsing.infer_type(["", ""]) == "text"
    assert parsing.infer_type(["2026-10-20", "2026-10-21T13:00"]) == "datetime"


def test_per_file_aliases_preserve_native_columns_and_mapping_overrides():
    p = parsing.profile(
        "settlement",
        [
            "merchant_store_name,transaction_amount,transaction_id\nA,100,001\n",
            "outlet,gross_amount,transaction_id\nB,200,002\n",
            "branch,outlet,gross_amount\nNative,Ignored,300\n",
        ],
    )
    assert [r["branch"] for r in p["rows"]] == ["A", "B", "Native"]
    assert p["rows"][0]["merchant_store_name"] == "A"
    assert p["rows"][0]["reference"] == "001"
    assert p["headers"].index("branch") == p["headers"].index("merchant_store_name") + 1
    blocked = parsing.profile("pos", ["outlet,amount\nA,100\n"], {"outlet": {"to": ""}})
    assert "branch" not in blocked["headers"]
    mapped = parsing.profile(
        "pos",
        ["location_code,total\n001,100\n"],
        {"location_code": {"to": "branch", "by": "user"}},
    )
    assert mapped["rows"][0]["branch"] == "001"
    priority = parsing.profile(
        "pos",
        ["outlet,chosen\nAlias,Explicit\n"],
        {"chosen": {"to": "branch", "by": "user"}},
    )
    assert priority["rows"][0]["branch"] == "Explicit"


def test_keep_types_deduplication_and_pure_inputs():
    p = parsing.profile(
        "pos",
        [
            "trace_number,table_no,amount,unused\n001,1,100,x\n001,1,100,y\n002,1,200,z\n003,1,300,z\n"
        ],
    )
    proposed = {c["name"]: c for c in p["proposed"]}
    assert proposed["trace_number"]["keep"]
    assert not proposed["table_no"]["keep"]
    assert not proposed["unused"]["keep"]
    before = deepcopy(p)
    result = parsing.build_parsed(p, rule(p))
    assert result["duplicates"] == 1
    assert len(result["rows"]) == 3
    assert result["rows"][0]["trace_number"] == "001"
    assert result["rows"][0]["payment_amount"] == 100
    assert p == before
    unknown = parsing.profile("pos", ["foo,bar\nx,y\n"])
    assert all(c["keep"] for c in unknown["proposed"])


def test_rule_diff_and_wrong_area():
    p = parsing.profile(
        "pos", ["branch,payment_amount,sales_datetime_out\nA,100,2026-10-20\n"]
    )
    saved = rule(p)
    assert parsing.rule_diff(p, saved) is None
    added = parsing.profile(
        "pos",
        [
            "branch,payment_amount,sales_datetime_out,order_channel\nA,100,2026-10-20,app\n"
        ],
    )
    assert parsing.rule_diff(added, saved)["added"] == ["order_channel"]
    missing = parsing.profile("pos", ["branch,payment_amount\nA,100\n"])
    assert "sales_datetime_out" in parsing.rule_diff(missing, saved)["missing"]
    text = parsing.profile(
        "pos", ["branch,payment_amount,sales_datetime_out\nA,unknown,2026-10-20\n"]
    )
    assert parsing.rule_diff(text, saved) is None
    other = parsing.profile(
        "pos", ["branch;payment_amount;sales_datetime_out\nA;100;2026-10-20\n"]
    )
    assert parsing.rule_diff(other, saved)["delimiter"]
    assert (
        parsing.looks_like(
            "keterangan,kredit,debit,saldo,account\nAIRPAY,100,0,100,01\n"
        )
        == "bank"
    )
    assert parsing.looks_like("foo,bar\nx,y\n") is None


def test_outlet_names_majority_unique_match_and_ambiguity():
    p = {
        "pos": table(
            [{"branch": "Zestly Central Plaza Jakarta"}] * 2
            + [
                {"branch": "ZESTLY CENTRAL PLAZA JAKARTA"},
                {"branch": "Zestly Harbor Square Surabaya"},
            ]
        )
    }
    outlets = cleaning.outlet_names(p)
    assert (
        cleaning.match_outlet("Zestly - Central Plz", outlets)
        == "Zestly Central Plaza Jakarta"
    )
    assert cleaning.match_outlet("Zestly", outlets) is None
    assert cleaning.match_outlet("Central Harbor", outlets) is None
    assert cleaning.match_outlet("unrelated", outlets) is None
    assert cleaning.standard_name("providers", "qris") == "DANA"
    assert cleaning.standard_name("providers", "DANA GOPAY") is None


def test_cleaning_decisions_preview_saved_rules_and_provenance():
    p = {
        "pos": table([{"branch": "Store One"}]),
        "settlement": table([{"branch": "store-one"}, {"branch": "Unknown"}]),
        "bank": table(
            [
                {"keterangan": "AIRPAY 123", "kredit": 100},
                {"keterangan": "Fee 123", "debit": 10},
                {"keterangan": "Fee 456", "debit": 20},
            ]
        ),
    }
    original = deepcopy(p)
    recs = cleaning.build_recs(p, None)
    assert {r["id"] for r in recs} == {"settlement.branch", "bank.exclude"}
    with pytest.raises(ValueError):
        cleaning.save(None, recs)
    for rec in recs:
        rec["decision"] = "accept"
    rules = cleaning.save(None, recs)
    assert rules["version"] == 1
    assert rules["maps"]["settlement.branch"]["Unknown"] == "Unknown"
    cleaned = cleaning.apply(p, rules)
    assert cleaned["settlement"]["rows"][0]["branch"] == "Store One"
    assert cleaned["settlement"]["was"][0] == {"branch": "store-one"}
    assert cleaned["bank"]["dropped"] == 2
    assert cleaned["bank"]["source_rows"] == [0]
    assert cleaning.build_recs(p, rules) == []
    assert p == original
    assert cleaning.active_rules(None, recs)["maps"] == rules["maps"]
    for rec in recs:
        rec["decision"] = "reject"
    rejected = cleaning.save(None, recs)
    assert cleaning.apply(p, rejected)["bank"]["dropped"] == 0
    assert cleaning.build_recs(p, rejected) == []


def test_refresh_preserves_edits_without_approving_new_values():
    p = {"settlement": table([{"branch": "menteng"}])}
    recs = cleaning.build_recs(p, None)
    recs[0]["items"][0]["to"] = "Custom"
    recs[0]["decision"] = "accept"
    assert cleaning.build_recs(p, None, recs)[0]["decision"] == "accept"
    p["settlement"]["rows"].append({"branch": "new spelling"})
    refreshed = cleaning.build_recs(p, None, recs)[0]
    assert refreshed["items"][0]["to"] == "Custom"
    assert refreshed["decision"] is None


@pytest.fixture
def demo_data():
    root = Path(__file__).resolve().parents[2] / "data" / "with-exceptions"
    if not root.exists():
        pytest.skip(
            "Unzip Drive Data/with-exceptions.zip into data/ for fixture checks"
        )
    return root


def test_zestly_day1_and_day8_acceptance(demo_data):
    profiles = {}
    parsed = {}
    saved = {}
    for area, prefix in [("pos", "POS"), ("settlement", "SET"), ("bank", "STA")]:
        text = (demo_data / "day-01-20261020" / f"{prefix}_20261020.csv").read_text()
        profiles[area] = parsing.profile(area, [text])
        assert set(REQUIRED_COLUMNS[area]) <= set(profiles[area]["headers"])
        saved[area] = rule(profiles[area])
        parsed[area] = parsing.build_parsed(profiles[area], saved[area])
    assert len(parsed["pos"]["rows"]) == 1178
    sale = parsed["pos"]["rows"][0]
    assert sale["sales_datetime_out"] == sale["sales_date_out"]
    stl = parsed["settlement"]["rows"][0]
    for target, source in [
        ("branch", "merchant_store_name"),
        ("reference", "transaction_id"),
        ("transaction_date", "create_time"),
        ("gross_amount", "transaction_amount"),
        ("nett_amount", "settlement_amount"),
    ]:
        assert stl[target] == stl[source]
    recs = cleaning.build_recs(parsed, None)
    assert {r["id"] for r in recs} == {"settlement.branch", "bank.exclude"}
    for rec in recs:
        rec["decision"] = "accept"
    rules = cleaning.save(None, recs)
    assert len(cleaning.apply(parsed, rules)["bank"]["rows"]) == 10
    # The live demo adds day 8 after the complete first week, not just day 1.
    for area, prefix in [("pos", "POS"), ("settlement", "SET"), ("bank", "STA")]:
        texts = [
            next(day.glob(f"{prefix}_*.csv")).read_text()
            for day in sorted(demo_data.glob("day-0[1-7]-*"))
        ]
        prof = parsing.profile(area, texts)
        assert parsing.rule_diff(prof, saved[area]) is None
        parsed[area] = parsing.build_parsed(prof, saved[area])
    assert len(parsed["pos"]["rows"]) == 8784
    for rec in (recs := cleaning.build_recs(parsed, rules)):
        rec["decision"] = "accept"
    rules = cleaning.save(rules, recs)
    assert len(cleaning.apply(parsed, rules)["bank"]["rows"]) == 70
    changes = []
    for area, prefix in [("pos", "POS"), ("settlement", "SET"), ("bank", "STA")]:
        texts = [
            next(day.glob(f"{prefix}_*.csv")).read_text()
            for day in sorted(demo_data.glob("day-*"))
        ]
        prof = parsing.profile(area, texts)
        diff = parsing.rule_diff(prof, saved[area])
        if diff:
            changes.append((area, diff))
        parsed[area] = parsing.build_parsed(prof, rule(prof))
    assert len(changes) == 1
    assert changes[0][0] == "pos"
    assert changes[0][1]["added"] == ["order_channel"]
    recs = cleaning.build_recs(parsed, rules)
    assert len(recs) == 1
    assert recs[0]["id"] == "settlement.branch"
    assert len(recs[0]["items"]) == 1
    assert recs[0]["items"][0]["from"] == "Zestly - Central Plz"
    assert recs[0]["items"][0]["to"] == "Zestly Central Plaza Jakarta"
    assert recs[0]["items"][0]["rows"] > 0
    assert len(parsed["pos"]["rows"]) == 8784 + 1198


def test_invalid_headers_rows_and_mapping_are_rejected():
    for text in ["A,a\nx,y\n", "a,\nx,y\n", "a,b\nx,y,z\n", 'a,b\n"unterminated,y\n']:
        with pytest.raises((ValueError, parsing.csv.Error)):
            parsing.profile("pos", [text])
    with pytest.raises(ValueError):
        parsing.profile("pos", ["outlet\nA\n"], {"outlet": {"to": "kredit"}})


def test_rule_diff_detects_nontext_type_and_mapping_changes():
    before = parsing.profile("pos", ["branch,amount\nA,100\n"])
    changed = parsing.profile("pos", ["branch,amount\nA,true\n"])
    assert {c["name"] for c in parsing.rule_diff(changed, rule(before))["types"]} == {
        "amount",
        "payment_amount",
    }
    changed = parsing.profile("pos", ["branch,amount\nA,100\n"], {"amount": {"to": ""}})
    assert parsing.rule_diff(changed, rule(before))["rename"] == {"amount": ""}
    native = parsing.profile("pos", ["branch,amount,payment_amount\nA,100,200\n"])
    assert parsing.rule_diff(native, rule(before))["rename"] == {"amount": ""}


def test_bank_keep_override_and_provenance_after_drops():
    parsed = {
        "bank": table(
            [
                {"keterangan": "Fee 1", "debit": 10},
                {"keterangan": "AIRPAY 2", "kredit": 100},
                {"keterangan": "Unknown 3", "kredit": 200},
            ]
        )
    }
    recs = cleaning.build_recs(parsed, None)
    recs[0]["decision"] = "accept"
    recs[0]["items"][1]["exclude"] = False
    rules = cleaning.save(None, recs)
    result = cleaning.apply(parsed, rules)["bank"]
    assert result["dropped"] == 1
    assert result["source_rows"] == [1, 2]
    assert result["was"] == [{}, {}]
    assert cleaning.build_recs(parsed, rules) == []


def test_casts_use_contract_types_and_keep_leading_zero_ids():
    assert parsing.parse_number("12,34,567.89") == 1234567.89
    assert parsing.clean_value("ya", "bool") is True
    assert parsing.clean_value("tidak", "bool") is False
    assert parsing.clean_value("maybe", "bool") is None
    assert parsing.clean_value("  ", "number") is None
    assert parsing.clean_value("2026-10-20", "datetime") == "2026-10-20T00:00:00+07:00"
    assert parsing.clean_value("20/10/26 13.05", "date") == "2026-10-20"
    with pytest.raises(ValueError):
        parsing.clean_value("x", "not-a-type")
    p = parsing.profile("pos", ["account,trace_number,amount\n0001,0002,12500\n"])
    assert parsing.build_parsed(p, rule(p))["rows"][0]["account"] == "0001"
