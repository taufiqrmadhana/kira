# **KIRA frontend: flow and reference**

The page is plain JavaScript served by the backend at /. It has no state of its own beyond view preferences: every number comes from the API. This document walks through every screen and flow (what the user sees, what they can do, which API calls it makes), then lists the state, the conventions, and, generated from the code, every script with its functions and the page actions it handles.

## **Screen map**

`/login.html ──► landing (once per browser session) ──► workspace`  
                                                         `├─ Overview`  
                                                         `├─ Workflow: 1 Upload · 2 Convert · 3 Clean · 4 Match (+ results table)`  
                                                         `├─ Match analysis: Match rate (Table | Matrix) · Match map (Linked tables | Chains) · Records · Follow-up`  
                                                         `├─ Kira chat panel (bottom right, on every page)`  
                                                         `└─ Tutorial (button top right) · client switcher (sidebar) · profile menu · Reset`

## **Boot**

> 1. A page request without a session cookie is redirected by the server to /login.html?next=….  
> 2. login.html: username and password → POST /api/login → on 200 go to next (keeping the \#link); on 401 show "Wrong username or password". It checks GET /api/me first and skips itself when already signed in.  
> 3. index.html loads the scripts in order (see the generated list). pipeInit() calls apiBoot(): GET /api/status (401 → login page; no answer → "Can't reach the KIRA server" screen), then GET /api/overview (small, about 1 KB: draws the Overview right away), then sync() \= GET /api/workflow?rows=100 \+ GET /api/overview (files, rules, recommendations, 100-row table previews, result totals; about 0.4 MB on 8,784 sales).  
> 4. links.js reads the address first: \#/analysis?c=zestly-demo\&tab=map\&view=linked\&stage=l2\&outlet=…\&from=…\&to=… opens exactly that view and client and skips the landing.  
> 5. The landing (landing.js) shows once per browser session: hero, the four steps, the client list with the selected client's latest match rate, **Enter workspace** and **Take the tour**.

Every API call sends X-Kira-User (the profile name, for the audit log) and X-Kira-Client (the selected client, when not the default). A 401 at any time sends the user to the login page.

## **Overview**

> * Match-rate ring (POS sales traced to a bank credit ÷ POS sales), cards (matched, mismatched, need review, bank credits explained), stage rings.  
> * **KIRA learns as it runs** (learning.js, GET /api/learning): bars of decisions per close and what the saved rules cover.  
> * **History** calendar: match rate per sales date; a day opens its outlets (Match rate) or its match map.  
> * **Needs your attention**: the first open records (from /api/overview).  
> * No close yet: files per area and a button into the workflow.

## **Workflow (four steps, pipeline.js, cleaning.js, matching.js, swapped to the API by server.js)**

| Step | The user | API   |
| :---- | :---- | :---- |
| 1 Upload | drops files or folders into POS, Settlement, Mutation; sees duplicates refused (SHA-256), wrong-area hints, upload history; can move or remove files; can add sample files | POST /files/{type} (multipart uploads, folder), GET /files/{id}/download, POST /files/{id}/move, DELETE /files/{id}, POST /files/samples/{day} |
| 2 Convert | presses Convert (animated progress per table); for each table decides the upload rule: create (first time), update or keep (when columns changed); ticks columns to keep (with "Keep all"), picks types, picks which file column fills each required column (header mapping, with AI reasons) | POST /convert, POST /upload-rules/{type} {choice, columns?, rename?} |
| 3 Clean | reviews recommendations (value in the file → standard value, rows affected, AI suggestions marked), accepts or rejects each (Undo), saves as cleaning rules; reviews the clean tables (changed cells highlighted, "Show before cleaning") and the data standard | POST /cleaning/recommendations/{id} {decision, mapping?, exclude?}, POST /cleaning/save, GET /tables/{layer}/{type} |
| 4 Match | per stage: first time, KIRA suggests rules (with how many rows each matches); later, chooses saved rules, tests, optionally creates another rule, runs (live counters); "Why not 100%?" groups unmatched rows by cause with an AI explanation and may offer a better ID rule; deletes rules | GET /matching/{stage}/suggestions, POST /matching/{stage}/preview, POST /matching/{stage}/rules, POST /matching/{stage}/test, POST /matching/{stage}/run, GET /matching/{stage}/insights, DELETE /matching/rules/{id} |
| Results | ring, totals, export of everything; the filterable results table (same as Records) | GET /matching/export, GET /analysis/records |

After every change the page runs sync() again and redraws. Steps open in order: Convert needs a file in each area, Clean needs every upload rule decided, Match needs cleaning saved.

## **Match analysis (analysis.js, analysis-tables.js, followups.js)**

One selection drives the page: period (all dates, latest day, last 7 days, this month, from–to), outlet, provider. KPIs on top: match rate, POS sales and money, matched, need review, mismatched, open without a sale, bank credits explained.

| Tab · view | What it shows and does | API   |
| :---- | :---- | :---- |
| Match rate · Table (default) | one row per day / week / month / all dates, by outlet and/or provider; rows per table, match rate from both sides per stage, end to end, money on each side, differences; sort, "only rows under 100%", find, column groups, tick rows for a subtotal, export; the bank credits with no settlement noted under the table; click a row → its linked tables | GET /analysis/rates |
| Match rate · Table, below | **Where the money differences come from**: labelled kinds (expected: rounding, fee, promo; to check: not in bank yet, credit with no settlement, sale with no settlement, settlement with no sale, amount differs), each with count, rupiah and samples | GET /analysis/gaps |
| Match rate · Matrix | outlets × sales dates, coloured cells, totals row and column; per-day bars; outlets ranked lowest first; click a cell → its match map | GET /analysis/summary |
| Match map · Linked tables (default) | two tables of a stage side by side (01 POS ↔ 02 Settlement, 02 Settlement ↔ 03 Bank); status chips, link ids, search, sort, columns, paging, footer total (sum, avg, min, max, count); tick rows or click a link → the other side shows what's linked; tick & tie compares both totals; tick Not-found rows on both sides → **Link by hand…** (with a reason); list of links made by hand with Remove; click a row → compare dialog | GET /analysis/side/{stage}/{table}, POST/GET/DELETE /analysis/manual-links, GET /analysis/records?ids= |
| Match map · Chains | one row per record: POS sale, settlement, bank credit in a line with what differs; open a row to compare every field (and every column) | GET /analysis/records (status filter, grouped order) |
| Records | the results table: search, status chips with counts, reason, amount range, sort any column, group by bank credit, columns, page size, export of the filtered rows; compare dialog per record | GET /analysis/records, GET /analysis/export |
| Follow-up | records that aren't matched with status (open, investigating, resolved), assignee, note; save per row; counts per status | GET /analysis/follow-ups, POST /analysis/follow-ups |

The compare dialog shows the fields side by side (outlet, date and time, amount, nett against the bank credit, payment method, shared ID, bank description) marked agrees / differs / missing / info, "Every column", the follow-up form, and "Ask Kira about this". **Copy link** copies the address of exactly this view.

## **Kira chat panel (workflow.js panel, server.js agent wiring)**

Bottom-right button on every page. Shows the chat so far (GET /api/agent/history), context line and quick questions for the current page, the message box. Sending → POST /api/agent/chat with the screen context. Replies show markdown, a "How Kira got this" list, and for change tools a card "Kira wants to · needs your OK" with Approve (all) / Reject → POST /api/agent/confirm. Highlights and tours act on the page (see document 04).

## **Tutorial and tours (guide.js)**

The **Tutorial** button opens a panel: Start from the beginning (8 chapters: Welcome, Upload, Convert, Clean, Match, Results, Match analysis, Kira), or one chapter; options "Play automatically" and "Large text for presenting"; keys → ← Space Esc. A tour is a list of steps {go?, sel, text, act?, click?}: go navigates (never changes data), sel is the element to point at (skipped when it isn't on screen), text the explanation. The engine moves Kira's cursor, dims the rest (spotlight), shows the bubble with Back / Next / Auto / Stop and a box to ask Kira about this step (answer shown in the bubble, tour paused).

## **Clients, profile, reset**

> * Sidebar client switcher: the list comes from GET /api/clients; switching stores the id in local storage and reloads; "Add a client" → POST /api/clients.  
> * Profile menu: name and role, **Sign out** (POST /api/logout).  
> * **Reset** (top right): the user types the client's name to confirm → POST /api/reset → a notice with the backup file name.

## **State in the browser**

| Kept where | What   |
| :---- | :---- |
| Server | everything about the data: files, rules, tables, results, manual links, follow-ups, chats, audit |
| Page variables after sync() | rawFiles, pipe (step, rules, decisions, recommendations, matching rules), parsedTables / cleanTables (previews of 100 rows plus totals), mstate (stage states), srv (the workflow answer), srvSummary (the Overview answer) |
| ax (analysis.js) | selection, tab, filters, sort, paging, highlight, loaded summary / records / map |
| at (analysis-tables.js) | rate-table and linked-tables settings, selections, data |
| fu, lr, guide | follow-up list, learning panel, tour engine |
| localStorage | selected client, client list cache, chat session id per client, view preferences (tab, columns, tutorial options) |
| sessionStorage | landing seen, reset notice |

## **Conventions**

> * Screens are functions that return HTML strings; shell() redraws the page. Later files extend earlier ones by replacing a global function, so load order matters.  
> * Clicks are handled by one listener per file on data-\* attributes (for example data-ax-tab="map", data-at-sel="a\|123"); the generated list below names them per file.  
> * Inputs that the user types in (search boxes) are never redrawn while loading: only the table under them is, so focus stays.  
> * Every API call goes through api(path, {method, body, form}), which adds the headers, turns 401 into the login page, and turns error responses into an Error with the server's detail.

## ---

**Scripts and functions (generated from the code)**

Plain JavaScript, no build step. index.html loads the files below in this order; a later file extends an earlier one by replacing a global function (overview \= function () { … }), so the order matters.  
Stylesheets: styles.css, match-grid.css, workflow.css, governance.css, simplify.css, pipeline.css, demo.css, overview.css, landing.css, analysis.css, analysis-tables.css, kira.css, guide.css.

## **Load order**

> 1. app.js  
> 2. match-grid.js  
> 3. workflow.js  
> 4. reruns.js  
> 5. simplify.js  
> 6. governance.js  
> 7. pipeline.js  
> 8. samples.js  
> 9. cleaning.js  
> 10. matching.js  
> 11. assistant.js  
> 12. server.js  
> 13. demo.js  
> 14. overview.js  
> 15. analysis.js  
> 16. analysis-tables.js  
> 17. followups.js  
> 18. learning.js  
> 19. guide.js  
> 20. links.js  
> 21. landing.js

## **app.js**

Functions:

> * icon(name, size \= 16\)  
> * upload()  
> * download(name, text, type \= "text/plain")  
> * bank(()  
> * close()  
> * me()  
> * money(n)  
> * num(n)  
> * esc(s)  
> * provider(p)  
> * act(action)  
> * posRecord(r)  
> * settlementRecord(r)  
> * posRow(r)  
> * recText(o)  
> * recTable(list)  
> * head(title, desc, action \= "")  
> * evidence(title, sub, id)  
> * claims()  
> * audit(action, object, detail \= "", { cat \= "data", outcome \= "Recorded", agent \= false } \= {})  
> * filters()  
> * sum(a, k)  
> * mapping()  
> * overview()  
> * reconciliation()  
> * investigations()  
> * sources()  
> * persist()  
> * govDefault()  
> * govSave()  
> * simNow(offset \= 0\)  
> * data()  
> * applyResolutions()  
> * badge(t)  
> * toast(msg)  
> * shell()  
> * navButton(n)  
> * renderView()  
> * navCount(id)  
> * openExceptions()  
> * metric(label, value, note, ico, accent \= false, def \= "")  
> * chart(d)  
> * exceptionTable(d)  
> * empty(title, desc)  
> * caseStatus(id)  
> * caseCard(r)  
> * claimExternal()  
> * schemaPanel()  
> * calcRow(label, value)  
> * openDrawer(title, eyebrow, body)  
> * openModal(title, body, cls \= "")  
> * showCase(id)  
> * showTransaction(id)  
> * showClaim()  
> * showEvidence(id)  
> * showSource(id)  
> * exportClaim()

Page actions it handles or renders (data-\* attributes): action, case, evidence, mapping, nav, row, schema, source, tab.

## **match-grid.js**

Functions:

> * KiraGrid(()

Page actions it handles or renders (data-\* attributes): scale.

## **workflow.js**

KIRA workflow: upload → AI-drafted matching rules → confirm → side-by-side review, plus a no-SQL data explorer and the always-on assistant ("Kira"). Loaded after app.js and reuses its globals (rows, bank, posRecord, settlementRecord, shell…).  
Functions:

> * work(title, steps)  
> * on(id)  
> * review()  
> * explorer()  
> * ts(s)  
> * sleep(ms)  
> * P(id, k)  
> * hms(s)  
> * normOutlet(s)  
> * test(row, f)  
> * opt(v, l)  
> * wfDefault()  
> * propose(title, detail, label, run, cancel \= "Not now", tool \= "")  
> * daily()  
> * wfSave()  
> * allFiles()  
> * pendingRules()  
> * rulesVersion()  
> * engine()  
> * simulate(mutate)  
> * agentRun()  
> * step1()  
> * step2(E)  
> * step3(E)  
> * step4(E)  
> * dayStrip()  
> * stepper()  
> * hierarchy()  
> * sampleFile(slot)  
> * sampleFileBase(slot)  
> * slotCard(\[id, title, file, , ic, grain\])  
> * sha256(f)  
> * profileFile(f)  
> * handleFiles(list)  
> * petSay(html, { bubble, action \= "" } \= {})  
> * afterUpload()  
> * doDraft()  
> * agentPanel()  
> * petSvg(size \= 54\)  
> * runAgent(title, sub, steps)  
> * petMood(m)  
> * doAcceptHigh()  
> * recommendCard(E)  
> * ruleCard(d)  
> * impactBar(E)  
> * doRun()  
> * compareModal(tx)  
> * results()  
> * flowSvg(E)  
> * rulePerf(E)  
> * compareSection(E)  
> * cmpLegend()  
> * pairsHtml(E, level, filter, only)  
> * pairL1(x)  
> * pairL2(x)  
> * orphanRow(b)  
> * priorRow(b)  
> * pairRow(l, m, r, cls \= "")  
> * card(title, sub, lines, side, cls \= "")  
> * ghost(t, s)  
> * linkCol(st, label, color, tx)  
> * stlFile(s)  
> * cmpL1(p, s)  
> * cmpL2(s, b)  
> * ledgerRows()  
> * colsOf(list)  
> * isNum(list, c)  
> * isTime(c)  
> * opsFor(list, c)  
> * timeOf(v)  
> * sqlOf()  
> * parseAsk(text)  
> * applyAsk(text)  
> * exResults()  
> * petMount()  
> * petToggle(open)  
> * userSays(t)  
> * petBadge()  
> * petContext()  
> * greet()  
> * addMsg(html, who \= "bot", quiet \= false)  
> * paDecide(id, yes)  
> * traceHtml(list)  
> * typing(ms \= 600\)  
> * viewName()  
> * nextStep()  
> * doAttachAll()  
> * gotoRule(id)  
> * setRule(id, st, quiet \= false)  
> * openExplorer(text)  
> * ex2html(list, cols)  
> * respond(q)  
> * afterRender()

Replaces (extends) earlier functions: overview(), showTransaction(id), shell(), act(a).  
Page actions it handles or renders (data-\* attributes): drop, ex, pa, pet, pet-ask, tip, wf.

## **reruns.js**

KIRA closed days: per-day figures behind the grid, late-arriving data, and versioned reruns (BR-06, BR-29, NFR-01). A rerun never overwrites a day; it adds a version, and v1 stays readable. Loaded after workflow.js and before governance.js (which boots the app).  
Functions:

> * isoParts(iso)  
> * fmtDay(iso)  
> * shortDay(iso)  
> * nextIso(iso)  
> * fakeSha(s)  
> * round1(n)  
> * pct(x)  
> * baseDays()  
> * baseDay(iso)  
> * derive(v, base)  
> * closeRules(iso)  
> * dayVersions(iso)  
> * latest(iso)  
> * allPendingLate()  
> * currentRules()  
> * computeRun(iso, lateIds, rules)  
> * sameResult(a, b)  
> * gridDays()  
> * viewedVersion()  
> * dayBanner()  
> * pseudoRows(d)  
> * pastOverview()  
> * daySummary(iso)  
> * recheckDays()  
> * rerunsView()  
> * openRerun(iso, lateId)  
> * renderRerun()  
> * saveRerun()  
> * openRecheck()  
> * saveRecheck()

Page actions it handles or renders (data-\* attributes): rr.

## **simplify.js**

Business-oriented workflow shell. Files stay in this browser, separate from sample run inputs.  
Functions:

> * fileStore(mode, operation)  
> * refreshFiles()  
> * providerExamples()  
> * dateShift(iso, n)  
> * workflowCalendar()  
> * journeyStrip()  
> * prepareDay()  
> * fileLibrary()  
> * addLibraryFiles(files)  
> * reviewSignature()  
> * completionPanel()  
> * verifyResults()  
> * exportReviewedResults()

Page actions it handles or renders (data-\* attributes): calendar, cancel-folder, export-results, file-download, folder-path, library-drop, new-folder, open-history, save-verification, start-workflow, verify-check, verify-results.

## **governance.js**

KIRA controls and insights: next-step tasks, cash exceptions, the TX-0428 resolution and the rule Kira learns from it (R5), GOPAY's format change, agreement term extraction, the provider scorecard, the evaluation against BRD §11–12 and the audit log. Loaded last; it also boots the app.  
Functions:

> * pad2(n)  
> * who(role)  
> * govRun(key, title, steps)  
> * busyPanel()  
> * taskList(role)  
> * scenarios()  
> * waitingOn(role)  
> * tasksPanel()  
> * cashExceptions()  
> * scorecardFollowup()  
> * overdueFollowup()  
> * openResolve()  
> * spark(values, { lo, hi, ref, unit \= "%", label })  
> * confirmLink()  
> * openR5()  
> * learnBanner()  
> * openDrift()  
> * verbatim(q)  
> * decidable()  
> * agStatus(id)  
> * openAgreement(id, extract \= false)  
> * doExtract()  
> * agreementsView()  
> * octDetail()  
> * novDetail()  
> * feeDetail()  
> * payDetail()  
> * rulesVersions()  
> * scorecardView()  
> * liveEval()  
> * evalSummary()  
> * evalView()  
> * auditRows()  
> * auditView()

Replaces (extends) earlier functions: sources().  
Page actions it handles or renders (data-\* attributes): gov.

## **pipeline.js**

Workflow page, steps 1–2: raw files → upload rules → converted tables (Layer 1). Step 3 (cleaning, Layer 2\) lives in cleaning.js and step 4 (matching) in matching.js. No business date: every raw file in each area is used when converting and running.  
Functions:

> * KIRA\_CLIENT(()  
> * clientKey(k)  
> * pipeDefault()  
> * pipeSave()  
> * pipeLog(action, type, name, detail \= "")  
> * pipeStore(store, mode, op)  
> * kvGet(k)  
> * kvSet(k, v)  
> * detectDelimiter(line)  
> * parseCSV(text, delim)  
> * normHeader(h)  
> * parseNumber(v)  
> * parseDateValue(v)  
> * inferType(values)  
> * cleanValue(v, type)  
> * profileType(type)  
> * buildClean(profile, rule)  
> * ruleDiff(profile, rule)  
> * rowCount(T)  
> * normBranch(s)  
> * tsOf(s)  
> * delimName(d)  
> * sniffType(text)  
> * loadXLSX()  
> * xlPad(n)  
> * excelCell(v)  
> * csvQuote(v)  
> * excelSheets(buf)  
> * addRawFiles(type, entries)  
> * markStale()  
> * collectDrop(dt)  
> * loadSamples()  
> * runConvert()  
> * animateLoader(i, to)  
> * paintLoader(i)  
> * refreshClean()  
> * decideRule(type, choice)  
> * rulesSettled()  
> * fmtWhen(iso)  
> * fmtSize(n)  
> * stepReach(i)  
> * stepDone(i)  
> * pipeStepper()  
> * pipeFoot(back, next)  
> * uploadArea(t)  
> * stepUpload()  
> * tableLoader(t, i)  
> * ruleColumnsTable(type, cols, editable, diff)  
> * mappingBlock(t, prop, editable)  
> * rulePrompt(t)  
> * stepConvert()  
> * goStep(n)  
> * pipeInit()

Replaces (extends) earlier functions: daily(), navCount(id), overview().  
Page actions it handles or renders (data-\* attributes): loader, pipe-convert, pipe-go, pipe-sample, pipe-step, pipe-tab, raw-download, raw-drop, raw-move, raw-remove, rule-decide, rule-form, rule-keep, rule-type, start-workflow.

## **samples.js**

Synthetic raw files for the workflow demo. Deterministic per day, with realistic edge cases: DANA pays out per transaction (reference in the bank description); GOPAY pays one batch per outlet per day (one bank credit covers many settlements); plus a late settlement, an amount mismatch, a voided sale, a payout without reference, payouts not yet in the bank, and unrelated bank rows. Outlet and provider names are spelled differently across files, so step 3 has something to clean.  
Functions:

> * sampleRawFiles(day)

## **cleaning.js**

Step 3 · Clean (Layer 2). KIRA compares the converted tables (Layer 1\) with your data standard and recommends fixes. You accept or reject each one; saving turns the decisions into cleaning rules that are applied the same way on every later run. Matching only ever reads the cleaned tables.  
Functions:

> * standardName(list, value)  
> * isPayout(row)  
> * buildRecs()  
> * activeCleaning()  
> * applyCleaning()  
> * updateCleaning()  
> * cleaningChanged()  
> * cleanPending()  
> * cleaningSettled()  
> * decideRec(id, d)  
> * saveCleaning()  
> * recCard(r)  
> * standardSummary()  
> * cleanSheet()  
> * stepClean()

Page actions it handles or renders (data-\* attributes): clean-save, rec.

## **matching.js**

Step 4: two matching stages (POS ↔ Settlement, then Settlement ↔ Mutation), each driven by saved matching rules. First run: KIRA suggests rules to save. Later runs: choose rules, test them, then either create another rule or generate the result. Results bind many POS/settlement rows to one bank mutation.  
Functions:

> * suggest(stage)  
> * fmtWindow(w)  
> * freshStage()  
> * missingForRun()  
> * resetMatching()  
> * restoreMatching()  
> * saveMatching()  
> * describeRule(r)  
> * ruleName(r)  
> * nextRuleId(stage)  
> * draftL1(params, why)  
> * draftL2(kind, why)  
> * runL1(rules, T)  
> * ring(pct, label, big)  
> * runL2(rules, T)  
> * runStage(stage, rules, T \= cleanTables)  
> * pause(ms)  
> * stageReady(sid)  
> * startStage(sid)  
> * saveDraft(sid, i)  
> * testStage(sid)  
> * selectedRules(sid)  
> * generateStage(sid)  
> * paintLive(fired)  
> * finishRun()  
> * finalResult()  
> * exportCombined()  
> * ruleDirectory()  
> * draftCard(sid, d, i)  
> * stageBody(s)  
> * combinedTable(F)  
> * analytics()  
> * glossary()  
> * stepRun()

Page actions it handles or renders (data-\* attributes): hit, live-bar, live-count, live-feed, live-total, m-cancel, m-change, m-del, m-discard, m-export, m-generate, m-new, m-save, m-start, m-test, m-view, mdir.

## **assistant.js**

Kira assistant for the workflow. Kira can run every step through the same functions the buttons use. Those functions are its tools (see docs/ARCHITECTURE.md). Reading and explaining happen right away. Anything that saves or changes data is shown as a proposed action and runs only after you click OK. After each action Kira looks at the workflow again and proposes the next step, so you can go from upload to export by approving one step at a time.  
Functions:

> * plural(n, w)  
> * stageName(sid)  
> * kiraDo(fn)  
> * pipeNext()  
> * kiraStatus()  
> * kiraRunStage(sid, drafts)  
> * kiraTools()  
> * resetPipeline()

Replaces (extends) earlier functions: respond(q), nextStep(), greet(), petContext().

## **server.js**

The page talks to the KIRA backend: every step reads and writes through /api, and the Kira chat talks to the real agent (Google ADK). The screens are the older browser screens; this file swaps where the data comes from and what the buttons call. The backend is required: without it the page shows that the server can't be reached.  
Functions:

> * api(path, { method \= "GET", body, form } \= {})  
> * newChat()  
> * toLogin()  
> * sync()  
> * attempt(fn)  
> * unreachable(msg)  
> * apiBoot()  
> * refresh()  
> * serverVersion(name, fn)  
> * toDraft(sid, d)  
> * md(text)  
> * refreshPreview(sid, i)  
> * short(v)  
> * showAgent(out)  
> * agentCall(path, body)  
> * whySample(x)  
> * whyPanel(sid)  
> * loadWhy(sid)

Replaces (extends) earlier functions: draftCard(sid, d, i), respond(q), greet(), typing(ms), stageBody(s).  
Server versions of actions (serverVersion): finalResult(), addRawFiles(type, entries), loadSamples(), runConvert(), decideRule(type, choice), decideRec(id, d), saveCleaning(), resetPipeline(), startStage(sid), saveDraft(sid, i), testStage(sid), generateStage(sid), exportCombined().  
Page actions it handles or renders (data-\* attributes): ag, m-del, m-new, m-try, m-why, new-chat, raw-download, raw-move, raw-remove, rule-fill, rule-form, rule-keep, rule-type.  
API calls: /api/agent/history, /api/cleaning/recommendations/, /api/cleaning/save, /api/convert, /api/files/, /api/files/samples/, /api/matching/, /api/matching/export, /api/matching/rules/, /api/overview, /api/reset, /api/upload-rules/, /api/workflow.

## **demo.js**

Demo helpers: a "Reset demo" button that wipes everything for a fresh run (backend data in server mode, plus all browser storage), and "Keep all" checkboxes on upload rules.  
Functions:

> * resetButton()  
> * askReset()  
> * currentClient()  
> * deleteDB(name)  
> * resetEverything(btn)  
> * backupNote()  
> * resetDoneNotice()  
> * dismissNotice()  
> * syncKeepAll(form)  
> * accountMenu()  
> * setAccountOpen(open)  
> * clientList()  
> * loadClients()  
> * clientSwitcher()  
> * setClientOpen(open)  
> * switchClient(id)  
> * switchedNotice()

Replaces (extends) earlier functions: shell().  
Page actions it handles or renders (data-\* attributes): account, client-add, client-pick, demo-cancel, demo-confirm, demo-dismiss, demo-reset, demo-start, reset-name, rule-all, rule-form, rule-keep, sign-out.  
API calls: /api/clients.

## **overview.js**

Overview: the selected client's latest close, built from the real workflow results, and a monthly calendar with the match rate per sales date. Replaces the earlier fixed demo overview.  
Functions:

> * rateOf(d)  
> * rateClass(r)  
> * shiftMonth(ym, n)  
> * ovCalendar(days)  
> * ovData()  
> * ovAttention(items)  
> * ovEmpty()  
> * ovSkeleton()

Replaces (extends) earlier functions: overview(), daily().  
Page actions it handles or renders (data-\* attributes): ov-day, ov-jump, ov-month, ov-results.

## **analysis.js**

Match analysis: the latest complete run, per outlet and per day. · Match rate: outlets × sales dates, the match rate of each cell, with totals per outlet, per day and overall, a daily trend and an outlet ranking. Any date range, one outlet or all, one provider or all. · Match map: the selected records with their POS sale, settlement and bank credit side by side. Open one to compare every field; what disagrees is highlighted. Kira can highlight records too (highlight\_records). · Records: the results table with search, status / reason / amount filters, sorting, columns, paging, export. Everything is computed by /api/analysis (backend/kira/core/analysis.py) over every row; this file only shows it.  
Functions:

> * axSave()  
> * axFirst(...v)  
> * axDay(v)  
> * axRecordDay(p, s, b)  
> * axClean(f)  
> * axHasKey(r, keys)  
> * axScope()  
> * axQS(o)  
> * axServer()  
> * axBanks(out)  
> * axGetSummary(scope)  
> * axGetRecords(f, sort, desc, offset, limit)  
> * axExport(f)  
> * axTable()  
> * axTableFilters()  
> * axMapFilters()  
> * axLoad(which)  
> * axPaint(which)  
> * axReload({ scope \= false, list \= true } \= {})  
> * axStale()  
> * axShort(iso)  
> * axWd(iso)  
> * axRate(b)  
> * axAmtRate(b)  
> * axMetric(b)  
> * axBand(r)  
> * axRp(v)  
> * axTime(v)  
> * axVal(v)  
> * axPeriod()  
> * axIsId(v)  
> * axSharedIds(p, s)  
> * axInDesc(s, b)  
> * axGap(a, b)  
> * axCompare(r)  
> * axOpts(list, sel, all, label \= (x)  
> * axScopeBar()  
> * shiftIso(iso, n)  
> * axKpis()  
> * axTabs()  
> * axCell(o, d, b, total)  
> * axMatrix()  
> * axUnassignedNote(un)  
> * axTrend()  
> * axRanking()  
> * axRateTab()  
> * axHlBanner()  
> * axIsHl(r)  
> * axFuChip(r)  
> * axPosCard(r, cmp)  
> * axStlCard(r, cmp)  
> * axBankCard(r, first)  
> * axLink(r, cmp, stage)  
> * axCmpTable(r, cmp)  
> * axAllCols(r)  
> * axMapList()  
> * axMapTab()  
> * axColsAvail()  
> * axColsSel()  
> * axChips()  
> * axRecTools(embedded)  
> * axRecordsTab()  
> * axMain()  
> * axSkeleton()  
> * axEmpty()  
> * analysisView()  
> * axEmbedInner()  
> * axGo(tab, scope)  
> * axSetScope(patch)  
> * axHighlight(keys, note \= "", by \= "Kira")  
> * axContext()  
> * axAskKira(text)  
> * axAskAbout(r)  
> * axCmpModal(i)

Replaces (extends) earlier functions: combinedTable(), analytics(), renderView(), petContext().  
Page actions it handles or renders (data-\* attributes): ax-allcols, ax-ask, ax-clear, ax-cmp, ax-colreset, ax-day, ax-export, ax-freason, ax-go, ax-group, ax-hideok, ax-hlclear, ax-hlonly, ax-kira, ax-limit, ax-mappage, ax-mapq, ax-mapst, ax-metric, ax-o, ax-open, ax-outlet, ax-page, ax-q, ax-quick, ax-reason, ax-reset, ax-retry, ax-sort, ax-st, ax-tab, ax-unsort, ov-ax.  
API calls: /api/analysis/export, /api/analysis/records, /api/analysis/summary.

## **analysis-tables.js**

Tables you can work with, on the Match analysis page: · Match rate → Table: one row per period (day / week / month / all), outlet and provider. Per row: rows per table, the match rate of each stage seen from both sides, end to end, the money on each side, and the differences. Sort any column, keep only rows under 100%, tick rows for a subtotal, click a row to open its linked tables, export. · Match map → Linked tables: the two tables of one stage side by side (POS \| settlement, settlement \| bank), each with its own search, link status, sort, columns, footer total and paging. Tick rows on one side and the other side shows only the rows linked to them; the tie bar compares the two sides' totals ("tick and tie"). The numbers come from /api/analysis/rates and /api/analysis/side (backend/kira/core/analysis.py).  
Functions:

> * atPane()  
> * atSave()  
> * atReset()  
> * atGetRates(all \= false)  
> * atTable(p)  
> * atFollowLinks(p)  
> * atGetSide(p)  
> * atLoad(which)  
> * atPaint(which)  
> * atRateBody()  
> * atPaneBody(p)  
> * atPaintTie()  
> * atViewBar(kind)  
> * atInject(html, bar)  
> * atPeriodLabel(p)  
> * atRowKey(x)  
> * atVisibleCols()  
> * atCell(k, v)  
> * atRateTools()  
> * atRateSelHtml()  
> * atRateTab()  
> * atLoadGaps()  
> * atGapsHtml()  
> * atRange(period)  
> * atOpenRow(key)  
> * atExportRates()  
> * atAvail(table)  
> * atCols(table)  
> * atAggCol(p)  
> * atAggValue(p)  
> * atSelSum(p)  
> * atStatusCls(s)  
> * atPaneHead(p)  
> * atSelSumHtml(p)  
> * atTieHtml()  
> * atManualActions()  
> * atManualReady()  
> * atSameAmount(p)  
> * atManualModal()  
> * atManualSave(btn)  
> * atAfterManual()  
> * atLoadManual()  
> * atManualList()  
> * atLinkedTab()  
> * atCompare(rec)  
> * atSelectChanged(p)

Replaces (extends) earlier functions: axMain(), axReload(o \= {}), axGo(tab, scope), axStale(), axHighlight(keys, note, by), axContext().  
Page actions it handles or renders (data-\* attributes): at-below, at-clearsel, at-colreset, at-follow, at-gby, at-link, at-mandel, at-mansave, at-manual, at-note, at-page, at-period, at-q, at-rclear, at-rexport, at-rlimit, at-row, at-rpage, at-rq, at-rrow, at-rsel, at-rselall, at-rsort, at-same, at-sel, at-selall, at-sort, at-st, at-stage, at-unfollow, at-view, ax-hlclear, ax-hlonly.  
API calls: /api/analysis/gaps, /api/analysis/manual-links, /api/analysis/manual-links/, /api/analysis/rates, /api/analysis/records, /api/analysis/side/.

## **followups.js**

Follow-up: the work list of records that aren't matched. For each one, who is on it, what they found, and whether it is resolved. Saved on the server for everyone (POST /api/analysis/follow-ups) and attached to the record, so it stays across matching runs. Also editable from the compare dialog of any record.  
Functions:

> * fuLoad()  
> * fuBody()  
> * fuChips()  
> * fuForm(r, compact)  
> * fuTab()  
> * fuSave(form, btn)

Replaces (extends) earlier functions: axTabs(), axMain(), axCmpTable(r, cmp), axReload(o \= {}), axStale(), axHighlight(keys, note, by), axContext().  
Page actions it handles or renders (data-\* attributes): fu-cmp, fu-field, fu-page, fu-q, fu-rid, fu-save, fu-st.  
API calls: /api/analysis/follow-ups.

## **learning.js**

"KIRA learns as it runs" on the Overview: the decisions a person had to make in each close (upload rules, cleaning cards, new matching rules), falling as saved rules answer more, and what those rules now cover. Data: GET /api/learning (backend/kira/services/learning.py).  
Functions:

> * lrLoad()  
> * lrPanel()

Replaces (extends) earlier functions: overview(), sync().  
API calls: /api/learning.

## **guide.js**

Kira's guided tours and the Tutorial. Kira takes over a cursor of its own, moves it across the real screen, dims everything else and explains each control in a speech bubble. You go at your own pace (Next / Back, or let it play), and you can ask Kira about what's on screen right in the bubble: the tour pauses, Kira answers with your data, and Next carries on. Tours only navigate, scroll and open panels; they never change data. · Tutorial button (top right): the full walkthrough from the start, or any chapter, for demos and new users. · Ask Kira: clear "how do I…" questions start the matching tour; the agent can start one with start\_tour.  
Functions:

> * plain(h)  
> * tutSave()  
> * goView(v)  
> * workflowAt(n)  
> * lockedStep(n, why)  
> * wait(ms)  
> * tourFor(q, strict \= false)  
> * tutorialSteps(from \= 0\)  
> * reducedMotion()  
> * guideLayer()  
> * moveCursor(x, y)  
> * spotOn(el)  
> * anchor(el)  
> * placeBubble(x, y)  
> * fillBubble(st, i, n)  
> * syncAuto()  
> * runBar(readMs)  
> * clickRipple()  
> * findEl(sel)  
> * nextAction(readMs)  
> * runTour(name, opts \= {})  
> * closeTutPanel()  
> * endTour(name, shown, finished)  
> * tourButtons(except)  
> * realign()  
> * guideAsk(q)  
> * tutButton()  
> * tutPanel()  
> * setTutOpen(open)  
> * startTutorial(chapter \= 0\)  
> * tutHint()

Replaces (extends) earlier functions: shell(), respond(q), petContext().  
Page actions it handles or renders (data-\* attributes): action, area, at-below, ax-kira, copy-link, guide, guide-ask, guide-chat, m-export, m-view, nav, pipe-convert, pipe-sample, pipe-step, show-before, tour, tut-start, tutorial, tutorial-open.  
API calls: /api/agent/chat.

## **links.js**

Shareable links: the page you're on is kept in the address, e.g. \#/analysis?tab=map\&view=linked\&stage=l2\&outlet=Menteng\&from=2026-10-27\&to=2026-10-27 Opening such a link (after signing in) shows the same page, client, selection and view. "Copy link" copies it.  
Functions:

> * linkOf()  
> * readLink()

Replaces (extends) earlier functions: shell().  
Page actions it handles or renders (data-\* attributes): ax-kira, copy-link.

## **landing.js**

Landing page: shown once per browser session before the workspace. While it is on screen the app keeps loading the selected client's data behind it, so the workspace is ready when you enter. Clicking the KIRA logo in the sidebar brings it back.  
Functions:

> * landingStats()  
> * landingReady()  
> * landingStatusHtml()  
> * landingHtml()  
> * showLanding()  
> * refreshLanding()  
> * enterWorkspace()

Replaces (extends) earlier functions: shell().  
Page actions it handles or renders (data-\* attributes): home, landing-client, landing-enter, landing-tour.

## **Added on 5 November**

Four changes to the screens after this document was generated. Screenshots 21–26 in the Screens folder; the features and their API are in 08 (Added on 5 November).

* Match analysis filters: one selection bar says which data (Period chips with Pick dates, which shows the date fields; Outlet; Provider only when there is more than one). Every active filter is a chip with × under the bar, plus Clear all. The rate table toolbar reads as a sentence: One row per Day / Week / Month / Whole period and ✓ Outlet / Provider; a switch Only rows under 100%; Find in this table; Columns; Export. Records keeps search and status chips in front; reason and amount range are under More filters.  
* Follow-up: each record's form has a two-line note and a Draft button; the tab has a language choice (English or Bahasa Indonesia) and Draft notes for this list (every record of the selection without a note, across pages). Drafted fields are marked; a bar says how many notes Kira drafted, with Discard drafts and Save N notes (POST /analysis/follow-ups/draft, POST /analysis/follow-ups/bulk). Nothing is saved before that.  
* Kira chat: save\_follow\_ups shows an approval card with the records, status, assignee and the full note; after it runs, the follow-up list reloads.  
* Workflow step 4: in Choose the rules, each rule has ↑ ↓ (the order it runs in, POST /matching/{stage}/order) and Edit (the rule's conditions in the same card as a new rule, with the numbers on its own and on top of the other rules; Save changes or Cancel; PATCH /matching/rules/{id}). The Matching rules card shows one total per stage (sales → settlement, settlements → bank), never a sum of both, and long rule names end in … with the full name on hover.
