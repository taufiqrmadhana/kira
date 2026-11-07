# **KIRA: product and architecture**

## **The problem**

A merchant with ten outlets takes thousands of digital payments a day. Each one appears three times, in three systems that don't share an ID: the POS sale at the cashier, the payment provider's settlement report, and the bank statement where the money finally arrives, usually the next day, as one transfer per store that pays hundreds of sales at once, minus fees, rounded to the thousand. Finance teams reconcile this by hand in Excel. It takes hours each day, and when a store's payout is missing or an amount is keyed wrong, nobody sees it until month end.

## **Who uses it**

> * **The reconciliation analyst** closes each day: uploads the files, checks what doesn't match, follows it up.  
> * **The finance lead or CFO** reads the match rate per outlet and day, and wants to know where money is missing and whether it is under control.  
> * **A new team member** needs to learn the process fast (the tutorial and Kira).

## **What KIRA does**

> 1. **Upload** the three kinds of files, in whatever format they come (CSV, Excel, PDF bank statements).  
> 2. **Convert** them into typed tables. Each file format is remembered as an upload rule; when a provider changes its file (a new column), KIRA asks once.  
> 3. **Clean** them to a data standard: outlet names from the POS, provider names, which bank rows are payouts. Each decision becomes a cleaning rule.  
> 4. **Match** in two stages: POS sale ↔ settlement, then settlement ↔ bank credit. KIRA studies the data and suggests the rules (for the Zestly files: an exact ID shared by POS and settlement, and the provider's daily withdrawal per store).  
> 5. **Analyse**: match rate per outlet per day from both sides, linked tables with tick and tie, money differences labelled, a follow-up list, Kira's explanations.

Every decision becomes a rule that is reused, so each close needs fewer decisions (7 on the first day of the demo data, 2 on a later day with a new column and a new spelling). Every number links to the rows behind it, every change is approved by a person and written to the audit log.

## **Why it matters (build directions)**

> * **Deep Domain AI.** It works the way a reconciliation expert works: two-stage matching, wallet withdrawals and payout rounding, tick and tie, a follow-up list, approvals and an audit trail. The AI explains and suggests; people decide.  
> * **Autonomous and adaptive.** Rules learned from decisions are reused, and the learning panel shows the drop in decisions per close. Kira can run the whole workflow, pausing for approval on every change.  
> * **AI-native operations.** Questions such as "why is Harbor Square at 0% on 24 October?" or "where is the money missing?" get an answer with evidence in seconds, where a person would need an afternoon in Excel.

## **Technology**

| Part | Choice   |
| :---- | :---- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (SQLite, one database per client), pdfplumber for PDF tables, openpyxl for Excel |
| AI | Google ADK 2.12 agent with LiteLLM, model deepseek/deepseek-chat (any LiteLLM model works); the same model for small suggestion calls |
| Frontend | Plain JavaScript and CSS served by the backend, no build step |
| Hosting | One uvicorn process behind a Cloudflare tunnel (requests over 100 s are cut by Cloudflare, so long work must stay under that or run in the background) |

The rest of this document is the architecture as built in the prototype: workflow, layers, rules, analysis, Kira, the files of the page and of the backend, how to run it and how it is tested.  
---

KIRA reconciles payments. It traces each POS sale to the payment provider's settlement and then to the money that reached the bank.  
The repo has two parts:

| Part | Where | What it is   |
| :---- | :---- | :---- |
| Backend | backend/ | Python API (FastAPI), database (SQLAlchemy), and the Kira agent (Google ADK 2.12 \+ DeepSeek via LiteLLM). All the logic and every number. |
| Web page | dist/ | Plain JavaScript, served by the backend at /. Every step reads and writes through the API; the Kira chat panel talks to the agent. |

The page needs the backend (deployed at kira.madgun.us). The old **browser mode** (everything computed and stored in the browser, scripted Kira) is gone: new logic is written once, in the backend. Some older browser-side code still sits under the screens it draws (pipeline.js, cleaning.js, matching.js, assistant.js); server.js replaces each action with its API call.  
**Sign-in.** With KIRA\_PASSWORD set, every page and API call needs a session: the app's own login page (login.html) posts to /api/login, which sets a signed, HttpOnly cookie (14 days, KIRA\_SECRET signs it). Pages without a session redirect to the login page, API calls answer 401 (the page then goes to the login page). **Sign out** is in the profile menu.  
**Clients.** Each client (workspace) has its own database (kira.db, kira-\<client\>.db); the X-Kira-Client header picks one per request. The list of clients and their names is kept on the server (/api/clients), so every browser sees the same list; the default client is named by KIRA\_CLIENT\_NAME.

## ---

**1\. The workflow**

 `Step 1 Upload        Step 2 Convert           Step 3 Clean              Step 4 Match`  
 `─────────────        ──────────────           ────────────              ────────────`  
 `raw files      ──▶   Layer 1 tables     ──▶   Layer 2 tables      ──▶   Layer 3 links  ──▶  results / CSV`  
 `(Layer 0)            upload rules             cleaning rules            matching rules`  
                      `(per file type)          (data standard)           (stage l1, l2)`

Each step uses **rules**. KIRA proposes a rule and a person accepts it. Saved rules are reused on every later run. KIRA only asks again when the data has something the rules don't cover.

| Step | Input | KIRA proposes | You decide | Saved as | Output   |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 Upload | files (CSV, TXT, Excel) | which area a file belongs to | keep or move | raw file \+ SHA-256 | Layer 0 |
| 2 Convert | Layer 0 | columns to keep, types, delimiter | create / update / keep | upload rule vN (per type) | Layer 1 |
| 3 Clean | Layer 1 | standard names, rows to leave out | accept / reject each | cleaning rules vN | Layer 2 |
| 4 Match | Layer 2 | matching rules from patterns | save, test, run | matching rules PS1, SM1… | Layer 3 \+ results |

### **Step 1 · Upload (Layer 0\)**

> * There are three areas: **POS** (cashier sales), **Settlement** (provider reports such as DANA or GOPAY) and **Mutation** (the bank statement).  
> * A file identical to one already uploaded is skipped, based on its SHA-256 fingerprint.  
> * Each sheet in an Excel workbook becomes its own raw file. Title rows above the header are skipped.  
> * **PDF** (server mode): tables are read from PDFs that contain text, such as bank statements and provider reports. A table that continues over several pages is joined into one, and a header repeated on each page is dropped. Scanned PDFs (images only) are refused with a clear message, because reading them needs OCR, which isn't built.  
> * If a file's header looks like another area's, KIRA suggests moving it.  
> * Adding, removing or moving any file marks the converted tables as out of date and clears the matching results.

### **Step 2 · Convert (Layer 1\)**

> * All files of one type are read into a single table. KIRA detects the delimiter, normalizes headers to snake\_case and guesses each column's type (text, number, date, date & time, yes/no). Columns that look like IDs always stay text.  
> * **Required columns** (server mode): each table has its own required columns (REQUIRED\_COLUMNS) and is checked on its own. For every required column the rule card shows one of three states:  
> * **In the file**: the column is there under its own name.  
> * **Filled from** another column of the file: for example branch ← merchant\_store\_name, or transaction\_date ← create\_time. KIRA finds the source column first in the saved rule, then in known aliases (COLUMN\_ALIASES), then by asking the AI. The AI is told what each standard column means (COLUMN\_INFO), so it matches on meaning, not only on name, and gives a reason.  
> * **Not found**: you pick a column yourself.

Filling never changes the file's own columns: merchant\_store\_name stays, and branch is added next to it with the same values. It happens per file before files are combined, so different providers can fill the same standard column from differently named columns. The choice is saved in the upload rule (rename: {source column: standard column}; "" means don't fill), and the source column is kept by default. \- **Which columns to keep** (server mode): standard columns are always proposed as kept. Every other column (bank\_name, terminal\_id, printed\_by…) is judged by the AI from its name and a few sample values: keep if it helps identify, check or explain a payment, drop if it's layout or internal. The rule card shows "AI: keep / drop" with the reason, and you can change it. The decision is saved in the upload rule, so the AI is asked only about columns the rule hasn't seen. Without AI, only standard columns are proposed as kept. Kept extra columns appear in the tables and the export; matching rules use the standard columns. \- An **upload rule** stores the columns to keep, their types, the delimiter and the header mapping for one file type. \- First upload: KIRA proposes a rule with the important columns ticked. You create it (v1). \- Later uploads: KIRA compares the files with the saved rule. A new column, a missing column, a changed type or a different delimiter means it asks: **update** (vN+1) or **keep** (ignore the change). \- The rule is then applied: only kept columns, values cast to their type ("2.000.000,00" → 2000000, 26/10/26 13.00 → 2026-10-26T13:00:00+07:00), and exact duplicate rows removed. \- Layer 1 doesn't change what the values mean. It only gives them a proper type.

