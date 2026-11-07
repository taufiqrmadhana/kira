# Outlet Insights backend

- Time: 2026-11-07, Asia/Bangkok.
- Task: Tests first for the optional Outlet Insights model, service, and router. Read existing analysis rates, gap aggregates, records, filters, persisted matching results, API dependencies, audit helpers, and engine/API contracts. Added only the new files authorized for Insights.
- Implementation: profile metadata uses the shared Base; profiles seed on first read and explicit updates are audited. The local router database dependency commits first-read profile seeds because the existing GET dependency rolls reads back. Complete matching runs are mandatory. Rates and money-gap classifications are read through the existing analysis service; payout-level gaps are allocated once across a complete bank group to prevent duplicates across outlets and dates. Relative periods resolve in Jakarta; coverage and actual POS data dates are returned.
- Verification: API tests cover pre-match 409s, persistent profile seeding, atomic updates, unknown outlets, audit evidence, unchanged matching/workflow state, complete gap totals beyond five samples, shared payout attribution across two outlets/dates, relative-period dates, and empty historical coverage. Demo answer-key checks use the existing loader and skip when the dataset is unavailable. Root adds tool tests and records final full-suite results in the integration guide.
- Merged: no; integration registrations remain for Taufiq.

- Time: 2026-11-07, follow-up review.
- Task: Isolated optional table registration inside the API fixture so the unmodified platform schema test sees only the registered application features. Reattach the exact mapped table for each Insights fixture and remove it on teardown. Corrected non-negative payout-gap attribution to use absolute nett weights when a bank group contains refunds, retaining the existing signed bank-credit allocation.
- Verification: The signed-settlement regression failed before the fix and passed afterward; Insights plus platform tests: 16 passed, 1 skipped (missing demo data). Ruff passed. Merged: no.
