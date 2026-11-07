# KIRA design system

Owner: Andrew. Every screen follows this file. Reference screens: docs/screens/. What not to copy from them: docs/10, "Don't copy these".

## Product and mood

Payment reconciliation for Indonesian merchants. Users: the reconciliation analyst who closes each day, the finance lead
who reads match rates and money gaps, and a new team member learning the process. Calm, exact, trustworthy; dense where
there is data, quiet everywhere else. The memorable part is the numbers and the evidence behind them, not decoration.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| bg | #f6f7f4 | page |
| surface | #ffffff | tables, panels |
| ink | #202c29 | text |
| muted | #626d66 | secondary text (check AA contrast on bg) |
| line | #e6eae4 | borders, dividers |
| green | #285d47 | the one accent: primary actions, links, Matched |
| dark | #173f35 | primary button, active navigation |
| mint | #eaf3eb | Matched background, selected row |
| lime | #d2ecaf | highlight (Kira highlighted rows) |
| amber / amber-bg | #936724 / #fcf4e5 | Needs review, "To check" |
| red / red-bg | #a44e43 / #f9ece9 | Mismatched, 0% cells |
| focus | #96ba69 | 3 px focus ring, 3 px offset |

Amber and red only ever mean status. Status is always written as text too, never colour alone. No gradients, glass, glow
or coloured shadows.

## Type

- DM Sans (400, 500, 600, 700) for text and tables; Manrope (600, 700, 800) for page titles and big numbers. Self-hosted variable WOFF2 fonts in `web/public/fonts` with `font-display: swap`; preload both families.
- Scale: 12 / 13 / 14 / 16 / 20 / 28 / 40 px. Body 14, tables 13, captions 12. Nothing under 12 px.
- Every number uses tabular figures (font-variant-numeric: tabular-nums) and is right-aligned in tables.
- Sentence case everywhere. No spaced all-caps labels over titles.

## Shape and space

- Radius: 8 px for controls, chips and tooltips; 12 px for panels and modals; **4 px for daily grid cells only** (`--day-grid-radius`).
- One shadow, for overlays only (modal, chat panel, menus): 0 12px 40px rgba(18, 45, 40, 0.18).
- Spacing on a 4 px base: 4, 8, 12, 16, 24, 32, 48.
- Layout: sidebar 224 px; content up to 1440 px; tables may use the full width.
- Tables sit on the page surface; cards only for things you act on (a decision, a KPI). No cards inside cards.

## Formats (Indonesian)

- Money: Rp 9.031.421 (dot thousands, no decimals unless needed).
- Counts: 8.639.
- Percent: 98,3% (comma decimal, matching the Indonesian thousands). Use the same everywhere, charts included.
- Dates: "Sat 24 Oct 2026" (English UI); date inputs show dd/mm/yyyy; ISO in URLs.

## Components (web/src/components)

