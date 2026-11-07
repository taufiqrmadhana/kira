Gaps and fixes before the build
Checked on 4 November 2026 against the live site (kira.madgun.us, branch kira-final, commit 0728478) and the code behind it. Read this after 00 and before 06.
Verdict
The kit (00–07 and Data) is enough to know what to build: the product, every screen and flow, every endpoint with a real response, Kira's 25 tools and full instruction, the demo script, and data with answer keys.
It was not enough on its own in four places, now filled by documents 09–11:
Gap
	Why it matters
	Now in

	How the engine works. Document 03 lists 156 functions without a description, including run_l1, run_l2, suggest, final_result and every parser.
	Without the rules you won't reproduce the numbers in the Data guide (8,639 of 8,784; Rp 10,671,421 to check).
	09 Engine rules
	COLUMN_ALIASES. Document 03 says "see the source", and the source can't be brought.
	The Zestly settlement file fills 5 required columns through these aliases (branch ← merchant_store_name, reference ← transaction_id, transaction_date ← create_time, gross_amount ← transaction_amount, nett_amount ← settlement_amount; POS sales_datetime_out ← sales_date_out). Without them, the upload-rule cards show 6 required columns as Not found, someone picks each by hand (or you depend on the AI being up), and day 8 is no longer "2 questions".
	09 Engine rules
	What it looks like. The only visual reference was the live site.
	If the site is down, or you want Codex to see a screen, you need images and design tokens.
	10 UI reference + Screens folder
	A plan that fits the time. Document 06 has phases but no hours. The current site is about 4,900 lines of Python, 10,500 of JavaScript and 5,700 of CSS.
	Four people with Codex can rebuild the demo path in about two hours, not the whole site.
	The two-hour plan below
	Corrections to documents 00–07
Where
	It says
	Actually

	01 · 3 Backend · API table
	"Sign-in is not built yet."
	Built: login page, POST /api/login, signed HttpOnly cookie. The Sign-in paragraph near the top of 01 and document 02 are right.
	01 · 3 Backend · Kira agent
	"Sessions are kept in memory (InMemorySessionService)."
	DatabaseSessionService in kira_chat.db next to the SQLite database, so chats survive a restart. Document 04 is right.
	01 · 2 Web page (pipeline.js, cleaning.js, matching.js, assistant.js tables)
	Browser-side engines, localStorage kira-pipeline-v1, IndexedDB stores.
	Browser mode is gone. Don't rebuild any of it: every number comes from the API.
	05 · Scripts and functions
	Function lists for app.js, workflow.js, reruns.js, simplify.js, governance.js, match-grid.js, samples.js, assistant.js.
	About 330 KB of legacy code from the first Codex prototype (reruns, governance, scorecard, agreements, data explorer…). None of those screens are reachable in the current app. Build from the screen-by-screen first half of 05, not from the function list, and don't copy the "a later file replaces a global function" pattern.
	05 · Kira chat panel
	Quick questions for the current page.
	The live panel still shows old prototype chips ("Explain the Rp 12.000 case", "Where are we on 26 Oct?") that don't fit the Zestly data. Use the questions in 07 instead.
	01 · 2 Web page
	/api/workflow?rows=100 is about 150 KB.
	About 0.4 MB on 8,784 sales (05 is right).
	01 · Step 3 · data standard
	Outlets Menteng and Senopati, providers DANA and GOPAY.
	Those lists only serve the built-in sample files. With the Zestly data the outlet names come from the POS file. The Zestly POS file has no payment_method_ori column, so there is no provider card; that's why day 1 has exactly 2 cleaning cards (settlement branch names and bank row kinds).
	Added on 5 November: build these too
Four changes went into the live app after the kit was written. The rebuild includes them; the tasks are in 12.
Change
	What the user sees
	Specified in

	Kira drafts follow-up notes
	Follow-up tab: Draft on a record, or Draft notes for this list (notes in English or Bahasa Indonesia). Kira writes one note per reason, outlet and day from the evidence: what is wrong, the numbers and dates, the next action. A person checks, changes what they want, then Save all. In the chat: "isi follow-up notes buat Harbor Square 24 Oktober, assign ke Andrew" → Kira drafts, then asks for approval to save.
	below, 09 section 8, screens 22–24
	Matching rules: order and edit
	Step 4's rule list: ↑ ↓ change the order the rules run in; Edit opens a saved rule's conditions with the live numbers; Save changes. Results made with the old order or version are cleared, so the stage is tested and run again.
	below, 09 section 4, screens 25–26
	Simpler filters
	Match analysis: one bar says which data (Period chips, Pick dates, Outlet, Provider only when there is more than one), every active filter is a chip with × plus Clear all; the table toolbar reads "One row per Day … and ✓ Outlet", a switch "Only rows under 100%"; rarely used record filters sit under More filters.
	10 "Filters", screen 21
	Rules card totals
	One total per stage ("8.781 sales → settlement", "8.641 settlements → bank"). The old card added both stages ("31.040 matched"), which counted each sale twice, and cut off the second column.
	10, screen 25
	Contract additions (also at the end of 02)
