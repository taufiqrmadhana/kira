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
- [x] 3 — shared components and motion catalogue
- [x] 4 — sidebar, topbar, reset and share links
- [x] 5 — landing and Overview
- [x] 6 — workflow
- [x] 7 — Match analysis
- [x] 8 — Insights
- [x] 9 — guided close and agent tools
- [x] 10 — tutorials
- [x] 11 — responsive, accessibility and end-to-end verification

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
## 7 November 2026, 15:40 WIB — Phase 8 Insights
- Rebuilt the scatter with zero sales origin, observed minimum minus 0.5pp through 100% keep-rate domain, labelled dashed medians, three true quadrant labels, no leader-line fan, consistent amber quadrant encoding and an explicit summary. Real Bay View keep rate 100.2% retains its actual value with a 100%-boundary arrow and explanatory copy.
- Added container-responsive phone chart with explicit compact axis units, persistent hover/focus evidence, roving keyboard navigation, and no page overflow. Shared period chips plus provider/city/region filters; flagged outlet filters this page. Four monetary KPI cards, compact pinned-outlet table with RateCells, anomalies table/evidence and contextual Ask Kira drafts, sentence-case profile action, tutorial targets.
- Tests first: initial six new/changed behavior checks failed; final focused web Insights/Scatter 14 passed. Read-only Playwright checks run 1440/768/390, including tooltip bounds, genuine values, filtering, table actions, chat draft, profile cancel and blocked write guard. Screenshots in docs/screens/dev2/insights-{header,scatter,tooltip,outlets,anomalies}-WIDTH.png. Existing npm test:insights now invokes the current acceptance script.
- Provider API implementation and financial scope tests handled by cache agent. Dataviz/build-web-data-visualization skill unavailable after local/tool discovery, already documented by parent; exact requested chart rules and DESIGN.md applied without claiming skill use. Web-design-guidelines fetched fresh and reviewed; fixed profile field names/autocomplete and chart narrow-screen visibility. No remaining new-file findings. Sentence-case rule follows this task/DESIGN over guideline title case.
- DESIGN.md updated with the chart domain, above-ceiling truthfulness, median/direct-label rules, responsive units and Insights table/actions.
- Merged: no. Scratch database only; no deployment.

- Phase 7 final TypeScript/build gate passes. Match-map browser checks pass 1440/1280/768/390 and short viewport, including readable KPIs, dock/sheet, draft retention and Escape focus. Commit `5b86f18` pushed. The Insights DESIGN entry was included in that documentation commit; its implementation is in Phase 8.

## 2026-11-07 15:50 WIB — Phase 10 read-only tutorials

- Added the tour engine, target observer, eleven chapter definitions (78 real steps), spotlight/cursor/bubble, chapter menu, first-visit hint, persistent preferences, presentation mode, clicker keys, timing and reduced-motion behavior. Page-header and chat how-to entry points share the engine; locked stages explain their prerequisites.
- Tutorial questions use the current chat session and exact step context, pause playback and append exchanges without opening the dock. Context broadcasts and replay keep free chat read-only when mounted mid-tour. Approval handoff stops the tour; the server guard is covered by the Phase 9 backend tests. Compare-modal focus permits the tutorial question field without removing the normal modal trap.
- Target checks exposed missing stage rings in Workflow Results; restored both from actual saved stage totals and added a regression test. Cold destinations now await shared page data before the two-second target lookup. No production data was changed.
- Tests first: **11 tour tests + 9 overlay tests pass**, including next/back, skip lookup, locked prerequisites, autoplay timing, keyboard controls, question pause and context replay. The **12 Step4 tests** also pass. TypeScript and the frozen production build pass.
- `check-tutorial.cjs` passes all **78 steps / 11 chapters with zero skips** on the original seven-day demo, one stubbed question, no API writes or console/browser errors, and a mocked empty-workspace locked chapter. Captures cover chapters 1, 2 and 8 at 1440 and a 390 px bubble. All non-read API requests are blocked by the browser guard. Frozen output is isolated at `/tmp/kira-dev2/tour-dist`; screenshots are in `docs/screens/dev2/tutorial/`.
- DESIGN.md documents target timing, read-only boundaries, cursor/spotlight, viewport placement, accessibility, question/approval behavior and preferences. Merged: no; parent coordinates commit and push. No deployment.

