# Match map and floating Kira

Verified on 7 November 2026 against the real Zestly Demo. The Match map now uses the available page width and leads with the money comparison. References, statuses and amounts are visible by default; every imported source field remains available in Columns. Hovering or focusing a reference opens the shared evidence tooltip.

Harbor Square on 24 October shows 142 settlements and Rp 9.031.421 without a linked bank credit. Its bank panel explains the missing evidence and opens the follow-up list with the same outlet, dates and reason. Empty tables no longer show a redundant Rp 0 aggregate footer. Secondary KPIs and filter spacing are compact, and date editors open only after Pick dates.

Kira starts minimized on every signed-in screen. Its persistent launcher opens a viewport-contained nonmodal popup without resizing the page. Minimizing preserves drafts, messages, running requests and pending approvals. Escape restores focus to the launcher; touch opening focuses the heading without raising the keyboard. No approval or workflow behavior changed.

The screenshot reported as the old design already contained the new Insights navigation. The problem was the Match map composition and reserved chat column. Separately, confirmed cache/bookmark edge cases were fixed: direct HTML requests now revalidate, and legacy hash bookmarks retain workspace/filter parameters.

## Checks

- 98 frontend tests and six chat protocol tests pass; TypeScript and Vite production build pass.
- Real API browser checks cover 1440, 768 and 390 px, plus a 390 × 600 popup. No page overflow, visible text below 12 px or chat-induced layout shift. Draft retention, Escape/focus return and meaningful default columns verified.
- Demo data is read without reloading or rematching. The daily grid and integrated Insights remain part of the app.

## Screenshots

- [Match map, 1440 px](screens/match-map-1440.png)
- [Match map, 768 px](screens/match-map-768.png)
- [Match map, 390 px](screens/match-map-390.png)
- [Floating Kira, desktop](screens/floating-kira-1440.png)
- [Floating Kira, phone](screens/floating-kira-390.png)

Public release verification is recorded after deployment below.
