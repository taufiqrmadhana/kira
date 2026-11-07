import pytest
from test_matching_engine import ID, WITHDRAWAL, demo_tables, tables

from kira.core import analysis, matching


def result(t):
    return analysis.records(
        t, matching.final_result(t, matching.run_l1([ID], t), matching.run_l2([WITHDRAWAL], t))
    )


def test_bank_money_is_allocated_once_before_filtering():
    t = tables()
    recs = result(t)
    allocation = analysis.allocate(recs, t)
    assert list(allocation.values()) == [600, 400]
    rows, total = analysis.rate_rows(recs, t, allocation)
    assert total["bank_credit"] == 1000
    assert total["bank"] == 1
    selected, _ = analysis.rate_rows(recs[:1], t, allocation)
    assert selected[0]["bank_credit"] == 600
    assert rows[0]["r_full"] == 100


def test_record_identity_survives_row_reordering():
    t = tables()
    first = {r["key"]: r["rid"] for r in result(t)}
    t["pos"]["rows"].reverse()
    assert first == {r["key"]: r["rid"] for r in result(t)}


@pytest.mark.parametrize(
    "dataset,expected,check", [("clean-100", 23043, 0), ("with-exceptions", 26361, 10671421)]
)
def test_demo_gaps_and_rates(dataset, expected, check):
    t, _ = demo_tables(dataset)
    recs = result(t)
    gaps = analysis.gaps(recs, recs, t)
    assert gaps["explained"] == expected
    assert gaps["unexplained"] == check
    alloc = analysis.allocate(recs, t)
    rates, total = analysis.rate_rows(recs, t, alloc)
    linked_banks = {r["bank"] for r in recs if r["bank"] is not None and r["stl"] is not None}
    assert total["bank_credit"] == pytest.approx(
        sum(t["bank"]["rows"][b]["kredit"] for b in linked_banks)
    )
    if dataset == "with-exceptions":
        harbor = next(r for r in rates if r["period"] == "2026-10-24" and "Harbor" in r["outlet"])
        assert harbor["r_full"] == 0
        assert harbor["stl_nett"] == 9031421
        assert next(g for g in gaps["kinds"] if g["kind"] == "not_in_bank")["count"] == 142
