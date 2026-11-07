# Outlet Insights integration

Integrated into `dev` on 7 November 2026 with the daily match grid. Model, API, Kira tools, route and navigation registrations below are applied. Deployment remains pending approval.

The original branch validation notes below describe its pre-integration environment; current verification is in `docs/day-grid-verification.md`.

## Taufiq's registrations

Apply these after integrating the new files. Each code block is one line to add or replace.

1. **At the bottom** of `backend/kira/models.py`, after `now()` and the model classes (the location avoids a circular import):

```python
from kira import models_insights  # noqa: F401,E402 -- register outlet_profiles
```

2. In the feature tuple in `backend/kira/api/app.py`, add:

```python
"performance",
```

3. In `backend/kira/agent/agent.py`, add this import:

```python
from .tools_insights import INSIGHTS_TOOLS
```

Replace the `TOOLS =` assignment with:

```python
TOOLS = READ_TOOLS + INSIGHTS_TOOLS + [FunctionTool(fn, require_confirmation=True) for fn in CHANGE_TOOLS]
```

Add the following lines inside `INSTRUCTION`, under Scope and How to work respectively:

```text
- Also help with outlet performance (sales, deductions, what reached the bank) from the user's reconciled data.
- Use get_outlet_performance and get_outlet_anomalies for sales, deductions, keep rate, and "which outlet keeps least"; use only their reconciled evidence.
- Pass relative periods as period (last_week, last_month, last_quarter, this_quarter, ytd); never compute dates yourself.
- If period.coverage < 1, say which dates have POS data using period.data_dates; mention missing days, and never present absent data as zero sales. Call get_outlet_performance for coverage when answering from anomalies.
- Give a one-line answer with 2–4 numbers, then "How I got this:" with the method; distinguish outlet totals, unassigned credits, expected deductions, and money to check.
```

4. In `web/src/App.tsx`, add the import:

```tsx
import Insights from './pages/insights/Insights';
```

Add to the existing `Routes`:

```tsx
<Route path="/insights" element={<Insights />} />
```

Add inside the existing main navigation (reuses its imported icon):

```tsx
<NavLink to="/insights" onClick={() => setExpanded(false)}><ChartNoAxesCombined size={18} />Insights</NavLink>
```

Replace the `const page =` line so the top bar and Kira screen context identify Insights:

```tsx
const page = location.pathname.startsWith('/insights') ? 'Insights' : location.pathname.startsWith('/analysis') ? 'Match analysis' : location.pathname.startsWith('/workflow') ? 'Workflow' : 'Overview';
```

Restart the backend after registration; normal `init_db()` creates the new table on the shared Base. No rematching or workflow migration is needed.

5. When registering the feature, also add the new table to the exact schema expectation in `backend/tests/test_platform.py::test_schema_and_empty_status`:

```python
"outlet_profiles",
```

That existing test currently asserts an exact set of tables. The new Insights tests isolate optional registration so the unregistered branch's existing suite remains unchanged and green; after registration, this extra one-line test expectation is necessary.

## HTTP and tool contracts

All paths below have the usual `/api` prefix. The page uses `lib/api.ts` for client and user headers. Both insights reads accept `date_from`, `date_to`, `outlet`, `city`, `region`, `period`. Outlet/City/Region are exact values. Relative period and explicit dates are mutually exclusive. Bad dates/periods and missing completed matching stages return HTTP 409. No filters means all reconciled dates, including bank-only dates; coverage counts only days containing POS data.

`GET /performance/outlets` returns:

```text
{
  period: {from, to, days, label, coverage, data_from, data_to, data_dates},
  totals: {orders, gross_sales, avg_ticket, provider_gross, mdr, promo_provider,
           fees, nett_settled, bank_received, pending_bank, to_check, expected_diff,
           deduction, deduction_rate, keep_rate, keep_rate_expected, match_rate},
  medians: {gross_sales, keep_rate},
  rows: [{outlet, ...totals fields, city, region, period, date_from, date_to, quadrant, reason}],
  unassigned: {credits, amount}
}
```

Money is rupiah; keep/deduction rates and coverage are fractions, while `match_rate` preserves `r_full`'s 0–100 percentage. Undefined ratios and unavailable provider promos are null. Totals recompute ratios from summed money/counts. Rows sort by keep rate ascending, with unavailable ratios last. Unassigned credits are separate from totals, and excluded when filtering by outlet, city, or region because there is no evidence to assign them.

`GET /performance/anomalies` returns:

```text
{
  anomalies: [{kind, severity, outlet, period: {from,to}, value, expected, rupiah, why,
               filter: {date_from,date_to,outlet,reason}}],
  skipped: [{kind, why}]
}
```

Kinds: `missing_money`, `low_match`, `high_deduction`, `sales_drop`, `sales_spike`. `missing_money` is high above 0.5% of gross sales; other checks default low. MAD zero is explicitly skipped. Weekday checks use up to four preceding same weekdays with at least three observed days; missing days are not fabricated as zero. Current quarter and YTD end today in Asia/Jakarta. Last week is the previous Monday–Sunday.

`GET /performance/outlet-profiles` returns `{profiles:[{outlet,city,region,updated_by,updated_at}]}`. `PUT` takes `{profiles:[{outlet,city,region}]}` and returns that same enriched shape. Unknown outlets or duplicate outlet updates return 409; malformed/extra fields return 422. Updates are atomic and audited with `state.audit`. City seeds from the outlet's last word; region starts empty.

