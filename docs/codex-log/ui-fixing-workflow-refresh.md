# Workflow progress and client navigation integration

- Time: 2026-11-07 14:46 Asia/Jakarta.
- Task: Integrate the supplied Step 2 and Step 4 UI references and the clarified Client selection / Add client navigation into `ui_fixing`, preserving the earlier uncommitted landing, sign-in and floating Kira changes.
- Committed, pushed or merged: no. Branch HEAD remains `9f4cb6e`, equal to the fetched `origin/dev`; all new work is uncommitted on `ui_fixing`.

Step 2 processes POS, Settlement and Mutation in order. Its scanner and rising counts follow actual server checkpoints; converted rows and upload-rule decisions appear only after the transaction completes and the workflow refreshes. Step 4 keeps testing separate from generation, displays the test overview and explicit decision, streams actual matching checks and rule hits, and shows saved results with summary rings, amounts, a paginated combined table and Excel export. The downloaded workbook is editable in Excel or importable into Google Sheets; this is not a connected Google Sheets write.

The shared NDJSON client handles fragmented text, heartbeats, server errors, cancellation and incomplete streams without automatically retrying writes. Uncertain matching completion requires a refresh before another generation attempt. The final full suite exposed a combined-table first-click race; a regression reproduced it, and expansion now belongs to the current result rather than a delayed effect. The test mock uses a generic request wrapper so TypeScript also verifies the regression.

Client selection replaces the Workspace label. Add client uses the existing name-only creation endpoint, selects the returned client after success, preserves navigation and leaves an empty client's workflow at Upload. Modal validation, pending states, cancellation, server failure and explicit retry are covered. UI reviews intercepted APIs; no real client or demo transactions were created or modified.

Validation:

- Full web suite: 30 files, 184 tests passed. After the type-only mock adjustment, all 12 Step 4 tests passed again.
- Full backend suite: 205 passed, 19 skipped; changed Python files passed Ruff lint and format checks.
- Browser checks: existing navigation/analysis acceptance and mocked conversion/matching/client flows passed. Workflow screenshots reviewed at desktop, tablet and phone sizes; new-client flow reviewed at 1440 and 390 px. No overflow or browser errors in these checks.
- Production build: `npm run build` passed. Vite reports the existing large-chunk advisory (main JavaScript 535.15 kB, 161.01 kB gzip); no build errors.

The local frontend remains available at `http://127.0.0.1:5178/`, proxying to the isolated demo backend on port 8002. Restarted that owned backend to load the new streaming and spreadsheet routes, verified them in OpenAPI, and verified the frontend returns HTTP 200. No demo reset, conversion or matching run was performed for verification. Detailed implementation and focused checks are in `ui-fixing-convert.md`, `ui-fixing-matching.md`, `ui-fixing-client-selection.md` and `workflow-progress-backend.md`.
