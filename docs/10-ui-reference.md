UI reference: screens and design
The Screens folder next to this document has 26 screenshots of the live app (1440 × 900 at 2×, taken on 4 November 2026). Use them for what is on each screen and how the flow goes. Don't copy the styling pixel for pixel: the current look is the minimal version, and the section "Don't copy these" lists what makes it look generic. Document 11 says how to do better.
Codex can look at images: put the folder in docs/screens/ in the repo and name the file in each task ("build the Overview like docs/screens/02-overview.png, following DESIGN.md").
Screens
File
	Screen
	Look for

	00-landing.png
	Landing (once per browser session)
	Hero, the four steps, client list with latest match rate, Enter workspace, Take the tour
	01-login.png
	Sign-in
	Username, password, show password, error line
	02-overview.png
	Overview, Zestly Demo
	Latest-close banner, 98.3% ring, four KPI cards, stage rings, "KIRA learns as it runs" bars and chips, History calendar, Needs your attention
	03-workflow-1-upload.png
	Workflow step 1 · Upload
	Three areas (POS, Settlement, Mutation), files, history, stepper
	04-workflow-2-convert.png
	Step 2 · Convert, rules already saved
	Raw → clean preview per table, 100% per table
	05-workflow-3-clean.png
	Step 3 · Clean, nothing new to decide
	Cleaned tables with tabs and counts, "Show before cleaning"
	06-workflow-4-match.png
	Step 4 · Match, after a run
	Stage cards, rules, results ring and totals
	07-analysis-rate-table.png
	Match analysis · Match rate · Table, only rows under 100%
	Filter bar, KPI cards, tabs, group by Day/Week/Month, Outlet/Provider toggles, two-level header (Rows · Match rate), red cell for Harbor Square 24 Oct, total row, the unlinked-credit note, money gaps list (Expected / To check)
	08-analysis-rate-matrix.png
	Match rate · Matrix
	Outlets × days, coloured cells, totals, trend and ranking
	09-analysis-linked-l1.png
	Match map · Linked tables, POS ↔ Settlement
	Two tables side by side, status chips with counts, link ids, column picker, footer sum, link toggle in the middle
	10-analysis-linked-l2-harbor.png
	Linked tables, Settlement ↔ Bank, Harbor Square 24 Oct
	142 "Not found" settlements, empty bank side, footer nett Rp 9.031.421 (the demo moment)
	11-analysis-chains.png
	Match map · Chains
	POS │ settlement │ bank in one row, what differs
	12-analysis-records.png
	Records
	Search, status chips, reason, amount range, group by bank credit, export
	13-analysis-followup.png
	Follow-up
	Status, assignee, note per record, counts
	14-kira-chat-panel.png
	Kira chat panel
	Header, "Looking at…" context line, greeting, quick chips, input
	15-tutorial-panel.png
	Tutorial panel
	Start from the beginning, chapters, options
	16-compare-dialog.png
	Compare dialog (from Records)
	Fields side by side marked agrees / differs / missing, follow-up form, Ask Kira
	17-decision-upload-rule.png
	Step 2 with decisions open (sample files)
	"Create an upload rule for POS?" cards: required columns and where each comes from, column list with keep tick, type and sample, Create rule
	18-decision-cleaning.png
	Step 3 with recommendations open (sample files)
	Cards per column: value in file → standard value, rows affected, Accept / Reject, bank row kinds
	19-decision-matching-suggestions.png
	Step 4 before any rule (sample files)
	Suggested rules with how many rows each matches, Save
	21-analysis-filters-simplified.png
	Match analysis with the simpler filters (5 Nov)
	One selection bar (Period chips, Pick dates, Outlet), "Showing only Harbor Square × Sat 24 Oct × Clear all", the toolbar sentence "One row per Day and ✓ Outlet", the switch "Only rows under 100%"
	22-follow-up-kira-drafts.png
	Follow-up of Harbor Square 24 Oct after "Draft notes for this list"
	The language choice, "142 notes drafted by Kira" with Discard drafts / Save 142 notes, every row's form filled by Kira and marked as a draft
	23-follow-up-saved-by-kira.png
	Follow-up, Investigating
	The 142 Harbor Square records with Kira's note, assigned to Andrew, "Kira (approved by Taufiq)"
	24-kira-approval-follow-up-notes.png
	Kira asks to save a follow-up note
	The approval card: which records, status, assignee and the full note; Approve / Reject
	25-matching-rules-order-and-totals.png
	Step 4 rule list
	One total per stage on the rules card; each rule with ↑ ↓ and Edit
	26-matching-rule-edit.png
	Editing a saved rule
	The rule's conditions, the numbers on its own and on top of the other rules, Save changes / Cancel
	Screens 17–19 come from the built-in DANA/GoPay sample files, because the Zestly demo client has every decision made already. The cards look the same with the Zestly files.
