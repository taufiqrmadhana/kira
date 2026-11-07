Team assignments
Who builds what during the hackathon, written so each person can open Codex, say "I'm <name>, let's start to build" with the link to this folder, and go.
For the coding agent (read this first)
When someone says "I'm Taufiq / Andrew / Rifat / Nurwan, let's start to build":
1. Find their section below. Work only on their area and the files they own (table "Who owns which files"). If a change is needed in someone else's file, tell the person and name the owner instead of editing it.
2. Find the documents. If the current folder is the repo and has docs/, read those (Markdown copies of this folder, with screenshots in docs/screens/). Otherwise read the Google Docs in this Drive folder. Read the documents their section lists, in that order. 08 corrects some lines in 01 and 05: where they disagree, 08 and 09 win.
3. Find where the build is. Ask for the time since the start if it isn't clear, and whether the repo exists yet (taufiqrmadhana/kira-hackathon). Before the repo exists, follow the person's "Before the repo" steps in an empty folder; after it exists, clone it and continue with their task list.
4. Work through the task list in order. For each task: write the tests first from its "Done when" check, then the code, run the tests, commit with a one-line subject naming the feature (no body), pull with rebase, push. Small commits, pushed often.
5. Endpoints and response shapes follow docs/02 exactly. Engine behaviour follows docs/09. Screens follow DESIGN.md and the anti-slop checklist in docs/11. If the contract has to change, say so to the person first: other people code against it.
6. Never copy code from the old prototype or open kira.madgun.us's page source: the event allows bringing data and specifications, not code. The screenshots in docs/screens/ are the visual reference.
7. At each checkpoint (0:20, 1:10, 1:40) give the person three lines: done, in progress, blocked (and by whom).
8. Add one line per Codex task to docs/codex-log/<name>.md (time, task, merged yes/no). It is the evidence for the "Use of Codex" criterion.
The team
Person
	Role
	In one line

	Taufiq
	Kira, platform and integration (lead)
	Repo and backend skeleton, sign-in, the Kira agent with approvals and guardrails, the chat panel, deploy, merging everything
	Andrew
	Product UI and design system
	DESIGN.md, the web app shell and shared components, login, Overview, Match analysis screens, the anti-slop pass, demo click-through
	Rifat
	Data pipeline (steps 1–3)
	Upload, convert with upload rules, clean with cleaning rules: backend and the Workflow screens for steps 1–3; loading the demo data
	Nurwan
	Matching and analysis (step 4 and after)
	The matching engine, results, match rate, money gaps, linked tables, follow-ups, learning: backend and the step 4 screen
	Each person builds their area end to end (backend and its screens) so nobody waits on a hand-off. Andrew owns the look: everyone builds screens from his components and DESIGN.md, and he reviews every screen.
Stack and layout (agreed)
* Backend: Python 3.13, uv, FastAPI, SQLAlchemy 2 on SQLite (one file per client), Google ADK 2.12.0 with LiteLLM 1.106.2 (and mcp 2.3.0), DeepSeek via DEEPSEEK_API_KEY. Port 8000.
* Web: React + Vite + TypeScript, Tailwind with the DESIGN.md tokens, TanStack Table. Dev server 5173 with /api proxied to 8000. npm run build writes web/dist, which FastAPI serves at /.
* Layering: api and agent → services → core + models. Only services change data. core has no database.
* Repo: taufiqrmadhana/kira-hackathon (private), everyone pushes small commits to main.
kira-hackathon/
 AGENTS.md  DESIGN.md
 docs/            00–12, data-guide.md, screens/, codex-log/
 data/            the demo data (not committed if the rules say so; see Rifat)
 backend/
   pyproject.toml
   kira/  config.py db.py models.py standard.py
          core/      parsing.py cleaning.py matching.py analysis.py
          services/  state.py status.py clients.py learning.py files.py convert.py clean.py match.py analysis.py manual.py
          api/       app.py deps.py auth.py routes/
          agent/     agent.py tools.py chat.py guard.py
   tests/
 web/
   src/  main.tsx App.tsx lib/ components/ pages/ kira/

