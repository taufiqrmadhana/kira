"""Persist matching rules and runs without changing the source tables."""

import json
import math

from sqlalchemy import select

from kira.core import matching
from kira.models import CleaningRules, MatchingRule, MatchLink, MatchRun
from kira.services import learning, state
from kira.services.state import WorkflowError


def _check_stage(stage):
    if stage not in matching.STAGES:
        raise WorkflowError("Matching stage must be l1 or l2")


def ready(s):
    conversion = state.get(s, "conversion", {})
    if not conversion or conversion.get("stale"):
        raise WorkflowError("Convert the current files before matching")
    if any(
        conversion.get("decisions", {}).get(k) not in {"same", "created", "updated", "kept"}
        for k in conversion.get("proposals", {})
    ):
        raise WorkflowError("Decide every upload rule before matching")
    if s.scalar(select(CleaningRules.id).limit(1)) is None or state.get(s, "recommendations", []):
        raise WorkflowError("Save the cleaning rules before matching")


def _rule_dict(rule):
    result = {
        k: getattr(rule, k)
        for k in ("id", "stage", "kind", "params", "name", "position", "created_by")
    }
    result["created_at"] = rule.created_at.isoformat()
    result["conditions"] = matching.describe_rule(result)
    return result


def list_rules(s, stage=None):
    query = select(MatchingRule).order_by(
        MatchingRule.stage, MatchingRule.position, MatchingRule.id
    )
    if stage is not None:
        _check_stage(stage)
        query = query.where(MatchingRule.stage == stage)
    return [_rule_dict(r) for r in s.scalars(query)]


def _rules(s, stage, rule_ids=None):
    rules = list_rules(s, stage)
    if rule_ids is None:
        return [r for r in rules if r["params"].get("enabled", True)]
    if len(set(rule_ids)) != len(rule_ids) or not set(rule_ids) <= {r["id"] for r in rules}:
        raise WorkflowError("Select existing rules from this stage, each once")
    selected = set(rule_ids)
    if any(r["id"] in selected and not r["params"].get("enabled", True) for r in rules):
        raise WorkflowError("Activate the selected rules before running them")
    return [r for r in rules if r["id"] in selected]


def columns(s):
    ready(s)
    tables = state.clean_tables(s)
    output = {}
    for area, table in tables.items():
        available = {c["name"]: c for c in table["columns"]}
        for key in dict.fromkeys(k for row in table["rows"] for k in row if not k.startswith("__")):
            if key not in available:
                available[key] = {
                    "name": key,
                    "type": "number"
                    if any(isinstance(row.get(key), (int, float)) for row in table["rows"])
                    else "text",
                }
        output[area] = list(available.values())
    return output


def _validate(s, stage, kind, params, name):
    _check_stage(stage)
    kinds = {"l1": {"id", "composite"}, "l2": {"withdrawal", "ref", "batch", "amount"}}
    if kind not in kinds[stage] or not isinstance(params, dict):
        raise WorkflowError("Rule kind does not belong to this stage")
    defaults = {
        "id": {},
        "composite": {"outlet": True, "method": True, "amountTol": 0, "window": 1},
        "withdrawal": {"groupBy": "entity_id", "requireId": True, "amountTol": 0, "maxDays": 3},
        "batch": {"groupBy": "merchant_id", "requireId": True, "amountTol": 0},
        "ref": {"amountTol": 0},
        "amount": {"amountTol": 0},
    }
    allowed = set(defaults[kind]) | {"enabled"}
    if kind in ("id", "composite"):
        allowed |= {"posCol", "stlCol"}
    if kind == "composite":
        allowed |= {"requireId", "posAmount", "stlAmount", "posDate", "stlDate"}
    if stage == "l2":
        allowed |= {"minDays", "maxDays"}
    if set(params) - allowed:
        raise WorkflowError("Unknown rule condition")
    p = defaults[kind] | params
    if stage == "l2" and ("minDays" in p or "maxDays" in p):
        p.setdefault("minDays", 0)
        p.setdefault("maxDays", 3)
    for key in ("amountTol", "minDays", "maxDays", "window"):
        if key not in p or key == "window" and p[key] == "day":
            continue
        value = p[key]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or value < 0
        ):
            label = {
                "amountTol": "Amount difference limit",
                "minDays": "Earliest bank arrival",
                "maxDays": "Latest bank arrival",
                "window": "Time difference",
            }[key]
            raise WorkflowError(f"{label} must be a number of zero or more")
    if p.get("minDays", 0) > p.get("maxDays", 3):
        raise WorkflowError("Minimum bank delay must not exceed the maximum")
    for key in ("outlet", "method", "requireId", "enabled"):
        if key in p and not isinstance(p[key], bool):
            raise WorkflowError(f"{key} must be true or false")
    tables = state.clean_tables(s)
    if kind == "composite" and (
        bool(p.get("posCol")) != bool(p.get("stlCol")) or p.get("requireId") and not p.get("posCol")
    ):
        raise WorkflowError("Choose both reference columns")
    required = {"posCol", "stlCol"} if kind == "id" else set()
    for key, area in (
        ("posCol", "pos"),
        ("stlCol", "settlement"),
        ("groupBy", "settlement"),
        ("posAmount", "pos"),
        ("stlAmount", "settlement"),
        ("posDate", "pos"),
        ("stlDate", "settlement"),
    ):
        if key not in p and key not in required:
            continue
        column = p.get(key)
        if not isinstance(column, str) or not column.strip():
            label = {
                "posCol": "POS reference",
                "stlCol": "settlement reference",
                "groupBy": "settlement group",
                "posAmount": "POS amount",
                "stlAmount": "settlement amount",
                "posDate": "POS date",
                "stlDate": "settlement date",
            }[key]
            raise WorkflowError(f"Choose the {label} column")
        columns = {c["name"] for c in tables[area]["columns"]} | {
            k for row in tables[area]["rows"] for k in row
        }
        if column not in columns:
            raise WorkflowError(f"{column} is not a column of {area}")
    if not isinstance(name, str) or len(name.strip()) > 100:
        raise WorkflowError("Rule name must have at most 100 characters")
    rule = {"stage": stage, "kind": kind, "params": p}
    return p, name.strip() or matching.rule_name(rule)


