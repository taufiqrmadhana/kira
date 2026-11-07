"""Useful rule alternatives remain available even when earlier rules cover their rows."""

from copy import deepcopy

import pytest
from test_matching_engine import ID, WITHDRAWAL, tables

from kira.core import matching


@pytest.mark.parametrize("with_time", [False, True])
def test_alternative_suggestion_survives_when_saved_rule_already_links_every_sale(with_time):
    t = tables()
    if with_time:
        for pos, stl in zip(t["pos"]["rows"], t["settlement"]["rows"]):
            stl["transaction_date"] = pos["sales_datetime_out"]
    before = deepcopy(t)
    suggestions = matching.suggest("l1", [ID], t)
    exact = next(
        r for r in suggestions if r["kind"] == "composite" and r["params"]["amountTol"] == 0
    )
    assert (exact["matches_alone"], exact["extra_after_saved"]) == (2, 0)
    alternate = {**exact, "id": "PS2"}
    first = matching.run_l1([ID, alternate], t)
    reordered = matching.run_l1([alternate, ID], t)
    assert first["matched"] == reordered["matched"] == 2
    assert first["hits"] == {"PS1": 2, "PS2": 0}
    assert reordered["hits"] == {"PS2": 2, "PS1": 0}
    assert t == before


@pytest.mark.parametrize("enabled", [False, True])
def test_saved_conditions_are_not_suggested_again_regardless_of_activation(enabled):
    t = tables()
    original = matching.suggest("l1", [], t)[0]
    saved = {**original, "id": "PS2", "params": {**original["params"], "enabled": enabled}}
    before = deepcopy(saved)
    suggestions = matching.suggest("l1", [saved], t)
    assert not any(
        r["kind"] == saved["kind"] and r["params"] == original["params"] for r in suggestions
    )
    assert saved == before
    assert matching.run_l1([saved], t)["matched"] == (2 if enabled else 0)


def test_different_id_conditions_remain_available_after_an_id_rule_is_saved():
    t = tables()
    for pos, stl in zip(t["pos"]["rows"], t["settlement"]["rows"]):
        pos["trace_number"] = stl["external_reference_id"] = "trace-" + pos["sales_number"]
        stl["sale_id"] = pos["sales_number"]
    saved = {**ID, "params": {"posCol": "sales_number", "stlCol": "sale_id"}}
    suggestion = next(r for r in matching.suggest("l1", [saved], t) if r["kind"] == "id")
    assert suggestion["params"] == ID["params"]
    assert (suggestion["matches_alone"], suggestion["extra_after_saved"]) == (2, 0)


def bank_tables(description="Merchant-1 S1"):
    t = tables()
    t["settlement"]["rows"] = t["settlement"]["rows"][:1]
    t["settlement"]["rows"][0].update(merchant_id="Merchant-1", settled_date="2026-10-24")
    t["bank"]["rows"][0].update(kredit=600, keterangan=description)
    return t


def test_bank_alternatives_are_retained_and_each_credit_is_used_only_by_first_rule():
    t = bank_tables()
    saved = {"id": "SM1", "kind": "ref", "params": {"amountTol": 0, "enabled": True}}
    suggestions = matching.suggest("l2", [saved], t)
    assert [r["kind"] for r in suggestions] == ["batch"]
    alternate = {**suggestions[0], "id": "SM2"}
    assert (alternate["matches_alone"], alternate["extra_after_saved"]) == (1, 0)
    for rules in ([saved, alternate], [alternate, saved]):
        result = matching.run_l2(rules, t)
        assert result["matched"] == len(result["links"]) == 1
        assert result["hits"] == {rules[0]["id"]: 1, rules[1]["id"]: 0}


def test_amount_fallback_keeps_different_conditions_but_skips_saved_conditions():
    t = bank_tables("Bank payout")
    saved = {"id": "SM1", "kind": "amount", "params": {"amountTol": 10, "enabled": True}}
    suggestion = matching.suggest("l2", [saved], t)[0]
    assert suggestion["kind"] == "amount"
    assert (suggestion["matches_alone"], suggestion["extra_after_saved"]) == (1, 0)
    saved["params"]["amountTol"] = 0
    assert matching.suggest("l2", [saved], t) == []


def test_withdrawal_suggestion_recognizes_saved_default_minimum_delay():
    t = tables()
    t["settlement"]["rows"].extend(
        {**row, "entity_id": "87654321"}
        for row in list(t["settlement"]["rows"])
        if "entity_id" in row
    )
    t["bank"]["rows"].append({**t["bank"]["rows"][0], "keterangan": "AIRPAY 54321"})
    assert matching.suggest("l2", [], t)[0]["kind"] == "withdrawal"
    saved = {
        **WITHDRAWAL,
        "params": {**WITHDRAWAL["params"], "minDays": 0, "enabled": False},
    }
    assert not any(r["kind"] == "withdrawal" for r in matching.suggest("l2", [saved], t))


@pytest.mark.parametrize("stage", ["l1", "l2"])
def test_suggestions_without_any_links_are_not_offered(stage):
    t = tables()
    t["settlement"]["rows"] = []
    assert matching.suggest(stage, [], t) == []
