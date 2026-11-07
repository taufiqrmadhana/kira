# Workflow cleaning screen

- Time: 2026-11-07, 13:27 Asia/Jakarta.
- Task: Restyle Workflow step 3 from the supplied before/standard/after screenshots, preserving cleaning decisions and real table data.
- Merged: no; work remains uncommitted on `ui_fixing` as requested.

Changed `Step3.tsx` and added scoped `workflow-clean.css` and `Step3.test.tsx`. The standard panel now stays visible and shows the backend's canonical outlet/provider names with their aliases. Its optional checked-column and bank-payout-word details come from the existing `/cleaning` response; `services/clean.standard()` copies these from `kira.standard.STANDARD`. The saved-rules status only appears when rules exist and no recommendations remain.

The cleaned table uses the shared DataTable with one server pager, initially requesting 50 rows. Source tabs show real totals, field headers include types, row numbers remain visible, and the table has contained scrolling, sticky headers, thin cell borders and pale alternating rows. Only differing fields actually present in `__was` receive full-cell yellow highlighting. The before toggle restores originals, including zero, false and null, and removes yellow while preserving keyboard-accessible evidence. Existing accept/reject/undo/save actions, loading/error states and workflow navigation remain intact. Clicking the current source tab retains its loaded rows.

Tests first: the new checks initially failed against the old 10-row table and collapsed standard. Final targeted run passed 13 tests across `Step3.test.tsx` and `workflow.test.tsx`. The existing workflow pagination fixture was narrowly updated for the new 50-row request. Root reported the combined web suite passing all 128 tests in 25 files and the production build passing. Subsequent browser QA required one CSS specificity correction so yellow also wins over even-row backgrounds; the rerun passed.

Reviewed mocked screenshots in headless Edge at 1440 x 1100, 820 x 1180 and 390 x 844. All sizes had no page overflow or browser errors, contained horizontal/vertical table scrolling, sticky headers, and the expected yellow cell background. Also checked the before view, keyboard evidence tooltip, next server page and switching sources after paging. Every `/api/**` request was intercepted and all requests were GET; no live workspace data was changed. Screenshots and the browser script are in the OS temp directory as `kira-clean-*`.

The only shared type changes are optional `Cleaning.standard.columns` and `payout_words`, plus optional `UploadRule.delimiter` coordinated with the conversion work and verified against `services/convert.current_rule`. No shared DataTable or workflow stylesheet change was needed.
