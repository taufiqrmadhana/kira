# Local demo refresh, guided tour and OpenAI integration

- Time: 2026-11-07 15:10 Asia/Jakarta.
- Task: Restart the local UI with the latest Client selection controls, prepare GPT-6.1 Terra for a user-supplied OpenAI key, and add a guided end-to-end workflow tutorial inside Kira.
- Committed, pushed or merged: no. Work remains uncommitted on `ui_fixing`, preserving the preceding UI changes.

The local-server investigation found multiple frontends. Ports 5173 and 5175 were launched with `5175` as a positional Vite root and used the standard proxy to port 8000; that backend belongs to the separate `tes_kriuk` checkout. The working UI preview used 5178 and this checkout's isolated demo backend on 8002. Only the identified KIRA frontend processes were stopped. The unrelated port-8000 server was left running.

The refreshed local frontend serves this repository on both `http://127.0.0.1:5173/` and `http://127.0.0.1:5178/`, with port 5175 redirecting old bookmarks to 5173. Both active ports proxy to 8002. A OneDrive lock on `web/node_modules/.vite/deps` prevented the first restart; per-port Vite caches in the OS temporary directory resolved it without deleting the existing cache. A read-only browser check verified Client selection and Add client on all three entry ports, with no browser errors or API writes.

Restarted the owned demo backend on 8002 after verifying its command line. It still uses the same isolated `insights-demo.db`; the launcher now honors model, provider key and `KIRA_AI` settings from `backend/.env` instead of forcing AI off. Startup succeeded and `/api/me` through 5173 returned HTTP 200. The effective configuration was checked without printing any secret: model `openai/gpt-6.1-terra`, AI enabled, OpenAI key not yet configured. No demo files, rules, matching results or clients were changed.

OpenAI configuration and its mocked HTTP/ADK approval checks are recorded in the provider task log and `docs/04-kira-agent.md`. The real `.env` was not edited, no dependencies were upgraded and no paid API request was made. Live account access remains unverified until the user supplies a key. Add these settings to `backend/.env` and restart the backend:

```dotenv
OPENAI_API_KEY=
KIRA_MODEL=openai/gpt-6.1-terra
KIRA_AI=on
```

The tour starts from Take a tour in the Kira popup, works without model access, and explains client selection, all three upload areas, conversion/upload rules, cleaning, both matching stages, results/export and Match analysis. It navigates and scrolls to real controls, with a moving guide cursor and spotlight. Locked stages keep their existing gates and receive an explanation. Previous/Next, Pause/Resume, Finish/Exit and Escape are supported; reduced motion starts paused. The original route, query, hash, scroll position, chat draft and navigation state are restored. The tour never invokes upload, save, generate or other data-changing actions. Detailed UI validation is in `ui-fixing-guided-tour.md`.

Validation at integration: full backend suite 214 passed, 19 skipped; Ruff lint and format clean. Full web suite 31 files, 197 tests passed. The first production build passed. Visual review then corrected spotlight reset and touch-hover contrast; final focused/browser/build results are recorded below.

Final review added two protections before a tour may navigate: the existing Follow-up discard confirmation is respected, and active conversion/matching requests veto launch with an explanation in chat. Regressions verify that cancel preserves an unsaved note and that tour requests leave both stream signals un-aborted. The tour's phone scrolling now puts the Convert heading and action above its explanation card.

Browser review passed all 48 steps across ready/locked workflows and desktop/phone sizes, including positive spotlight dimensions overlapping real targets, persistent cursor movement, reduced motion, no overflow, route/query/scroll/focus restoration and zero API writes. A targeted final phone capture also verifies that Convert remains above the tutorial card. The live local browser check, with only GET requests allowed, verified tour launch without a model key and Escape returning to Workflow, plus the Client selection and Add client controls on every local entry port.

The final suite exposed test-readiness races under concurrent build load: initial App tests awaited an element before all mocked startup reads settled, and two sign-in tests asserted focus before passive effects ran. Tests now await React's mocked-read cascade and the actual focus condition, respectively. No assertion was removed or timeout increased. All 16 focused tour/navigation checks pass; final full-suite results follow.

Final full web suite after those fixes: **32 files, 203 tests passed** in 77.83 seconds. Backend remains **214 passed, 19 skipped**. The concluding `npm run build` passed after the final test changes, with the existing Vite large-chunk advisory only (550.94 kB JavaScript, 165.92 kB gzip). `git diff --check` is clean apart from informational CRLF conversion warnings. The local frontend returned HTTP 200 on the final check. Everything remains uncommitted on `ui_fixing`.