def save_rule(s, stage, kind, params, actor, name=""):
    ready(s)
    params, name = _validate(s, stage, kind, params, name)
    existing = list_rules(s, stage)
    counters = state.get(s, "matching_ids", {})
    number = max(counters.get(stage, 0), max((int(r["id"][2:]) for r in existing), default=0)) + 1
    counters[stage] = number
    state.put(s, "matching_ids", counters)
    rule = MatchingRule(
        id=f"{matching.STAGES[stage]['prefix']}{number}",
        stage=stage,
        kind=kind,
        params=params,
        name=name,
        position=max((r["position"] for r in existing), default=0) + 1,
        created_by=actor,
    )
    s.add(rule)
    s.flush()
    if params.get("enabled", True):
        state.clear_matching(s, stage)
    state.audit(
        s, actor, "Saved matching rule", rule.id, json.dumps({"name": name, "params": params})
    )
    learning.note(s, "matching_rule", rule=rule.id, name=name, stage=stage)
    return _rule_dict(rule)


def _current_run(s, stage):
    return s.scalar(
        select(MatchRun)
        .where(MatchRun.stage == stage, MatchRun.current.is_(True))
        .order_by(MatchRun.id.desc())
        .limit(1)
    )


def edit_rule(s, rule_id, kind, params, actor, name=""):
    rule = s.get(MatchingRule, rule_id)
    if rule is None:
        raise WorkflowError("Matching rule does not exist")
    params, name = _validate(s, rule.stage, kind, params, name)
    current = _current_run(s, rule.stage)
    cleared = bool(current and (rule_id in current.rule_ids or params.get("enabled", True)))
    rule.kind, rule.params, rule.name = kind, params, name
    if cleared:
        state.clear_matching(s, rule.stage)
    state.audit(
        s, actor, "Edited matching rule", rule.id, json.dumps({"name": name, "params": params})
    )
    s.flush()
    return {**_rule_dict(rule), "results_cleared": cleared}


def order_rules(s, stage, rule_ids, actor):
    rules = list_rules(s, stage)
    if len(rule_ids) != len(set(rule_ids)) or set(rule_ids) != {r["id"] for r in rules}:
        raise WorkflowError("Order must contain every rule of this stage exactly once")
    current = _current_run(s, stage)
    if current and [rid for rid in rule_ids if rid in current.rule_ids] != current.rule_ids:
        state.clear_matching(s, stage)
    for i, rid in enumerate(rule_ids, 1):
        s.get(MatchingRule, rid).position = i
    state.audit(s, actor, "Reordered matching rules", stage, ", ".join(rule_ids))
    s.flush()
    return list_rules(s, stage)


def delete_rule(s, rule_id, actor):
    rule = s.get(MatchingRule, rule_id)
    if rule is None:
        raise WorkflowError("Matching rule does not exist")
    current = _current_run(s, rule.stage)
    if current and rule_id in current.rule_ids:
        state.clear_matching(s, rule.stage)
    s.delete(rule)
    state.audit(s, actor, "Deleted matching rule", rule_id)


