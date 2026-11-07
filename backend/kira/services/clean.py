"""Layer 2 recommendations, decisions and versioned cleaning rules."""

from copy import deepcopy

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kira.core import cleaning
from kira.models import CleaningRules, CleanRow, ParsedRow
from kira.services import ai, learning, state
from kira.standard import STANDARD


def current_rules(s: Session) -> dict | None:
    rule = s.scalar(select(CleaningRules).order_by(CleaningRules.version.desc()).limit(1))
    if rule is None:
        return None
    return {
        "version": rule.version,
        "maps": deepcopy(rule.maps),
        "exclude": deepcopy(rule.exclude),
        "created_by": rule.created_by,
        "created_at": rule.created_at.isoformat(),
    }


def recommendations(s: Session) -> list[dict]:
    return state.get(s, "recommendations", [])


def standard(s: Session) -> dict:
    from kira.services import analysis

    return analysis.cached(_standard)(s)


def _standard(s: Session) -> dict:
    # The standard only needs POS outlet spellings and their frequency. Avoid
    # decoding every column of every parsed POS, settlement and bank row.
    names = s.scalars(
        select(ParsedRow.data["branch"].as_string())
        .where(ParsedRow.type == "pos")
        .order_by(ParsedRow.row_no)
    )
    result = deepcopy(STANDARD)
    outlets = cleaning.outlet_names({"pos": {"rows": [{"branch": name} for name in names]}})
    result["outlets"] = {name: [key] for key, name in outlets.items()}
    return result


def _ai_names(rec: dict) -> None:
    pending = [
        item["from"]
        for item in rec["items"]
        if not item.get("to") and item.get("by") not in {"ai", "user"}
    ]
    if not pending or rec.get("decision"):
        return
    kind = STANDARD["columns"][rec["table"]][rec["column"]]
    answers = ai.standard_names(kind, rec["choices"], pending)
    for item in rec["items"]:
        if item["from"] in answers:
            answer = answers[item["from"]]
            item.update(to=answer["name"], by="ai", why=answer.get("why", ""))


def _ai_payouts(rec: dict) -> None:
    pending = [
        item for item in rec["items"] if item["credit"] > 0 and item.get("by") not in {"ai", "user"}
    ]
    if not pending or rec.get("decision"):
        return
    answers = ai.classify_bank_rows(pending, STANDARD["payout_words"])
    for item in rec["items"]:
        if item["pattern"] in answers:
            answer = answers[item["pattern"]]
            item.update(exclude=not answer["payout"], by="ai", why=answer.get("why", ""))


def refresh(s: Session, types: list[str] | None = None) -> None:
    """Refresh uncovered values, retain decisions and rebuild the affected Layer 2 tables."""
    from kira.services.convert import parsed_tables

    parsed = parsed_tables(s)
    previous = recommendations(s)
    recs = cleaning.build_recs(parsed, current_rules(s), previous)
    if ai.enabled():
        for rec in recs:
            (_ai_names if rec["kind"] == "map" else _ai_payouts)(rec)
    state.put(s, "recommendations", recs)
    selected = set(state.TYPES if types is None else types)
    before, after = ({r["id"]: r for r in cards} for cards in (previous, recs))
    for rec in [*previous, *recs]:
        if before.get(rec["id"]) != after.get(rec["id"]):
            selected.add(rec["table"])
    _rebuild(s, parsed, [type_ for type_ in state.TYPES if type_ in selected])


def _rebuild(s: Session, parsed: dict | None = None, types: list[str] | None = None) -> None:
    from kira.services.convert import parsed_tables

    parsed = parsed_tables(s) if parsed is None else parsed
    selected = list(state.TYPES) if types is None else types
    effective = cleaning.active_rules(current_rules(s), recommendations(s))
    cleaned = cleaning.apply({type_: parsed[type_] for type_ in selected}, effective)
    for type_, table_ in cleaned.items():
        state.drop_rows(s, CleanRow, type_)
        s.add_all(
            CleanRow(type=type_, row_no=i, source_row=source, data=row, was=was)
            for i, (row, source, was) in enumerate(
                zip(table_["rows"], table_["source_rows"], table_["was"])
            )
        )
    s.flush()
    state.clear_matching(s)


def _need_conversion(s: Session) -> None:
    from kira.services.convert import rules_settled

    if not rules_settled(s):
        raise state.WorkflowError(
            "Convert the current files and decide all upload rules before cleaning"
        )


