"""Refresh Layer 2 after conversion; cleaning decisions and routes are added in R4."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from kira.core import cleaning
from kira.models import CleaningRules, CleanRow
from kira.services import state


def current_rules(s: Session) -> dict | None:
    rule = s.scalar(select(CleaningRules).order_by(CleaningRules.version.desc()).limit(1))
    if rule is None:
        return None
    return {
        "version": rule.version,
        "maps": rule.maps,
        "exclude": rule.exclude,
        "created_by": rule.created_by,
        "created_at": rule.created_at.isoformat(),
    }


def recommendations(s: Session) -> list[dict]:
    return state.get(s, "recommendations", [])


def refresh(s: Session, types: list[str] | None = None) -> None:
    """Keep existing decisions, rebuild recommendations and apply cleaning to changed tables."""
    from kira.services.convert import parsed_tables

    parsed = parsed_tables(s)
    rules = current_rules(s)
    recs = cleaning.build_recs(parsed, rules, recommendations(s))
    state.put(s, "recommendations", recs)
    selected = list(state.TYPES) if types is None else types
    cleaned = cleaning.apply(
        {type_: parsed[type_] for type_ in selected}, cleaning.active_rules(rules, recs)
    )
    for type_, table in cleaned.items():
        state.drop_rows(s, CleanRow, type_)
        s.add_all(
            CleanRow(type=type_, row_no=i, source_row=source, data=row, was=was)
            for i, (row, source, was) in enumerate(
                zip(table["rows"], table["source_rows"], table["was"])
            )
        )
    s.flush()
