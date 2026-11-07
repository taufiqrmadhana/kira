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
- [x] 4 — sidebar, topbar, reset and share links
- [x] 5 — landing and Overview
- [x] 6 — workflow
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

## 2026-11-07 14:57 WIB — Phase 4 shell and reset

- Client button/menu with scoped cached rates, creation and Switch client; distinct navigation icons and pending-decision count. Topbar Tutorial entry, account menu and exact-demo Reset control. Kira launcher moves to sidebar/topbar and reports work/approval status. Desktop chat reserves400 px; smaller screens use a bounded sheet. Container layouts keep numbers readable when docked.
- Added POST `/api/reset`, exact demo allowlist and typed client confirmation, checked SQLite backup including WAL pages, exclusive0600 backup files, transactional deletion of only the selected client's data and audit/cache handling. Existing `{ok,backup}` response preserved; documented appended contract. UI displays counts and backup; failed reset remains recoverable. Confirmed reset removes stale client chat approvals.
- Copy link on analysis/Insights shares the complete current URL and confirms only after clipboard success.
- Verification: 12 reset tests +20 cache/workflow regressions pass. 34 focused web tests pass (one further menu-keyboard test added and passes); TypeScript and production build pass. Match-map/dock browser checks pass1440/1280/768/390 and390×600, including single-line KPI numbers, no page overflow, draft preservation and Escape focus. Four-width shell control checks finish below.
- Phase3 strict motion check now waits for the router update before testing the actual running step-marker transition; normal/reduced both pass. Matching captures now show the active flow in view. No fabricated transition claim remains.
- DESIGN.md changes for Andrew: sidebar/topbar contents, client menu, reset flow, fixed launcher positions,400 px desktop dock, smaller sheet and container responsiveness. Phase3 commit `f873378` pushed. Merged: no. No deployment.
- Final Phase4 shell browser check passes all four widths: sign-in, client/account menus, empty states, typed reset confirmation, exact clipboard URLs and Kira placement. No browser errors or overflow. Reset checks never execute a scratch reset. Component suites now cover35 focused web cases after the keyboard addition.

## 2026-11-07 15:03 WIB — Phase 5 landing and Overview

- Landing copy is factual, signed-out panel embeds the shared sign-in form, client rows load their own last sales date/rate/open follow-ups, and entry supports tutorial/guided modes. Controlled carousel retained; first-paint steps stagger80 ms and stop for reduced motion.
- Overview distinguishes sales coverage26Oct from matching7Nov14:10WIB (naive SQLite timestamps normalized fromUTC). SummaryBand uses145 mismatched POS sales and separately3 open records without a sale. Calendar/By outlet restores Harbor's0% cell and money flags; attention uses exact record evidence, readable bank labels and largest amount first; learning shows actual decisions.
- Fixed inherited mobile ring max-height so160px ring cannot overlap the KPI row, and explicitly set attention header ink colour. No API changes.
- Verification: **222 web tests in38 files pass**.13 landing/Login tests pass; browser landing signed-in/out passes1440/1280/768/390, including text contrast. Overview numerical/date/evidence checks pass1440/390, with no overflow closed/open Kira; final visual corrections recaptured. Backend expanded full suite **237 passed**,2 existing ADK warnings,240.04s.
- DESIGN.md changes for Andrew: factual landing/shared sign-in/client statistics/entry controls; Overview sales-vs-run dates, one POS mismatch denominator, separate orphan count, calendar/outlet history and compact attention/learning content.
- Phase4 commit `6268e64` pushed. Merged:no. No deployment.

## 2026-11-07 15:15 WIB — Phase 6 workflow

- Unified step headings and final completed check, one page Refresh, contextual tutorial/guided entry, human conversion columns and skipped empty ledger rows. Cleaning standard aliases move into accessible tooltips; saved rules initially collapse and internal IDs become optional columns.
- Matching adds rule-hit strip, precise unmatched/batch sentences, overflow edit/reorder/delete controls, confirmation, responsive Glossary, contextual Why question, Results SummaryBand and combined table. Exports use the full selected scope and captured client; bank amounts appear once per page payout, with continuation links.
- Fixed existing sample endpoint's missing bundle path: exact demo clients only, validated days1–8/three sources, ordinary duplicate/audit/cache behavior, atomic failures. API response unchanged; documented range/guards. POST samples tests never change scratch data.
- Verification: **239 web tests in40 files pass**; 40 root behavior tests, 11 combined-table/export tests, and matching integration tests pass. **59 backend focused tests** include27 new sample cases plus reset/file regressions. Combined evidence browser passes1440/390 on8.787 records and real statement references/pays92. Workflow1–3 browser passes1440/390 with zero writes/errors/overflow; final all-step capture follows.
- DESIGN.md changes for Andrew: step headers/footer/completion, useful conversion fields, alias tooltips/optional IDs, saved-rule collapse, matching rule/results/glossary pattern, contextual draft and combined credit evidence.
- Phase5 commit `3e25a20` pushed. Merged:no. No deployment.
- Final Phase6 production build passes. All4 workflow steps pass browser checks at1440/390, including finalcheck, oneRefresh, accurate69batches, responsive Glossary, lazy8.787-rowcombinedtable, Whyquestiondraft, no APIwrites/errors. Normal/reduced motion catalogue rerun passes. Screenshots `docs/screens/dev2/workflow-v2/` and `docs/screens/dev2/records/`.

## 2026-11-07 15:42 WIB — Phase 7 Match analysis

- Added six selection metrics, Grid/Table and Linked tables/Chains views, rate-table group bands, money columns and ticked subtotals. Money differences are sorted within To check/Expected groups. Records adds status/search/amount/reason/provider filters, payout grouping and full filtered exports; Chains contains POS sales only.
- Restored explicit bank descriptions and actual linked settlement references, visible LinkChips, totals below both panes, persistent selections on both sides and manual-link reason/Undo controls. Compare uses full payout nett totals, informational dates, existing follow-up values, guarded saves and a contextual Kira draft. Follow-ups remain compact with a sticky bulk action.
- Backend adds optional pos_only/only_differences filters, strict source-index validation for manual links and reference sorting. Literal differences include expected fees/rounding. Default response shapes are preserved. Two legacy sample fixtures were corrected for the approved demo bundle layout.
- Verification: **263 web tests in 46 files passed** before Phase 9/10 tests were introduced. Backend **302 passed**, two existing ADK warnings; an additional side-reference sort test passed afterward (303 collected). Focused compare/manual/cache/table/motion checks pass. Browser Records/Chains and rates/follow-ups pass at 1440/390 with no writes, errors or overflow; full Match-map gate follows after its card-layout correction.
- DESIGN.md changes for Andrew: analysis summary/exploration, grouped rate table, bank evidence, manual linking, compare states, records/chains and follow-up layout. New Insights provider documentation was prepared alongside these additive contracts and will ship with its implementation in Phase 8.
- Phase 6 commit `2d8426b` pushed. Merged: no. No deployment.