### **Step 3 · Clean (Layer 2\)**

> * KIRA compares Layer 1 with the **data standard**, which is defined in one place: dist/cleaning.js (STANDARD) and backend/kira/standard.py. It contains:  
> * outlets: **the outlet names in your POS** (server mode). POS is your own system, so its names are the standard. Several spellings of one outlet in POS are grouped, and the most used spelling wins. Settlement outlet names are matched to them by the words that tell outlets apart: Zestly \- Riverside Ctr → Zestly Riverside Center Jogja (words every outlet shares, like Zestly, are ignored). Names that still don't fit go to the AI. The list in standard.py is only used when POS has no outlet names (and in browser mode).  
> * providers: standard provider names ("QRIS-DANA", "qris" → DANA; "e-wallet gopay" → GOPAY).  
> * columns: which column of each table holds outlet or provider names.  
> * payout\_words: a bank credit whose description mentions one of these is a provider payout, no question asked.  
> * KIRA makes one **recommendation** per column that has values outside the standard, plus one to leave out bank rows that aren't payouts.  
> * **Bank rows that aren't payouts** are decided per *kind of description* (the description with its numbers taken out), so 10 transfers of the same kind are one decision. Debits and lines with no amount are proposed to leave out. Credits without a known provider name go to the AI (server mode), which says payout or not with a note. Example: "Airpay is ShopeePay's payment aggregator" → kept. You can switch any kind between "leave out" and "keep". Decisions are saved per kind, so only new kinds of description are asked again. Each recommendation shows the value in the file, what it becomes and how many rows it affects. You can change any target, or choose "Leave as is" for values KIRA couldn't identify.  
> * You accept or reject each recommendation. The card then shows "✓ Accepted" or "Rejected" with an **Undo** button. Then save. Saving creates **cleaning rules vN**:  
> * accepted values are mapped to their standard name.  
> * rejected values are saved "as is", so KIRA doesn't ask about them again.  
> * the bank exclusion is saved as on or off.  
> * Next time only *new* values are recommended. Example: day 2 has a new spelling, GoPay QR, so KIRA asks only about that one.  
> * Layer 2 keeps the old value of each changed cell (was). The UI highlights those cells and has a "Show before cleaning" toggle.  
> * **Where AI fits:** most recommendations come from the word lists in the standard. In server mode, values the lists can't identify are sent to the model, which proposes a standard name. These are labelled "AI suggestion" and go through the same accept/reject and save, so the cleaning that gets applied stays rule-based and repeatable. If the model is unavailable, the value is left for you to pick.

### **Step 4 · Match (Layer 3\)**

Matching runs in two stages. Each stage has an ordered list of **matching rules**, and a row matched by an earlier rule is not checked again.

| Stage | Links | Rule kinds   |
| :---- | :---- | :---- |
| l1 POS ↔ Settlement (PS1, PS2…) | one POS sale to one settlement row | composite: same outlet, same payment method, POS amount \= settlement gross (± tolerance), times within N minutes |
| l2 Settlement ↔ Mutation (SM1…) | one or many settlements to one bank credit | withdrawal: the provider pays out through a wallet; each store's payments of a day are paid by that store's withdrawal row of the day (same groupBy, e.g. entity\_id, and date), and the withdrawal reaches the bank as one credit of the same amount, up to maxDays later, whose description contains the end of the store code · ref: description contains the settlement reference and the amount equals net · batch: settlements grouped by merchant ID \+ settled date add up to one credit · amount: amount only, always marked "needs review" |

