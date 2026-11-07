"""Deterministic cleaning recommendations and rules; no persistence or model calls."""

import re
from collections import Counter
from copy import deepcopy

from kira.core.parsing import parse_number
from kira.standard import STANDARD

LIST_NAME = {"outlets": "outlet", "providers": "provider"}
EMPTY_RULES = {"version": 0, "maps": {}, "exclude": {}}


def plural(n: int, word: str) -> str:
    return word if n == 1 else word + "s"


def _key(v) -> str:
    return re.sub(r"[^a-z0-9]", "", str(v or "").lower())


def _words(v) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", str(v or "").lower()))


def standard_name(list_: str, value) -> str | None:
    """Resolve only an unambiguous standard name or alias."""
    text = str(value or "").lower()
    matches = [
        name
        for name, aliases in STANDARD[list_].items()
        if text == name.lower() or any(alias in text for alias in aliases)
    ]
    return matches[0] if len(matches) == 1 else None


def outlet_names(parsed: dict) -> dict[str, str]:
    """Use the most frequent POS spelling of each outlet, with stable tie order."""
    counts = {}
    for row in parsed.get("pos", {}).get("rows", []):
        value = str(row.get("branch") or "").strip()
        if value:
            counts.setdefault(_key(value), Counter())[value] += 1
    return {key: count.most_common(1)[0][0] for key, count in counts.items()} or {
        _key(name): name for name in STANDARD["outlets"]
    }


def match_outlet(value, outlets: dict[str, str]) -> str | None:
    """Match exact normalized names, then uniquely shared distinguishing words."""
    if _key(value) in outlets:
        return outlets[_key(value)]
    words = {name: _words(name) for name in outlets.values()}
    if not words:
        return None
    shared = set.intersection(*words.values())
    query = _words(value) - shared
    scores = {name: len(query & (tokens - shared)) for name, tokens in words.items()}
    best = max(scores.values())
    winners = [name for name, score in scores.items() if score == best]
    return winners[0] if best > 0 and len(winners) == 1 else None


def is_payout(row: dict) -> bool:
    """A payout is a positive credit mentioning a known payment provider."""
    return (parse_number(row.get("kredit")) or 0) > 0 and any(
        word in str(row.get("keterangan") or "").lower()
        for word in STANDARD["payout_words"]
    )


def pattern(desc) -> str:
    """Group descriptions after replacing digit runs and collapsing whitespace."""
    return " ".join(re.sub(r"\d+", "#", str(desc or "").lower()).split())


def _excluded(rules: dict, row: dict) -> bool:
    return (
        rules.get("exclude", {})
        .get("bank", {})
        .get(pattern(row.get("keterangan")), False)
    )


