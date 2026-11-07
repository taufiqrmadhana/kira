# Workflow upload screen

- Time: 2026-11-07, 13:02 Asia/Jakarta.
- Task: Restyle Workflow step 1 from `sampleui/Workflow-step1.png` while preserving its real API actions. Owned changes are `Step1.tsx`, new `workflow-upload.css`, and new `Step1.test.tsx`.
- Merged: no; work is on `ui_fixing`.

Added three white bordered category cards with dark green icons, green actual file counts, mint dashed drop zones, folder headings grouped once, compact real file metadata, download/remove actions, and a full-width continuation footer. File details and move controls are collapsed by default; wrong-area files expose the correction immediately. Kept sample days 1 and 2, the real upload/folder/drop behavior, folder paths, the 10 MB check, duplicate reporting, download headers, delete/move endpoints, history and pending states. The history summary shows loading/error text instead of implying zero events before its request finishes.

Tests first: initial run produced four expected failures for grouped-folder and accessible-control behavior. After implementation all five new tests passed, covering grouped folders and conversion navigation, multipart folder upload and size rejection, wrong-area moves, sample/removal/pending states, and drop-to-category upload.

Reviewed screenshots against the supplied reference in headless Edge at 1440×1100, 820×1180 and 390×844. Also checked an expanded file-details/move control and the desktop layout with Kira open. No page overflow or browser errors; the move action sent the expected mocked endpoint and payload. Every `/api/**` request was intercepted in this browser check; no live workspace data was changed. Screenshots and the temporary browser script remain in the OS temp directory as `kira-upload-*`.

CSS is scoped to `.wf-upload-panel` and imported by Step1. No Workflow shell or shared workflow CSS edits were made in this task. Root owns final suite/build checks and shell integration.
