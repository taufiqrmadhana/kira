"""CSV/Excel conversion and upload-rule comparison. Pure functions; no database or AI."""

import csv
import io
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from kira.standard import COLUMN_ALIASES, DEFAULT_COLUMNS

DELIMITERS = [",", ";", "\t", "|"]
ID_LIKE = re.compile(r"(^id$|_id$|code|account|number|^no$|_no$|reference|^ref)")
WIB = timezone(timedelta(hours=7))
BOOL_VALUES = {
    "true": True,
    "false": False,
    "yes": True,
    "no": False,
    "ya": True,
    "tidak": False,
}


def detect_delimiter(line: str) -> str:
    """Choose the most frequent supported separator in the first nonempty line."""
    first = next((s for s in line.lstrip("\ufeff").splitlines() if s.strip()), "")
    return max(DELIMITERS, key=first.count)


def parse_csv(text: str, delimiter: str) -> list[list[str]]:
    """Read quoted CSV, excluding the BOM and wholly empty rows."""
    return [
        row
        for row in csv.reader(
            io.StringIO(text.lstrip("\ufeff")), delimiter=delimiter, strict=True
        )
        if any(cell.strip() for cell in row)
    ]


def excel_sheets(data: bytes) -> list[dict]:
    """Read tables from each sheet, skipping titles above the first 60%-filled row."""
    from openpyxl import load_workbook

    book = load_workbook(io.BytesIO(data), read_only=True, data_only=True, keep_links=False)
    result = []
    try:
        for sheet in book.worksheets:
            rows = []
            for values in sheet.iter_rows(values_only=True):
                row = [
                    value.isoformat()
                    if isinstance(value, (datetime, date))
                    else str(value).lower()
                    if isinstance(value, bool)
                    else str(value)
                    if value is not None
                    else ""
                    for value in values
                ]
                while row and not row[-1].strip():
                    row.pop()
                rows.append(row)
            width = max((len(row) for row in rows), default=0)
            if width < 2 or not any(sum(bool(v.strip()) for v in row) >= 2 for row in rows):
                continue
            start = next(
                (i for i, row in enumerate(rows)
                 if sum(bool(v.strip()) for v in row) >= width * 0.6),
                None,
            )
            if start is None:
                continue
            out = io.StringIO()
            csv.writer(out).writerows(rows[start:])
            result.append({"sheet": sheet.title, "csv": out.getvalue(), "skipped": start})
    finally:
        book.close()
    return result


def norm_header(h: str) -> str:
    """Normalize header punctuation to underscores."""
    return re.sub(r"[^a-z0-9]+", "_", h.strip().lower()).strip("_")


def parse_number(v) -> float | int | None:
    """Read Indonesian or international numbers without accepting partial values."""
    if v is None or isinstance(v, bool):
        return None
    text = re.sub(r"\s+", "", str(v).strip())
    text = re.sub(r"^Rp", "", text, flags=re.IGNORECASE)
    if not re.fullmatch(r"[0-9.,]+", text):
        return None
    if "." in text and "," in text:
        decimal = "." if text.rfind(".") > text.rfind(",") else ","
        thousands = "," if decimal == "." else "."
        if text.count(decimal) != 1:
            return None
        whole, fraction = text.rsplit(decimal, 1)
        if not fraction.isdigit() or not whole.replace(thousands, "").isdigit():
            return None
        text = whole.replace(thousands, "") + "." + fraction
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", text) or re.fullmatch(
        r"\d{1,3}(?:,\d{3})+", text
    ):
        text = text.replace(".", "").replace(",", "")
    else:
        text = text.replace(",", ".")
        if not re.fullmatch(r"\d+(?:\.\d+)?", text):
            return None
    try:
        value = Decimal(text)
        return int(value) if value == value.to_integral_value() else float(value)
    except (InvalidOperation, OverflowError):
        return None


