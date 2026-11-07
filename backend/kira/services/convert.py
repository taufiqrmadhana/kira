"""Versioned upload rules and Layer 1 conversion; callers own transactions."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kira.core import parsing
from kira.models import ParsedRow, RawFile, UploadRule, now
from kira.services import ai, learning, state
from kira.standard import DEFAULT_COLUMNS, REQUIRED_COLUMNS

SETTLED = {"same", "created", "updated", "kept"}
COLUMN_TYPES = {"text", "number", "date", "datetime", "bool"}


def _check_type(type_: str) -> None:
    if type_ not in state.TYPES:
        raise ValueError("Table must be pos, settlement or bank")


def current_rule(s: Session, type_: str) -> dict | None:
    _check_type(type_)
    rule = s.scalar(
        select(UploadRule)
        .where(UploadRule.type == type_)
        .order_by(UploadRule.version.desc())
        .limit(1)
    )
    if rule is None:
        return None
    return {
        "type": rule.type,
        "version": rule.version,
        "delimiter": rule.delimiter,
        "columns": [dict(c) for c in rule.columns],
        "rename": dict(rule.rename or {}),
        "created_by": rule.created_by,
        "created_at": rule.created_at.isoformat(),
    }


def _rule_rename(rule: dict | None) -> dict:
    return {
        name: {"to": target, "by": "rule"}
        for name, target in (rule or {}).get("rename", {}).items()
    }


def _texts(s: Session, type_: str) -> list[str]:
    return list(s.scalars(select(RawFile.text).where(RawFile.type == type_).order_by(RawFile.id)))


def _profile(s: Session, type_: str, rename: dict | None = None) -> dict:
    return parsing.profile(type_, _texts(s, type_), rename)


def _proposal(prof: dict, rule: dict | None) -> dict:
    proposed = [dict(c) for c in prof["proposed"]]
    old = {c["name"]: c for c in (rule or {}).get("columns", [])}
    diff = parsing.rule_diff(prof, rule)
    type_changes = {change["name"] for change in (diff or {}).get("types", [])}
    for column in proposed:
        if column["name"] in old:
            column["keep"] = old[column["name"]].get("keep", True)
            if column["name"] not in type_changes:
                column["type"] = old[column["name"]]["type"]
    return {
        "proposed": proposed,
        "delimiter": prof["delimiter"],
        "diff": diff,
        "rows": len(prof["rows"]),
        "files": prof["files"],
        "samples": prof["samples"],
        "rename": prof["rename"],
    }


def _propose(s: Session, type_: str, rule: dict | None, on_file=None) -> dict:
    """Use saved mappings, aliases, then AI for required columns missing in each format."""
    texts = _texts(s, type_)
    mapping = _rule_rename(rule)
    seen = set()
    if ai.enabled():
        for text in texts:
            prof = parsing.profile(type_, [text], mapping)
            missing = [name for name in REQUIRED_COLUMNS[type_] if name not in prof["headers"]]
            raw = [
                parsing.norm_header(h)
                for h in parsing.parse_csv(text, parsing.detect_delimiter(text))[0]
            ]
            signature = (tuple(raw), tuple(missing))
            if not missing or signature in seen:
                continue
            seen.add(signature)
            suggestions = ai.map_columns(
                type_, missing, {name: prof["samples"].get(name, "") for name in raw}
            )
            for target, item in suggestions.items():
                source = item["header"]
                # A saved refusal or known alias is a decision the model cannot replace.
                if source in mapping or source in prof["rename"]:
                    continue
                mapping[source] = {"to": target, "by": "ai", "why": item.get("why", "")}
    prof = parsing.profile(type_, texts, mapping, on_file=on_file)
    prof["type"] = type_
    _ai_columns(prof, rule)
    return _proposal(prof, rule)


def _ai_columns(prof: dict, rule: dict | None) -> None:
    """Judge only extra columns the saved rule has not already decided."""
    if not ai.enabled():
        return
    saved = {c["name"] for c in (rule or {}).get("columns", [])}
    candidates = {
        c["name"]: [row[c["name"]] for row in prof["rows"] if row.get(c["name"])][:5]
        for c in prof["proposed"]
        if c["name"] not in DEFAULT_COLUMNS[prof["type"]] and c["name"] not in saved
    }
    if not candidates:
        return
    decisions = ai.judge_columns(prof["type"], candidates)
    for column in prof["proposed"]:
        if column["name"] in decisions:
            column.update(decisions[column["name"]], by="ai")


def convert(s: Session, actor: str, progress=None) -> dict:
    """Profile all areas and apply saved rules; changed formats wait for a decision."""
    areas = set(s.scalars(select(RawFile.type).distinct()))
    if areas != set(state.TYPES):
        raise state.WorkflowError("Upload files to POS, Settlement and Mutation before converting")
    proposals, decisions = {}, {}
    for type_ in state.TYPES:
        count = (
            s.scalar(select(func.count()).select_from(RawFile).where(RawFile.type == type_))
            if progress
            else 0
        )

        def report(completed, message):
            if progress:
                progress(
                    {
                        "area": type_,
                        "completed": completed,
                        "total": count + 2,
                        "unit": "steps",
                        "message": message,
                    }
                )

        report(0, "Reviewing file headers")
        rule = current_rule(s, type_)
        proposal = _propose(
            s,
            type_,
            rule,
            on_file=lambda completed, total: report(
                completed, f"Profiled {completed} of {total} files"
            ),
        )
        proposals[type_] = proposal
        decisions[type_] = "new" if rule is None else "changed" if proposal["diff"] else "same"
        report(count + 1, "Column proposal ready")
        _replace_parsed(s, type_, rule)
        report(count + 2, "Saved rule applied" if rule else "Ready for upload-rule review")
    result = {
        "at": now().isoformat(),
        "stale": False,
        "proposals": proposals,
        "decisions": decisions,
    }
    state.put(s, "conversion", result)
    if progress:
        progress(
            {"completed": 0, "total": 1, "unit": "steps", "message": "Refreshing cleaned tables"}
        )
    _refresh_parsed(s, list(state.TYPES))
    state.audit(s, actor, "Convert files", "All tables")
    if progress:
        progress({"completed": 1, "total": 1, "unit": "steps", "message": "Saving conversion"})
    return result


def decide_upload_rule(
    s: Session,
    type_: str,
    choice: str,
    actor: str,
    columns: list[dict] | None = None,
    rename: dict[str, str] | None = None,
) -> dict:
    """Create/update a version or keep the old one; record exactly one learning event."""
    _check_type(type_)
    if choice not in {"create", "update", "keep"}:
        raise ValueError("Choice must be create, update or keep")
    conversion = state.get(s, "conversion")
    if not conversion or conversion.get("stale"):
        raise state.WorkflowError("Convert the current files before deciding upload rules")
    pending = conversion["decisions"].get(type_)
    if pending in SETTLED or type_ not in conversion["proposals"]:
        raise state.WorkflowError("This table has no pending upload rule")
    rule = current_rule(s, type_)
    if (rule is None and choice != "create") or (rule is not None and choice == "create"):
        raise state.WorkflowError("Create a first rule; update or keep an existing rule")
    if choice == "keep":
        if columns is not None or rename is not None:
            raise ValueError("Use update to change columns or header mappings")
    else:
        reviewed = conversion["proposals"][type_]
        mapping = _rule_rename(rule) | reviewed["rename"]
        if rename is not None:
            headers = {
                parsing.norm_header(h)
                for text in _texts(s, type_)
                for h in parsing.parse_csv(text, parsing.detect_delimiter(text))[0]
            }
            for source, target in rename.items():
                if source not in headers or (target and target not in DEFAULT_COLUMNS[type_]):
                    raise ValueError(
                        "Header mappings must use an existing header and a standard column"
                    )
                mapping[source] = {"to": target, "by": "user"}
        prof = _profile(s, type_, mapping)
        proposal = _proposal(prof, rule)
        selected = {c["name"]: dict(c) for c in proposal["proposed"]}
        for column in reviewed["proposed"]:
            if column["name"] in selected:
                selected[column["name"]].update(column)
        known = set(selected) | {column["name"] for column in reviewed["proposed"]}
        seen = set()
        for override in columns or []:
            name = override.get("name")
            if name not in known or name in seen:
                raise ValueError("Each column override must name a distinct existing column")
            seen.add(name)
            type_value, keep = override.get("type"), override.get("keep")
            if type_value is not None and type_value not in COLUMN_TYPES:
                raise ValueError("Invalid column type")
            if keep is not None and not isinstance(keep, bool):
                raise ValueError("Column keep must be a boolean")
            if name not in selected:
                continue
            if type_value is not None:
                selected[name]["type"] = type_value
            if keep is not None:
                selected[name]["keep"] = keep
                selected[name].pop("by", None)
                selected[name].pop("why", None)
        proposal["proposed"] = list(selected.values())
        if not any(c["keep"] for c in selected.values()):
            raise ValueError("Keep at least one column")
        record = UploadRule(
            type=type_,
            version=(rule["version"] if rule else 0) + 1,
            delimiter=prof["delimiter"],
            columns=list(selected.values()),
            rename={name: info["to"] for name, info in prof["rename"].items()},
            created_by=actor,
        )
        s.add(record)
        s.flush()
        conversion["proposals"][type_] = proposal
    conversion["decisions"][type_] = {"create": "created", "update": "updated", "keep": "kept"}[
        choice
    ]
    state.put(s, "conversion", conversion)
    rebuild_parsed(s, [type_])
    saved = current_rule(s, type_)
    learning.note(
        s, "upload_rule", table=type_, choice=choice, version=saved["version"], actor=actor
    )
    state.audit(s, actor, f"{choice.title()} upload rule", type_, f"Version {saved['version']}")
    return saved


def rebuild_parsed(s: Session, types: list[str] | None = None) -> None:
    """Replace only selected tables, then refresh cleaning and invalidate matching."""
    selected = list(state.TYPES) if types is None else types
    for type_ in selected:
        _check_type(type_)
        rule = current_rule(s, type_)
        _replace_parsed(s, type_, rule)
    _refresh_parsed(s, selected)


def _replace_parsed(s: Session, type_: str, rule: dict | None) -> None:
    state.drop_rows(s, ParsedRow, type_)
    if rule is not None:
        table = parsing.build_parsed(_profile(s, type_, _rule_rename(rule)), rule)
        s.add_all(ParsedRow(type=type_, row_no=i, data=row) for i, row in enumerate(table["rows"]))


def _refresh_parsed(s: Session, selected: list[str]) -> None:
    from kira.services import clean

    s.flush()
    clean.refresh(s, selected)
    state.clear_matching(s)


def rules_settled(s: Session) -> bool:
    conversion = state.get(s, "conversion")
    return bool(
        conversion
        and not conversion.get("stale")
        and all(conversion.get("decisions", {}).get(type_) in SETTLED for type_ in state.TYPES)
    )


def pending_rules(s: Session) -> list[dict]:
    conversion = state.get(s, "conversion")
    if not conversion or conversion.get("stale"):
        return []
    pending = []
    for type_, proposal in conversion["proposals"].items():
        decision = conversion["decisions"].get(type_)
        if decision in SETTLED:
            continue
        rule = current_rule(s, type_)
        pending.append(
            {
                "type": type_,
                "decision": decision,
                "delimiter": proposal["delimiter"],
                "columns": proposal["proposed"],
                "diff": proposal["diff"],
                "rename": proposal["rename"],
                "current_version": rule["version"] if rule else None,
            }
        )
    return pending


def parsed_tables(s: Session) -> dict:
    return {
        type_: {
            "columns": state.table_columns(s, type_),
            "rows": [
                dict(row.data)
                for row in s.scalars(
                    select(ParsedRow).where(ParsedRow.type == type_).order_by(ParsedRow.row_no)
                )
            ],
        }
        for type_ in state.TYPES
    }
