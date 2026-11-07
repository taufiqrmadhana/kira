"""User-approved matching layers must retain uncertainty and money differences."""

from copy import deepcopy

import pytest
from test_matching_engine import ID, WITHDRAWAL, tables

from kira.core import analysis, matching


def layer(**params):
    return {
        "id": "PS2",
        "kind": "composite",
        "params": {
            "outlet": True,
            "method": False,
            "window": "day",
            "amountTol": 0,
            "posCol": "trace_number",
            "stlCol": "external_reference_id",
            "requireId": True,
            **params,
        },
    }


def test_layers_apply_amount_date_and_reference_limits_in_order():
    t = tables()
    t["settlement"]["rows"][0]["gross_amount"] = 590
    t["settlement"]["rows"][1]["transaction_date"] = "2026-10-25"
    rules = [
        layer(),
        {**layer(window=2880), "id": "PS3"},
        {**layer(window=2880, amountTol=10, enabled=False), "id": "PS4"},
    ]
    result = matching.run_l1(rules, t)
    assert result["matched"] == 1
    assert result["hits"] == {"PS2": 0, "PS3": 1}
    rules[2]["params"]["enabled"] = True
    result = matching.run_l1(rules, t)
    assert result["hits"] == {"PS2": 0, "PS3": 1, "PS4": 1}
    t["settlement"]["rows"][1]["transaction_date"] = "2026-10-24"
    final = matching.final_result(t, result, matching.run_l2([WITHDRAWAL], t))
    recs = analysis.records(t, final)
    assert (
        next(r for r in recs if r["key"] == "P1")["reason"] == "Sale and settlement amounts differ"
    )
    assert final["totals"]["linked"] == 2
    assert final["totals"]["full"] == 1


def test_optional_reference_never_overrides_a_conflicting_known_reference():
    t = tables()
    t["settlement"]["rows"][0]["external_reference_id"] = "different"
    result = matching.run_l1([layer(requireId=False)], t)
    assert result["matched"] == 1
    t["pos"]["rows"][0]["trace_number"] = ""
    assert matching.run_l1([layer(requireId=False)], t)["matched"] == 2


@pytest.mark.parametrize("duplicate_side", ["pos", "settlement"])
def test_duplicate_candidates_are_not_chosen_by_row_order(duplicate_side):
    t = tables()
    t[duplicate_side]["rows"].append(deepcopy(t[duplicate_side]["rows"][0]))
    for rule in (ID, layer()):
        result = matching.run_l1([rule], t)
        assert result["matched"] == 1
        assert 0 in result["ambiguous"]


def test_composite_supports_custom_amount_and_date_columns():
    t = tables()
    for area, amount, date in (
        ("pos", "payment_amount", "sales_datetime_out"),
        ("settlement", "gross_amount", "transaction_date"),
    ):
        for row in t[area]["rows"]:
            if amount in row:
                row["custom_amount"] = row.pop(amount)
            if date in row:
                row["custom_date"] = row.pop(date)
    result = matching.run_l1(
        [
            layer(
                posAmount="custom_amount",
                stlAmount="custom_amount",
                posDate="custom_date",
                stlDate="custom_date",
            )
        ],
        t,
    )
    assert result["matched"] == 2


def test_bank_tolerance_links_but_does_not_erase_shortage():
    t = tables()
    t["bank"]["rows"][0]["kredit"] = 990
    strict = matching.run_l2([WITHDRAWAL], t)
    assert strict["matched"] == 0
    relaxed = {**WITHDRAWAL, "params": {**WITHDRAWAL["params"], "amountTol": 10}}
    b = matching.run_l2([relaxed], t)
    final = matching.final_result(t, matching.run_l1([ID], t), b)
    recs = analysis.records(t, final)
    assert final["totals"]["full"] == 0
    assert final["totals"]["linked"] == 2
    assert {r["reason"] for r in recs} == {"Bank payout amount differs"}
    assert analysis.gaps(recs, recs, t)["unexplained"] == 10
    relaxed["params"]["enabled"] = False
    assert matching.run_l2([relaxed], t)["matched"] == 0


def test_bank_date_interval_and_duplicate_credits_remain_unlinked():
    t = tables()
    exact = {**WITHDRAWAL, "params": {**WITHDRAWAL["params"], "maxDays": 0}}
    assert matching.run_l2([exact], t)["matched"] == 0
    t["bank"]["rows"].append(deepcopy(t["bank"]["rows"][0]))
    result = matching.run_l2([WITHDRAWAL], t)
    assert result["matched"] == 0
    assert result["ambiguous"] == [0, 1]


def test_withdrawal_cannot_be_assigned_to_two_groups_or_a_partial_group():
    t = tables()
    # A reference rule takes one payment first. The full withdrawal cannot pay the remainder.
    t["bank"]["rows"].append({"keterangan": "S1", "kredit": 600, "tanggal_transaksi": "2026-10-24"})
    b = matching.run_l2([{"id": "SM0", "kind": "ref", "params": {}}, WITHDRAWAL], t)
    assert b["matched"] == 1
    assert b["links"][0]["left"] == [0]
