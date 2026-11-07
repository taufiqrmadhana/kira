"""Workflow reads reuse snapshots while decisions still become visible immediately."""

from unittest.mock import patch

from sqlalchemy import event
from test_analysis_cache import database  # noqa: F401

from kira import db
from kira.models import ParsedRow
from kira.services import analysis, clean, state, status


def test_workflow_and_status_reuse_across_sessions(database):
    with patch.object(status, "_counts", wraps=status._counts) as counts:
        with db.session_scope(write=False) as s:
            first = status.workflow(s, rows=5)
        initial_calls = counts.call_count
        with db.session_scope(write=False) as s:
            assert status.workflow(s, rows=5) == first
            assert status.status(s) == first["status"]
        assert counts.call_count == initial_calls
    with db.session_scope() as s:
        state.put(s, "recommendations", [{"decision": None}])
    with db.session_scope(write=False) as s:
        assert status.status(s)["cleaning"]["open"] == 1
        assert status.workflow(s, rows=5)["status"]["cleaning"]["open"] == 1


def test_standard_reads_pos_names_only_preserving_frequency_and_ties(database):
    with db.session_scope() as s:
        for i, name in enumerate(["Zestly A", "zestly a", "Zestly A", "Outlet B"]):
            s.add(ParsedRow(type="pos", row_no=i, data={"branch": name, "huge": "unused"}))
    loaded = []

    def loaded_row(row, context):
        loaded.append(row)

    event.listen(ParsedRow, "load", loaded_row)
    try:
        with db.session_scope(write=False) as s:
            assert clean.standard(s)["outlets"] == {
                "Zestly A": ["zestlya"],
                "Outlet B": ["outletb"],
            }
        assert loaded == []
    finally:
        event.remove(ParsedRow, "load", loaded_row)


def test_warm_workflow_and_clean_reads(database):
    analysis.warm_cache(db.engine_for(""))
    with patch.object(status, "_counts", side_effect=AssertionError("Status cache missed")):
        with db.session_scope(write=False) as s:
            status.workflow(s, rows=5)
            status.status(s)
