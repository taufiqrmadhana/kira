"""ADK tools call the same services as the page, off the server's event loop."""

import asyncio
import logging
from functools import wraps
from importlib import import_module

from google.adk.tools.tool_context import ToolContext

from kira.db import Busy, session_scope
from kira.services.state import WorkflowError

from .guard import scrub_value

log = logging.getLogger(__name__)


def _service(module: str, name: str):
    """Load teammate-owned modules only when needed, with an honest handoff error."""
    try:
        service = import_module(f"kira.services.{module}")
    except ModuleNotFoundError as exc:
        if exc.name != f"kira.services.{module}":
            raise
        raise WorkflowError(
            f"The {module} service is not available yet. Its owner needs to integrate it."
        ) from exc
    fn = getattr(service, name, None)
    if not callable(fn):
        raise WorkflowError(
            f"The {module}.{name} service is not available yet. Its owner needs to integrate it."
        )
    return fn


def _threaded(fn):
    @wraps(fn)
    async def run(*args, **kwargs):
        try:
            return scrub_value(await asyncio.to_thread(fn, *args, **kwargs))
        except (WorkflowError, Busy) as exc:
            return scrub_value({"status": "error", "message": str(exc)})
        except Exception:
            log.exception("Kira tool %s failed", fn.__name__)
            return {
                "status": "error",
                "message": "The tool could not finish. Please try again or use the workflow page.",
            }

    return run


def _call(fn, *, write=False):
    with session_scope(write=write, wait=2 if write else None) as s:
        result = fn(s)
    return {"status": "ok", "result": result}


def _actor(ctx: ToolContext) -> str:
    if not getattr(ctx, "tool_confirmation", None) or ctx.tool_confirmation.confirmed is not True:
        raise WorkflowError("This change needs your approval before it can run.")
    user = str(ctx.state.get("user", "User"))[:100]
    return f"Kira (approved by {user})"


def _stage(stage):
    if stage not in ("l1", "l2"):
        raise WorkflowError("Choose stage l1 or l2.")


def _scope(date_from="", date_to="", outlet=""):
    return {"date_from": date_from, "date_to": date_to, "outlet": outlet}


@_threaded
def get_workflow_status() -> dict:
    """Read uploaded file counts, workflow readiness, matching stages and the next step."""
    return _call(_service("status", "status"))


@_threaded
def list_files() -> dict:
    """List uploaded POS, settlement and bank files, including wrong-area hints."""
    return _call(_service("files", "list_files"))


@_threaded
def get_upload_rules() -> dict:
    """Read saved upload rules and decisions still waiting after conversion."""
    return _call(
        lambda s: {
            "rules": {
                table: _service("convert", "current_rule")(s, table)
                for table in ("pos", "settlement", "bank")
            },
            "pending": _service("convert", "pending_rules")(s),
        }
    )


@_threaded
def preview_table(layer: str, table: str, limit: int = 10) -> dict:
    """Preview up to 50 rows of a parsed or clean POS, settlement or bank table."""
    if layer not in ("parsed", "clean") or table not in ("pos", "settlement", "bank"):
        raise WorkflowError("Choose parsed or clean and pos, settlement or bank.")

    def preview(s):
        tables = (
            _service("convert", "parsed_tables")(s)
            if layer == "parsed"
            else _service("state", "clean_tables")(s)
        )
        result = tables.get(table, {"columns": [], "rows": []})
        return {**result, "rows": result.get("rows", [])[: max(1, min(limit, 50))]}

    return _call(preview)


@_threaded
def get_cleaning_recommendations() -> dict:
    """Read cleaning recommendations and the saved cleaning rules."""
    return _call(
        lambda s: {
            "recommendations": _service("clean", "recommendations")(s),
            "rules": _service("clean", "current_rules")(s),
        }
    )


@_threaded
def get_matching_rules() -> dict:
    """Read saved matching rules in their execution order for both stages."""
    return _call(_service("match", "list_rules"))


@_threaded
def suggest_matching_rules(stage: str) -> dict:
    """Suggest rules for l1 (POS to settlement) or l2 (settlement to bank); save nothing."""
    _stage(stage)
    return _call(lambda s: _service("match", "suggest")(s, stage))


@_threaded
def test_matching_rules(stage: str, rule_ids: list[str] | None = None) -> dict:
    """Test saved rules for l1 or l2 without saving matching results."""
    _stage(stage)
    return _call(lambda s: _service("match", "test")(s, stage, rule_ids))


