# Available-work integration, 7 November 2026

Integrated source revisions:

| Owner | Branch | Revision |
| --- | --- | --- |
| Taufiq | taufiq | 7eb2a0c |
| Andrew | andrew | 321a5f3 |
| Rifat | feature/mhmmdrifat | 34c2af5 |
| Nurwan | fitur/nurwan | 014b85d |

The combined build is assembled in `web/src/App.tsx`. It uses Andrew's shell, shared components, populated Overview and basic analysis; Nurwan's Step 4 and backend; Rifat's upload/conversion/cleaning backend; and Taufiq's sign-in, client registry, Kira panel and deployment. Authentication and the active workspace are shared across all four contributions. The existing DM Sans/Manrope fonts and the Waiting for files status design are retained.

Integration adapters in `web/src/kira/` supply the empty-workspace status, mount the available matching screen, and display actual records selected by Kira. Successful agent changes refresh page resources; highlights open the selected records. The current sign-in screen is reused from the isolated preview through a separate entry module. CSV downloads send the selected client header. React and its TypeScript declarations are resolved from the main web package, including when the isolated preview has its own dependencies installed. Vitest only collects its own test files.

## Validation

- The combined 149-test backend suite passed with both supplied Drive datasets installed; a new full-close integration test also passed. Ruff passed. Dataset-dependent tests skip explicitly in a release checkout without data files.
- Seven app unit/integration tests and six chat protocol tests passed; the TypeScript/Vite production build passed.
- Real-backend Chrome checks covered sign-in, empty and populated Overview, active-client switching, basic analysis, CSV export and Step 4. Desktop, tablet and phone widths had no page overflow or JavaScript errors.
- The isolated prepared fixture produced 8,639 fully matched POS sales out of 8,784, 69 linked credits out of 70, and Rp 10,671,421 to check.
- Kira's actual merged service adapters drafted and saved 142 Harbor Square follow-up notes in that QA workspace, preserving the assignee and approval attribution.
- A separate API integration test uploads days 1–7, converts each day, approves upload and cleaning rules, runs both matching stages, and checks the actual 8,639/8,784 full matches, 69 linked credits, Rp 10,671,421 to check, Rp 26,361 expected, and seven first-close decisions.
- The prepared fixture and QA databases are local test artifacts. They are not the production demo clients; real production demo loading remains Rifat’s task.

## Remaining owner work

- Rifat: R5 Workflow steps 1–3 screens and R6 production demo-client loading. Upload, conversion and cleaning decision/save APIs are integrated.
- Andrew: finish analysis controls and pagination, linked tables/tick-and-tie, follow-up screens, and the remaining visual/demo pass. The current Match map and Follow-up tabs remain marked as pending. The Kira record-highlight view provides direct evidence without claiming to implement those screens.
- Nurwan: complete a visual review of Step 4 within this shell and coordinate the real pipeline/demo run after cleaning is available.

No teammate feature branches were rewritten. Additional contributions should merge into `dev`, preserving the integration adapters until their full owner screens replace them.

## Build and deploy

```sh
cd backend && uv sync --frozen && uv run pytest -q
cd ../web && npm ci && npm test && npm run build
```

`backend/deploy-local.sh` now builds the main app when `web/package.json` is present. It retains the standalone-preview fallback for older platform revisions. Deployment uses the existing Cloudflare origin on port 4174, existing credentials and shared new-build databases. Previous release drop-ins remain under `~/.local/share/kira-build/backups/` for rollback.
