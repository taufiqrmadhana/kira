# Landing page refresh

- Time: 2026-11-07, 12:36 Asia/Jakarta.
- Task: Build the new landing page on `ui_fixing` from the supplied `sampleui/landingpage.png` reference. Own files: `web/src/pages/landing/Landing.tsx`, `landing.css`, and `Landing.test.tsx`; no App or shared-style edits.
- Merged: no.

Read AGENTS.md, DESIGN.md and the UI checklist, and inspected the supplied screenshot. Implemented a dark forest and lime landing page with the KIRA brand, large headline, four compact workflow steps, authenticated workspace chooser, and enter/sign-in action. Workspace names come only from the clients prop; saved selection is honored only if it is still available. Loading, request errors with retry, signed-out and empty-client states are distinct.

Added a left-to-right rotating statistics strip grounded in `docs/data-guide.md`: 8,784 sales, 98.3% matched end to end, and seven first-close decisions. It explicitly identifies the documented demo and 20–26 October 2026 dates, rather than presenting these as current workspace results. Added pause/play, previous/next, hover/focus pause, and reduced-motion handling. The user explicitly authorized the animation and reference palette for this page.

Tests were written first and failed on the missing component before implementation. Targeted Vitest result: 6 passed, covering saved selection and entering the selected workspace, signed-out behavior, no invented clients, loading/error/retry states, carousel pause behavior, and reduced motion. Root owns App registration, final browser comparison and full-suite/build verification.