> * **Rows that aren't sales** (opening/closing balance, withdrawal; read from transaction\_type or row\_type) are never counted as unmatched. A withdrawal row is used as the link between payments and the bank credit.  
> * **ID columns are kept by default** when converting: names that say ID (entity\_id, reference, \*\_code) always, and number-like names (trace\_number, \*\_no) when their values are mostly distinct. They're how files link to each other.  
> * **ID rules** (stage l1): KIRA looks for a POS column and a settlement column that share values and look like IDs (mostly unique), such as trace\_number \= external\_reference\_id. When one links at least 30% of POS sales, it's suggested first, because an exact ID is the most reliable link.  
> * **Same-day window:** when settlement times are dates without a time (almost all at 00:00), the time-window rule is suggested as "same day" instead of minutes.  
> * **First time:** KIRA studies the data and suggests rules. For example, "90% of POS sales have a settlement within 1 min" becomes a 1-minute rule. You save the ones you want.  
> * **Later:** choose saved rules, **test** them (nothing is saved), optionally create another rule from what's left unmatched, then **run**.  
> * Running stage 1 again clears stage 2\. Any change to Layer 2 clears both.  
> * **Results:** each POS or settlement row is shown next to the bank credit that paid it, with a status:  
> * Matched: POS → settlement → bank all agree.  
> * Mismatched: a link is missing, with the reason (no POS sale, no settlement, not in bank yet, credit with no settlement).  
> * Needs review: matched by amount only, or several credits fit.  
> * **Why not 100%?** (server mode): under a stage that didn't match everything, KIRA groups the unmatched rows by a cause it can check in the data, then the AI explains each group and says what to do. Example causes: the ID isn't in the other file; same amount but another outlet or date; the candidate is already taken; not a sale (opening/closing balance, withdrawal); a bank credit that equals the total of many settlements (batch payout). Each group shows up to 5 sample rows next to their nearest candidate. The groups come from the data without the AI, and the result is cached per run. Kira can do the same in chat (explain\_unmatched).  
> * **Totals:** match rate (POS sales traced all the way to a bank credit ÷ all POS sales), per-stage rates, number of batch payouts, and cash explained.  
> * **Export:** CSV with one row per record and the mutation, settlement and POS columns side by side.

### **Match analysis (after a complete run)**

The **Match analysis** page (sidebar) reads the latest complete run. One selection drives everything on it: a period (all dates, the latest day, the last 7 days, this month, or any from–to range), one outlet or all, one provider or all. "All dates" with "all outlets" is the aggregate of everything.

> * **Match rate → Table** (default): one row per period (**day, week, month or all dates**), and per outlet and/or provider. Per row: rows per table (POS, settlement, bank), the match rate of each stage **seen from both sides** (POS → settlement, settlement → POS, settlement → bank, bank → settlement), end to end, the money on each side (POS amount and nett, settlement gross, MDR and nett, bank credit) and the **differences** in rupiah (POS − settlement gross, settlement nett − bank). Each bank credit is shared over the settlements it pays in proportion to their nett, so a batch payout isn't counted twice and the bank column adds up to the credits. Sort any column (rates worst first), keep **only rows under 100%**, find a row, choose column groups, tick rows for a subtotal, export. The footer is the total of the rows shown. Click a row to open its linked tables.  
> * **Match rate → Matrix:** a matrix of outlets × sales dates. Each cell is the match rate of one outlet on one day (POS sales matched ÷ POS sales, same definition as the Overview), coloured ≥ 95% / 80–95% / \< 80%, with the counts and a "+n" for open rows without a sale. The last column is each outlet over the period, the last row each day over all outlets, the corner the total. Switch between **Sales** (count) and **Money** (amount). Under it: the match rate per day (trend) and per outlet (lowest first). Click a cell for its match map, an outlet or a date to narrow the selection.  
> * **Match map → Linked tables** (default): the two tables of a stage side by side: **01 POS ↔ 02 Settlement** or **02 Settlement ↔ 03 Bank**. Each row has its status (Linked, Review, Not found) and its **link**: M1-0042 pairs a POS sale with its settlement, M2-0007 a bank credit with every settlement it pays (the bank row says "pays n"). Each side has its own search, status chips with counts, sort, column picker, paging and a footer total (any number column: sum, average, min, max, count). With the link button on, ticking rows (or clicking a link) on one side shows only the rows linked to them on the other. The **tick & tie** bar compares the two footers' totals (the ticked rows, or every row shown) and shows the difference, e.g. a credit against the nett of the settlements it pays. Click a row to compare it field by field.  
> * **Match map → Chains:** the records of the selection, one row each: POS sale \| settlement \| bank credit, with the link between them (rule, "ID ✓", or what differs, e.g. "Δ amount", "12 min"). Show open records only (default), all, or one status; search; or keep only rows where something differs. Click a row to compare it field by field: outlet (with the value before cleaning), date and time (minutes apart), amount, nett against the bank credit (for a batch payout: the total of every settlement the credit pays), payment method, shared ID (a POS and a settlement column with the same ID value) and what the bank description mentions. Each field is marked agrees / differs / missing / info. **Every column** shows all three rows side by side; values changed by cleaning and IDs found on both sides are highlighted.  
> * **Records:** the results table with search (any value of any linked row), status chips with counts, reason, amount range, sort by any column (empty values last), **Group by bank credit** (each credit next to the rows it pays; on by default, off while sorting), a column picker per table, page size, and **Export** of exactly the filtered rows. The same table replaces the combined table under step 4's results.  
> * **Linking by hand:** in the linked tables, tick rows marked *Not found* on both sides (stage 1: one sale and one settlement; stage 2: one bank credit and the settlements it pays). The tie bar then offers **Link by hand…**: it shows both sides and the difference, and asks why they belong together. The link is saved on the server (manual\_links, rule Manual), added on top of the matching runs every time results are read, kept when matching runs again, and written to the audit log. Each row is checked against a fingerprint, so a link whose rows changed (new files, new cleaning) is ignored and listed as out of date. "Find the same amount" fills the other side's search with the ticked total. The list of links made by hand (with **Remove**) is under the tie bar.  
> * **Where the money differences come from** (under the match-rate table): every rupiah that doesn't agree in the selection, labelled. *Expected:* a bank credit within Rp 1.000 of the settlements it pays when the credit is a round thousand (rounding), a difference explained by the withdrawal \+ handling fees, plus under Rp 1.000 left in the wallet (fee; the fee is read from the store's withdrawal row of that day, from its fee columns or, when those weren't kept, its gross − nett), a sale and settlement that differ by the promo amount. *To check:* settled but not in the bank yet (with how many days before the latest bank date), bank credit with no settlement, POS sale with no settlement, settlement with no POS sale, other amount differences. Each kind has a count, the rupiah and sample records.  
> * **Follow-up** (fourth tab): the work list of records that aren't matched. For each: status (open, investigating, resolved), who it's assigned to and a note. Saved on the server for everyone (follow\_ups), keyed by the record's id (POS sales number, settlement reference, or a fingerprint of the bank row) so it stays when matching runs again; written to the audit log. Also editable in the compare dialog of any record, and shown as a chip next to the record's status in the other tables.  
> * **Kira:** "Ask Kira" (page, map, gaps, follow-up, or one record) sends the question with what is on screen. Kira answers with its read tools and calls highlight\_records; the page then shows only those records (in the linked tables, the chains and the records table) with a "Kira highlighted…" bar (show all / clear).  
> * **Shareable links:** the address keeps the page you're on (\#/analysis?tab=map\&view=linked\&stage=l2\&outlet=Menteng\&from=2026-10-27\&to=2026-10-27, plus c=\<client\> for another client). **Copy link** copies it; opening it after signing in shows the same client, selection, tab and view.

