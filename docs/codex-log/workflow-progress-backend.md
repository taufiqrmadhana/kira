# Workflow progress and spreadsheet export

- Time: 2026-11-07, 14:27 WIB.
- Task: Add genuine conversion/matching progress and editable Excel export for the workflow UI.
- Merged: no. No commits or git operations performed; root owns integration.

Added `POST /api/convert/stream` and `POST /api/matching/{stage}/run/stream` as authenticated NDJSON streams, preserving the existing synchronous endpoints. Each stream captures the request's client and actor, then creates, uses, commits/rolls back, and closes its database session inside one worker thread. Progress is provisional; the terminal complete event is serialized before commit and emitted only after commit succeeds. Workflow/lock conflicts and failed writes produce a terminal error. Disconnects request rollback at a checkpoint or before commit; a completed commit cannot be undone by a later disconnect. Heartbeats carry no invented percentage.

Conversion reports real file profiling, proposal, and saved-rule checkpoints in POS, settlement, bank order. Parsed rows are staged in the same atomic transaction before the existing shared cleaning refresh and matching invalidation. Matching reports real source checks and cumulative matched/hit counts, throttled to roughly 200 checkpoints plus rule/final boundaries. Rule ordering and matching results are unchanged. Callback arguments are optional for legacy service/core callers.

Added `GET /api/matching/export.xlsx`. A write-only openpyxl workbook exports every combined result row using the shared typed projection also used by CSV. It retains numeric/boolean types and all retained source columns, freezes/filters the header, stores imported strings explicitly as text to prevent formula execution, removes invalid XML controls, and respects Excel's text-cell limit. Existing CSV export remains available.

Validation was tests first: the initial new tests failed for missing callbacks/routes/export. New regressions cover progress bounds/order/throttling, unchanged engine results, full-row export and literal formula text, authentication, workflow and lock errors, separate client databases, worker/session thread ownership, conversion rollback, matching-run preservation on commit failure, completion after commit, and disconnect rollback. Final full backend run:

```text
.venv/Scripts/python.exe -m pytest -q --basetemp .venv/progress-full-20261107 -p no:cacheprovider
205 passed, 19 skipped, 2 existing ADK experimental-feature warnings in 58.21s
```

Ruff lint and format checks passed for all ten changed Python files. `docs/02-api-contract.md` documents the added routes, units, terminal/error behavior, session ownership, and export shape. Tests used temporary databases only; the live demo database was not changed.