def decide(
    s: Session,
    rec_id: str,
    decision: str | None,
    mapping: dict[str, str] | None = None,
    exclude: dict[str, bool] | None = None,
) -> dict:
    _need_conversion(s)
    if decision not in {"accept", "reject", None}:
        raise ValueError("Decision must be accept, reject or null")
    recs = recommendations(s)
    rec = next((r for r in recs if r["id"] == rec_id), None)
    if rec is None:
        raise state.WorkflowError("This cleaning recommendation is no longer available")
    if mapping is not None:
        if rec["kind"] != "map":
            raise ValueError("Use exclude to edit bank row kinds")
        items = {item["from"]: item for item in rec["items"]}
        if any(
            raw not in items or target not in ["", *rec["choices"]]
            for raw, target in mapping.items()
        ):
            raise ValueError(
                "Choose an existing value and a listed standard name, or leave it blank"
            )
        for raw, target in mapping.items():
            items[raw].update(to=target, by="user")
            items[raw].pop("why", None)
    if exclude is not None:
        if rec["kind"] != "exclude":
            raise ValueError("Use mapping to edit standard names")
        items = {item["pattern"]: item for item in rec["items"]}
        if any(
            pattern not in items or not isinstance(value, bool)
            for pattern, value in exclude.items()
        ):
            raise ValueError("Choose an existing bank row pattern and a boolean exclusion")
        for pattern, value in exclude.items():
            items[pattern].update(exclude=value, by="user")
    rec["decision"] = decision
    state.put(s, "recommendations", recs)
    _rebuild(s, types=[rec["table"]])
    return rec


def save(s: Session, actor: str) -> dict:
    _need_conversion(s)
    recs, previous = recommendations(s), current_rules(s)
    if any(rec.get("decision") not in {"accept", "reject"} for rec in recs):
        raise state.WorkflowError("Decide every cleaning recommendation before saving")
    if previous is not None and not recs:
        return previous
    saved = cleaning.save(previous, recs)
    s.add(
        CleaningRules(
            version=saved["version"], maps=saved["maps"], exclude=saved["exclude"], created_by=actor
        )
    )
    s.flush()
    if recs:
        learning.note(
            s, "cleaning", cards=[r["id"] for r in recs], version=saved["version"], actor=actor
        )
    state.audit(
        s, actor, "Save cleaning rules", f"Version {saved['version']}", f"{len(recs)} decisions"
    )
    state.put(s, "recommendations", [])
    _rebuild(s)
    return current_rules(s)


def settled(s: Session) -> bool:
    from kira.services.convert import rules_settled

    return bool(rules_settled(s) and current_rules(s) is not None and not recommendations(s))


def table(s: Session, layer: str, type_: str, limit: int = 100, offset: int = 0) -> dict:
    from kira.services import analysis

    return analysis.cached(_table)(s, layer, type_, limit, offset)


def _table(s: Session, layer: str, type_: str, limit: int = 100, offset: int = 0) -> dict:
    if layer not in {"parsed", "clean"} or type_ not in state.TYPES:
        raise ValueError("Choose parsed or clean and pos, settlement or bank")
    if not 0 <= limit <= 1000 or offset < 0:
        raise ValueError("Limit must be 0–1000 and offset must be nonnegative")
    model = ParsedRow if layer == "parsed" else CleanRow
    total = s.scalar(select(func.count()).select_from(model).where(model.type == type_))
    selected = s.scalars(
        select(model).where(model.type == type_).order_by(model.row_no).offset(offset).limit(limit)
    )
    rows = []
    for row in selected:
        value = deepcopy(row.data)
        if layer == "clean" and row.was:
            value["__was"] = deepcopy(row.was)
        rows.append(value)
    parsed = s.scalar(select(func.count()).select_from(ParsedRow).where(ParsedRow.type == type_))
    conversion = state.get(s, "conversion") or {}
    raw = conversion.get("proposals", {}).get(type_, {}).get("rows", parsed)
    result = {
        "columns": state.table_columns(s, type_),
        "rows": rows,
        "total": total,
        "raw": raw,
        "dupes": max(0, raw - parsed),
    }
    if layer == "clean":
        changed = sum(
            bool(was) for was in s.scalars(select(CleanRow.was).where(CleanRow.type == type_))
        )
        result.update(changed=changed, dropped=max(0, parsed - total))
    return result