Records: one per result row, in the results' order. Its day, outlet and provider come from the first linked row that has them (POS → settlement → bank): day \= sales\_date or sales\_datetime\_out, else transaction\_date, else the bank date; outlet \= branch; provider \= POS payment\_method\_ori or payment\_method, else the settlement's payment\_method. **The POS transactions are the baseline:** the match rate is POS sales matched ÷ POS sales, and every row of the match-rate table and the matrix is a sales date and an outlet of the POS (settlements with no sale are added to their own outlet and date). Rows without a POS sale don't count in the match rate; they're counted as "open". A bank credit that no settlement points to has no outlet (a bank statement has none), so it isn't a row: it's noted once under the table ("n bank credits (Rp …) aren't linked to any settlement"), counted in the money gaps, and listed in Records. The logic is in backend/kira/core/analysis.py; the records of a run are cached in memory per database until the next run or manual link.

### **Tutorial and guided tours (guide.js, from Andrew's tours)**

Kira takes over a cursor of its own, moves it across the real page, dims everything else (spotlight) and explains each control in a speech bubble. Tours only navigate, scroll and open panels; they never change data.

> * **Tutorial** button (top right, also **Take the tour** on the landing page): **Start from the beginning** runs the whole walkthrough, 8 chapters: Welcome (Overview), Upload, Convert, Clean, Match, Results, Match analysis (rate table, money gaps, linked tables, linking by hand, follow-up, shareable links), and Kira. Or pick one chapter. Made for demos: **Next / Back** at your own pace (or **Play automatically**), **Large text for presenting**, keys → ← Space Esc. Steps whose control isn't on screen for this client's data are skipped. A first-time visitor gets a hint pointing at the button.  
> * **Ask Kira inside the tour:** every bubble has "Ask Kira about this…" and two quick questions ("Explain with my data", "Why does this matter?"). The tour pauses, the question goes to the agent with the screen and the tutorial step as context, and the answer shows in the bubble (and in the chat, where the conversation carries on). Next continues the tour. Kira doesn't highlight records or start another tour while a tour is on screen; anything that would change data waits for approval in the chat.  
> * **From the chat:** clear "how do I / cara / gimana / tunjukin / give me the tour" questions start the matching tour (upload, convert, clean, match, results, analysis, or a quick overview); anything else goes to the agent, which can start one with its start\_tour tool.

### **KIRA learns as it runs (Overview)**

Every decision a person makes is noted (services/learning.py): creating, updating or keeping an upload rule, each cleaning card saved, each new matching rule. Running Settlement ↔ Bank closes the round. The Overview panel shows the decisions per close as bars (they drop as saved rules answer more: with the sample files, day 1 needs every decision and day 2 only the new POS column and the new provider spelling) and what the saved rules cover: file formats remembered, names and spellings standardised, kinds of bank rows judged, matching rules, links made by hand, follow-ups resolved. GET /api/learning; Kira reads it with get\_learning.

### **Guardrails on every AI call (agent/guard.py)**

