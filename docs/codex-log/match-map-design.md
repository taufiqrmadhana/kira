# Match map evidence redesign

- Time: 2026-11-07 12:25 WIB
- Task: Replace clipped source-first tables with compact payment evidence, a clear money comparison, and a purposeful missing-bank state. Keep every imported column available, preserve tick-and-tie filtering, and link the empty bank side to the scoped follow-up list. Document the convention in DESIGN.md.
- Validation: Wrote regression tests before implementation. DataTable and analysis suites: 14 passed, covering async default visibility, optional source fields, missing-bank count/amount/action, and existing link selection. Root owns final responsive browser inspection and deployment verification.
- Merged: no (committed on shared dev checkout; root will integrate and push).
