"""Small transactional helpers shared by all workflow services."""

from copy import deepcopy

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from kira.models import AuditLog, CleanRow, MatchRun, UploadRule, WorkflowState

TYPES = ("pos", "settlement", "bank")


class WorkflowError(ValueError):
    """A request cannot run at the current workflow step."""


def get(s: Session, key: str, default=None):
    value = s.get(WorkflowState, key)
    # Callers can safely mutate and put() a nested value without SQLAlchemy losing it.
    return deepcopy(value.value if value is not None else default)


def put(s: Session, key: str, value) -> None:
    entry = s.get(WorkflowState, key)
    if entry is None:
        s.add(WorkflowState(key=key, value=deepcopy(value)))
    else:
        entry.value = deepcopy(value)


def audit(s: Session, actor: str, action: str, obj: str, detail: str = "") -> None:
    s.add(AuditLog(actor=actor, action=action, object=obj, detail=detail))


def clear_matching(s: Session, stage: str | None = None) -> None:
    """Invalidate results, keeping runs and links as evidence and follow-ups intact."""
    if stage not in (None, "l1", "l2"):
        raise WorkflowError("Matching stage must be l1 or l2")
    stages = ("l1", "l2") if stage in (None, "l1") else ("l2",)
    s.execute(update(MatchRun).where(MatchRun.stage.in_(stages)).values(current=False))
    for name in stages:
        s.execute(delete(WorkflowState).where(WorkflowState.key == f"run_{name}"))


def table_columns(s: Session, type_: str) -> list[dict]:
    rule = s.scalar(
        select(UploadRule)
        .where(UploadRule.type == type_)
        .order_by(UploadRule.version.desc())
        .limit(1)
    )
    if rule is None:
        return []
    return [
        {"name": c["name"], "type": c.get("type", "text")}
        for c in rule.columns
        if c.get("keep", True)
    ]


def clean_tables(s: Session) -> dict:
    # Scalar JSON projections decode fresh dictionaries on every read. They can
    # be changed by matching/analysis without copying or mutating ORM entities.
    return {
        type_: {
            "columns": table_columns(s, type_),
            "rows": list(
                s.scalars(
                    select(CleanRow.data).where(CleanRow.type == type_).order_by(CleanRow.row_no)
                )
            ),
        }
        for type_ in TYPES
    }


def drop_rows(s: Session, model, type_: str | None = None) -> None:
    statement = delete(model)
    if type_ is not None:
        if type_ not in TYPES:
            raise WorkflowError("Table must be pos, settlement or bank")
        statement = statement.where(model.type == type_)
    s.execute(statement)
