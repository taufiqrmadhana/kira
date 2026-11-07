# Andrew’s UI handoff

Repository: `taufiqrmadhana/kira`. Branch: `andrew`. The initial UI commit `321a5f3` was pushed from Andrew’s terminal. The completion work below is local and has not been committed or pushed; Andrew requires approval first.

## Implementation

| Assignment | Local implementation | Acceptance status |
| --- | --- | --- |
| A1 | Design tokens; shared UI components; cookie/actor/client API client; error handling; login and existing-session check; responsive shell; profile; accessible tabs, modal and mobile navigation. | Core helpers and real API sign-in checked. Frontend build/browser verification pending dependencies. |
| A2 | Overview close line, ring, KPIs, stage rings, flat learning bars, attention links. Links preserve the client; attention accepts the actual nested POS/settlement response. | API response shape reviewed. Original demo-data numbers and browser rendering still need verification. |
| A3 | Period shortcuts and dd/mm/yyyy inputs; outlet/provider scope and removable chips; rate grouping by day/week/month/whole period and outlet/provider; five rates, counts and money; two-level headers; server sort/paging; columns; ticked subtotal; export of every filtered rate page; labelled gaps and unassigned credits. | Core period/date behavior checked. React interactions and table export need the frontend suite/browser. |
| A4 | Both linked stages; status counts, search, link ids, source columns, server sort/paging, column selection, aggregates, cross-side tick selection and tick-and-tie. Follow-up status/assignee/two-line note, row save/draft, English/Indonesian drafts, review marks, all-page draft map, discard and bulk save in batches of at most 2,000. Failed saves retain notes; unsaved edits are protected from draft replacement. | Real cached team API passed the synthetic 142-record Harbor case, including save persistence after rerunning matching. UI/browser checks are written but not yet run. |
| A5 | Source review against the design checklist; original reference screenshots restored from the cached team starter; browser acceptance script and screenshot capture prepared. | Still pending: production build, React suite, browser screenshots/responsive/keyboard checks, and full team demo rehearsal. |

The UI never supplies fallback financial numbers when the backend fails. Explicit fixture responses are confined to test files and the browser test script.

## Integration

`components/TeamIntegration.tsx` mounts Taufiq’s exported `ChatPanel` when `src/kira/index.ts` is merged. It reserves normal document space, passes actor/client/screen context, refreshes data after approved changes, and routes highlighted keys to linked tables. It also mounts a merged Workflow page or Nurwan’s Step4 module. No teammate-owned implementation was modified or copied into the working application.

The current `andrew` checkout does not contain those teammate modules or the backend. Their absence is an integration dependency, not completed functionality. Cached backend snapshots used below are confined to ignored `web/.verification/team/`.

## Validation completed

- TypeScript syntax transpilation succeeded for the source files at the first completion checkpoint. This is not full type checking.
- `scripts/check-core.cjs`: passed formatting, date parsing, period bounds, actor/client headers, cookies, query encoding, client-preserving links, server conflict details, sign-in redirect and empty responses.
- A separate cached team backend was assembled under `.verification/team` from local `origin/fitur/nurwan` plus Rifat’s `origin/feature/mhmmdrifat` pipeline. It uses installed Python dependencies only, with AI disabled.
- Existing team API/service checks: **11 passed, 2 skipped**. The skipped checks need the original Drive demo data.
- `scripts/check-team-contract.py`: passed real FastAPI login/401 behavior, 142 Harbor settlements totaling **Rp 9.031.421**, no Harbor bank credit, all-page drafting without saving, explicit bulk save and persistence after rerunning both stages. It uses a synthetic fixture, not the original 8,784-sale dataset, and a fresh verification database.

## Remaining blocker

The sandbox returns EACCES for npm registry downloads. Frontend dependencies are not installed. Therefore **no full TypeScript build, Vitest pass, or browser pass is claimed**. Andrew was asked to run `npm install` in `web/`; once those files exist locally, Codex can continue the checks.

```powershell
cd C:\Users\andre\OneDrive\Documents\lol\kira\web
npm install
npm test
npm run build
npm run dev
```

With Vite running, a second terminal can run:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
```

The browser script uses explicit contract fixtures and captures login, Overview, rate table, linked tables, draft/saved notes, cross-selection and 1280/768/390 px views under ignored `.verification/screenshots/`. It exercises all-page save/reload, discard and failed-save recovery. Those fixture checks do not substitute for a full run with the merged team backend and original demo dataset.

Vite proxies `/api` to `127.0.0.1:8000`. The `c` query parameter selects a client and survives navigation. The kit’s hash bookmarks and `from`/`to`, `rate`/`followup` aliases are accepted.
