import copy

import pytest
from test_matching_engine import ID, WITHDRAWAL, tables

from kira.core import matching


@pytest.mark.parametrize(
    ("stage", "rules", "checks"),
    [
        ("l1", [ID, {**ID, "id": "PS2"}], 4),
        ("l2", [WITHDRAWAL], 1),
        ("l2", [WITHDRAWAL, {"id": "SM2", "kind": "amount", "params": {}}], 3),
        ("l2", [{"id": "SM2", "kind": "batch", "params": {"groupBy": "entity_id"}}], 1),
        ("l1", [], 0),
        ("l2", [], 0),
    ],
)
def test_progress_counts_real_checks_without_changing_results(stage, rules, checks):
    source = tables()
    for row in source["settlement"]["rows"]:
        row["settled_date"] = row.get("transaction_date")
    before = copy.deepcopy(source)
    expected = matching.run_stage(stage, rules, source)
    events = []
    result = matching.run_stage(stage, rules, source, progress=events.append)
    assert result == expected
    assert source == before
    assert events[0]["completed"] == 0
    assert events[-1]["completed"] == events[-1]["total"] == checks
    assert [e["completed"] for e in events] == sorted(e["completed"] for e in events)
    assert all(e["stage"] == stage and e["unit"] == "checks" for e in events)
    assert all(0 <= e["completed"] <= e["total"] == checks for e in events)
    assert events[-1]["matched"] == result["matched"]
    assert events[-1]["hits"] == result["hits"]
    assert events[0]["hits"] == {}


def test_progress_reports_an_intermediate_processed_row_with_real_hits():
    events = []
    matching.run_stage("l1", [ID], tables(), progress=events.append)
    middle = next(event for event in events if event["completed"] == 1)
    assert middle["total"] == 2
    assert middle["matched"] == 1
    assert middle["hits"] == {"PS1": 1}


def test_progress_counts_unmatchable_rows_and_skipped_batch_groups():
    source = tables()
    source["pos"]["rows"].append({"payment_amount": 3})
    events = []
    matching.run_stage(
        "l1",
        [{"id": "PS2", "kind": "composite", "params": {}}],
        source,
        progress=events.append,
    )
    assert events[-1]["completed"] == events[-1]["total"] == 3
    for row in source["settlement"]["rows"]:
        row["settled_date"] = row.get("transaction_date")
    events.clear()
    result = matching.run_stage(
        "l2",
        [WITHDRAWAL, {"id": "SM2", "kind": "batch", "params": {"groupBy": "entity_id"}}],
        source,
        progress=events.append,
    )
    assert result["hits"] == {"SM1": 2, "SM2": 0}
    assert events[-1]["completed"] == events[-1]["total"] == 2


def test_large_stage_reports_bounded_checkpoints_with_exact_final_count():
    source = tables()
    source["pos"]["rows"] = [dict(source["pos"]["rows"][0]) for _ in range(10000)]
    events = []
    result = matching.run_stage("l1", [ID], source, progress=events.append)
    assert events[-1]["completed"] == events[-1]["total"] == 10000
    assert events[-1]["matched"] == result["matched"] == 1
    assert 3 < len(events) <= 205
    assert all(0 <= item["completed"] <= item["total"] for item in events)


@pytest.mark.parametrize("stage, rule", [("l1", ID), ("l2", WITHDRAWAL)])
def test_progress_preserves_nurwan_inactive_rule_behavior(stage, rule):
    events = []
    disabled = {**rule, "params": {**rule["params"], "enabled": False}}
    result = matching.run_stage(stage, [disabled], tables(), progress=events.append)
    assert result == matching.run_stage(stage, [], tables())
    assert events[-1]["completed"] == events[-1]["total"] == 0
    assert events[-1]["hits"] == {}