@_threaded
def get_results() -> dict:
    """Read totals of the latest completed matching run; never invent missing results."""
    return _call(_service("match", "results"))


@_threaded
def explain_unmatched(stage: str) -> dict:
    """Read evidence-backed causes and examples for unmatched rows in a stage."""
    _stage(stage)
    return _call(lambda s: _service("insights", "explain")(s, stage))


@_threaded
def get_match_rate(date_from: str = "", date_to: str = "", outlet: str = "") -> dict:
    """Read match rates by sales date and outlet; dates use YYYY-MM-DD."""
    return _call(lambda s: _service("analysis", "summary")(s, _scope(date_from, date_to, outlet)))


@_threaded
def get_rate_table(
    period: str = "day",
    by_outlet: bool = True,
    by_provider: bool = False,
    only_under_100: bool = False,
    date_from: str = "",
    date_to: str = "",
    outlet: str = "",
    limit: int = 30,
) -> dict:
    """Read up to 100 rate rows, lowest end-to-end first, for day, week, month or all."""
    if period not in ("day", "week", "month", "all"):
        raise WorkflowError("Choose day, week, month or all.")
    return _call(
        lambda s: _service("analysis", "rates")(
            s,
            _scope(date_from, date_to, outlet),
            period=period,
            outlet=by_outlet,
            provider=by_provider,
            below=only_under_100,
            sort="r_full",
            desc=False,
            limit=max(1, min(limit, 100)),
        )
    )


@_threaded
def get_match_map(outlet: str = "", day: str = "", status: str = "open", limit: int = 20) -> dict:
    """Read POS, settlement and bank evidence for one outlet and sales day, up to 50 records."""
    return _call(
        lambda s: _service("analysis", "match_map")(s, outlet, day, status, max(1, min(limit, 50)))
    )


@_threaded
def explain_money_gaps(date_from: str = "", date_to: str = "", outlet: str = "") -> dict:
    """Explain rupiah differences: expected rounding/fees and missing payments to check."""
    return _call(lambda s: _service("analysis", "gaps")(s, _scope(date_from, date_to, outlet)))


@_threaded
def get_follow_ups(status: str = "", limit: int = 20) -> dict:
    """Read open, investigating or resolved follow-ups, with notes and assignees."""
    if status not in ("", "open", "investigating", "resolved"):
        raise WorkflowError("Choose open, investigating or resolved.")
    return _call(
        lambda s: _service("analysis", "follow_ups")(s, status=status, limit=max(1, min(limit, 50)))
    )


@_threaded
def get_learning() -> dict:
    """Read decisions per close and what the saved rules now cover."""
    return _call(_service("learning", "summary"))


@_threaded
def highlight_records(keys: list[str], note: str = "") -> dict:
    """Highlight existing sales numbers or settlement references on the user's linked tables."""
    if not keys or len(keys) > 1000:
        raise WorkflowError("Name between 1 and 1,000 record keys to highlight.")
    return _call(
        lambda s: {"highlighted": _service("analysis", "find_keys")(s, keys), "note": note[:500]}
    )


@_threaded
def draft_follow_up_notes(
    keys: list[str] | None = None,
    outlet: str = "",
    day: str = "",
    reason: str = "",
    language: str = "en",
    only_empty: bool = True,
) -> dict:
    """Draft evidence-based follow-up notes grouped by reason, outlet and day; save nothing."""
    if language not in ("en", "id"):
        raise WorkflowError("Choose en or id for the draft language.")
    if keys is not None and len(keys) > 1000:
        raise WorkflowError("Draft at most 1,000 named records at once.")
    return _call(
        lambda s: _service("followup", "draft")(
            s,
            keys=keys,
            f={**_scope(day, day, outlet), "reason": reason},
            lang=language,
            only_empty=only_empty,
        )
    )


@_threaded
def convert_files(tool_context: ToolContext) -> dict:
    """Convert uploaded files into Layer 1 tables and propose upload rules, after approval."""
    actor = _actor(tool_context)
    return _call(lambda s: _service("convert", "convert")(s, actor), write=True)


