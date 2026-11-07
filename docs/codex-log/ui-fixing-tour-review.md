# Guided tour independent review

- Time: 7 November 2026, 15:18 Asia/Bangkok.
- Task: Diagnose stale local UI without touching another repository's server or client data; independently test and review the guided tour.
- Merged: no. No commits or pushes.

Confirmed the old API on port 8000 belongs to a different repository. The current review frontend uses this workspace's Vite source and the isolated review API; the parent task owns process changes. No environment secrets were read and no live API writes were made.

Added `GuidedTour.test.tsx` and `TourNavigation.test.tsx`. The focused run passed all 16 tests: client-bound routing, timing and pause controls, reduced motion, missing and gated targets, keyboard focus and Escape, restoring the launch control, live step explanations, persistent cursor, positive spotlight geometry after reusing a target, unsaved follow-up cancellation, and preventing tours from aborting an active conversion or matching generation. Unsaved-note and conversion regressions were demonstrated failing before the corresponding fixes.

Reviewed product changes with the web agent. Findings addressed there include screen-reader announcements, hidden ancestor targets, persistent cursor geometry, touch-hover contrast, original scroll restoration, unsaved follow-up confirmation, workflow busy guards, and positioning the phone Convert target above the explanation card.

Mocked Chrome review traversed all 12 steps for both empty and completed workflow fixtures at 1440px and 390px (48 steps). Every spotlight had positive dimensions and overlapped its actual target. Cursor elements persisted; desktop transitions were enabled and reduced-motion phone transitions were disabled. There were no page errors, unexpected requests, horizontal overflow, or API writes. Finish and Escape restored route, query parameters, original scroll and chat focus.

After the final phone positioning change, a focused 390px review passed again, including an explicit assertion that the Convert button remains above the tour card. Review screenshots are in the temporary directory as `kira-tour-{locked|ready}-{1|5|7|11|12}-{1440|390}.png`; the final phone Convert screenshot is `kira-tour-ready-5-390.png`. The temporary review script is `kira-guided-tour-review.cjs`. Parent task owns the final complete suite and production build.

- Follow-up, 15:20: A complete test run alongside a production build exposed the default polling deadline while the App test waited for several immediately mocked read cascades. The navigation fixture now awaits React's asynchronous `act` around initial render and chat opening before asserting readiness. No timeout was increased and no product code changed. The focused 16 tests passed again after this adjustment; the parent will run the complete suite without a concurrent build.