Who owns which files
Owner
	Backend
	Web

	Taufiq
	pyproject.toml, config.py, db.py, models.py (writes every table from 03 in the skeleton; others ask him for changes), services/state.py, status.py, clients.py, learning.py (note() only), api/app.py, deps.py, auth.py, routes/status.py, routes/auth.py, routes/clients.py, routes/agent.py, agent/*
	src/kira/* (chat panel)
	Rifat
	standard.py, core/parsing.py, core/cleaning.py, services/files.py, convert.py, clean.py, routes/files.py, convert.py, clean.py, tests/test_pipeline_*.py
	src/pages/workflow/ (page, stepper, Step1–Step3)
	Nurwan
	core/matching.py, core/analysis.py, services/match.py, analysis.py, manual.py, learning.py (summary), routes/match.py, analysis.py, overview.py, tests/test_matching_.py, test_analysis_.py
	src/pages/workflow/Step4*
	Andrew
	(none)
	package.json, vite and tailwind config, src/main.tsx, App.tsx (routes and nav), lib/api.ts, lib/format.ts, components/, pages/Login, pages/overview/, pages/analysis/*
	Shared one-line edits are fine (adding a router to api/app.py, a route to App.tsx); pull first, keep them one line.
Interfaces to agree in the first 20 minutes
From 06 "Interfaces to agree on early", unchanged: the record shape (/analysis/records), the side row (/analysis/side), the rate row (/analysis/rates), the agent reply {reply, pending, tool_calls}, and errors as 409 with detail. Plus three function signatures other people call:
* learning.note(s, kind, **data) (Taufiq's stub, Nurwan's summary): Rifat calls it when an upload rule is decided and when cleaning is saved; Nurwan when a matching rule is saved and when stage l2 runs.
* state.audit(s, actor, action, obj, detail="") and WorkflowError (Taufiq): everyone.
* services/analysis.py summary, rates, gaps, match_map, find_keys, follow_ups (Nurwan, signatures as in 03): Kira's tools call them.
Timeline
Time
	Taufiq
	Andrew
	Rifat
	Nurwan

	Before 0:00
	DeepSeek key, deploy target ready, Repo starter downloaded
	DESIGN.md drafted from 10
	Data unzipped
	Data unzipped
	0:00–0:05
	Create repo, push Repo starter, send link
	Web scaffold locally
	Engine work in a scratch folder
	Engine work in a scratch folder
	0:05–0:20
	Backend skeleton, models, sign-in, push
	Tokens, shell, components, login page, push
	parsing.py, standard.py with tests
	matching.py ID + withdrawal rules with tests
	0:20
	Checkpoint: skeleton runs, shapes agreed






	0:20–1:10
	Agent read tools, chat API, guard; then change tools with approval
	Overview; Match rate table and money gaps
	Upload, convert, clean services and routes; Workflow steps 1–3 screens
	Match services and routes, results, rates, gaps, overview, learning; step 4 screen
	1:10
	Checkpoint: day 1 of with-exceptions runs end to end in the app






	1:10–1:40
	Chat panel with approval card and highlights; deploy
	Linked tables with tick & tie; Follow-up tab
	Load days 1–7 into the demo clients, one day per request
	/analysis/side, follow-ups, export; check every number against the Data guide
	1:40
	Checkpoint: demo data loaded, every demo screen works






	1:40–2:00
	Everyone: day 8 live run, fixes, the 07 script once, Andrew leads the click-through






	Included since 5 November: Kira's follow-up drafts, rule order and edit, the simpler filters, one total per stage on the rules card (see 08 "Added on 5 November").
If there are more than two hours, add back in this order: Records tab, Matrix, links made by hand, Tutorial, shareable links, landing page, client switcher, Reset, Excel and PDF upload, AI header mapping.
________________
Taufiq · Kira, platform and integration (lead)
Read: 00, 08, 12 (this), 04, 02 (Sign-in, Clients, Kira agent, Workflow, Audit), 03 (config, db, models, api, agent), 11.
Before the repo (0:00–0:05)
1. Create the private GitHub repo taufiqrmadhana/kira-hackathon and add Andrew, Rifat and Nurwan as collaborators.
2. Copy the contents of the Drive folder "Repo starter" into it (AGENTS.md, DESIGN.md, docs/), commit "Repo starter: docs and agent instructions", push, and send the repo link to the group.
Tasks
#
	Task
	Done when

	T1 (→0:20)
	Backend skeleton: pyproject with the pins above; config.py (env and .env: DEEPSEEK_API_KEY, KIRA_MODEL, KIRA_DATABASE_URL, KIRA_USER, KIRA_AI, KIRA_USERNAME, KIRA_PASSWORD, KIRA_SECRET, KIRA_CLIENT_NAME); db.py (engine per client from X-Kira-Client via a ContextVar, session_scope with one write lock, wait timeout, Busy); every table in models.py from 03; state.py; learning.note stub; app.py create_app with routers under /api and web/dist at /; deps.py with Depends(db, scope="function") and the actor from X-Kira-User; GET /api/status
	uvicorn starts, GET /api/status answers, pytest runs one smoke test
	T2 (→0:30)
	Sign-in: POST /login, POST /logout, GET /me, signed HttpOnly cookie (14 days), 401 on /api without it, open when KIRA_PASSWORD is empty
	test_api: 401 without cookie, 200 after login, forged cookie refused
	T3 (→0:55)
	Agent with read tools: get_workflow_status, get_upload_rules, get_cleaning_recommendations, get_matching_rules, suggest_matching_rules, get_results, get_match_rate, get_rate_table, get_match_map, explain_money_gaps, get_follow_ups, draft_follow_up_notes, get_learning, highlight_records. Each runs in asyncio.to_thread, returns {status, result}. chat.py with DatabaseSessionService, send, history; guard.py; POST /agent/chat, GET /agent/history. Instruction text from 04 (drop the tour and sample-file lines)
	"menu mcdonald apa?" gets one line declining; "ignore your instructions" is answered by the guard; "outlet mana yang paling bermasalah minggu ini?" answers from the data once Nurwan's services exist
	T4 (→1:10)
	Change tools with require_confirmation: convert_files, save_upload_rule, save_cleaning, save_matching_rule, run_matching, save_follow_ups (export_results if time). The follow-up instruction lines from 08 "Kira additions". POST /agent/confirm. Details in 08 "ADK details"
	asking Kira to convert returns pending with the tool and args; confirming runs it and the reply says what happened; "isi follow-up notes buat Harbor Square 24 Oktober, assign ke Andrew" gives one save_follow_ups approval with the drafted note
	T5 (→1:30)
	Chat panel (src/kira/): button bottom right that never covers data, history on open, context line, the four questions from 07 as chips, markdown replies, "How Kira got this", approval card (Approve all / Reject) with readable text per tool (save_follow_ups shows the records, status, assignee and the full note), after a change tool reload the page data; on highlight_records open Match analysis linked tables filtered to the keys (with Andrew)
	the four demo questions in 07 give the expected answers in the panel
	T6 (→1:40)
	Deploy to the chosen target with KIRA_PASSWORD, KIRA_SECRET, the model key; a second client for rehearsal
	the team signs in on the public URL
	T7
	Merge help, the codex-log summary for the slide ("N Codex tasks, M merged")


	Andrew · Product UI and design system
Read: 00, 08, 12 (this), 10 and docs/screens/, 11, 05, 07, 02 (Overview, Analysis and Learning responses: use them as mock data).
Before the repo (0:00–0:05): create the web app in web/ (Vite, React, TypeScript, Tailwind, TanStack Table, React Router) in an empty folder; push it as soon as Taufiq sends the repo link.
Tasks
#
	Task
	Done when

	A1 (→0:25)
	DESIGN.md final (from the starter, with Impeccable's init if installed). Tailwind theme from its tokens. lib/api.ts (adds X-Kira-User and X-Kira-Client, 401 → /login, errors become the server's detail), lib/format.ts (Rp 9.031.421, dates, percentages in one style). Shell: sidebar (logo, client name, Overview, Workflow, Match analysis, profile), top bar. Components: Button, StatusChip, KpiCard, Ring, DataTable (sticky header, sort, paging, footer total, row ticks), Tabs, Segmented, Modal, Toast, Empty / Loading / Error. Login page. Push
	the others can build pages from the components; login works against Taufiq's backend
	A2 (→0:50)
	Overview: latest close line, match-rate ring, Matched / Mismatched / Needs review / Bank credits explained, stage rings, "KIRA learns as it runs" bars (GET /learning, flat bars, direct labels), Needs your attention (GET /overview)
	matches the numbers in docs/screens/02-overview.png on the demo data
	A3 (→1:10)
	Match analysis page with the simpler filters (10 "Filters", screen 21): one selection bar (Period chips, Pick dates, Outlet, Provider only when more than one) with every active filter as a chip with × and Clear all; KPI row; tabs Match rate · Match map · Follow-up. Match rate table toolbar as a sentence: One row per Day / Week / Month / Whole period and ✓ Outlet / Provider, the switch Only rows under 100%, Find, Columns, Export; sort, total row, the unlinked-credit note; under it the money differences list (Expected / To check with counts and rupiah)
	the 07 bookmark view (day, by outlet, only under 100%) shows Harbor Square 24 Oct at 0%
	A4 (→1:35)
	Linked tables: stage switch (01 POS ↔ 02 Settlement, 02 Settlement ↔ 03 Bank), two tables side by side with status chips and counts, link ids, search, footer sum; ticking rows on one side filters the other; tick & tie bar with the difference. Follow-up tab: status, assignee, note (a two-line box), save; Draft per record and Draft notes for this list (POST /analysis/follow-ups/draft, notes in English or Bahasa Indonesia), drafted rows marked, a bar with Discard drafts / Save N notes (POST /analysis/follow-ups/bulk)
	Harbor Square 24 Oct, stage 2: 142 Not found, bank side empty, footer nett Rp 9.031.421; Draft notes for this list fills every row (all pages; Harbor Square 24 Oct: 142 drafts, one note), Save all stores them, and they show after reload
	A5 (→1:50)
	Anti-slop pass on every screen with the checklist in 11 (and $impeccable critique / audit if installed), screenshot each, fix; lead the click-through of the 07 script
	checklist passes on every screen; the script clicks through without an error
	Rifat · Data pipeline (steps 1–3)
Read: 00, 08, 12 (this), 09 sections 1–3, data-guide, 02 (1 Upload, 2 Convert, 3 Clean), 03 (standard.py, core/parsing.py, core/cleaning.py, services files, convert, clean), 05 (Workflow), 10 (screens 03, 04, 05, 17, 18).
Before the repo (0:00–0:20): in a scratch folder, write standard.py (lists in 09 section 1, COLUMN_ALIASES included), core/parsing.py and core/cleaning.py as pure functions with pytest, using the Zestly files in data/with-exceptions/day-01-20261020 and day-08-20261027-new-format. Move them into the repo at 0:20.
Tasks
#
	Task
	Done when

	R1 (→0:20)
	Pure functions: read CSV, normalise headers, numbers, dates (WIB), types, aliases, profile, build the Layer 1 table, rule diff, wrong-area guess; outlet names from POS, outlet matching, bank row kinds, recommendations, apply, save (09)
	tests: day 1 settlement fills branch, reference, transaction_date, gross_amount, nett_amount from aliases; POS fills sales_datetime_out; "Zestly - Central Plz" matches Zestly Central Plaza Jakarta
	R2 (→0:40)
	services/files.py and routes: POST /files/{type} (multipart, several files), GET /files, download, move, delete; SHA-256 duplicate refused; wrong-area hint; any change marks the conversion stale and clears matching
	uploading the same file twice is refused; a bank file dropped in POS gets the hint
	R3 (→0:55)
	services/convert.py and routes: POST /convert, GET /convert, GET /upload-rules, POST /upload-rules/{type} {choice, columns?, rename?}; learning.note on every decision
	day 1: three "create" cards; after creating, Layer 1 tables exist; day 8 on top: one "update" card for POS (order_channel)
	R4 (→1:10)
	services/clean.py and routes: GET /cleaning, POST /cleaning/recommendations/{id} {decision, mapping?}, POST /cleaning/save, GET /tables/{layer}/{type}; learning.note on save
	day 1: two cards (settlement branch names, bank row kinds); day 8: one (Central Plz)
	R5 (in parallel from 0:40)
	Workflow screens with Andrew's components: stepper (steps open in order), Step 1 (three areas, drop files, list, history), Step 2 (convert button with progress, upload-rule cards: required columns and where each comes from, keep ticks, types, Create / Update / Keep), Step 3 (recommendation cards: value → standard value, rows, Accept / Reject / Undo, Save; cleaned table with "Show before cleaning")
	screens 17 and 18 in docs/screens work against the real backend
	R6 (1:10–1:40)
	Load the demo: clients zestly-demo and zestly-demo-latihan; for each, days 1–7 of with-exceptions, one day per request (convert after each day), decisions as on the first close, then ask Nurwan to run both stages. Keep day 8 out for the live demo. Keep the data out of git unless the organisers say otherwise
	Overview of zestly-demo shows 98.3% and 7 decisions
	Nurwan · Matching and analysis (step 4 and after)
Read: 00, 08, 12 (this), 09 sections 4–7, data-guide, 02 (4 Match, 5 Analysis, Workflow: overview and learning), 03 (core/matching.py, core/analysis.py, services match, analysis, manual, learning), 05 (Step 4, Match analysis), 10 (screens 06, 07, 10, 19).
Before the repo (0:00–0:20): in a scratch folder, write core/matching.py as pure functions with pytest: the ID rule, the withdrawal rule, suggest for both, final_result (09 section 4). Tables are {"columns": [...], "rows": [...]}; build small test tables by hand and one from the day-01 files once Rifat's parser exists.
Tasks
#
	Task
	Done when

	N1 (→0:20)
	core/matching.py: run_l1 (ID and composite), run_l2 (withdrawal; ref, batch, amount if time), suggest, final_result, export_csv
	suggest l1 gives "ID: trace_number = external_reference_id", l2 gives "Withdrawal payout by entity_id"; clean-100 gives 8,784 full
	N2 (→0:45)
	services/match.py and routes: GET /matching/rules, GET /matching/{stage}/suggestions, POST /matching/{stage}/rules, POST /matching/{stage}/preview (with exclude), PATCH /matching/rules/{id} (edit), POST /matching/{stage}/order (reorder), DELETE /matching/rules/{id}, POST /matching/{stage}/test, POST /matching/{stage}/run (l1 clears l2), GET /matching/results, GET /matching/export; learning.note on rule saved and on l2 run
	with-exceptions days 1–7: l1 8,781 linked, l2 8,641 of 8,783 settlements, 69 of 70 credits, 8,639 full
	N3 (→1:10)
	core/analysis.py records, allocate, rate_rows, gaps; services/analysis.py with the records cached per run; GET /analysis/summary, /analysis/rates, /analysis/gaps, /analysis/records (basic), GET /overview, GET /learning (decisions per close and what the rules cover)
	gaps: to check Rp 10,671,421, expected Rp 26,361; rates: Harbor Square 24 Oct 0%; learning: close 1 = 7 decisions
	N4 (in parallel from 0:45)
	Step 4 screen: per stage, suggested rules with how many rows each matches, Save, Test, Run (counters), results ring and totals; the rule list with ↑ ↓ (order) and Edit (the rule's conditions with live numbers, Save changes); the rules card with one total per stage
	screens 19, 25 and 26 in docs/screens work against the real backend; editing a used rule clears the stage's results
	N5 (1:10–1:40)
	GET /analysis/side/{stage}/{table} (link ids M1-…, M2-…, Linked / Review / Not found, footer aggregates), GET and POST /analysis/follow-ups (kept across runs), match_map and find_keys for Kira; services/followup.py (09 section 8: rule notes first, AI on top) with POST /analysis/follow-ups/draft and /bulk; run both stages on the demo clients after Rifat loads them
	Harbor Square 24 Oct stage 2: 142 Not found, nett Rp 9,031,421; a follow-up survives a new run; drafting the open records gives one note for the 142 Harbor Square records
	Before the day (everyone)
* Python 3.13 and uv, Node 22, git, Codex CLI signed in.
* Codex can read this Drive folder (Google Drive plugin: codex plugin add google-drive@openai-curated-remote), or download the Repo starter folder by hand.
* UI skills from 11 installed (at least Impeccable and web-design-guidelines); Andrew also the data-visualisation plugin.
* Data/with-exceptions.zip and clean-100.zip unzipped (Rifat and Nurwan need them first).
* Each person has read their section and the documents it lists once.
