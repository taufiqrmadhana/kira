# UI fixing: landing and Overview

- Time: 2026-11-07, Asia/Bangkok.
- Task: Created `ui_fixing` from current `origin/dev` and followed the user's `../sampleui/landingpage.png` and `../sampleui/overview tab.png` references. Added a dark forest/lime public landing page with workspace selection and a controlled statistics carousel. Statistics explicitly use documented example results, not invented automation savings or live client totals. Added the monthly Overview calendar with real daily match rates, month navigation, evidence links, and a prominent Workflow button.
- Integration: `/` is the landing page; `/overview` is the workspace overview. Identity checks keep the public landing available for signed-out visitors. Enter workspace preserves its selected client; the sidebar Overview link and page-not-found return link use the new route. Added explicit workspace loading/error/retry states and fixed saved-client selection when the list arrives asynchronously. Existing login and workflow behavior remain covered by integration tests.
- Validation: `npm test`: 99 passed across 21 test files, including seven landing tests, six calendar tests, and six app integration tests. `npm run build`: passed TypeScript and Vite; Vite reports a non-blocking 503 kB main-chunk size warning. `git diff --check`: passed.
- Browser: headless Edge at 1440×1000, 820×1180, and 390×844. Verified autoplay, pause, reduced-motion behavior, signed-out landing to login, landing to selected workspace, and Overview to Workflow. Reviewed screenshots against both references. No browser errors or page overflow; summary adapts to the available content width with the assistant open. Final checks used the current backend with 13,995 orders over 17–26 October. Runtime scripts, SQLite, and screenshots are in the OS temporary directory; no demo data is committed.
- Local preview: `http://127.0.0.1:5178/`, with a temporary Vite proxy to the isolated current backend on port 8002. The repository's normal proxy configuration is unchanged. The earlier port-8000 service remains untouched.
- Merged: no; work stays on `ui_fixing`.

## Workflow and local loading follow-up

- Time: 2026-11-07, Asia/Bangkok. Task: follow the supplied Workflow 01, Workflow 02 and upload-rule references. Merged: no.
- Upload now uses three bordered file areas, folder groups, compact file actions and an aligned footer. Convert shows an indeterminate scan during the real request, followed by returned column samples or parsed rows and separate POS, Settlement and Mutation upload-rule decisions. Reduced motion, existing field mappings and file operations are preserved. Category-specific details and screenshots are recorded in the upload and conversion task logs.
- Updated the shared step bar and kept the bookmarked workspace when navigating steps or opening analysis. Kira starts collapsed behind its existing Ask Kira button so the workflow has the reference's full content width; chat history is fetched when opened.
- Removed the duplicate Overview fetch and reused the shell's status response on Match analysis. Added integration regressions for request counts and workspace navigation. The backend read optimization and measured component timings are documented in `ui-load-performance.md`.
- Final combined verification: 111 web tests passed across 23 files; production build passed (511.65 kB main bundle, with Vite's non-blocking 500 kB advisory). Backend suite: 182 passed, 19 skipped. The development API on port 8002 was restarted with the optimized source; the preview remains at `http://127.0.0.1:5178/`.
- Browser workflow checks use intercepted API fixtures to exercise pending requests and rule decisions without changing the user's local demo data. Original CSV files and all runtime/screenshot artifacts stay outside the repository.

## Saved rules, clean tables, and mascot

- Time: 2026-11-07, Asia/Bangkok. Task: follow the user's additional saved-rule, data-standard, and spreadsheet references, add the mascot popup, and check whether loading delays were caused by Wi-Fi. Committed, pushed, merged: no, per the user's explicit instruction.
- Step 2 now collapses saved rules into summaries with read-only disclosures. Step 3 has a visible data-standard panel, source tabs with counts, typed sticky headers, 50-row server paging, and yellow fills only for cells changed by cleaning. Original values remain available with the before-cleaning toggle and per-cell evidence.
- Kira now opens from a local vector pet mascot into a non-modal popup; draft and approval behavior are covered by focused tests. See the mascot and clean-table task logs for details and browser checks.
- Combined verification: 128 web tests passed across 25 files. Final review then added a pending-history keyboard regression; all 13 chat and app integration checks passed after its fix. Browser checks verified the final yellow fill on alternating rows. The final TypeScript and Vite production build passed (518.33 kB main chunk, retaining Vite's advisory over 500 kB). The prior backend validation remains 182 passed, 19 skipped, with no new backend source changes in this follow-up.
- Read-only timing checks show local workflow requests at 1.2–1.4 seconds and an external Google Fonts stylesheet at 319 ms on a fresh browser load. Localhost processing does not traverse Wi-Fi; the observations do not support blaming Wi-Fi alone. Endpoint comparison limitations and measured development reload times are recorded in `ui-load-performance.md`.

## Authorized dev integration

- The user subsequently requested integrating and pushing to `dev`, retaining our UI versions. See `ui-fixing-integration.md` for the exact frontend snapshot, retained backend work, and final verification. This authorization replaces the earlier no-commit instruction recorded above.