Button (primary, secondary, quiet, danger) · StatusChip (Matched, Needs review, Mismatched; Linked, Review, Not found;
Expected, To check) · KpiCard · Ring (match rate) · DataTable (sticky header, two-level header, sort, ticks, footer
aggregate, paging, empty/loading/error) · Tabs · Segmented · SelectionBar (period, from–to, outlet, provider) · Modal ·
Toast · DecisionCard (upload rule, cleaning recommendation, suggested matching rule) · ChatPanel (Taufiq) ·
FilterChip (an active filter with ×, plus Clear all) · Switch (on/off filters such as "Only rows under 100%") ·
MoreFilters (a disclosure with a count of active filters) · DraftMark (a field Kira filled: green border and "Kira's draft:
check it, then Save").

## Filters

One bar per page says which data (period, outlet, provider) and shows every active filter as a chip; table toolbars
only say how to show it, written as a sentence ("One row per Day and ✓ Outlet"). Date fields appear only after "Pick dates".

## States

Every table and panel has: loading (skeleton rows), empty (what to do next, with the button to do it) and error (the
server's detail and Retry).

## Copy

Say what is on the screen with the real numbers: "142 sales were settled but not in the bank yet: Rp 9.031.421". No
slogans, no "Unlock insights", no middle-dot strings. Labels don't repeat their content.

## Motion

Motion explains actions and real work. Tokens: `--ease-out: cubic-bezier(.2,.8,.2,1)`,
`--ease-in-out: cubic-bezier(.65,.05,.25,1)`; `--t-fast: 150ms`, `--t-base: 220ms`,
`--t-slow: 450ms`, `--t-story: 900ms`. Reduced motion makes placement and values immediate;
progress text and accessible final values remain available. No idle loops or invented progress.

1. Routes fade and rise 8 px; the sidebar active marker slides to the new item.
2. Workflow's active segment slides, finished checks draw, and connectors fill left to right.
3. Step panels crossfade and move 16 px in the direction of travel.
4. Uploads tint on drag, show real per-file byte progress, animate file arrival and known file counts.
5. Conversion dots travel only during work; source lines dim, results stagger by 60 ms, counters reach real totals.
6. Accepted cleaning recommendations collapse into Saved rules; changed cells flash yellow once.
7. Matching shows an indeterminate connector until the result arrives, then animates confirmed rule hits,
   counts and rings. Never invent intermediate numbers.
8. The first Overview view per client/session builds rings and KPIs; calendar weeks enter 30 ms apart.
9. Changed filter totals interpolate for 300 ms; screen readers receive the final value directly.
10. Selecting evidence scrolls and flashes counterpart rows once. Related LinkChips pulse once and compare
    dialogs scale in from their triggering row.
11. Grid cells lift on hover; selected evidence slides open.
12. Chat messages rise 8 px; actual progress enters in order. Completed guided steps collapse into summaries;
    the desktop dock animates content width.
13. The mascot thinks only during work or immediately after interaction.
14. Tutorial cursor glides, spotlight morphs and its bubble fades between targets.
15. Toasts rise 12 px. Skeletons appear only after 250 ms.

Guided close, compare and tutorial motion is integrated with those feature phases and checked again in the final
browser pass. Shared hooks cancel interrupted animations and react to reduced-motion preference changes.

The public landing page follows the supplied `sampleui/landingpage.png`: a dark forest background, lime accents,
and a compact workspace chooser. Its requested statistics carousel may rotate automatically from left to right;
provide previous/next and pause controls, pause on hover or keyboard focus, and disable autoplay for reduced motion.
Label documented demo statistics explicitly; do not imply they are live client results or guaranteed business outcomes.

Kira uses a local green vector mascot with an explicit accessible name. Preserve conversation, draft, active requests
and pending approvals when minimized. Escape returns focus to the launcher. Animate only during work or interaction.

Cleaned-table cells use pale yellow with a written change count and before/after evidence to mark values changed by
cleaning. The Show before cleaning view displays the original values without yellow fills. Unchanged cells remain neutral.

## Charts

Flat bars and rings with direct labels, the green accent for the value and line colour for the track; red and amber only
for status thresholds (≥ 95% green, 80–95% amber, < 80% red).

Every visual has a plain title, one line explaining how to read it, a legend naming the marks actually present, and a
sentence underneath with the real numbers, most important finding first. Colour has one meaning within a visual;
status is also written in tooltips, accessible labels, and the summary. Use `lib/format.ts` for Indonesian figures.
Interactive collections (grid cells, tickable rows, tabs and segmented controls) use roving focus and arrow keys.

### Daily match grid

`DayGrid`, `DayGridTooltip`, and `DayGridLegend` are shared by Overview and Match analysis. Fill measures the share of
POS sales with a complete bank trail; it does not judge money differences. Use the following **stepped** tokens, never
interpolate or fade red into green. Thresholds use the unrounded rate; only the cell label rounds to a whole number.
Each background/label pair passes WCAG AA for the 12 px minimum label.

| Rate | Fill token | Fill | Label token | Label |
| --- | --- | --- | --- | --- |
| ≥ 99.5% | `--day-grid-high` | #285d47 | `--day-grid-high-label` | #ffffff |
| ≥ 98%, < 99.5% | `--day-grid-strong` | #4b7954 | `--day-grid-strong-label` | #ffffff |
| ≥ 96%, < 98% | `--day-grid-good` | #8dbb78 | `--day-grid-good-label` | #202c29 |
| ≥ 95%, < 96% | `--day-grid-healthy` | #d2ecaf | `--day-grid-healthy-label` | #202c29 |
| ≥ 80%, < 95% | `--day-grid-amber` | #f1ce83 | `--day-grid-amber-label` | #202c29 |
| < 80% | `--day-grid-red` | #a44e43 | `--day-grid-red-label` | #ffffff |

Cells are square, at least 28 px, with 4 px gaps and a 4 px radius. Labels are Manrope bold and tabular. Independent
marks: a red top-right wedge means money to check; amber means review records only; an amber bottom-left dot means
settlements waiting for a bank credit. A white separator makes the wedge distinguishable even on a red fill. Transparent
cells with a 1 px dashed muted border mean no data and cannot receive focus. A solid neutral `line` fill with an em dash
means settlement/bank evidence exists but there are no POS sales to calculate a rate; retain its money flags and click
through to evidence. Never turn an undefined denominator into 0% or hide evidence.

Latest close uses a 2 px dashed green ring; selection uses a 2 px white gap followed by a 2 px green ring. Hover and
keyboard focus lift a cell to 1.2× above its neighbours. With reduced motion, use the ring without scaling. There is one
tab stop within the grid; left/right move through days with data, up/down retain the column, Home/End reach the first/last
populated day in that row. Enter opens evidence. Below 680 px, hide the cell numbers and scroll the grid within its panel,
with sticky row labels; never widen the page. Month rows always have columns 1–31; nonexistent dates are blank.

### Evidence tooltip

Use shared `EvidenceTooltip` for visual tooltips, including the grid and Insights scatter. It renders in a document-body
portal with a fixed viewport position, so panels cannot clip it. Prefer above if it fits fully, then below, then beside;
reserve a 12 px gap to the target and clamp the surface 8 px from all viewport edges. Resize and scrolling reposition it.
In unusually small windows, constrain height to free space rather than cover the target.

| Token | Value | Use |
| --- | --- | --- |
| `--tooltip-surface` | `dark` (#173f35) | tooltip surface |
| `--tooltip-text` | #ffffff | title and values |
| `--tooltip-muted` | #d2dfd7 | labels and action hint |
| `--tooltip-line` | #58756a | hairline divider |
| `--tooltip-red` | #ffb5a8 | issue dots on dark surface |
| `--tooltip-amber` | #f4cc76 | waiting/review dots on dark surface |

Maximum width 240 px; padding 12 px; radius 8 px; the existing overlay shadow. All content is at least 12 px. The title
uses Manrope bold, followed by an optional verdict line, divider, label/value rows with right-aligned tabular values,
one flag line per issue with a status dot, and a muted sentence explaining the click action. Hover and keyboard focus
show the same evidence. Escape dismisses it. Day tooltips label the derived mismatch count **Mismatched POS** so it is
clear that this count uses the POS denominator; the money flags also include settlement-only issues. Waiting age is
measured against `latest_bank_date` from the gaps evidence, independently of the latest POS close ring; omit age when
that date is unavailable.

## Before a screen is done

Run the anti-slop checklist in docs/11-ui-skills.md (and $impeccable critique if installed), take a screenshot, compare
with docs/screens/.


## Loading and data refresh

Use layout-shaped `SummaryBandSkeleton`, `TableSkeleton` (real column labels), `GridSkeleton`, and `ChartSkeleton`. Reserve the final layout immediately; reveal placeholders only after 250 ms. Existing data stays visible during refresh with `aria-busy` and an Updating… status. No page remount on data changes. Query keys include the client and normalized scope; hover and focus prefetch the destination. Route components load separately so a first visit does not download every workflow and analysis screen.

## Stylesheet ownership

`tokens.css` owns colour values and the theme. `base.css` holds element defaults; `components.css` holds shared controls, shell and companion styling. `styles.css` imports these in order. Screen-specific layouts use the same tokens. The former preview and nested chat build are removed. The consolidation preserves the existing colours; palette tokens retain secondary shades pending the component design pass.

### Match map evidence

The Match map starts with a compact comparison of the two sides’ amounts and their difference, followed by a sentence with the record count and current reason. Tables show Reference, Status and the relevant amount by default; imported source fields, date, outlet, rule and link IDs remain available through Columns. Hover or focus a reference to read its date, outlet, link and rule in the shared evidence tooltip. Keep evidence rows about 44 px high, references on one line with ellipsis, and amounts right-aligned.

When settlements have no bank credit, give the populated table more width and explain the empty side with the real count, amount and a scoped follow-up action. Omit empty-table aggregates and filters in this state. Stack the explanation before the table on narrow screens.

## Shared components v2

- `PageHeader`: 28 px Manrope 800 title without a trailing stop, factual subtitle, right-aligned actions and a labelled
  tutorial button. One primary action only where there is a clear next step.
- `SummaryBand`: directly on the page. Main ring 160 px, stroke 12, value 40 px; long percentages shrink to 28 px.
  Stage rings 72 px with fitted values and direct labels. Zero has no coloured round-cap dot.
- `KpiCard`: white surface, 1 px line, radius 12; 13 px/600 label, 28 px tabular value, 12 px factual caption.
  Semantic status tints are allowed. Numeric reveals include an accessible static final value.
- `DataTable`: compact rows 36 px, evidence rows 44 px; light leaf headers, optional type captions, dark group bands
  only. Sticky headers and optional first columns, nowrap references, mint hover/selection and 3 px green inset.
  Footer totals, aggregate picker, portal Columns, export and pager. Refresh errors retain existing data.
- `RateCell`: right-aligned rate and a flat 48 × 4 px bar; green ≥95%, amber ≥80%, red below 80%; accessible name.
- `StatusChip`: 12 px icon and text, optional reason. `LinkChip`: reference, dark rule badge, optional pays count.
- `Tabs`: optional subtitle and roving arrow-key focus. `Segmented` and `ToggleChip` expose selected state;
  `Switch` uses native checkbox semantics. `IconTile`: 36 px, white Lucide icon on dark.
- `Popover`, `Menu`, `Modal`, `Toast`: shared body portal, viewport clamping and Escape/focus restoration.
  Modals trap focus and isolate the background; toast timers pause on hover/focus and never steal focus.
- Copy uses sentence case and `plural()` with Indonesian-formatted counts. Use icons for controls.

The development-only `/dev/components` route shows desktop and mobile states. Its browser checks cover row heights,
ring fit, sticky columns, overlays, keyboard focus and reduced motion.

## Workspace shell and Kira placement

The 224 px sidebar contains the workspace brand, client button card, Daily work navigation and Kira card at its foot.
The client card shows IDR, the latest sales date and match rate; its menu offers clients, Add client and Switch client.
Each navigation destination has its own icon. A Workflow badge counts waiting upload and cleaning decisions.
The 64 px topbar holds the breadcrumb, Tutorial, demo-only Reset and account menu. Reset shows affected counts,
requires the exact client ID and reports the backup. Copy link shares the complete analysis or Insights URL.

Below 800 px Kira's launcher moves into the topbar as a 40 px icon with a status dot. It never floats over data.
At 1280 px and wider, opening Kira reserves a 400 px right column with an animated content-width change; smaller
screens use a viewport-contained nonmodal sheet. Escape returns focus. Page layouts respond to their actual container
width so opening the dock cannot squash KPI numbers or tables. The closed launcher reports Ready, Working or waiting
for approval. A confirmed reset clears that client's active conversation state and stale approvals.

## Landing and Overview

Landing keeps the forest introduction, four-step strip and controlled documented-statistics carousel. Use a factual
headline and explain what happens to files; no slogan eyebrow or footer. Signed-out visitors see the shared sign-in form
in the right panel. Client rows show the actual last sales date, RateCell and open follow-up count. Entry buttons open
the workspace, its tutorial or guided close. Steps enter once, 80 ms apart; reduced motion is immediate.

Overview labels sales coverage separately from the matching timestamp (UTC API timestamps displayed in Asia/Jakarta).
Its SummaryBand uses **Mismatched POS sales**, the same denominator as Match analysis; records without a POS sale have
their own count. History switches between the monthly calendar and outlet/day grid with money flags. Attention is a
compact evidence table with record, outlet, amount, status and reason, largest amount first. Bank-only records have a
human label while preserving their precise evidence key. Learning bars show actual decisions per close and learned rules.

## Workflow and combined evidence

All steps use the stepper's title and a Step n of 4 line, explanation and consistent Back/status/Next footer where
applicable. Refresh lives in the page header; the final step receives its completed check after both stages run.
Conversion previews lead with amount, date, reference, outlet and provider, omit internal IDs and empty ledger rows,
and retain actual source names in tooltips. Saved-rule summaries use sentences without middle-dot separators.
Cleaning standards show canonical names; keyboard/hover tooltips reveal aliases. Internal IDs are optional columns,
and previously saved rules start collapsed; a newly decided card remains visible as it moves into Saved rules.

Matching shows a rule-hit strip, stage-specific results and batch-payout counts. Rule editing, order and deletion live
in an overflow menu; deletion confirms consequences. Explain terms in the adjacent Glossary at wide content widths,
or its disclosure on smaller screens. Why not 100% opens a contextual Kira draft; sending remains explicit.
Results use SummaryBand, export and an optional combined evidence table. This table has light leaf headers under dark
group bands, server paging, optional columns and full-scope export. Show each bank credit amount once per bank on the
page; continuation rows name the same payout link and never substitute a settlement ID for a bank reference.

### Outlet insights (dev2)

Use the same sales-period buttons and outlet/provider selection as Match analysis, with city and region filters. Retain
older relative periods under More periods. A flagged outlet filters the current Insights page; evidence links open the
matching records with their original date, outlet, provider and reason. The profile action reads “Edit city and region”.

The scatter starts gross sales at zero. The keep-rate domain runs from the lowest observed rate minus 0.5 percentage
points to 100%; it must never stretch above 100%. A real rate above 100% uses an upward boundary marker at the ceiling,
an explicit explanatory sentence, and its unchanged actual value in the tooltip and table. Never silently turn it into
100%. Label both dashed selection medians. Direct labels belong only to outlets in the “sells a lot, keeps little”
quadrant; other outlets are identified through the shared evidence tooltip on hover or keyboard focus. Amber dots and
shade mean that quadrant only. Describe only marks present in the legend and state the actual findings underneath.

The chart measures its container before paint and on resize so its points remain visible on a phone or beside Kira.
On narrow charts, shorten only city suffixes in direct labels and mark compact currency-axis units explicitly as
“m = million”; complete outlet names and rupiah amounts remain in the tooltip and evidence table. Keep chart text at
least 12 px. Arrow keys/Home/End move among points, Enter opens evidence, and Escape dismisses the tooltip.

Outlets use the shared compact DataTable with a pinned outlet and Keep rate RateCell. Anomalies use a compact table
with Severity, Kind, Outlet, Why, Amount, Evidence and Ask Kira. The Kira action opens a contextual draft and never
submits it automatically. Monetary KPI values stay on one line at phone and docked widths.

## Match analysis exploration

Use a factual selection subtitle and six SummaryBand metrics, keeping POS mismatches separate from records without a sale.
Match rate opens on Grid; Table provides grouped rows/rates/money headers, pinned Date and Outlet, scope controls, RateCells,
full exports and a selected-row subtotal. Money differences group To check before Expected and sort each by absolute amount.

Linked tables show source references, each bank credit's own description, and the actual linked settlement in a separate
column. LinkChips identify the payout/rule/count. Tick-and-tie totals sit below both tables, sticky when space permits.
Both sides retain selections for explicit manual linking; require a reason and offer Undo. Compare uses field-level
Agrees/Differs/Missing states; dates are informational. It loads existing follow-up fields before saving, guards unsaved
edits, and opens a contextual Kira draft. The modal grows from the selected record; reduced motion is immediate.

Records supports status counts, search, reason/provider/amount filters, grouping by bank credit and full-scope export.
Chains contains only POS sales and shows both rule links and missing bank evidence. Only differences includes expected
fees/rounding and field differences, while a settlement date alone is informational. Follow-ups keep compact rows and a
sticky explicit bulk-save bar with the actual approval actor. All evidence rows are keyboard reachable.
