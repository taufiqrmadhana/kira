from copy import deepcopy

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from kira.db import Base
from kira.models import CleanRow, UploadRule
from kira.services import analysis


@pytest.fixture
def database():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(
            UploadRule(
                type="pos",
                version=1,
                delimiter=",",
                columns=[
                    {"name": "reference", "type": "text", "keep": True},
                    {"name": "hidden", "type": "number", "keep": False},
                ],
                created_by="Nurwan",
            )
        )
        session.add_all(
            [
                CleanRow(
                    type="pos",
                    row_no=0,
                    source_row=0,
                    data={"reference": "P1", "details": {"label": "original"}},
                    was={"reference": "old P1"},
                ),
                CleanRow(
                    type="settlement",
                    row_no=1,
                    source_row=1,
                    data={"reference": "S2", "nett_amount": 1250, "flag": True},
                    was={},
                ),
                CleanRow(
                    type="settlement",
                    row_no=0,
                    source_row=0,
                    data={"reference": "S1", "nett_amount": None, "flag": False},
                    was={},
                ),
            ]
        )
        session.commit()
    yield engine
    engine.dispose()


def test_analysis_tables_read_clean_data_and_history_once(database):
    statements = []

    def record_query(connection, cursor, statement, parameters, context, many):
        if "FROM clean_rows" in statement:
            statements.append(statement)

    event.listen(database, "before_cursor_execute", record_query)
    with Session(database) as session:
        tables = analysis._tables(session)

    assert len(statements) == 3
    assert all("clean_rows.data" in sql and "clean_rows.was" in sql for sql in statements)
    assert tables["pos"]["columns"] == [{"name": "reference", "type": "text"}]
    assert tables["pos"]["rows"][0]["__was"] == {"reference": "old P1"}
    assert tables["settlement"] == {
        "columns": [
            {"name": "reference", "type": "text"},
            {"name": "nett_amount", "type": "number"},
            {"name": "flag", "type": "text"},
        ],
        "rows": [
            {"reference": "S1", "nett_amount": None, "flag": False},
            {"reference": "S2", "nett_amount": 1250, "flag": True},
        ],
    }
    assert tables["bank"] == {"columns": [], "rows": []}


def test_analysis_tables_are_detached_and_read_changes_in_next_session(database):
    with Session(database) as session:
        stored = session.scalar(select(CleanRow).where(CleanRow.type == "pos"))
        original_data, original_was = deepcopy(stored.data), deepcopy(stored.was)
        tables = analysis._tables(session)
        tables["pos"]["rows"][0]["details"]["label"] = "comparison only"
        tables["pos"]["rows"][0]["__was"]["reference"] = "comparison only"
        assert stored.data == original_data
        assert stored.was == original_was
        assert not session.dirty

    with Session(database) as session:
        stored = session.scalar(select(CleanRow).where(CleanRow.type == "pos"))
        stored.data = {**stored.data, "reference": "P2"}
        session.commit()

    with Session(database) as session:
        current = analysis._tables(session)
    assert current["pos"]["rows"][0] == {
        "reference": "P2",
        "details": {"label": "original"},
        "__was": {"reference": "old P1"},
    }
