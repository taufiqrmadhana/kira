# Convert scanning and upload-rule review

- Time: 2026-11-07 06:08 UTC (13:08 WIB).
- Task: Updated Step 2 from the supplied before/after conversion screenshots and upload-rule-card reference. Added three source-to-table lanes, source file names and column samples, scanning lines, skeleton rows, staggered previews, required-column source tables, and compact keep/type/sample controls.
- Files: `web/src/pages/workflow/Step2.tsx`, new `ConversionPreview.tsx`, new `workflow-convert.css`, new `Step2.test.tsx`, and this log. Shared workflow styles/types and existing workflow tests were left to their owners.
- Real-data boundary: The scan follows the actual POST `/convert` and workflow reload promise. No artificial delay or percentage is used. Before conversion the existing API exposes file metadata, so the panel shows real uploaded names. Proposal samples are first-nonempty values per column and are explicitly labelled as column samples, never assembled into an invented transaction. Actual parsed rows appear only when the existing table preview returns them. No extra endpoint or browser spreadsheet parsing was added.
- Rule behavior: Preserved the create/update/keep request bodies, multiple source mappings, reviewed target overrides, and roving keyboard focus for keep checkboxes. Removed the old invented fallback “Saved rule v1” when no saved rule exists.
- Tests: Wrote five new state/preview tests first and observed them fail against the prior UI. All five now pass, together with all six existing workflow mapping and keyboard tests. Root's full web test/build verification passed after implementation.
- Browser review: All API calls intercepted with explicit review fixtures; no demo data was written. Chrome checks at 1440, 820, and 390 pixels verified three indeterminate pending indicators, hidden rules while pending, three cards after completion, actual parsed-row rendering after a saved rule, no page overflow, and no browser errors. Reduced-motion mode disables scan and row animations. Fixed narrow rule headings after screenshot inspection.
- Screenshots: `%TEMP%/kira-convert-scanning-{1440,820,390}.png`, `%TEMP%/kira-convert-rules-{1440,820,390}.png`, and `%TEMP%/kira-convert-parsed.png`.
- Merged: no; root owns commits and branch integration.

## Saved-rule follow-up

- Time: 2026-11-07 06:21 UTC (13:21 WIB).
- Task: After a rule is saved, replace its decision controls with a compact white summary. Labels use the backend's persisted `created`, `updated`, `kept`, or `same` decision; unknown decisions say “Saved.” The remaining areas stay open for review.
- Evidence: Counts come from saved columns and parsed-table totals. Delimiter comes from `current_rule`, which includes it in the real backend response; the shared optional TypeScript field was coordinated with the types owner. The View rule disclosure shows only saved column types, keep choices, and mappings, including explicit “Do not fill” mappings.
- Tests: Added six follow-up cases first, observed the five new display/disclosure cases fail on the previous UI, then implemented the summaries. All 17 tests pass across Step2 and the existing workflow tests. Failed saves retain the open decision and edited values. Create/update/keep payloads are unchanged.
- Browser review: Mocked requests only. Confirmed a successful POS save collapses that card while Settlement and Mutation remain open. At 1440 and 390 pixels there is no page overflow or browser error. Enter opens the native disclosure button and Space closes it; saved details contain no editable controls. Screenshots: `%TEMP%/kira-saved-rule-1440.png`, `%TEMP%/kira-saved-rule-390.png`, and `%TEMP%/kira-saved-rule-expanded.png`.
- Committed/pushed/merged: no. No live API writes.
