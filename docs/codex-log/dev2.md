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
- [x] 1 — shared caches, targeted invalidation, loading, fonts and code splitting
- [x] 2 — cleanup, evidence restoration and stable companion state
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

## Phase 1 — performance gates passed

- Process cache bounded to 32 entries, client/run/rule/manual-link revisions, canonical scopes, per-client cold-read locks, response isolation and post-commit warming. Workflow, cleaning and table reads also share cached snapshots. POS outlet standards use a SQL projection rather than loading all source records.
- React Query provides client-scoped keys, 60 s freshness, deduplication, retained data and targeted invalidation. Writes cancel stale in-flight reads; sign-out clears account data. Removed page remounts and duplicate follow-up refreshes; prefetch after identity check and navigation hover/focus.
- Deferred layout skeletons, refresh status and local WOFF2 fonts. Route code split. Entry JS **104.82 kB**, separate reusable React runtime **223.24 kB**; both below 250 kB (combined initial JavaScript is larger than the entry). Fixed circular component exports.
- Browser gates: **18/18 passed**, readiness **179–543 ms**, max CLS **0.00578**, zero duplicate completed requests, preview flashes, console errors or failed readiness.
- Validation: web **147 passed in 28 files**, build and core checks pass. Backend full run **221 passed** before the final workflow extension; **20 focused cache/workflow tests** pass, and the expanded full suite is running. Background warming is disabled in general test fixtures and exercised explicitly in scheduler tests to avoid races with test monkeypatches.
- DESIGN.md changes for Andrew: self-hosted font delivery; loading/refresh behavior, fixed-height delayed skeletons, targeted query lifecycle and route splitting. No API response or endpoint changes.
- Merged: no. Phase0 commit: `88ff50d`, pushed to `origin/dev2`. No deployment.

| Page | Before desktop ms | After desktop ms | After mobile ms |
| --- | ---: | ---: | ---: |
| overview | 911 | 183 | 225 |
| workflow-1 | 1851 | 253 | 240 |
| workflow-2 | 1048 | 193 | 179 |
| workflow-3 | 1449 | 424 | 418 |
| workflow-4 | 1513 | 197 | 205 |
| analysis-rates | 5463 | 543 | 426 |
| analysis-map | 7760 | 469 | 382 |
| analysis-follow | 4652 | 391 | 379 |
| insights | 5176 | 397 | 208 |

Raw reports: `loading-before.json`, `loading-after.json`. Screenshots: `docs/screens/dev2-before/` and `docs/screens/dev2/`. Production builds, warm scratch backend, fresh page/query cache; timing differences on the shared workstation are not production latency guarantees.

### Phase 2 restoration started in the performance commit

The first evidence-restoration changes arrived during staging: `LinkedTables`, its CSS, the analysis root class and DataTable's optional source columns. Their failing-first historical regression tests pass (15 targeted tests). They are included with their tests and restored browser script in this commit; the Phase 1 loading report above was captured before this restoration. Phase 2 is not yet complete.

## 2026-11-07 14:34 WIB — Phase 2 cleanup and restoration

- Backend final verification: **225 passed**, 2 existing ADK warnings, 253.01 s. The earlier background-test warnings are resolved. Included one follow-up cache-generation correction so clearing all caches also invalidates an in-flight first read.
- Removed prototype preview entrypoints, nested chat package and unused integration wrappers. Consolidated sign-in into `pages/Login.tsx`; empty workspaces explain the four steps, and incomplete analysis names the matching stage that is missing.
- Restored payment evidence and missing-bank explanation from KIRA history, with 15 passing regression tests and browser checks at 1440/1280/768/390 and 390×600. Companion minimization now retains history, draft, in-flight requests and pending approvals; working/approval status is visible on launcher. Failed sign-in remains inline.
- Root stylesheet split into tokens/base/components. Folded chat, mascot and integration styles into the shared file; all source colour hex values live in tokens.css, including SVG mascot fills. Structural CSS comparison resolves every token to its prior literal: no declarations or colours unintentionally changed. Empty-state layout is intentional.
- DESIGN.md changes for Andrew: stylesheet ownership and restored Match map evidence guidance. API shape unchanged.
- The named dataviz/build-web-data-visualization skill was not found locally or in connected plugin search; unrelated plugins were not installed. Chart work will use the explicit specification and DESIGN.md chart/accessibility rules; a named-skill review cannot be claimed.
- Verification: broader web suite/build/browser review in progress. Merged: no. No deployment. `deploy-local.sh` only loses its obsolete nested-preview build fallback; it was not run.

### Phase 2 verification complete

- Web **161 passed in 29 files**; TypeScript and production build pass. `check-match-map.cjs` and `check-shell.cjs` pass. Source scan finds no legacy preview/wrapper names and no hex colours outside tokens.css.
- CSS/browser review: 27 views (nine pages at 1440/1280/390), no horizontal page overflow; screenshot comparison found only the requested sidebar navigation difference. Additional sign-in/empty/matching screenshots at 1440/390 in `docs/screens/dev2/`.
- Phase 1 plus initial evidence restoration commit: `bd6124a`, pushed. Remaining Phase 2 work committed separately below. Merged: no. No deployment.

## 2026-11-07 14:50 WIB — Phase 3 components and motion foundation

- Added PageHeader, SummaryBand, fitted rings, animated KPIs, RateCell, icon StatusChip, LinkChip, subtitle tabs, ToggleChip and IconTile. DataTable supports compact/evidence density, sticky columns, human/type headers, aggregates, portal Columns and export. Shared overlays trap/restore focus and clamp to the viewport.
- Motion uses shared timing/easing tokens, cancellable numeric/reveal hooks, real upload bytes, active conversion/matching flows, confirmed result counters, cleaning-card collapse and changed-cell flash, route/step/nav movement, linked evidence highlighting, first-view Overview reveals, chat entries and toast motion. Reduced motion preserves final values and progress text.
- Verification: **200 web tests** exercised; 199 passed in the full run, then the sole legacy column-picker test was updated for its intentionally portaled menu and all 9 analysis tests passed. TypeScript and production build pass. Component gallery browser checks pass at 1440/390 (ring fit, 36/44 px rows, sticky columns, overlays, no overflow, reduced motion); workflow catalogue 2–7 passes normal/reduced browser checks. Eight overlay tests plus independent keyboard/viewport checks pass.
- Screenshots: `docs/screens/dev2/components/` and workflow motion captures. Entry JS 109.96 kB; React runtime remains a separate 223.24 kB chunk.
- DESIGN.md changes for Andrew: complete shared-component entries; motion tokens/catalogue; retain companion state and remove obsolete floating-placement guidance. `plural()` centralizes count grammar. API unchanged.
- Dependency note: guided-step collapse, compare-dialog origin, dock width and tutorial cursor/spotlight require the features in phases 7/9/10. Their final motion acceptance remains open until those screens exist; the foundation is verified here. No fabricated progress or async matching endpoint was added.
- Phase 2 commit: `12b6e1f`, pushed. Merged: no. No deployment.
