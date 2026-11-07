# Mascot chat and review follow-up

- Time: 2026-11-07, Asia/Bangkok. Task: add the requested pet mascot popup while retaining Kira's chat and approval behavior. Merged: no. All work remains uncommitted at the user's request.
- Added a local vector green cat with a leaf tuft; no image request or external animation library. The labelled Ask Kira launcher opens a non-modal popup, leaving the workflow at full width. The original embedded presentation remains available to other integrations.
- Keyboard behavior: named dialog, expanded/controls relationship, Escape dismissal, focus returned to the launcher, typed drafts retained. Pending changes still require the existing explicit approval action. Opening or dismissing chat does not submit a write.
- Review fix: focus enters the popup immediately, so Escape also works while history is still loading. A deferred-history regression reproduced the previous focus failure before the fix.
- Motion: small tail/leaf response to hover or focus, and leaf movement while an action runs; reduced motion disables these effects. The closed launcher has space below page actions so it does not cover the workflow's footer buttons.
- Tests first: the new popup interaction test failed before implementation. Focused tests cover opening/dismissal, draft preservation, embedded presentation, and approval preservation across closing/reopening.
- Final validation: all five chat tests and eight app integration tests passed after the immediate-focus fix. Production build passed.
- Browser: Edge with all API requests intercepted at 1440, 820, and 390 pixels. Verified opening, sending a fixture question, closing with Escape, focus return, viewport bounds, no page overflow, reduced motion, and no overlap with footer actions. No browser errors or live API writes. Screenshots are `%TEMP%/kira-mascot-{closed,open}-{1440,820,390}.png`.
- Loading diagnosis: see `ui-load-performance.md` for measured local request/development overhead and the separate external font request. The measurements do not support attributing the delay entirely to Wi-Fi.