@_threaded
def save_upload_rule(table: str, choice: str, tool_context: ToolContext) -> dict:
    """Approve a proposed upload rule: table pos/settlement/bank, choice create/update/keep."""
    actor = _actor(tool_context)
    if table not in ("pos", "settlement", "bank") or choice not in ("create", "update", "keep"):
        raise WorkflowError("Choose pos, settlement or bank and create, update or keep.")
    return _call(
        lambda s: _service("convert", "decide_upload_rule")(s, table, choice, actor), write=True
    )


@_threaded
def save_cleaning(accept: list[str], reject: list[str], tool_context: ToolContext) -> dict:
    """Decide every open cleaning recommendation, then save the cleaning rules, after approval."""
    actor = _actor(tool_context)

    def save(s):
        recommendations = _service("clean", "recommendations")(s)
        pending = {r["id"] for r in recommendations if not r.get("decision")}
        selected = accept + reject
        if len(selected) != len(set(selected)) or set(selected) != pending:
            raise WorkflowError(
                "Accept and reject must cover every open recommendation exactly once."
            )
        for rid in accept:
            _service("clean", "decide")(s, rid, "accept")
        for rid in reject:
            _service("clean", "decide")(s, rid, "reject")
        return _service("clean", "save")(s, actor)

    return _call(save, write=True)


@_threaded
def save_matching_rule(
    stage: str, kind: str, params: dict, tool_context: ToolContext, name: str = ""
) -> dict:
    """Save a suggested rule for l1 or l2; copy its kind and conditions exactly from the suggestion."""
    actor = _actor(tool_context)
    _stage(stage)
    return _call(
        lambda s: _service("match", "save_rule")(s, stage, kind, params, actor, name), write=True
    )


@_threaded
def run_matching(stage: str, tool_context: ToolContext, rule_ids: list[str] | None = None) -> dict:
    """Run and save one stage after approval. Run l1 before l2; rerunning l1 clears l2."""
    actor = _actor(tool_context)
    _stage(stage)
    return _call(lambda s: _service("match", "run")(s, stage, actor, rule_ids), write=True)


@_threaded
def save_follow_ups(
    note: str,
    tool_context: ToolContext,
    status: str = "investigating",
    assignee: str = "",
    keys: list[str] | None = None,
    outlet: str = "",
    day: str = "",
    reason: str = "",
) -> dict:
    """Save one full note on at most 1,000 named records. Supply keys or outlet, day AND reason."""
    actor = _actor(tool_context)
    if not keys and not (outlet and day and reason):
        raise WorkflowError(
            "Name record keys or an outlet, day and reason before saving follow-ups."
        )
    if not note.strip() or len(note) > 10000 or status not in ("open", "investigating", "resolved"):
        raise WorkflowError("Provide a note and an open, investigating or resolved status.")
    if keys and len(keys) > 1000:
        raise WorkflowError("Save at most 1,000 records at once.")

    def save(s):
        f = {**_scope(day, day, outlet), "reason": reason}
        if keys:
            existing = _service("analysis", "find_keys")(s, keys)
            if set(existing) != set(keys):
                raise WorkflowError(
                    "Some record keys no longer exist. Refresh the records before approving."
                )
            f["keys"] = ",".join(keys)
        selected = _service("analysis", "follow_ups")(s, f, limit=1001)
        records = selected.get("records", [])
        if not records:
            raise WorkflowError("No follow-up records match that selection.")
        if selected.get("total", len(records)) > 1000 or len(records) > 1000:
            raise WorkflowError("Save at most 1,000 records at once; narrow the selection.")
        results = {}
        for record in records:
            rid = record.get("rid")
            if not rid:
                raise WorkflowError(
                    "A selected record has no stable follow-up id. Refresh the results."
                )
            results[rid] = _service("analysis", "set_follow_up")(
                s, rid, status, note, assignee, actor
            )
        return {"saved": len(results), "follow_ups": results}

    return _call(save, write=True)


READ_TOOLS = [
    get_workflow_status,
    list_files,
    get_upload_rules,
    preview_table,
    get_cleaning_recommendations,
    get_matching_rules,
    suggest_matching_rules,
    test_matching_rules,
    get_results,
    explain_unmatched,
    get_match_rate,
    get_rate_table,
    get_match_map,
    explain_money_gaps,
    get_follow_ups,
    get_learning,
    highlight_records,
    draft_follow_up_notes,
]
CHANGE_TOOLS = [
    convert_files,
    save_upload_rule,
    save_cleaning,
    save_matching_rule,
    run_matching,
    save_follow_ups,
]
