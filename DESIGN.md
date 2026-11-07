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

- Radius: 8 px for controls and chips, 12 px for panels and modals. Nothing else.
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

Only in answer to an action: run counters while matching, a short highlight on rows Kira points at. Honour
prefers-reduced-motion.

## Charts

Flat bars and rings with direct labels, the green accent for the value and line colour for the track; red and amber only
for status thresholds (≥ 95% green, 80–95% amber, < 80% red).

## Before a screen is done

Run the anti-slop checklist in docs/11-ui-skills.md (and $impeccable critique if installed), take a screenshot, compare
with docs/screens/.
