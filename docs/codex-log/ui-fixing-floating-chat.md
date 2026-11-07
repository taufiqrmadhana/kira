# Floating Kira and UI refresh verification

- Time: 2026-11-07 14:06 +07:00.
- Task: bring `ui_fixing` up to date with dev, simplify landing and sign-in, and make the icon-only Kira popup movable.
- Merged: no. New changes remain on `ui_fixing` for review.

Fast-forwarded `ui_fixing` from 79ecf7a to origin/dev at 9f4cb6e. The incoming change was the deployment log.
Landing and sign-in work is documented in `ui-fixing-landing-simplify.md` and `ui-fixing-sign-in.md`.

The popup launcher now displays only the mascot and an approval count when needed. Its accessible name remains
Ask Kira. Drag either the mascot or the header grip using a mouse, touch or pen. Arrow keys move the focused
control, Shift increases the distance, and Home restores its default position. The whole popup is measured and
kept within the visible viewport, with safe-area padding and sizing that responds to the mobile keyboard.
Movement leaves drafts, history, pending approvals and focus intact. Escape during a header drag releases the
pointer before the header is removed. Embedded chat keeps its existing presentation.

Validation:

- Full web suite: 154 tests passed across 28 files, before the final drag-cancellation regression was added.
- Final focused hook and chat suite: 19 tests passed, including the added regression and viewport sizing.
- Browser chat suite: 4 passed, including real dragging, draft retention, resize, keyboard movement, approvals,
  and phone sign-in errors. Independent Chrome reproduction verified Escape during dragging is fixed.
- Existing browser acceptance script passed sign-in, Overview, rate drill-down, follow-up save/reload/discard,
  failed-save recovery, cross-selection, and desktop/tablet/phone layouts.
- Landing and sign-in were visually inspected at desktop, tablet and phone sizes with reduced motion checked.
- All browser API traffic used explicit fixtures. No demo records or backend behavior were changed.
- Production build and whitespace validation passed. Vite retains the existing advisory about the main bundle
  exceeding 500 kB.

Browser checks now locate the chat textbox by role because the icon-only launcher also has an accessible name.
A OneDrive lock prevented reuse of the old Playwright artifact directory; a fresh ignored output directory was used.