* POST /api/analysis/follow-ups/draft body {rids?: [string], keys?: [string], only_empty?: bool, lang?: "en" or "id"}; without rids or keys, the query's scope (date_from, date_to, outlet, provider, reason) picks the records that aren't matched. Response {drafts: [{rid, key, status, note, assignee, by: "ai" or "rule", group}], groups: [{label, records, total, status, note, keys, by}], by, skipped}. Nothing is saved, and it doesn't take the write lock.
* POST /api/analysis/follow-ups/bulk {items: [{rid, status, note, assignee}]} → {saved, follow_ups: {rid: {status, note, assignee, by, at}}}. 409 when empty or over 2,000 items.
* PATCH /api/matching/rules/{id} {kind, params, name} → the rule plus results_cleared (true when the current results used it).
* POST /api/matching/{stage}/order {rule_ids: every rule id of the stage, first one first} → the stage's rules in the new order. 409 unless the list is exactly the stage's rules.
* POST /api/matching/{stage}/preview also takes exclude: the id of the rule being edited, so "more after your saved rules" compares with the other rules.
Kira additions (also at the end of 04)
* Read tool draft_follow_up_notes(keys = None, outlet = "", day = "", reason = "", language = "en", only_empty = True): the drafted groups {label, records, total, status, note, keys, by}, the number of records, and how many already had a note. Nothing saved.
* Change tool (approval) save_follow_ups(note, status = "investigating", assignee = "", keys = None, outlet = "", day = "", reason = ""): one note on the given keys, or on every open record of that outlet, day and reason. Refuses when no records are named; at most 1,000 at once. Audit: "Kira (approved by <user>)".
* Instruction: replace "Linking rows by hand and following up are done by people on the page, not by you." with: "Follow-up notes: when the user asks you to fill in, write or suggest follow-up notes ("isi follow-up", "bikinin catatan"), call draft_follow_up_notes (language = the user's), say in one or two lines what you drafted per group, then call save_follow_ups once per group with the drafted note (the app asks the user to approve). Keep the drafted facts; set an assignee only when the user names one. Linking rows by hand stays with people on the page."
* Approval card text: "Save a follow-up note on <reason · outlet · day, or N records>: <status>, assigned to <name>. Note: “…”".
Checked on the demo data with the real model: drafting all 148 open records takes about 8 seconds (7 groups). The 142 Harbor Square records get one note: "SHOPEEPAY payout for Zestly Harbor Square Surabaya (store 69795388) of 2026-10-24 is not in the bank: 142 settlements, Rp 9.031.421, as of the 2026-10-27 statement (3 days). Ask SHOPEEPAY for the payout status and check the next statement." Asked in the chat in Indonesian, Kira drafted the same in Indonesian, asked for approval, and saved it on all 142 records, assigned to Andrew.
Decide before the event
1. Where the rebuilt app runs. Document 06 only says "deploy target". Pick it (a new hostname on the homelab tunnel, or a PaaS), name who sets it up, and test a hello-world there beforehand. Cloudflare cuts requests after 100 s, so convert per day.
2. Model key. DEEPSEEK_API_KEY (or whatever the event provides) on every laptop, plus KIRA_PASSWORD and KIRA_SECRET for the deploy.
3. The stack for the page (recommendation below).
4. The rules. Screenshots, design tokens and skill files are not KIRA code, but confirm with the organisers that bringing them is fine. Don't run Codex's url-to-code on kira.madgun.us during the event: it copies the old front end, which is code.
Recommended stack
Part
	Choice
	Why

	Backend
	As built: Python 3.13, FastAPI, SQLAlchemy 2 on SQLite (one file per client), uv. Pins that worked: google-adk==2.12.0, litellm==1.106.2, mcp==2.3.0; plus fastapi, uvicorn, python-multipart, python-dotenv, openpyxl, pdfplumber, greenlet. aiosqlite arrives with google-adk (needed for the chat database).
	Documents 02–04 describe exactly this.
	Page
	React + Vite + TypeScript, Tailwind with KIRA's tokens from document 10 as the theme, TanStack Table for the data tables. Built to static files that FastAPI serves at /.
	Codex writes it fastest, four people can own separate screen files, and the UI skills in document 11 work best with it. If someone on the team prefers plain JavaScript, use ES modules with one file per screen, not the prototype's global-override pattern.
	Component kit
	None with its default look. If you use shadcn/ui, restyle it from the tokens first.
	Default kits are the quickest way to look like every other AI-built app (see 11).
	The two-hour plan