## 2026-11-07 15:52 WIB — Phase 9 guided close and chat

- Added a deterministic ten-step close, real-state prerequisite checks, per-client pause/resume, explicit action buttons, Follow along navigation, collapsed completion history and context-aware questions. FileSlots accept supported files/folders only after a request, retain paths, report actual bytes, separate equal filenames from different folders and retry failed uploads without replaying completed picks.
- Inline upload decisions preserve aliases and required sources; cleaning retains prior rejection decisions and supports per-item choices. Matching reuses or explicitly saves/tests/runs rules. Results show a compact SummaryBand and the largest grouped money issues, with explicit export and follow-up drafting. Minimize preserves running work and approvals.
- Chat context includes URL scope, selected references, guided/tutorial step and readable dates. Suggestions are English and derive numbers from cached data. How-to questions launch read-only chapters. Tour answers append to the same history; active tutorial context stays read-only through ordinary chat and confirmation.
- Added agent tools start_tour, start_guided_close, request_files, approved export_results and approved add_sample_files. All eight change tools enforce approval and tutorial guards. Guided actions use X-Kira-Origin and audit as “via Kira, approved by <user>”. Explicit CSV exports audit transactionally; client IDs, including the default empty ID, remain pinned. Existing endpoint shapes remain compatible; optional confirmation context is documented.
- Acceptance: the real scratch latihan day-8 close used only chat buttons/FileSlots for all nine writes. Exactly two decisions appeared (POS upload v2 and settlement outlet spelling). Final POS **9,982**, fully matched **9,837**, stage 1 **9,979**, stage 2 **9,839**, linked credits **79**; day-8-only POS/matched **1,198**, unexplained **Rp 0**, expected rounding **Rp 2,169**. Learning questions are **[7,2]**. All ten steps captured at1440/deviceScale2 and390; full evidence in guided-close/acceptance.json. Independent read-only totals/audit recheck agrees.
- Verification: 25 root chat/engine/intake/context tests passed; 27 focused guided UI/repair tests passed, with further wrong-area/focus cases added. Backend final full suite **368 passed**, two existing ADK warnings. Export/audit additions passed62 focused checks; independent approval/client/transaction review found no blocker. Final whole-web/build gates follow in Phase11.
- DESIGN.md changes for Andrew: contextual conversation, deterministic step cards/intake/decisions/results and motion. Tour definitions are included as a shared dependency of chat how-to routing; provider and presentation ship in Phase10. Phase8 commit 737a3c1 pushed. Merged:no. No deployment.


## 2026-11-07 16:20 WIB — Phase 11 final verification

- Closed the deferred Phase 3 motion checks with the completed compare, dock, guided-close and tutorial features. Final workflow motion browser check passes both normal and reduced motion; confirmed values and progress text remain available. All requested functional phases are implemented.
- Final whole-source backend gate: **368 passed**, two existing Google ADK experimental-feature warnings, 295.82 seconds. Final whole-web gate: **308 passed in 55 files**, 73.33 seconds. After that run, the final Step4 action-hierarchy suite passes **15/15**, including three new cases for the first stage, second stage and completed flow. Production TypeScript/build passes; core, day-grid, Insights, Match map, loading, tutorial and real guided-close acceptance checks pass.
- Updated the day-grid acceptance script for the implemented Grid/Table control, Overview month calendar and anomalies table; it still proves Harbor's 142-record drilldown and all four money flags. Browser scripts now keep screenshots in `docs/screens/dev2/`.
- Added a failing-first regression for agent evidence navigation losing the exact client bookmark. Workflow, follow-up and highlighted-record navigation now retain the selected client in the URL.
- Final rendered accessibility review covers **56 view/size combinations** at 1440, 1280, 768 and 390. Zero horizontal page overflow, visible content below 12 px, computed text-contrast findings, unnamed controls, positive tabindex, JavaScript errors or attempted writes. Arrow/Home tab navigation and visible entry focus pass at all four widths. Read-only review includes completed guided Results, Records and Chains. Fixed Clean metadata contrast, 11 px analysis captions, shared keyboard/composer focus and completed matching action hierarchy. This is a targeted rendered/code review, not a WCAG certification; gradients and disabled-control contrast are excluded from the script.
- Final production loading: **48/48 pass**, 137–798 ms readiness, maximum CLS **0.02423**, zero completed duplicate requests, preview flashes, errors or page overflow. Step4's loading-height and pre-paint Glossary fix reduces its isolated CLS below 0.0007 at all four widths. The first cold/concurrent measurements are preserved separately rather than overwritten.
- Fresh final screenshots wait for confirmed values, use reduced motion and dismiss the previously seen tutorial hint. Main desktop captures use 1440 px at deviceScaleFactor 2; phone captures use 390 px. Visual review includes the supplied screenshot references, Overview, all analysis/workflow views, guided Results and tutorial; no old prototype source was opened.
- Reviewed the changed screens against docs/11's anti-slop checklist and the fetched web-design-guidelines. The task's sentence-case and specified dock/spotlight motion rules take precedence over conflicting generic rules. Impeccable and the named dataviz skill remain unavailable; no review by those tools is claimed.
- Merged: **no**. Deployment: **none**. All acceptance writes were confined to the scratch latihan client. The original seven-day demo remains intact.

