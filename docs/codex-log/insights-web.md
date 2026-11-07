# Outlet Insights page

- Time: 2026-11-07, 18:43 Asia/Jakarta.
- Task: Add Outlet Insights in new files only under `web/src/pages/insights/`, ready for Taufiq to register later. No existing app files were edited.
- Merged: no; work is on `insights`.

Wrote page tests first and observed the expected missing-page failure. Added typed endpoint wrappers, URL-based period/outlet/city/region filters, coverage and actual-data dates, four money KPIs, labelled median scatter and quadrant reasons, the shared DataTable sorted by lowest keep rate, anomaly evidence links, skipped-check explanations, audited profile editing via the API, and matching/empty/error/loading states. Updated the new files against the latest dev components after rebase, including DateField and workspace-preserving links.

Validation: `npm test` passed all 32 tests in 10 files, including 6 Insights tests. `npm run build` passed. Browser checks used representative mocked responses because demo data is not installed, with headless Edge at 1280×1000, 820×1180 and 390×844. Checked profile editing/saving and the exact Harbor Square analysis URL. No browser errors, page overflow or dialog overflow. Chart/table scrolling stays inside its own region on phones. Screenshots were reviewed against `docs/screens/21-analysis-filters-simplified.png`; screenshots and browser script remain in the OS temporary directory, and the temporary preview entries were removed.

Anti-slop review: green accent; amber/red only for status; Indonesian numbers; tabular and right-aligned table figures; direct chart labels; minimum readable chart text; no decorative cards, gradients or motion; visible keyboard focus; explicit loading, empty and error handling; responsive filters, KPIs and modal. Taufiq's route and navigation registration are intentionally left to integration.
