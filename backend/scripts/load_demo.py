"""R6: load the two Drive demo clients over the API, leaving day 8 for the live demo."""

import argparse
import json
import os
from hashlib import sha256
from pathlib import Path

import httpx

CLIENTS = {"zestly-demo": "Zestly Demo", "zestly-demo-latihan": "Zestly Demo – Latihan"}
EXPECTED = {
    "pos": 8784,
    "full": 8639,
    "l1": 8781,
    "stl": 8783,
    "l2": 8641,
    "credits": 70,
    "credits_linked": 69,
}
RULES = {
    "l1": {"kind": "id", "params": {"posCol": "trace_number", "stlCol": "external_reference_id"}},
    "l2": {
        "kind": "withdrawal",
        "params": {"groupBy": "entity_id", "requireId": True, "amountTol": 0, "maxDays": 3},
    },
}


def source_days(root: Path) -> list[list[tuple[str, Path]]]:
    """Validate all seven source days before making any requests."""
    days = []
    for day in range(1, 8):
        folders = sorted(root.glob(f"day-{day:02}-*"))
        if len(folders) != 1:
            raise ValueError(f"Expected one day-{day:02} folder in {root}")
        files = []
        for area, prefix in [("pos", "POS"), ("settlement", "SET"), ("bank", "STA")]:
            paths = sorted(folders[0].glob(f"{prefix}_*.csv"))
            if len(paths) != 1:
                raise ValueError(f"Expected one {prefix} CSV in {folders[0]}")
            files.append((area, paths[0]))
        days.append(files)
    return days


def call(client, method: str, path: str, **kwargs):
    response = client.request(method, f"/api{path}", **kwargs)
    response.raise_for_status()
    return response.json()


def verify(client, cid: str) -> dict:
    files = call(client, "GET", "/files")
    if len(files) != 21 or any(
        "20261027" in item["name"] or "day-08" in item["folder"] for item in files
    ):
        raise ValueError(f"{cid}: expected 21 files for days 1–7 only")
    overview = call(client, "GET", "/overview")
    totals = (overview.get("results") or {}).get("totals", {})
    if any(totals.get(key) != value for key, value in EXPECTED.items()):
        raise ValueError(f"{cid}: results do not match the Drive data guide: {totals}")
    learning = call(client, "GET", "/learning")
    closes = learning["closes"]
    if len(closes) != 1 or closes[0]["questions"] != 7 or learning.get("open"):
        raise ValueError(f"{cid}: expected one completed close with seven decisions")
    return {
        "client": cid,
        "files": len(files),
        "match_rate": round(100 * totals["full"] / totals["pos"], 1),
        "questions": closes[0]["questions"],
        "totals": totals,
    }


def load_client(client, cid: str, name: str, days: list, progress=print) -> dict:
    client.headers["X-Kira-Client"] = cid
    known = call(client, "GET", "/clients")
    if not any(item["id"] == cid for item in known):
        call(client, "POST", "/clients", json={"id": cid, "name": name})
    sources = {(area, path.name): path for day in days for area, path in day}
    existing = call(client, "GET", "/files")
    for item in existing:
        source = sources.get((item["type"], item["name"]))
        if source is None:
            raise ValueError(f"{cid}: unexpected existing file; refusing to replace workspace data")
        downloaded = client.get(f"/api/files/{item['id']}/download")
        downloaded.raise_for_status()
        if sha256(downloaded.content).digest() != sha256(source.read_bytes()).digest():
            raise ValueError(f"{cid}: existing file differs from Drive source: {source.name}")
    if call(client, "GET", "/learning")["closes"]:
        progress(f"{cid}: already loaded; verifying without creating another close")
        return verify(client, cid)
    for number, day in enumerate(days, 1):
        for area, path in day:
            call(
                client,
                "POST",
                f"/files/{area}",
                files={"uploads": (path.name, path.read_bytes(), "text/csv")},
                data={"folder": path.parent.name},
            )
        call(client, "POST", "/convert")
        for proposal in call(client, "GET", "/upload-rules")["pending"]:
            call(
                client,
                "POST",
                f"/upload-rules/{proposal['type']}",
                json={"choice": "create" if proposal["current_version"] is None else "update"},
            )
        progress(f"{cid}: converted day {number}/7")
    # First close covers the whole week: saving per day adds a third cleaning decision on day 2.
    cleaning = call(client, "GET", "/cleaning")
    recs = cleaning["recommendations"]
    if recs:
        if {rec["id"] for rec in recs} != {"settlement.branch", "bank.exclude"}:
            raise ValueError(f"{cid}: first close must contain the two documented cleaning cards")
        for rec in recs:
            call(
                client,
                "POST",
                f"/cleaning/recommendations/{rec['id']}",
                json={"decision": "accept"},
            )
        call(client, "POST", "/cleaning/save")
    elif cleaning["rules"] is None:
        raise ValueError(f"{cid}: expected saved cleaning rules when resuming after cleaning")
    saved = call(client, "GET", "/matching/rules")
    for stage, required in RULES.items():
        stage_rules = [rule for rule in saved if rule["stage"] == stage]
        if stage_rules:
            if len(stage_rules) != 1 or any(
                stage_rules[0][key] != required[key] for key in ("kind", "params")
            ):
                raise ValueError(f"{cid}: unexpected {stage} rule; refusing to change it")
        else:
            suggestions = call(client, "GET", f"/matching/{stage}/suggestions")
            if not any(
                all(suggestion.get(key) == required[key] for key in ("kind", "params"))
                for suggestion in suggestions
            ):
                raise ValueError(f"{cid}: documented {stage} rule was not suggested from the data")
            call(client, "POST", f"/matching/{stage}/rules", json=required)
    call(client, "POST", "/matching/l1/run", json={})
    call(client, "POST", "/matching/l2/run", json={})
    return verify(client, cid)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data/with-exceptions",
    )
    parser.add_argument("--username", default=os.getenv("KIRA_USERNAME", "kira"))
    args = parser.parse_args()
    days = source_days(args.data_dir)
    with httpx.Client(
        base_url=args.base_url, headers={"X-Kira-User": "Rifat"}, timeout=90
    ) as client:
        if password := os.getenv("KIRA_PASSWORD"):
            call(client, "POST", "/login", json={"username": args.username, "password": password})
        for cid, name in CLIENTS.items():
            print(json.dumps(load_client(client, cid, name, days), indent=2))


if __name__ == "__main__":
    main()
