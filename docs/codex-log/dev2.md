# dev2 implementation log

Requested specification: `~/Projects/kira-notes/09-codex-prompt-dev2.md`.
Starting revision: `9f4cb6e` from `origin/dev`; branch `dev2`.
All runtime verification uses `/tmp/kira-dev2`; no deployment or live database changes.

## 2026-11-07 14:10 WIB — baseline and performance preparation

- Read the complete specification, team ownership and design instructions. The lead's dev2 specification explicitly authorizes cross-team changes for this integration; DESIGN.md changes will be recorded here for Andrew.
- Created `dev2` from fetched `origin/dev`.
- Baseline tests and browser measurements in progress, before performance changes are activated.
- Added failing-first tests for delayed, layout-shaped loading placeholders; 2 tests now pass. They are not yet connected to production components while the baseline is captured.
- Skills: Sites local-only preview workflow; installed web-design-guidelines with fresh upstream rules. Impeccable critique/audit and dataviz skills were not found in the available local catalogs (chart review remains pending).
- Merged: no. Not deployed.

## Phase checklist

- [x] 0 — baseline tests, loading report and before screenshots
- [ ] 1 — shared caches, targeted invalidation, loading, fonts and code splitting
- [ ] 2 — cleanup, evidence restoration and stable companion state
- [ ] 3 — shared components and motion catalogue
- [ ] 4 — sidebar, topbar, reset and share links
- [ ] 5 — landing and Overview
- [ ] 6 — workflow
- [ ] 7 — Match analysis
- [ ] 8 — Insights
- [ ] 9 — guided close and agent tools
- [ ] 10 — tutorials
- [ ] 11 — responsive, accessibility and end-to-end verification

## Phase 0 — baseline complete

- Backend: **205 passed**, 2 upstream warnings, 275.84 s. Web: **135 passed in 26 files**, 10.92 s. Build: **519.42 kB** main JS, 122.34 kB CSS.
- Added readiness markers and `web/scripts/check-loading.cjs`: captures API start/end/status, normalized duplicate URLs, readiness, session-window CLS, preview flash, console errors, overflow, and screenshots.
- Final baseline uses a frozen production build to exclude Vite HMR and development StrictMode interference. Both before and after must use production mode for comparison. 18 page/viewport measurements completed with zero readiness failures or console errors.
- Desktop ready ms: Overview 911; Workflow steps 1–4: 1851 / 1048 / 1449 / 1513; Match rate 5463; Match map 7760; Follow-up 4652; Insights 5176. Exact historical timings vary with machine contention, but repeated rates/gaps/status requests and layout shift are reproduced.
- Screenshots: `docs/screens/dev2-before/`; timings: `docs/codex-log/loading-before.json`. Screenshots use viewport captures because full-page cleaning-table captures exceeded browser limits. Font waiting is disabled only during screenshots; loading metrics still include font requests.
- Verification: baseline checks above. Merged: no; no deployment.
