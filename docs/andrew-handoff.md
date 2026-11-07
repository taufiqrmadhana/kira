# Andrew’s UI handoff

Local repo remote is `taufiqrmadhana/kira`, while the kit names `taufiqrmadhana/kira-hackathon`. Confirm the destination before any push. Andrew asked to approve both committing and pushing; target branch will be `andrew`.

## Implemented locally

- React, TypeScript, Vite, React Router, Tailwind theme and TanStack Table scaffold.
- Shared button, status chip, KPI, ring, table, loading/empty/error, tabs, segmented controls, modal and toast.
- API client sends actor/client headers, cookies, redirects on 401 and exposes server error details.
- Login POSTs to `/api/login`; Overview reads `/api/overview` and `/api/learning`.
- Match analysis reads summary, rates and gaps with URL-backed date/outlet/provider scope. Includes table sort/paging, period grouping, below-100 filter, search and CSV link.
- Formatter and API behavior tests written before implementation.

## Still required

- A1 browser verification and live login against Taufiq’s backend.
- A3 quick period chips, provider grouping, columns chooser and server pagination for selections over 1,000 rows. Current table explicitly reports the loaded subset.
- A4 linked tables, cross-selection, tick-and-tie and follow-up draft/edit/save screens. The tabs currently explain that they are pending.
- A5 screenshot comparison against Drive reference screens, tablet and keyboard checks, end-to-end demo rehearsal.
- Rifat/Nurwan workflow routes and Taufiq chat mount. No teammate-owned implementation has been copied or changed.

## Validation environment

Dependency installation was attempted but this sandbox returns EACCES for npm registry network requests. No dependency install, production build or Vitest/browser pass can be claimed until those commands succeed. No backend exists in this local repo.

Six formatter assertions passed using Node’s TypeScript stripping (money, counts, percentages, missing percentage, Jakarta calendar date, empty date). Git whitespace check passed for tracked changes; new files remain untracked. API tests are written but have not run under Vitest.

## Run when dependencies are available

```powershell
cd web
npm install
npm test
npm run build
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`. The application displays real loading/empty/server error states and does not silently replace unavailable backend responses with mock financial numbers. Set `kira-client` in localStorage to the demo client id when Rifat has loaded it; default requests use the backend’s main workspace.