## Final report

### Changes, commits and verification by phase

Counts below describe the actual gate at that phase; focused suites overlap full-suite counts and must not be added together.

| Phase | Delivered | Commit | Verification |
| --- | --- | --- | --- |
| 0 | Baseline tests, readiness instrumentation, screenshots and request/CLS report | `88ff50d` | 205 backend; 135 web; 18 browser measurements |
| 1 | Client/run cache, React Query, targeted invalidation, skeletons, local fonts, code splitting | `bd6124a` | 225 backend after final cache extension; 147 web; 18/18 loading |
| 2 | Remove preview/nested package, consolidate styles, restore evidence and persistent Kira | `12b6e1f` | 161 web; 15 restoration regressions; 27 layout views plus shell/map checks |
| 3 | Shared components, overlays and full purposeful-motion catalogue | `f873378` | 200 web cases verified (199 full + corrected column test); component gallery, 8 overlay cases; final normal/reduced motion passes |
| 4 | Client/account menus, shell launcher/dock, copy links, backed-up demo reset | `6268e64` | 12 reset + 20 cache/workflow backend; 35 focused web; four-width shell/map |
| 5 | Factual landing, sales/run dates, consistent POS denominator, outlet grid and attention | `3e25a20` | 237 backend; 222 web; landing four widths, Overview desktop/phone |
| 6 | Consistent workflow, useful previews, rule actions, glossary, results and combined evidence | `2d8426b` | 239 web; 59 focused backend including 27 sample cases; four workflow steps desktop/phone |
| 7 | Rate table, money gaps, Records, Chains, compare, manual links/Undo and follow-ups | `5b86f18` | 302 backend plus added sorting regression; 263 web; analysis and four-width map browser checks |
| 8 | Honest responsive scatter, provider scope, monetary KPIs, outlet/anomaly evidence | `737a3c1` | 30 focused backend; 14 focused web; Insights at 1440/768/390 |
| 9 | Ten-step guided close, FileSlots, contextual chat, approval/audit-safe tools | `8421083` | Final backend 368; focused guide/chat/intake suites; real ten-step day-8 chat-only close |
| 10 | Eleven read-only tutorials, question bubble, playback, keyboard and presentation settings | `4f75deb` | 11 tour + 9 overlay + 12 Step4 tests; 78/78 real steps, zero skips/writes/errors |
| 11 | Final accessibility, responsive, motion, performance, navigation and acceptance review | Final validation commit containing this report | 308 full web + final 15/15 Step4 focused suite; build passes; 368 backend; 56 rendered views; 48/48 loading |

Phase 1 includes the first evidence restoration; Phase 7 includes the Insights design documentation; Phase 9 includes shared tour definitions. Their remaining implementation and checks are in the named feature commits. No phase was merged to dev or main.

### Loading before and final

Production preview, warm scratch backend, fresh browser/query cache per page. Desktop is 1440 px. These are local measurements, not production latency guarantees.

