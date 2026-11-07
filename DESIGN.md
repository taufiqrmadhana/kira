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

- DM Sans (400, 500, 600, 700) for text and tables; Manrope (600, 700, 800) for page titles and big numbers. Google Fonts.
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

### Floating Kira companion

Kira is available on every signed-in screen through a fixed bottom-right launcher. It starts minimized and remains
visible when its popup is open; opening or minimizing it never changes the page width. This launcher and its popup are
the explicit exception to keeping controls in the page flow. Use `dark` with light text for the launcher, a `lime` icon
tile, the 8 px control radius, and the existing overlay shadow. The popup uses `surface`, a 12 px panel radius, and the
same shadow, with no backdrop.

Keep the popup at most 400 px wide and 720 px tall, above the launcher, with 24 px desktop viewport clearance and 12 px
on small screens. Respect safe areas and the dynamic viewport height; scroll the conversation internally, never widen
the page. The launcher has a 52 px minimum touch target; all labels and pending-work indicators are at least 12 px.
Reserve room after page content so the last action can scroll clear of the launcher. No idle animation or motion is
needed; reduced-motion preferences also disable control transitions.

Use a named nonmodal dialog. The launcher exposes its expanded state and controls the popup. Escape or either minimize
control restores focus to the launcher. On desktop, focus the composer or pending approval; on touch screens, focus the
heading without opening the keyboard. Minimizing preserves the draft, conversation, running requests, and pending
approvals. It never approves or cancels work. While minimized, show working or awaiting-approval text on the launcher.

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

Only in answer to an action: run counters while matching, a short highlight on rows Kira points at. Honour
prefers-reduced-motion.

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