def suggest(s, stage):
    ready(s)
    return matching.suggest(stage, _rules(s, stage), state.clean_tables(s))


def preview(s, stage, kind, params, exclude=None):
    ready(s)
    params, name = _validate(s, stage, kind, params, "")
    all_rules = list_rules(s, stage)
    saved = _rules(s, stage)
    if exclude is not None and exclude not in {r["id"] for r in all_rules}:
        raise WorkflowError("The excluded rule must belong to this stage")
    saved = [r for r in saved if r["id"] != exclude]
    draft = {"id": "preview", "kind": kind, "params": {**params, "enabled": True}}
    proposed = [draft if r["id"] == exclude else r for r in all_rules]
    if exclude is None:
        proposed.append(draft)
    tables = state.clean_tables(s)
    alone = matching.run_stage(stage, [draft], tables)
    extra = (
        matching.run_stage(stage, proposed, tables)["matched"]
        - matching.run_stage(stage, saved, tables)["matched"]
    )
    return {
        "name": name,
        "conditions": matching.describe_rule(draft),
        "matches_alone": alone["matched"],
        "total": alone["total"],
        "extra_after_saved": extra,
    }


def _summary(result):
    keys = (
        "stage",
        "rules",
        "matched",
        "total",
        "unmatched_left",
        "unmatched_right",
        "hits",
        "ambiguous",
    )
    return {k: result[k] for k in keys}


def _compute(s, stage, rule_ids):
    _check_stage(stage)
    ready(s)
    if stage == "l2" and _current_run(s, "l1") is None:
        raise WorkflowError("Run POS to settlement matching first")
    return matching.run_stage(stage, _rules(s, stage, rule_ids), state.clean_tables(s))


def test(s, stage, rule_ids=None):
    return _summary(_compute(s, stage, rule_ids))


def run(s, stage, actor, rule_ids=None):
    result = _compute(s, stage, rule_ids)
    state.clear_matching(s, stage)
    run = MatchRun(
        stage=stage,
        rule_ids=result["rules"],
        summary={**_summary(result), "batches": result["batches"]},
        current=True,
        run_by=actor,
    )
    s.add(run)
    s.flush()
    for link in result["links"]:
        s.add(
            MatchLink(
                run_id=run.id,
                rule_id=link["rule"],
                left_rows=link["left"],
                right_rows=link["right"],
                review=link.get("review", False),
            )
        )
    state.put(s, f"run_{stage}", {**result, "run_id": run.id})
    state.audit(s, actor, "Ran matching", stage, f"{result['matched']} of {result['total']}")
    s.flush()
    if stage == "l2":
        final = results(s)
        learning.note(
            s,
            "close",
            pos=final["totals"]["pos"],
            matched=final["totals"]["full"],
            rules_used=result["rules"],
        )
    return {**_summary(result), "run_id": run.id}


def _links(s, T=None):
    if not all(_current_run(s, stage) for stage in ("l1", "l2")):
        return None
    a, b = (state.get(s, f"run_{stage}") for stage in ("l1", "l2"))
    if a is None or b is None:
        raise WorkflowError("Matching evidence is missing; run both stages again")
    return T or state.clean_tables(s), a, b


def _final(s):
    loaded = _links(s)
    if loaded is None:
        return None
    tables, a, b = loaded
    from kira.services import manual

    manual.apply(s, tables, a, b)
    return tables, matching.final_result(tables, a, b)


def by_day(T, F):
    output = {}
    for group in F["groups"]:
        for row in group["rows"]:
            if row["pos"] is None:
                continue
            pos = T["pos"]["rows"][row["pos"]]
            date = matching.day(pos.get("sales_datetime_out") or pos.get("sales_date"))
            bucket = output.setdefault(date, {"pos": 0, "matched": 0, "review": 0, "mismatched": 0})
            bucket["pos"] += 1
            bucket[
                {"Matched": "matched", "Needs review": "review", "Mismatched": "mismatched"}[
                    row["status"]
                ]
            ] += 1
    return output


def results(s, with_rows=False, limit=400):
    loaded = _final(s)
    if loaded is None:
        return None
    tables, final = loaded
    result = {"totals": final["totals"], "by_day": by_day(tables, final)}
    if with_rows:
        result["groups"] = final["groups"][: max(0, min(limit, 1000))]
    return result


def export(s, actor):
    loaded = _final(s)
    if loaded is None:
        raise WorkflowError("Run both matching stages before exporting")
    return matching.export_csv(*loaded)


def stage_status(s):
    from kira.services.status import status

    return status(s)["matching"]