`get_outlet_performance` returns `{status:"ok",result:{...outletsResponse,rows:[up to 12],total,outlets_included}}`. Totals, medians, period, and included outlet names cover the entire selected set, not just the first 12. Sort defaults to ascending keep rate; prefix a valid field with `-` for descending. `get_outlet_anomalies` accepts the same filters plus `kind`; it filters before truncating to 15, retaining all skipped checks and a total count. Both reuse the existing lazy `_service`, `_threaded`, `_call` and scrub/error boundary.

## Example and demo verification

The requested `data/with-exceptions/with-exceptions` fixtures are not installed in this workspace. Local discovery and connected Drive searches did not find them. Therefore a real demo API response and its answer-key verification are **not claimed**. The demo acceptance test is implemented with the existing `demo_tables` loader and skips cleanly when absent. Install the supplied fixtures and run `uv run pytest tests/test_performance_api.py -q` to capture/verify the requested demo response.

This response was captured from the existing small matching test fixture (`test_matching_api.seed`, both matching stages completed); it is **not** the seven-day demo:

```json
{
  "period": {"from":"2026-10-24","to":"2026-10-24","days":1,"label":"All dates","coverage":1.0,"data_from":"2026-10-24","data_to":"2026-10-24","data_dates":["2026-10-24"]},
  "totals": {"orders":2,"gross_sales":1000,"provider_gross":1000,"mdr":0,"fees":0,"nett_settled":1000,"bank_received":1000,"pending_bank":0,"to_check":0,"expected_diff":0,"deduction":0,"promo_provider":null,"avg_ticket":500,"deduction_rate":0,"keep_rate":1,"keep_rate_expected":1,"match_rate":100},
  "medians": {"gross_sales":1000,"keep_rate":1},
  "rows": [{"outlet":"Harbor","period":{"from":"2026-10-24","to":"2026-10-24","days":1,"label":"All dates","coverage":1.0,"data_from":"2026-10-24","data_to":"2026-10-24","data_dates":["2026-10-24"]},"date_from":"2026-10-24","date_to":"2026-10-24","orders":2,"gross_sales":1000,"provider_gross":1000,"mdr":0,"nett_settled":1000,"bank_received":1000,"city":"Harbor","region":"","promo_provider":null,"fees":0,"pending_bank":0,"to_check":0,"expected_diff":0,"deduction":0,"avg_ticket":500,"deduction_rate":0,"keep_rate":1,"keep_rate_expected":1,"match_rate":100,"reason":"Rp 0 deducted from gross sales, including payout fees","quadrant":"sells_less_keeps_more"}],
  "unassigned": {"credits":0,"amount":0}
}
```

The demo test checks 8,784 orders; outlet to-check plus unassigned of Rp 10,671,421; one unassigned Rp 1,250,000 credit; Harbor's Rp 9,031,421 missing payout and 24 Oct drilldown; the three smaller low-severity gaps; Lakeside's expected fee; and skipped weekday checks.

## Differences from the prompt's shorthand

- `outlet_rows` remains a list-returning pure function. Unassigned credits are returned separately by the service using analysis rates' `unassigned`, never fabricated as an outlet.
- The real service call is `analysis.rates(..., outlet=True, period="all")`; `by_outlet` is the HTTP parameter name.
- `analysis.gaps` has aggregates and at most five samples per kind, not a complete item list. The service reads complete outlet/day aggregates and allocates each bank-level gap once over its whole settlement group. Absolute affected-gap amounts use absolute nett weights, including refund groups; bank received keeps the analysis service's existing signed allocation. No matching rules or cleaning logic are rerun or changed.
- Normal GET sessions roll back; the feature-local `db` dependency and tool `_call(write=True)` commit only profile seeding. Matching, cleaning and workflow tables remain unchanged. Explicit profile edits are audited.
- `sale_diff` and `payout_diff` are gap kinds without corresponding record-reason filters. Their drilldowns retain dates/outlet with an empty reason. Mixed-kind anomalies also avoid a restrictive reason.
- Register `models_insights` at the bottom of `models.py` because it reuses `models.now`.
- The existing shared hook accepts a URL, not an endpoint function. The page-local resource hook preserves abort, retry, and `kira:data-changed` behavior while keeping the requested mockable endpoint wrappers.

## Validation

- Backend full suite: **171 passed, 18 skipped**, with two existing ADK experimental-feature warnings. Command: `uv run --link-mode copy pytest -q --basetemp=.venv/insights-full-suite-2 -p no:cacheprovider`. OneDrive rejects hardlinks and the machine's default pytest temporary/cache folders deny access; these flags change only installation/temp/cache handling. The initial unmodified command encountered those environment failures. All collected tests are still run.
- New coverage includes 17 core tests and API/tool tests for complete-run guards, profile persistence/auditing/atomicity, no workflow/matching writes, complete gaps beyond five examples, bank groups across outlets/dates, signed nett refunds, empty-period coverage, tool bounds, and error handling. Optional model registration is isolated in test fixtures so the original exact schema assertion stays green.
- `cd web && npm test`: **32 passed across 10 files**, including six Insights page tests.
- `cd web && npm run build`: passed TypeScript and Vite production build.
- Browser: headless Edge at **1280×1000, 820×1180, 390×844**, using clearly synthetic representative responses because the demo is absent. Profile edit/save and exact Harbor Square drilldown URL verified; no browser errors or page/dialog horizontal overflow. Chart/table scroll regions work on phones. Screenshots reviewed against `docs/screens/21-analysis-filters-simplified.png`; the DESIGN.md / docs/11 checklist was checked. Temporary preview entries were removed.
- Missing demo fixtures are reported as skips, not passes. The requested full seven-day real response remains to be captured when those files are available.
- Scope check: feature diff against `origin/dev` contains additions only, all within the allowed paths. No app/model/tool/navigation registrations, existing-file edits, or dev merge were performed.