Four people, each with Codex. Times are from the start. Copy 02, 03, 04 and 09 into docs/ in the repo (File → Download → Markdown) and put the Screens folder in docs/screens/ so Codex can read and look at them.
Time
	A · Data pipeline
	B · Matching and analysis
	C · Kira and platform
	D · Product UI

	0:00–0:20
	Agree table shapes and standard columns with B
	Agree the record and rate-row shapes (06 "Interfaces")
	Repo skeleton, AGENTS.md, app factory, DB session, login
	Page shell, sidebar, tokens from 10, login page, mock API from 02
	0:20–1:10
	Upload (CSV only), convert with upload rules and aliases, clean (outlet names from POS, bank row kinds). Check: with-exceptions day 1 gives 3 upload-rule cards and 2 cleaning cards.
	ID rule, withdrawal rule, suggest for both, final result, /analysis/rates, /analysis/gaps, /overview, /learning. Check: 8,639 of 8,784 and Rp 10,671,421 to check.
	Agent with read tools (status, match rate, rate table, money gaps, match map, highlight) and change tools (convert, save upload rule, save cleaning, save matching rule, run matching) with approval; guard and scope rules from 04
	Overview (ring, cards, learning bars), Workflow steps 1–4 with the decision cards, match-rate table with "only rows under 100%" and the money-gaps list, chat panel with the approval card
	1:10–1:40
	Load days 1–7 into the demo client, one day per request
	/analysis/side (linked tables, tick & tie) and follow-ups
	Highlights reach the page; reply clean-up and the one-time nudge (04)
	Linked tables with tick & tie, Follow-up tab
	1:40–2:00
	Everyone: day-8 run end to end, fix what breaks, run the script in 07 once






	Added on 5 November (in the plan, see 12): Kira's follow-up drafts, rule order and edit, the simpler filters, per-stage totals.
Already cut from this plan (add back in this order if you're ahead): Records tab, Matrix, links made by hand, Tutorial and tours, shareable links, landing page, client switcher, Reset, Excel and PDF upload, AI header mapping, composite/ref/batch/amount rules, "Why not 100%?".
Effect on the demo script (07): without the Tutorial, skip "Tutorial → Start" at 4:50 and keep the off-topic question; without shareable links, click to each view instead of using bookmarks.
Never cut (as in 06): both stages with the ID and withdrawal rules, the rate table, linked tables with tick & tie, money gaps, the learning panel, Kira with approvals and guardrails.
ADK details that are easy to get wrong
* Change tools are FunctionTool(fn, require_confirmation=True). When the model calls one, the run yields a function call named adk_request_confirmation; its id is the confirmation id and its args.originalFunctionCall holds {name, args}. Return these as pending. The paused tool also yields a function response whose error says it "requires confirmation": leave that out of the tool trace.
* Answering an approval: send one new user message whose parts are FunctionResponse(id = confirmation id, name = "adk_request_confirmation", response = {"confirmed": true or false}), one part per pending id, all in the same message. The runner then runs or skips the tool and the model continues.
* The reply text: only non-partial text parts authored by the agent, taken after the last tool response, with repeated paragraphs removed. If the model used tools but wrote nothing, send one hidden nudge ("Answer my last question in words now, using the tool results you just got. Keep it short.") and leave it out of the history.
* Tools never block the server: wrap each tool as an async function that runs the sync work in asyncio.to_thread, and keep the original name, signature and docstring (functools.wraps), or ADK builds an empty declaration. Change tools wait at most 2 seconds for the write lock and otherwise return {"status": "error", "message": "KIRA is busy finishing another change"}.
* Which client: a ContextVar set from the X-Kira-Client header in the request; asyncio.to_thread copies the context into the worker thread.
* Sessions: DatabaseSessionService(db_url="sqlite+aiosqlite:///<data dir>/kira_chat.db"), created with state {"user": <name>}; the instruction ends with "The user's name is {user?}."
* FastAPI: write endpoints take the DB session with Depends(db, scope="function") so the commit lands before the response is sent.
Pre-event checklist
* ☐ Every laptop: Python 3.13 and uv, Node 22, Codex CLI signed in, a Chromium for screenshot checks.
* ☐ Data/with-exceptions.zip and clean-100.zip unzipped on every laptop.
* ☐ docs/ ready to drop into the new repo: 02, 03, 04 and 09 as Markdown, 10 and the Screens folder.
* ☐ UI skills installed (document 11) and a DESIGN.md for KIRA agreed.
* ☐ Model key working, with a budget.
* ☐ Deploy target decided and tested.
* ☐ A recorded video of a full demo run as the last backup (07).