| Page | Before desktop ms | Final desktop ms | Final 390 px ms |
| --- | ---: | ---: | ---: |
| Overview | 911 | 190 | 454 |
| Upload | 1851 | 218 | 776 |
| Convert | 1048 | 184 | 142 |
| Clean | 1449 | 447 | 351 |
| Run matching | 1513 | 191 | 169 |
| Match rate grid | 5463 | 426 | 411 |
| Match map | 7760 | 647 | 553 |
| Follow-up | 4652 | 384 | 367 |
| Insights | 5176 | 182 | 190 |
| New rate table | — | 408 | 398 |
| New Records | — | 422 | 420 |
| New Chains | — | 374 | 409 |

API before values are medians of completed desktop baseline browser requests; their scopes and concurrent workloads differ from the final quiet warm benchmark. Final values are five complete-response HTTP samples after two warm-up rounds, with exactly 56 access-log requests and no other traffic during measurement.

| Endpoint | Baseline browser median ms | Final warm median ms | Final warm maximum ms |
| --- | ---: | ---: | ---: |
| /overview | 732 | 3.392 | 3.921 |
| /analysis/summary | 3975 | 4.219 | 6.309 |
| /analysis/rates | 3918 | 6.265 | 6.640 |
| /analysis/gaps | 4484 | 3.350 | 3.614 |
| /analysis/side/l2/bank | 5077 | 6.103 | 6.438 |
| /analysis/follow-ups | 3255 | 15.445 | 15.702 |
| /performance/outlets | 3364 | 3.726 | 3.753 |
| /performance/anomalies | 4513 | 3.104 | 3.353 |

All eight warm endpoints meet 150 ms. The earlier concurrent capture reached 892 ms and remains in `api-timings-concurrent.json`. `loading-final-cold.json` preserves the cold/concurrent page sample that exposed Step4 layout shift and slow initial requests; `loading-final.json` is the final controlled warm gate. Initial entry JS was 519.42 kB; the final entry is 165.55 kB with a separate 223.24 kB React runtime. Combined initial JavaScript exceeds 250 kB; the entry chunk meets the requested limit.

### Every DESIGN.md change for Andrew

1. **Type:** self-hosted variable DM Sans/Manrope, swap and preload; minimum 12 px content retained and enforced.
2. **Motion:** shared duration/easing tokens and all 15 requested interactions; real byte/count progress, cancellable animation and reduced-motion equivalents. Removed the obsolete floating-popup placement rule while retaining mascot interaction limits and conversation state.
3. **Loading/data refresh:** shaped delayed skeletons, retained data, accessible updating state, normalized client/query scope, prefetch and route splitting. Final Step4 height and pre-paint Glossary prevent viewport movement.
4. **Stylesheet ownership:** tokens/base/components split, screen styles share tokens, obsolete preview and nested chat build removed.
5. **Match map evidence:** readable references/amounts, 44 px evidence rows, source-field picker, tooltip, payment comparison, missing-bank explanation and narrow-screen ordering.
6. **Shared components:** PageHeader, SummaryBand/fitted rings, KpiCard, DataTable densities/groups/pinning/aggregates, RateCell, StatusChip, LinkChip, Tabs/Segmented/ToggleChip/Switch/IconTile, portal overlays/toasts and centralized count grammar.
7. **Workspace shell:** 224 px sidebar, client statistics/menu, distinct icons, pending badge, 64 px topbar, Tutorial/reset/account, exact Copy link, sidebar/topbar launcher, 400 px desktop dock, smaller bounded sheet and reset conversation cleanup.
8. **Landing/Overview:** factual copy and shared sign-in, actual client statistics and guided/tutorial entry, controlled carousel/entry motion, separate sales/run dates, POS mismatch/orphan distinction, calendar/outlet history, sorted evidence attention and actual learning bars.
9. **Workflow:** consistent step/header/footer/completion, human conversion columns, alias tooltips/optional IDs, saved-rule collapse, rule-hit/action strip, glossary, contextual question, Results SummaryBand and combined table with bank amounts counted once.
10. **Insights:** selected provider/date/location scope, zero sales origin and capped keep-rate domain, truthful above-100% boundary marker, medians/true quadrant labels, responsive units, accessible tooltip/roving focus, pinned outlet table and anomaly evidence/actions.
11. **Analysis exploration:** six summary metrics, grouped rate table/subtotals, sorted money groups, correct bank and settlement references, sticky tick-and-tie, explicit manual links/Undo, compare field states/unsaved guard/context draft, Records/Chains scope and compact follow-ups.
12. **Tutorials:** real data-tour anchors, target loading/lookup, read-only boundaries, cursor/spotlight/bubble geometry, viewport placement, question/history behavior, approval handoff, keyboard/autoplay/presentation, locked prerequisites and stored preferences.
13. **Guided close/chat:** complete screen context, preserved conversation, deterministic ten-step prerequisites/resume, explicit FileSlots/decisions, wrong-area choices, compact completion history/results, approval origin, focus and motion.
14. **Final accessibility/action hierarchy:** dark-green keyboard/composer focus separate from tutorial lime; shared readable muted captions; one enabled primary action, with completed matching reruns secondary and Next primary.

