"""Workflow progress derived from persisted evidence, shared by the UI and Kira."""

from importlib import import_module

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kira.models import (
    AuditLog,
    CleaningRules,
    CleanRow,
    MatchingRule,
    MatchRun,
    ParsedRow,
    RawFile,
)
from kira.services import state

# Pipeline handoff: conversion = {at, stale, proposals, decisions}; recommendations is
# a list of cleaning cards whose decision is accept, reject, or null.
CONVERSION_KEY = "conversion"
RECOMMENDATIONS_KEY = "recommendations"
SETTLED = {"same", "created", "updated", "kept"}


def _counts(s: Session, model) -> dict:
    return dict(s.execute(select(model.type, func.count()).group_by(model.type)).all())


def status(s: Session) -> dict:
    from kira.services import analysis

    return analysis.cached(_status)(s)


def _status(s: Session) -> dict:
    files = {type_: 0 for type_ in state.TYPES} | _counts(s, RawFile)
    conversion = state.get(s, CONVERSION_KEY) or {}
    converted = bool(conversion) and not conversion.get("stale", False)
    pending = [
        type_
        for type_ in conversion.get("proposals", {})
        if conversion.get("decisions", {}).get(type_) not in SETTLED
    ]
    recs = state.get(s, RECOMMENDATIONS_KEY, [])
    cleaning = s.scalar(select(CleaningRules).order_by(CleaningRules.version.desc()).limit(1))
    cleaning_open = sum(not rec.get("decision") for rec in recs)
    parsed_counts, clean_counts = _counts(s, ParsedRow), _counts(s, CleanRow)
    changed = {type_: 0 for type_ in state.TYPES}
    for row in s.execute(select(CleanRow.type, CleanRow.was)):
        changed[row.type] = changed.get(row.type, 0) + bool(row.was)
    tables = {
        type_: {
            "rows": count,
            "clean_rows": clean_counts.get(type_, 0),
            "changed": changed[type_],
            "dropped": max(0, count - clean_counts.get(type_, 0)),
        }
        for type_, count in parsed_counts.items()
    }
    matching = {}
    for stage in ("l1", "l2"):
        rule_count = s.scalar(
            select(func.count()).select_from(MatchingRule).where(MatchingRule.stage == stage)
        )
        run = s.scalar(
            select(MatchRun)
            .where(MatchRun.stage == stage, MatchRun.current.is_(True))
            .order_by(MatchRun.id.desc())
            .limit(1)
        )
        matching[stage] = {"done": run is not None, "rules": rule_count}
        if run:
            matching[stage].update(
                run_id=run.id,
                rule_ids=run.rule_ids,
                summary=run.summary,
                matched=run.summary.get("matched", 0),
                total=run.summary.get("total", 0),
                batches=run.summary.get("batches", 0),
                run_at=run.run_at.isoformat(),
            )
    if not all(files.values()):
        step, next_ = (
            1,
            {"tool": "add_sample_files", "say": "Add files to POS, Settlement, Mutation."},
        )
    elif not converted:
        step, next_ = 2, {"tool": "convert_files", "say": "Convert the uploaded files."}
    elif pending:
        step, next_ = 2, {"tool": "save_upload_rule", "say": "Decide the pending upload rules."}
    elif cleaning is None or recs:
        step, next_ = (
            3,
            {
                "tool": "save_cleaning",
                "say": "Review the cleaning recommendations and save the cleaning rules.",
            },
        )
    elif not matching["l1"]["done"]:
        step, next_ = 4, {"tool": "run_matching", "say": "Run POS to settlement matching."}
    elif not matching["l2"]["done"]:
        step, next_ = 4, {"tool": "run_matching", "say": "Run settlement to bank matching."}
    else:
        step, next_ = (
            4,
            {"tool": "export_results", "say": "Matching is complete. Export the results."},
        )
    return {
        "step": step,
        "next": next_,
        "files": files,
        "converted": converted,
        "upload_rules_pending": pending,
        "cleaning": {
            "open": cleaning_open,
            "rules_version": cleaning.version if cleaning else None,
        },
        "tables": tables,
        "matching": matching,
    }


def audit_log(s: Session, limit: int = 100) -> list[dict]:
    return [
        {
            "at": r.at.isoformat(),
            "actor": r.actor,
            "action": r.action,
            "object": r.object,
            "detail": r.detail,
        }
        for r in s.scalars(
            select(AuditLog).order_by(AuditLog.id.desc()).limit(max(0, min(limit, 1000)))
        )
    ]


def _service(name: str):
    """Optional only while each owner's branch is being built."""
    try:
        return import_module(f"kira.services.{name}")
    except ModuleNotFoundError as exc:
        if exc.name != f"kira.services.{name}":
            raise
        return None


def _table_preview(s: Session, layer: str, type_: str, limit: int) -> dict:
    model = ParsedRow if layer == "parsed" else CleanRow
    total = s.scalar(select(func.count()).select_from(model).where(model.type == type_))
    selected = s.scalars(
        select(model).where(model.type == type_).order_by(model.row_no).limit(limit)
    )
    rows = []
    for item in selected:
        row = dict(item.data)
        if layer == "clean" and item.was:
            row["__was"] = dict(item.was)
        rows.append(row)
    conversion = state.get(s, CONVERSION_KEY) or {}
    parsed = s.scalar(select(func.count()).select_from(ParsedRow).where(ParsedRow.type == type_))
    raw = conversion.get("proposals", {}).get(type_, {}).get("rows", parsed)
    preview = {
        "columns": state.table_columns(s, type_),
        "total": total,
        "rows": rows,
        "dupes": max(0, raw - parsed),
        "raw": raw,
    }
    if layer == "clean":
        changed = sum(
            bool(was) for was in s.scalars(select(CleanRow.was).where(CleanRow.type == type_))
        )
        preview.update(changed=changed, dropped=max(0, parsed - total))
    return preview


def workflow(s: Session, rows: int = 100) -> dict:
    from kira.services import analysis

    return analysis.cached(_workflow)(s, rows)


def _workflow(s: Session, rows: int = 100) -> dict:
    progress = status(s)
    files, convert, clean, match = (
        _service(name) for name in ("files", "convert", "clean", "match")
    )
    if any(progress["files"].values()) and not all((files, convert, clean)):
        raise state.WorkflowError("The data pipeline services are not installed yet")
    rows = max(0, min(rows, 1000))
    return {
        "status": progress,
        "files": files.list_files(s) if files else [],
        "conversion": state.get(s, CONVERSION_KEY),
        "upload_rules": {t: convert.current_rule(s, t) if convert else None for t in state.TYPES},
        "cleaning": {
            "rules": clean.current_rules(s) if clean else None,
            "recommendations": clean.recommendations(s) if clean else [],
        },
        "tables": {
            layer: {t: _table_preview(s, layer, t, rows) for t in state.TYPES}
            for layer in ("parsed", "clean")
        },
        "matching": {
            "rules": match.list_rules(s) if match else [],
            "stages": progress["matching"],
            "results": match.results(s, with_rows=False)
            if match and progress["matching"]["l2"]["done"]
            else None,
        },
    }
