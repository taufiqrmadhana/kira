# Simplify the landing page

- Time: 2026-11-07, 14:00 Asia/Jakarta.
- Task: Remove the landing workspace chooser, rotating statistics and extra explanatory blocks; center the page around one action and a short visual flow.
- Merged: no; changes are on `ui_fixing`, with no commits or pushes by this task.

Changed only `Landing.tsx`, `landing.css` and `Landing.test.tsx`. The forest/lime page now has the existing headline, a short plain-language description, one primary action, and a code-native illustration for Upload files → Kira checks → See results. Removed the four feature cards, chooser, demo figures, automatic carousel and footer badges. Entrance animation runs once; hover motion is brief and reduced-motion preferences disable animation and transitions.

CTA labels are `Get started` when signed out and `Open overview` when signed in. Existing props are unchanged. The page selects a valid saved `kira-client` behind the scenes, otherwise the first real returned client. Loading, request errors and empty client lists block entry; failures expose retry and empty accounts retain a truthful error. An explicitly saved empty-string client ID remains valid.

Tests first: all seven revised checks failed against the old page, then all seven passed after implementation. They cover the minimal public flow, no chooser/statistics or interval timer, saved/default/fallback clients, asynchronous loading, stale-list errors/retry, and no invented workspace.

Mocked browser review passed in headless Edge at 1440 x 1000, 820 x 1180 and 390 x 844. Visually inspected screenshots at all three sizes: centered hierarchy, three-step flow and CTA fit within each viewport without horizontal overflow. Verified animations finish after the one-time entrance, reduced-motion mode removes them, Get started opens sign-in, and Open overview keeps the saved demo client in its URL. No browser errors occurred. All API requests were intercepted and were GET; no live API writes were made. Screenshots are in the OS temp directory as `kira-landing-simple-{desktop,tablet,phone}.png`.