### HTTP contracts and Kira tools

- Added implementation of **POST /api/reset**, exact-demo typed confirmation, verified SQLite backup and transactional deletion. Its previously documented response is unchanged; the new required confirmation request is documented at the end of docs/02.
- Existing sample endpoint now resolves the checked-in day 1–8 bundles safely for exact demo clients. Existing records/export gain optional `pos_only` and `only_differences`; manual-link source indices are strict integers. Existing Insights endpoints gain optional provider scope. Defaults preserve response shapes.
- Existing chat confirmation adds optional context for the persisted tutorial guard. Guided writes identify approval origin; explicit matching/analysis CSV requests commit their export audit before returning. No additional matching-job or download endpoint was introduced.
- Five new tools in docs/04: **start_tour, start_guided_close, request_files, export_results, add_sample_files**. The first three return read-only UI directives. Export/sample tools require approval. All eight change tools enforce approval and the persisted tutorial guard; export directives pin the client and validated scope.

### Acceptance evidence and remaining limits

- The real latihan close uploaded day 8 only through chat FileSlots/buttons and completed all ten steps. Nine writes all have guided approval origin. Exactly two new learning decisions: POS format v2 and settlement outlet spelling. Final POS **9,982**, matched **9,837**; stage 1 **9,979/9,982**, stage 2 **9,839/9,981**; **79** linked bank credits. Day-8-only POS/matched **1,198**, unexplained **Rp 0**, expected rounding **Rp 2,169**. Learning counts **[7, 2]**. The original demo remains at 8,784 POS / 8,639 matched.
- All **78 steps in 11 tutorial chapters** passed without skips, data writes or browser errors. Locked prerequisites and an ask-in-bubble exchange are covered. The question response used a fixture; backend orchestration uses scripted real ADK model tests. **A live external model-provider conversation was not verified.**
- Impeccable critique/audit and the named dataviz skill were unavailable after discovery. Their execution is the only requested named-skill review skipped; DESIGN.md, supplied screenshots, docs/11 and fetched web-design-guidelines were used. No generic skill result or formal accessibility certification is claimed.
- No deployment, live database change, merge or destructive reset was performed. Reset/Undo/error behavior is verified in isolated tests; the real day-8 acceptance remains available for review in scratch data.

Screenshots: `docs/screens/dev2-before/`; final pages in `docs/screens/dev2/*-1440.png` and `*-390.png`; additional four-width captures; `components/`, `workflow-v2/`, `records/`, `match-map/`, `day-grid/`, `guided-close/` and `tutorial/`. Guided decisions and read-only numerical/audit evidence: `docs/screens/dev2/guided-close/acceptance.json`. Timing/accessibility evidence: `loading-before.json`, `loading-final.json`, `loading-final-cold.json`, `api-timings-final.json`, `api-timings-concurrent.json`, `step4-cls-after.json`, `accessibility-final.json` in this directory.

Final closure: Step4 action hierarchy tested first (two red cases), then **15/15 passed**. TypeScript and production build pass (entry **165.55 kB**, separate runtime **223.24 kB**). Four-width production recapture confirms only Next: Match analysis is enabled primary after completion; all 56 accessibility entries remain clean. Phase 3 and Phase 11 are complete. Final commit contains this report and verification artifacts; merged: no.