def parse_date(v) -> tuple[str, str] | None:
    """Return (date|datetime, ISO value); naive times and output use WIB."""
    text = str(v).strip() if v is not None else ""
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            return "date", date.fromisoformat(text).isoformat()
        if re.match(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}", text):
            value = datetime.fromisoformat(text)
        else:
            match = re.fullmatch(
                r"(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?:[ T](\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?",
                text,
            )
            if not match:
                return None
            day, month, year, hour, minute, second = match.groups()
            year = int(year) + (2000 if len(year) == 2 else 0)
            if hour is None:
                return "date", date(year, int(month), int(day)).isoformat()
            value = datetime(
                year, int(month), int(day), int(hour), int(minute), int(second or 0)
            )
        if value.tzinfo is None:
            value = value.replace(tzinfo=WIB)
        return "datetime", value.astimezone(WIB).isoformat(timespec="seconds")
    except (ValueError, OverflowError):
        return None


def infer_type(values: list[str]) -> str:
    """Infer a type from the first 200 nonempty values."""
    sample = [str(v).strip() for v in values if v is not None and str(v).strip()][:200]
    if not sample:
        return "text"
    if all(v.lower() in BOOL_VALUES for v in sample):
        return "bool"
    if all(parse_number(v) is not None for v in sample):
        return "number"
    dates = [parse_date(v) for v in sample]
    if all(dates):
        return "datetime" if any(d[0] == "datetime" for d in dates) else "date"
    return "text"


def clean_value(v, type_: str):
    """Cast a cell; empty or unparseable typed cells become None."""
    if v is None or not str(v).strip():
        return None
    if type_ == "text":
        return str(v).strip()
    if type_ == "number":
        return parse_number(v)
    if type_ == "bool":
        return BOOL_VALUES.get(str(v).strip().lower())
    if type_ in {"date", "datetime"}:
        parsed = parse_date(v)
        if parsed is None:
            return None
        if type_ == "date":
            return parsed[1][:10]
        return parsed[1] if parsed[0] == "datetime" else parsed[1] + "T00:00:00+07:00"
    raise ValueError(f"Unknown column type: {type_}")


def _alias(type_: str, header: str) -> str | None:
    for name in DEFAULT_COLUMNS[type_]:
        if header in COLUMN_ALIASES.get(name, []):
            return name
    return None


