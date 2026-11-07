"""Read projections avoid rebuilding ORM entities without sharing mutable JSON."""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from kira.db import Base
from kira.models import CleanRow
from kira.services import analysis, state


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(
            CleanRow(
                type="pos",
                row_no=0,
                source_row=0,
                data={"branch": "Harbor", "payment_amount": 100, "extra": {"tags": ["original"]}},
                was={"branch": "Harbour"},
            )
        )
        s.commit()
        s.expunge_all()
        yield s
    engine.dispose()


def test_clean_table_snapshots_do_not_materialize_orm_entities(session):
    loaded = []

    def track_load(row, context):
        loaded.append(row.id)

    event.listen(CleanRow, "load", track_load)
    try:
        tables = state.clean_tables(session)
    finally:
        event.remove(CleanRow, "load", track_load)
    assert tables["pos"]["rows"][0]["payment_amount"] == 100
    assert loaded == []


def test_clean_table_snapshots_keep_nested_json_isolated(session):
    stored = session.get(CleanRow, 1)
    first = state.clean_tables(session)
    first["pos"]["rows"][0]["extra"]["tags"].append("temporary")
    first["pos"]["rows"][0]["branch"] = "Temporary branch"
    session.flush()
    second = state.clean_tables(session)
    assert stored.data["extra"]["tags"] == ["original"]
    assert stored.data["branch"] == "Harbor"
    assert second["pos"]["rows"][0] == stored.data
    assert second["pos"]["rows"][0] is not stored.data
    assert second["pos"]["rows"][0]["extra"] is not stored.data["extra"]


def test_analysis_adds_cleaning_evidence_without_loading_data_twice(session):
    data_reads = []

    def track_select(connection, cursor, statement, parameters, context, many):
        if statement.lstrip().upper().startswith("SELECT") and "clean_rows.data" in statement:
            data_reads.append(statement)

    event.listen(session.bind, "before_cursor_execute", track_select)
    try:
        tables = analysis._tables(session)
    finally:
        event.remove(session.bind, "before_cursor_execute", track_select)
    assert len(data_reads) == 3  # One data read per area, including empty areas.
    assert tables["pos"]["rows"][0]["__was"] == {"branch": "Harbour"}
    assert {"name": "payment_amount", "type": "number"} in tables["pos"]["columns"]
    assert "__was" not in state.clean_tables(session)["pos"]["rows"][0]
