# Daily match grid and Insights verification

Verified on 7 November 2026 using the real seven-day Zestly Demo in an isolated local SQLite copy. No deployment was performed.

Overview and the Match rate tab share the new grid, tooltip, legend, daily data loading and evidence links. Overview supports outlet and month layouts; Match rate uses the compact outlet layout. DESIGN.md defines the stepped colours, grid radius, independent money markers, tooltip surface and collection keyboard behavior.

The `insights` branch is integrated with its model, API, Kira tools, navigation and page. Existing rings, learning bars, the Insights scatter and cleaning details now use the common explanation/evidence language. Tabs, segmented controls, filter groups and tick collections support arrow navigation with roving focus.

## Real demo acceptance

| Evidence | Result |
| --- | --- |
| Outlet layout | 10 outlets × 7 days, 70 populated boxes |
| Harbor Square, 24 Oct | Only red box: 0%, red corner, waiting dot; Rp 9.031.421 to check |
| Garden Mall, 22 Oct | Red corner; Rp 171.000 to check |
| Bay View, 23 Oct | Red corner despite 100% POS matching; Rp 151.000 to check |
| Riverside, 21 Oct | Red corner despite 100% matching; Rp 68.000 to check |
| Lakeside, 26 Oct | No corner; expected fee excluded |
| Grid summary | Four outlet-days with money to check; three above 95% |
| Harbor drilldown | Keyboard Tab → arrows → Enter opens stage 2, filtered to 142 “Not in bank yet” records |
| Other drilldowns | Missing POS sales and sale amount differences open stage 1 |
| Waiting age | Three days, measured against bank evidence dated 27 Oct; latest POS close ring stays on 26 Oct |
| Month layout | Okt 26, days 1–31; 24 empty dates are not focusable |

Overall totals remain 8.784 POS sales, 8.639 end-to-end links, 69 linked bank credits, Rp 10.671.421 to check and Rp 26.361 expected. The grid attributes Rp 9.421.421 to four outlet-days; the separate Rp 1.250.000 unassigned bank credit is not invented as an outlet.

## Validation

- Frontend: `cd web && npm test` — 84 tests across 19 files pass. TypeScript and Vite production build pass.
- Backend: full suite — 196 passed, no skips, two existing ADK experimental warnings. After the final Insights performance refactor, all 38 affected analysis/Insights regressions pass, including the new single-extraction guard; Ruff passes.
- Existing aggregate gaps responses also match the pre-grid implementation across 240 deterministic scope/amount combinations.
- `KIRA_E2E_BASE=http://127.0.0.1:5174 npm run test:day-grid` verifies real data, markers, summary amounts, keyboard drilldown, tooltip bounds, month layout, sticky labels and responsive containment.
- `KIRA_E2E_BASE=http://127.0.0.1:5174 npm run test:insights` verifies ten outlets, complete profiles/anomalies, hover/focus tooltips, keyboard movement, viewport edges, minimum type size and page containment.
- Browser checks and visual review cover 1440, 768 and 390 px. No page overflow, text below 12 px or browser errors. Horizontal scrolling stays inside the grid/chart/table. Cell numbers hide below 680 px.
- Insights now extracts complete gap evidence once per request. Fresh-session demo measurements: outlets 2.536 → 1.134 s; anomalies 2.531 → 1.113 s. Entire responses match before/after.

The local preview uses built assets and the copied demo database; it is not the public deployment. Browser scripts require a locally running API and a frontend proxying `/api`, with the seven-day `zestly-demo` client loaded. Additional full-page and tooltip captures remain in `artifacts/day-grid/screenshots/`.

## Screenshots

- [Daily grid, 1440 px](screens/day-grid-1440.png)
- [Daily grid, 768 px](screens/day-grid-768.png)
- [Daily grid, 390 px](screens/day-grid-390.png)
- [Integrated Insights, 1440 px](screens/day-grid-insights-1440.png)