def profile(
    type_: str, texts: list[str], rename: dict[str, dict] | None = None
) -> dict:
    """Combine raw rows; fill standard columns per file without replacing raw columns.

    Returns headers, raw rows, proposed column descriptors, delimiter(s), rename
    evidence and samples. Column types use text/number/bool/date/datetime.
    """
    if type_ not in DEFAULT_COLUMNS:
        raise ValueError(f"Unknown upload area: {type_}")
    headers, rows, delimiters, mappings = [], [], [], {}
    for text in texts:
        delimiter = detect_delimiter(text)
        data = parse_csv(text, delimiter)
        if not data:
            continue
        delimiters.append(delimiter)
        raw_headers = [norm_header(h) for h in data[0]]
        if any(not h for h in raw_headers) or len(set(raw_headers)) != len(raw_headers):
            raise ValueError("Headers must be nonempty and unique after normalization")
        fills = {}
        present = set(raw_headers)
        # Explicit mappings take precedence even when an alias occurs earlier.
        ordered = sorted(raw_headers, key=lambda h: h not in (rename or {}))
        for header in ordered:
            explicit = (rename or {}).get(header)
            target = (
                explicit.get("to", "")
                if explicit is not None
                else _alias(type_, header)
            )
            if target and target not in DEFAULT_COLUMNS[type_]:
                raise ValueError(f"Invalid standard column for {type_}: {target}")
            if explicit is not None:
                mappings[header] = dict(explicit)
            if target and target not in present:
                fills[header] = target
                present.add(target)
                mappings[header] = (
                    dict(explicit)
                    if explicit is not None
                    else {"to": target, "by": "alias"}
                )
        for header in raw_headers:
            for column in [header] + ([fills[header]] if header in fills else []):
                if column not in headers:
                    headers.append(column)
        for values in data[1:]:
            if len(values) > len(raw_headers):
                raise ValueError("CSV row has more cells than its header")
            row = dict(
                zip(raw_headers, values + [""] * (len(raw_headers) - len(values)))
            )
            for source, target in fills.items():
                row[target] = row[source]
            rows.append(row)
    proposed = []
    for header in headers:
        values = [r.get(header, "") for r in rows]
        nonempty = [v for v in values if str(v).strip()]
        distinct = len(set(nonempty)) / len(nonempty) if nonempty else 0
        id_like = bool(ID_LIKE.search(header))
        strong_id = bool(re.search(r"(^id$|_id$|code|account|reference|^ref)", header))
        keep = (
            header in DEFAULT_COLUMNS[type_]
            or bool(mappings.get(header, {}).get("to"))
            or (id_like and (strong_id or distinct >= 0.5))
        )
        proposed.append(
            {
                "name": header,
                "type": "text" if id_like else infer_type(values),
                "keep": keep,
            }
        )
    if proposed and not any(c["keep"] for c in proposed):
        for column in proposed:
            column["keep"] = True
    return {
        "headers": headers,
        "rows": rows,
        "proposed": proposed,
        "delimiter": Counter(delimiters).most_common(1)[0][0] if delimiters else ",",
        "delimiters": list(dict.fromkeys(delimiters)),
        "files": len(texts),
        "rename": mappings,
        "samples": {
            h: next((r[h] for r in rows if r.get(h, "").strip()), "") for h in headers
        },
    }


def build_parsed(prof: dict, rule: dict) -> dict:
    """Apply selected types/columns and remove identical converted rows."""
    columns = [dict(c) for c in rule["columns"] if c.get("keep", True)]
    rows, seen, duplicates = [], set(), 0
    for raw in prof["rows"]:
        row = {c["name"]: clean_value(raw.get(c["name"]), c["type"]) for c in columns}
        key = tuple(row.values())
        if key in seen:
            duplicates += 1
        else:
            seen.add(key)
            rows.append(row)
    return {"columns": columns, "rows": rows, "duplicates": duplicates}


def rule_diff(prof: dict, rule: dict | None) -> dict | None:
    """Return meaningful format changes, or None for a new/unchanged format."""
    if rule is None:
        return None
    old = {c["name"]: c for c in rule["columns"]}
    new = {c["name"]: c for c in prof["proposed"]}
    old_mapping = rule.get("rename") or {}
    mapping = {k: v["to"] for k, v in prof["rename"].items()}
    diff = {
        "added": [k for k in new if k not in old and not mapping.get(k)],
        "missing": [k for k, c in old.items() if c.get("keep", True) and k not in new],
        "types": [
            {"name": k, "from": old[k]["type"], "to": c["type"]}
            for k, c in new.items()
            if k in old
            and old[k].get("keep", True)
            and c["type"] not in {old[k]["type"], "text"}
        ],
        "delimiter": any(d != rule.get("delimiter", ",") for d in prof["delimiters"]),
        "rename": {
            k: mapping.get(k, "")
            for k in dict.fromkeys([*old_mapping, *mapping])
            if old_mapping.get(k) != mapping.get(k)
        },
    }
    return diff if any(diff.values()) else None


def looks_like(text: str) -> str | None:
    """Guess an area only when at least 40% of its standard headers occur."""
    data = parse_csv(text, detect_delimiter(text))
    if not data:
        return None
    headers = {norm_header(h) for h in data[0]}
    scores = {
        area: len(headers.intersection(columns)) / len(columns)
        for area, columns in DEFAULT_COLUMNS.items()
    }
    best = max(scores, key=scores.get)
    return best if scores[best] >= 0.4 else None