Filters (simplified on 5 November)
Users found the old filters unclear: two places to pick dates, "Outlet" meaning a filter in one place and a way to split rows in another, date fields always showing mm/dd/yyyy, and no clear way to see what was filtering a table. Now:
* One selection bar says which data the whole page shows: Period (All dates · Latest day · Last 7 days · This month · Pick dates; the date fields appear only after Pick dates), Outlet, and Provider only when there is more than one.
* Every active filter is a chip under the bar: "Showing only Zestly Harbor Square Surabaya × Sat 24 Oct 2026 × Clear all". Without filters: "Showing everything: all outlets, all dates", with the days and POS sales on the right.
* Table toolbars only say how to show it, as a sentence: "One row per [Day | Week | Month | Whole period] and [✓ Outlet] [Provider]"; then a switch "Only rows under 100%", "Find in this table…", Columns, Export.
* Records: search and status chips stay in front; reason and amount range sit under "More filters" with a count of the active ones.
* Rules card (step 4): one total per stage, never a sum of both; the rule names shorten with "…" and the full name shows on hover, so the second column is never cut off.
Layout
* Sidebar 222 px, fixed: logo, client switcher card, navigation (Overview, Workflow, Match analysis), profile at the bottom. 190 px under 1180 px wide.
* Top bar: breadcrumb (Daily work / page), then Tutorial, Reset demo, profile menu.
* Page head: title, one-line subtitle, actions on the right (Open workflow, Copy link, Ask Kira).
* Content up to 1500 px wide.
* Kira's button floats bottom right on every page; the panel opens above it.
Design tokens in the current app
Token
	Value
	Used for

	bg
	#f6f7f4
	page background
	surface
	#ffffff
	cards, tables
	ink
	#202c29
	text
	muted
	#77807b
	secondary text
	line
	#e6eae4
	borders, dividers
	green
	#285d47
	primary, matched, rings
	dark
	#173f35
	primary buttons, active step, table header band
	mint
	#eaf3eb
	matched backgrounds, active nav
	lime
	#d2ecaf
	client card, highlights
	amber / amberbg
	#936724 / #fcf4e5
	needs review, "to check"
	red
	#b45e51
	mismatched, 0% cells
	focus ring
	3 px #96ba69, offset 3 px
	keyboard focus
	* Fonts: DM Sans 400–700 for text, Manrope 600–800 for titles and big numbers (Google Fonts).
* Body text 13 px, line height 1.5.
* Corner radius 13 px on the main cards (8–12 px elsewhere).
* Numbers in Indonesian format: 8.639, Rp 565.628.000. Percentages are written 98.3%.
The palette (deep green, mint, lime) is a good base for a finance tool: keep it. The problems are in type, spacing and repetition, below.
Components
KPI card · match-rate ring · stage ring · stepper (4 steps) · decision card (upload rule, cleaning recommendation, suggested matching rule) · data table (sticky header, two-level header, status chips with counts, column picker, footer aggregate with column and function, paging, row ticks) · filter bar (quick periods, from–to dates, outlet, provider) · tabs with a subtitle · segmented control (Table | Matrix, Linked tables | Chains) · status chips (Matched, Needs review, Mismatched; Linked, Review, Not found; Expected, To check) · toast · modal (compare dialog, link by hand, reset confirmation) · chat panel (messages, "How Kira got this" trace, approval card with Approve / Reject) · tour bubble with spotlight · calendar month grid.
Don't copy these
These are what make the current UI look like a generic AI-built app. Fix them in the rebuild (document 11 has the tools and a checklist):
* Type too small and too many sizes. Hundreds of font sizes under 12 px in the stylesheets (labels at 9–11 px, nine different sizes below 12 px alone). Use a real scale (for example 12 / 13 / 14 / 16 / 20 / 28 / 40) and nothing under 12 px for content.
* Five corner radii (8, 9, 10, 12, 13 px). Pick two.
* A spaced all-caps eyebrow over every title ("FINANCE WORKSPACE", "STEP 3 OF 4", "SELECTED CLIENT"). Drop it, or keep it on one screen at most.
* Middle-dot strings in subtitles and footers ("zestly-demo · what arrived, what's still missing…").
* Every block is the same bordered card, cards inside cards. Let tables sit on the page; keep cards for things you act on.
* Gradient bars in the learning chart. Use flat bars with direct labels.
* Slogan copy ("Your cash, accounted for.", "Every number has its evidence."). Say what is on the screen ("Close of 26 Oct: 8.639 of 8.784 sales reached the bank").
* US date inputs (mm/dd/yyyy) in an Indonesian app, and mixed number styles (98.3% next to 8.639). Choose one locale and use it everywhere.
* Leftover chips in the chat panel ("Explain the Rp 12.000 case") that don't fit the data.
* The mascot floats over table columns (it covers "Bank → Settlement" and "End to end" in 07). Give the chat button a place that never covers data.
Starter DESIGN.md for the rebuild
Put this at the repo root as DESIGN.md, improve it with the tools in 11 before the event, and tell every Codex task to follow it.
* Product: KIRA, payment reconciliation for Indonesian merchants. Users: reconciliation analyst (daily), finance lead (reads rates and gaps), new team member. Mood: calm, exact, trustworthy; dense where there is data.
* Colour: the tokens above. One accent (green). Amber and red only for status. No gradients, glass or glow.
* Type: DM Sans for text and tables, Manrope for page titles and big numbers; scale 12 / 13 / 14 / 16 / 20 / 28 / 40; tabular figures for every number; numbers right-aligned.
* Shape: radius 8 px for controls, 12 px for panels; one shadow, for overlays only.
* Spacing: 4 px base (4, 8, 12, 16, 24, 32, 48).
* Formats: Rp 9.031.421; 98,3 % or 98.3% (pick one); dates "Sat 24 Oct 2026" in tables, ISO in the URL.
* Status: Matched (green), Needs review (amber), Mismatched (red) with the reason as text, never colour alone.
* States: every table has loading (skeleton rows), empty (what to do next) and error (the server's message) states.
* Motion: only in answer to an action (run counters, highlight); honour reduced motion.