> * **Scope:** Kira helps only with KIRA, reconciliation, payments, fees, bank statements and the finance work around them. A greeting gets one line; anything else (food menus, sports, news, general knowledge, unrelated coding or writing…) is declined in one line with a suggestion of what it can do instead. Tax and legal questions get the general idea and a pointer to their accountant.  
> * **Before the model:** asking for the system prompt, the instructions or keys, "ignore your instructions" (English or Bahasa), and messages over 2,000 characters are answered with a fixed reply; the model isn't called.  
> * **Injection:** file values, bank descriptions, tool results and the screen note are data, never instructions (in the agent's instruction and in every helper prompt). Values sent to the helper calls are cut to 300 characters; the screen note to 300\.  
> * **Output:** any secret (model key, sign-in password, cookie secret) is replaced with \[hidden\] in replies and helper answers. Helper answers are only used when they name values that exist (a header of the file, a standard name, a group code), as before.

### **Kira, the assistant**

Kira can run the whole workflow. It uses the same functions the buttons use, which are its **tools**:

| Kind | Tools | Approval   |
| :---- | :---- | :---- |
| Read | workflow status, files, upload rules, table preview, cleaning recommendations, matching rules, suggest rules, test rules, results, explain unmatched rows, match rate (period / outlet), match-rate table (day / week / month, outlet, provider, under 100%), match map (outlet \+ day), money gaps (labelled), follow-ups, highlight records, start a tour | runs right away |
| Change | add sample files, convert, save upload rule, save cleaning, save matching rule, run matching, export | **waits for your OK** |

Kira has no tools to delete files or rules, and it doesn't approve anything for you. Everything it changes is written to the audit log as Kira (approved by \<name\>).  
"Do the whole workflow for me" means Kira proposes one step, you approve it, Kira runs it and proposes the next.  
The chat panel is the ADK agent. You can chat about anything (it answers in your language and tone, never the formal "Anda"). When you ask about your data or ask for work, it uses its tools. Change actions appear as a "Kira wants to · needs your OK" card listing each action, with **Approve** (or **Approve all**) and **Reject**. After a change the page reloads the workflow and moves to the step Kira is working on (read tools reload nothing). From empty to exported CSV takes about 10 approvals. Each client and browser has one chat, stored on the server (kira\_chat.db): it survives a reload and a restart, and the panel shows it again ("Start a new chat" begins another). Kira's answer is what it said after its last tool result, without repeated paragraphs.

## ---

**2\. Web page (dist/)**

Plain JavaScript files loaded in order by index.html. There's no build step. Later files extend earlier ones by replacing global functions (for example daily \= function…). Data lives on the server; the browser keeps only view preferences (localStorage: tab, view, columns, the chat id, the client list for a fast first paint). server.js loads the workflow (/api/workflow?rows=100: table previews of 100 rows and result totals, about 150 KB) and the Overview summary after every change; result rows are read page by page from /api/analysis. The sections below describe the older browser-side engines that the screens still use for drawing.

| File | Role   |
| :---- | :---- |
| login.html | The sign-in page |
| followups.js | The Follow-up tab and the follow-up form in the compare dialog |
| links.js | Shareable links: the view in the address, **Copy link** |
| kira.css | Styles for sign-out, reset confirmation, chat history, manual links, money gaps, follow-up |

| File | Role   |
| :---- | :---- |
| app.js | App shell, navigation, Overview page, shared helpers (icon, num, esc, toast, audit), column schemas |
| workflow.js | Kira chat panel (addMsg, propose, paDecide, traceHtml, petToggle) and the older demo workflow |
| match-grid.js, reruns.js, simplify.js, governance.js | Older demo screens (Reruns, review/export, governance) |
| **pipeline.js** | Workflow page, steps 1–2 |
| samples.js | Synthetic sample files for day 1 and day 2 |
| **cleaning.js** | Step 3 and the data standard |
| **matching.js** | Step 4 |
| **assistant.js** | Kira in browser mode: scripted, proposes the next step |
| **server.js** | Server mode: loads state from /api/workflow, swaps each action for an API call, connects the chat panel to the agent (with the screen context) |
| demo.js | Reset demo, profile menu, client switcher (each client has its own browser storage and server database), "Keep all" on upload rules |
| overview.js | Overview from the real results: match-rate ring, totals, monthly calendar with the match rate per sales date (a day opens its outlets or its match map), open items |
| **analysis.js** | Match analysis page (match rate matrix, match map chains, records with filters), the filterable table under step 4, Kira highlights. Mirrors core/analysis.py |
| **analysis-tables.js** | The match-rate table and the linked tables (with tick & tie). Mirrors rate\_rows, allocate, side\_rows in core/analysis.py |
| guide.js | Kira's guided cursor tours |
| landing.js | Landing page with the client picker |

### **pipeline.js: steps 1–2**

| Function | What it does   |
| :---- | :---- |
| pipe / pipeSave() | Workflow state saved in localStorage (kira-pipeline-v1): current step, upload rules, decisions, cleaning rules and recommendations, matching rules |
| pipeLog(action, type, name, detail) | Adds an entry to the upload history and the audit log |
| pipeStore, kvGet, kvSet | IndexedDB access: raw store for files, kv store for parsed (Layer 1), clean (Layer 2\) and match |
| detectDelimiter, parseCSV, normHeader | Read CSV text |
| parseNumber, parseDateValue, inferType, cleanValue | Read Indonesian and international numbers and dates; guess and cast types |
| excelSheets(buf) | Excel → one CSV per sheet (SheetJS is loaded on first use) |
| addRawFiles(type, entries) | Upload: size and type checks, SHA-256 duplicate check, wrong-area hint (sniffType), save |
| markStale() | Files changed: conversion out of date, matching cleared |
| loadSamples() | Adds day 1, then day 2 sample files |
| profileType(type) | Combines all files of one type into one table, with proposed column types |
| runConvert() | Step 2: profiles every type, compares with upload rules (ruleDiff), sets decisions new / changed / same |
| decideRule(type, choice) | Create, update or keep an upload rule (reads the ticked columns and chosen types) |
| buildClean(profile, rule) | Applies an upload rule → Layer 1 table (kept columns, typed values, duplicates removed) |
| refreshClean() | Rebuilds Layer 1 (parsedTables), then calls updateCleaning() |
| rulesSettled(), stepReach(i), stepDone(i) | Which steps are open or finished |
| stepUpload(), stepConvert(), rulePrompt(t), pipeStepper() | Rendering |
| goStep(n) | Moves to a step if it's open |
| pipeInit() | Loads stored files and tables once every script has loaded |

### **cleaning.js: step 3**

| Function | What it does   |
| :---- | :---- |
| STANDARD | The data standard (see Step 3\) |
| standardName(list, value) | Standard name for a raw value, or null if none or several fit |
| isPayout(row) | Whether a bank row is a credit that mentions a provider |
| buildRecs() | Recommendations for values the saved cleaning rules don't cover, keeping decisions already made |
| activeCleaning() | Saved rules plus recommendations accepted so far (for the preview) |
| applyCleaning() | Layer 1 → Layer 2 (cleanTables), keeping old values in \_\_was |
| updateCleaning() | Called after convert or an upload-rule decision: rebuild recommendations and Layer 2 |
| decideRec(id, d) | Accept or reject one recommendation (click again to undo) |
| saveCleaning() | Saves cleaning rules vN+1 and clears the recommendations |
| cleaningSettled() | True when nothing is left to decide (opens step 4\) |
| stepClean(), recCard(r), standardSummary(), cleanSheet() | Rendering |

### **matching.js: step 4**

| Function | What it does   |
| :---- | :---- |
| runL1(rules, T) | Stage 1 engine: for each POS sale, the closest settlement in time that passes the rule |
| runL2(rules, T) | Stage 2 engine: ref, batch and amount rule kinds; collects ambiguous rows |
| runStage(stage, rules) | Runs one stage on the cleaned tables |
| suggest(stage) | Rule suggestions from the data: time window and method share for l1; reference, batch and amount gains for l2 |
| startStage, saveDraft, testStage, generateStage | Stage flow: analyse → create rule → choose & test → run (with live counters) |
| finalResult() | Combines both stages: groups rows under their bank credit, sets status and reason, computes totals |
| finishRun(), exportCombined() | Records the run and downloads the CSV |
| ruleDirectory(), draftCard, stageBody, analytics, combinedTable | Rendering |

### **assistant.js: Kira**

| Function | What it does   |
| :---- | :---- |
| pipeNext() | Looks at the workflow and returns Kira's next message and proposed action (with the tool calls it used) |
| kiraDo(fn) | Runs an approved action, then posts the next proposal |
| kiraRunStage(sid, drafts) | Saves suggested rules and runs a matching stage, like the buttons do |
| respond(q) | Answers chat messages: workflow intents first, older topics fall back to workflow.js |
| greet, petContext, nextStep | Greeting, the "Looking at…" line and the quick-question chips for each step |
| resetPipeline() | Clears every file, rule and result after confirmation |

### **server.js: server mode**

| Function | What it does   |
| :---- | :---- |
| apiBoot() | Called first by pipeInit(). Loads the Overview summary, then the workflow, then renders. On 401 it goes to the login page; if the server can't be reached it says so (there is no offline mode). |
| api(path, {method, body, form}) | Calls the API. Sends X-Kira-User with the person picked in the header, so the audit log names them. |
| sync() | Loads /api/workflow into the page's variables (rawFiles, pipe, parsedTables, cleanTables, mstate). The screens then render unchanged. |
| serverVersion(name, fn) | Replaces an action with its server version only when in server mode: addRawFiles, loadSamples, runConvert, decideRule (with header mapping), decideRec, saveCleaning, startStage, saveDraft, testStage, generateStage, exportCombined, finalResult, resetPipeline |
| draftCard | Rule card with the preview numbers from POST /matching/{stage}/preview |
| respond, greet | Chat goes to POST /api/agent/chat |
| showAgent(out) | Renders the agent's reply, tool trace and approval card |
| agentCall | Sends a chat message or an approval, then refreshes the page |

## ---

**3\. Backend (backend/)**

`backend/`  
  `pyproject.toml          dependencies (uv)`  
  `kira/`  
    `standard.py           types, default columns, required columns, data standard`  
    `config.py             settings from env / repo-root .env`  
    `db.py                 engine, sessions, init_db()`  
    `models.py             tables (one per layer + rules + audit)`  
    `core/                 pure logic, no database. Mirrors the UI files.`  
      `parsing.py          step 2 (CSV, Excel, header mapping)`  
      `pdf.py              PDF tables → CSV`  
      `cleaning.py         step 3`  
      `matching.py         step 4`  
      `analysis.py         records, filters, match rate per outlet per day, field comparison (match map)`  
    `services/             one module per step; the only place that changes data`  
      `files.py  convert.py  clean.py  match.py  status.py  state.py`  
      `analysis.py         match analysis of the latest run (cached per run)`  
      `ai.py               LLM suggestions: header mapping, standard names (optional)`  
    `api/                  FastAPI`  
      `app.py              create_app(): routers under /api, UI at /`  
      `deps.py             db session per request, current user`  
      `routes/             files.py convert.py clean.py match.py analysis.py status.py agent.py`  
    `agent/                Google ADK`  
      `tools.py            Kira's tools (call services)`  
      `agent.py            root_agent (LiteLlm → DeepSeek)`  
      `chat.py             Runner, sessions, approvals`  
    `samples/day1, day2    sample files (exported from dist/samples.js)`  
  `scripts/chat.py         chat with Kira in the terminal`  
  `tests/                  pytest`

Dependencies only point downwards: api and agent → services → core \+ models. Business rules live in core and standard.py. Any change to data goes through services. That's why the API and the agent always behave the same.

### **Tables (models.py)**

| Table | Layer | Holds   |
| :---- | :---- | :---- |
| raw\_files | 0 | the original file bytes, CSV text, area, folder, sheet, SHA-256 (unique), who and when |
| upload\_rules |  | one row per version per type: delimiter, columns \[{name, type, keep, by?, why?}\] (by: "ai" with the AI's reason), header mapping rename {raw: standard or ""} |
| parsed\_rows | 1 | type, row\_no, data (JSON) |
| cleaning\_rules |  | one row per version: maps ({"pos.branch": {"MENTENG": "Menteng"}}), exclude ({"bank": {"\<description pattern\>": true/false}}) |
| clean\_rows | 2 | type, row\_no, source\_row (→ Layer 1), data, was (old values) |
| matching\_rules |  | PS1/SM1…, stage, kind, params, position (run order) |
| match\_runs |  | one row per stage run: rules used, summary, current flag |
| match\_links | 3 | run, rule, left\_rows and right\_rows (row numbers), review |
| workflow\_state |  | short-lived state: last conversion and its proposals, open cleaning recommendations, table info |
| audit\_log |  | every change: who (person or "Kira (approved by …)"), what, detail |

Rows are stored as JSON because each provider's columns differ. If you move to Postgres (KIRA\_DATABASE\_URL), these become JSONB.

### **Services (services/)**

| Module | Functions   |
| :---- | :---- |
| files.py | add\_file(s, type, name, content, actor, folder), add\_samples(s, actor, day), list\_files, get\_file, remove\_file, move\_file, areas\_filled |
| convert.py | convert(s, actor) (profile → aliases → AI for missing required columns), decide\_upload\_rule(s, type, choice, actor, columns=None, rename=None), current\_rule, pending\_rules, rules\_settled, rebuild\_parsed, parsed\_tables |
| clean.py | recommendations, decide(s, rec\_id, decision, mapping=None), save(s, actor), current\_rules, refresh (after Layer 1 changes), settled |
| insights.py | explain(s, stage, use\_ai=True): unmatched rows grouped by cause, with samples and nearest candidates, plus the AI's summary, causes and actions |
| match.py | list\_rules, suggest(s, stage), save\_rule(s, stage, kind, params, actor, name), delete\_rule, test(s, stage, rule\_ids), run(s, stage, actor, rule\_ids), results(s, with\_rows), export(s, actor), ready (gate), stage\_status |
| status.py | status(s): step, next action, counts per area and table, matching state · workflow(s): everything the page shows, in one call · audit\_log · reset |
| ai.py | enabled(), ask\_json(task, data), map\_columns(table, missing, headers), judge\_columns(table, columns) (keep or drop \+ reason), standard\_names(kind, names, values) (+ reason), classify\_bank\_rows(rows, known) (payout or not \+ reason), explain\_unmatched(report) (summary \+ cause and action per group). Each returns nothing when no model key is set, KIRA\_AI=off, or the call fails. |
| analysis.py | summary(s, filters): totals, by\_outlet, by\_day, cells\[outlet\]\[day\], and the values the filters can take · records(s, filters, sort, desc, offset, limit): one page of records with their POS and settlement rows (each bank credit once, in banks) and the count per status · match\_map(s, outlet, day, status): records with what disagrees, for Kira · find\_keys · export(s, filters, actor): the CSV of the filtered rows. The records of a run are cached until the next run. |
| state.py | get/put workflow state, audit, clear\_matching, clean\_tables, WorkflowError |

Changes are made one at a time (db.write\_lock): if two identical requests arrive together, the second sees the first one's result and is refused (409), so a double click can't create a duplicate rule.  
Each table is processed on its own: deciding one table's upload rule rebuilds only that table's Layer 1 and Layer 2\.  
What clears what: changing files makes the conversion stale and clears matching. Rebuilding Layer 1 rebuilds Layer 2\. Any change to Layer 2 clears matching. Running l1 clears l2.  
A request that doesn't fit the current step raises WorkflowError. The API returns it as HTTP 409, and the agent gets it as {"status": "error", "message": …}.

### **API (/api, OpenAPI docs at /docs)**

| Step | Method & path | Does   |
| :---- | :---- | :---- |
|  | GET /status | step, next action, counts |
|  | GET /workflow?rows= | everything the page shows, in one call |
| 1 | GET /files · POST /files/{type} (multipart uploads, folder) · POST /files/samples/{day} · GET /files/{id}/download · POST /files/{id}/move · DELETE /files/{id} | upload and manage raw files |
| 2 | POST /convert · GET /convert · GET /upload-rules · POST /upload-rules/{type} {choice, columns?, rename?} | convert and decide upload rules (with header mapping) |
| 3 | GET /cleaning · POST /cleaning/recommendations/{id} {decision, mapping?} · POST /cleaning/save · GET /tables/{parsed\\\|clean}/{type}?limit\&offset | recommendations, decisions, saving, table previews |
| 4 | GET /matching/rules · GET /matching/{stage}/suggestions · POST /matching/{stage}/rules {kind, params, name} · POST /matching/{stage}/preview {kind, params} · GET /matching/{stage}/insights · DELETE /matching/rules/{id} · POST /matching/{stage}/test · POST /matching/{stage}/run {rule\_ids?} · GET /matching/results?rows=true · GET /matching/export | rules, test, run, results, CSV |
| Analysis | GET /analysis/rates?period=day\\\|week\\\|month\\\|all\&by\_outlet\&by\_provider\&below\&search\&sort\&desc\&offset\&limit (rows \+ totals) · GET /analysis/side/{l1\\\|l2}/{pos\\\|settlement\\\|bank}?link\_status\&links\&search\&sort\&desc\&offset\&limit (rows with link, status, row; counts; aggregates per number column) · GET /analysis/summary · GET /analysis/records?sort\&desc\&offset\&limit · GET /analysis/export — all take date\_from, date\_to, outlet, provider, status (comma-separated), reason, q, amount\_min, amount\_max, keys (comma-separated sales numbers or references) | match rate per outlet per day, filtered records, filtered CSV (409 before a complete run) |
|  | GET /overview | the Overview's summary: status, totals, match rate per sales date, first open items |
|  | GET /analysis/gaps · GET /analysis/follow-ups?follow\&search\&offset\&limit · POST /analysis/follow-ups {rid, status, assignee, note} · GET /analysis/manual-links · POST /analysis/manual-links {stage, left, right, note} · DELETE /analysis/manual-links/{id} | labelled money differences, the follow-up list, links made by hand |
| Sign-in | POST /login {username, password} · POST /logout · GET /me | session cookie (open without KIRA\_PASSWORD) |
| Clients | GET /clients · POST /clients {name, id?} | the shared client list; id renames |
| Kira | GET /agent/history?session\_id (the chat so far) · POST /agent/chat {session\_id, message, context?} (context: what the user is looking at, added to the message) · POST /agent/confirm {session\_id, answers: {confirmation\_id: approved}} | chat; change actions come back in pending, and every pending id of a reply is answered together |
|  | GET /audit · POST /reset | audit log, start over |

The person acting comes from the X-Kira-User header, or KIRA\_USER if the header isn't set. Sign-in is not built yet.

### **Kira agent (agent/)**

> * agent.py: root\_agent \= Agent(model=LiteLlm(settings.model), tools=TOOLS, instruction=…). The default model is deepseek/deepseek-chat. Any LiteLLM model id works through KIRA\_MODEL. The key is read from DEEPSEEK\_API\_KEY in the repo-root .env.  
> * tools.py: 18 read tools as plain FunctionTools and 7 change tools as FunctionTool(…, require\_confirmation=True). highlight\_records and start\_tour act on the page: the UI reads them from the reply's tool\_calls. Each tool opens a session and calls a service.  
> * chat.py: send(session\_id, user, message) and confirm(session\_id, user, confirmation\_id, approved). When a change tool is called, ADK emits an adk\_request\_confirmation call. chat.py returns it as pending: \[{id, tool, args}\]. The client answers with confirm, and ADK then runs or skips the tool and continues. The response also lists tool\_calls with their results, for a "how Kira got this" view.  
> * Sessions are kept in memory (InMemorySessionService). For persistence, swap in ADK's DatabaseSessionService.

## ---

**4\. Running it**

`## Backend + page`  
`npm start                       # = cd backend && uv run uvicorn kira.api.app:app --port 8000`  
                                `# http://127.0.0.1:8000 · API docs at /docs`

`## Kira in the terminal (asks y/n for each change; --yes approves all)`  
`uv run python scripts/chat.py "Do the whole workflow for me with the sample files"`

`## Kira in the ADK dev UI (pick "agent")`  
`uv run adk web kira`

Settings (environment or .env in the repo root):

| Variable | Default   |
| :---- | :---- |
| DEEPSEEK\_API\_KEY | required for Kira |
| KIRA\_MODEL | deepseek/deepseek-chat |
| KIRA\_DATABASE\_URL | sqlite:///backend/kira.db |
| KIRA\_USER | Nadia Aulia |
| KIRA\_AI | on. off turns off AI suggestions (header mapping, keep/drop for extra columns, standard names); the agent still works |
| KIRA\_PASSWORD | empty (no sign-in, for local use and tests). When set, every page and API call needs a session from the login page (username KIRA\_USERNAME, default kira). Set it on public deploys. |
| KIRA\_SECRET | signs the session cookie; derived from the password when empty |
| KIRA\_SESSION\_DAYS | 14 |
| KIRA\_CLIENT\_NAME | Main workspace: the default client's name |

A **reset** (the Reset button, typed confirmation with the client's name) first copies the client's SQLite database to kira.bak-reset-\<time\>.db next to it (the last 5 are kept), then clears that client's files, rules, tables, results, manual links and follow-ups. The audit log and the client list stay.  
Deployed on the homelab as user unit kira.service (uvicorn 127.0.0.1:4174) behind the Cloudflare tunnel at kira.madgun.us; settings in \~/.config/kira/env, data in \~/.local/share/kira/.

## **5\. Tests**

| Command | Covers   |
| :---- | :---- |
| npm test (tests/ui.cjs) | The page in a headless browser against a real backend (temporary database, AI off, sign-in on): login page, upload, duplicate check, convert, rules, clean, both matching stages (34/32/31/2), export, guided tours, results filters, match-rate table, money gaps, linked tables with tick & tie, linking by hand (and removing it), follow-up, matrix, chains, Kira highlights, filtered export, analysis tour, shareable links, header mapping for a provider with other header names, reload, adding a client, reset with typed confirmation and backup, sign-out |
| npm run test:api | \= cd backend && uv run pytest \-q |
| cd backend && uv run python scripts/evaluate.py \<folder\> \<key.xlsx\> | Real files against an answer key (see above) |
| cd backend && uv run pytest | Services and API with the same samples. test\_analysis.py: two days × two outlets, match rate per outlet per day agrees with the results and the Overview, scope, filters, sort, paging, filtered export, match map comparison, highlight keys, rate table, linked tables, manual links (kept across re-runs), money gaps (rounding and fees explained), follow-ups (kept across re-runs). test\_api.py: sign-in (redirect, 401, forged and expired cookies), clients, reset backup, a change is committed before its response. Final numbers match the UI: stage 1 34 matched, stage 2 32, full 31, batch payouts 2\. Also checks that exactly the 7 change tools need approval, the "why not 100%" groups (a 12-minute gap and an amount difference are told apart), header mapping by alias and by AI (model stubbed), AI names for unknown values, and a two-page PDF bank statement. |

### **Checked against a real answer key**

backend/scripts/evaluate.py \<folder\> \<answer key.xlsx\> runs a folder of POS / SET / STA files through the normal services on a temporary database: upload, convert, accept every cleaning recommendation, then the **first suggested rule** of each stage, with no AI. It then compares the result per sale with the answer key's Matching\_Sample sheet.  
On the masked SALDOM8S dataset (10 days, 10 stores: 13,995 POS sales, 14,295 settlement rows, 100 bank rows), KIRA suggests ID: trace\_number \= external\_reference\_id and Withdrawal payout by entity\_id. Every link matches the answer key: POS → settlement, settlement → withdrawal and withdrawal → bank credit are each 13,995 / 13,995 (100%). The run takes about 90 seconds. tests/test\_wallet\_provider.py covers the same pattern with small synthetic data.

## **6\. Not built yet**

> * Personal accounts and roles: one shared account signs in; the name in the audit log comes from the profile (X-Kira-User).  
> * OCR for scanned PDFs.  
> * Editing the data standard from the app (it's in code: backend/kira/standard.py, dist/cleaning.js).  
> * Undoing a link made by the rules (only links made by hand can be removed).  
> * Match analysis keeps a run's records in memory. That is fine for tens of thousands of rows; at hundreds of thousands, store them in a table when a run finishes and query it with SQL.