def build_recs(
    parsed: dict, rules: dict | None, previous: list[dict] | None = None
) -> list[dict]:
    """Propose one card per uncovered column and one for uncovered bank patterns."""
    rules = rules or EMPTY_RULES
    outlets = outlet_names(parsed)
    recs = []
    for area, checked in STANDARD["columns"].items():
        for column, list_ in checked.items():
            rid = f"{area}.{column}"
            saved = rules.get("maps", {}).get(rid, {})
            values = Counter(
                str(row[column])
                for row in parsed.get(area, {}).get("rows", [])
                if row.get(column) is not None and str(row[column]).strip()
            )
            items = []
            for value, count in values.items():
                if value in saved:
                    continue
                target = (
                    match_outlet(value, outlets)
                    if list_ == "outlets"
                    else standard_name(list_, value)
                )
                if value != target:
                    items.append({"from": value, "to": target or "", "rows": count})
            if items:
                choices = (
                    list(outlets.values())
                    if list_ == "outlets"
                    else list(STANDARD[list_])
                )
                recs.append(
                    {
                        "id": rid,
                        "table": area,
                        "column": column,
                        "kind": "map",
                        "decision": None,
                        "items": items,
                        "choices": choices,
                        "title": f"Use standard {LIST_NAME[list_]} names in {column}",
                        "why": f"{len(items)} {plural(len(items), 'value')} in {area} {column} differ from the standard names.",
                    }
                )
    groups = {}
    for row in parsed.get("bank", {}).get("rows", []):
        key = pattern(row.get("keterangan"))
        if is_payout(row) or key in rules.get("exclude", {}).get("bank", {}):
            continue
        credit, debit = (
            parse_number(row.get("kredit")) or 0,
            parse_number(row.get("debit")) or 0,
        )
        reason = (
            "No known provider name in the description"
            if credit > 0
            else "Money going out (debit)"
            if debit > 0
            else "No amount: a balance or information line"
        )
        item = groups.setdefault(
            key,
            {
                "pattern": key,
                "example": row.get("keterangan", ""),
                "rows": 0,
                "credit": 0,
                "debit": 0,
                "exclude": True,
                "why": reason,
            },
        )
        item["rows"] += 1
        item["credit"] += credit
        item["debit"] += debit
    if groups:
        recs.append(
            {
                "id": "bank.exclude",
                "table": "bank",
                "column": "keterangan",
                "kind": "exclude",
                "decision": None,
                "items": list(groups.values()),
                "title": "Leave out bank rows that aren't provider payouts",
                "why": "Decide which kinds of bank rows belong in reconciliation.",
            }
        )
    previous_by_id = {r["id"]: r for r in previous or []}
    for rec in recs:
        old = previous_by_id.get(rec["id"])
        if old is None:
            continue
        field = "from" if rec["kind"] == "map" else "pattern"
        old_items = {i[field]: i for i in old["items"]}
        editable = ("to", "by", "why") if field == "from" else ("exclude", "by", "why")
        for item in rec["items"]:
            for key in editable:
                if key in old_items.get(item[field], {}):
                    item[key] = deepcopy(old_items[item[field]][key])
        # A new value must not inherit approval given to a previously smaller card.
        if all(i[field] in old_items for i in rec["items"]):
            rec["decision"] = old.get("decision")
    return recs


def active_rules(rules: dict | None, recs: list[dict]) -> dict:
    """Combine saved rules with decided cards for a preview without mutating either."""
    result = deepcopy(rules or EMPTY_RULES)
    result.setdefault("maps", {})
    result.setdefault("exclude", {})
    for rec in recs:
        if rec.get("decision") not in {"accept", "reject"}:
            continue
        accepted = rec["decision"] == "accept"
        if rec["kind"] == "map":
            mapping = result["maps"].setdefault(rec["id"], {})
            for item in rec["items"]:
                mapping[item["from"]] = (
                    (item.get("to") or item["from"]) if accepted else item["from"]
                )
        elif rec["kind"] == "exclude":
            excludes = result["exclude"].setdefault(rec["table"], {})
            for item in rec["items"]:
                excludes[item["pattern"]] = bool(item["exclude"]) if accepted else False
        else:
            raise ValueError(f"Unknown recommendation kind: {rec['kind']}")
    return result


def apply(parsed: dict, rules: dict) -> dict:
    """Build Layer 2 with aligned was/source_rows lists and excluded-row counts."""
    result = {}
    for area, table in parsed.items():
        rows, was, source_rows, dropped = [], [], [], 0
        for index, original in enumerate(table["rows"]):
            if area == "bank" and _excluded(rules, original):
                dropped += 1
                continue
            row, old_values = dict(original), {}
            for column, value in original.items():
                mapping = rules.get("maps", {}).get(f"{area}.{column}", {})
                target = mapping.get(str(value), value)
                if target != value:
                    old_values[column] = value
                    row[column] = target
            rows.append(row)
            was.append(old_values)
            source_rows.append(index)
        result[area] = {
            **deepcopy(table),
            "rows": rows,
            "was": was,
            "source_rows": source_rows,
            "dropped": dropped,
        }
    return result


def save(rules: dict | None, recs: list[dict]) -> dict:
    """Create the next rules version only after every card has a valid decision."""
    if any(rec.get("decision") not in {"accept", "reject"} for rec in recs):
        raise ValueError("Decide on every cleaning recommendation before saving")
    result = active_rules(rules, recs)
    result["version"] = (rules or EMPTY_RULES).get("version", 0) + 1
    return result
