# Codex log: Rifat

| Time | Task | Merged |
| --- | --- | --- |
| 2026-11-07 10:06 WIB | R1: standard columns and aliases, pure CSV parsing/conversion/rule comparison, cleaning recommendations and versioned rules. Tests written first; 27 tests passed on Python 3.13, including Drive day-1, days-1–7 and day-8 fixtures. Ruff passed. Reviewed using caveman and ponytail. | Yes — PR #1 into dev |
| 2026-11-07 10:17 WIB | R2: CSV/TXT multipart uploads, file listing and original-byte downloads, move/delete, SHA-256 duplicate skipping, wrong-area hints, audit records, conversion invalidation and matching reset. Tests written first; 20 R2 tests passed, including batch rollback, client isolation and preservation of historical matching evidence. Full integration suite: 81 passed; Ruff passed. Reviewed using caveman and ponytail. | No — feature/mhmmdrifat |
| 2026-11-07 10:24 WIB | R3: conversion and upload-rule APIs, versioned create/update/keep decisions, column and header mapping overrides, Layer 1 rebuilds, learning events, audit records, and the cleaning refresh required after conversion. Tests written first; 15 R3 tests passed. Real Drive data converted one day per request: three initial cards, no new cards on days 2–7, one POS order_channel update on day 8, and 9,982 POS rows after day 8. Full integration suite: 96 passed; Ruff passed. Review fixed an unrelated update silently changing a saved numeric type to text. Reviewed using caveman and ponytail. | No — feature/mhmmdrifat |

Run from `backend/` until the shared project configuration is integrated:

```sh
uv run --no-project --python 3.13 --with pytest python -m pytest tests/test_pipeline_core.py -q
```

The fixture check needs Drive `with-exceptions.zip` extracted into `data/with-exceptions/`; it skips explicitly when absent. Demo data is excluded locally from git. R1 implements CSV only, as specified by the two-hour plan.

R2 was validated in `/tmp/kira-r2-integration` with Taufiq's platform at `7eb2a0c` combined with `dev` at `532276b`, using `cd backend && uv run --frozen pytest -q`. The feature branch needs that shared platform integrated before its service/API tests can run standalone. No platform files were copied into Rifat's branch.

R2 follows the assignment's CSV/TXT scope. Excel/PDF support and built-in sample loading remain deferred. Conversion services (R3), cleaning services (R4), upload screens (R5), and demo client loading (R6) are separate tasks. File changes mark conversion stale and clear current matching while retaining historical runs, links, and follow-up notes. Duplicate uploads and moves to the current area leave results unchanged.

R3 was tested in the same combined worktree with `cd backend && uv run --frozen pytest -q`. The new `services/clean.py` contains only the read/refresh helpers needed by conversion and workflow status; cleaning decisions, save, and table routes remain R4. Conversion rejects incomplete uploads and stale or repeated decisions; failed decisions roll back rules, rows, and workflow state. Each accepted create/update/keep decision calls `learning.note(s, "upload_rule", table=..., choice=..., version=..., actor=...)` once. Unchanged conversions do not add learning events. AI header mapping remains deferred under the two-hour plan. The platform branch is still required before this feature branch runs standalone; no platform-owned files were changed.
