# **Build plan: four people with Codex**

The rebuild starts from an empty repository during the event. The API contract (document 02\) is the boundary between people: the backend promises those endpoints and shapes, the frontend codes against them (with the example responses as mock data until the real endpoints exist). Each person owns one area end to end, including its tests.

## **Who builds what**

|  | Person A · Data pipeline | Person B · Matching and analysis | Person C · Kira and platform | Person D · Product UI   |
| :---- | :---- | :---- | :---- | :---- |
| Owns | Steps 1 to 3: files, convert, clean, the data standard | Step 4 and everything after: matching engine, results, Match analysis APIs, manual links, follow-ups, money gaps, learning | Kira agent (ADK), suggestion calls, guardrails, sign-in, clients, deploy | Every screen: login, landing, Overview, Workflow, Match analysis, chat panel, tutorial |
| Backend modules | standard.py, core/parsing.py, core/pdf.py, core/cleaning.py, services/files.py, services/convert.py, services/clean.py | core/matching.py, core/analysis.py, services/match.py, services/insights.py, services/analysis.py, services/manual.py, services/learning.py | agent/\*, services/ai.py, api/auth.py, services/clients.py, db.py, config.py, api/app.py | (none) |
| Endpoints | /files\*, /convert, /upload-rules\*, /cleaning\*, /tables/\* | /matching/\*, /analysis/\*, /learning, /overview | /agent/\*, /login, /logout, /me, /clients, /status, /workflow, /audit, /reset | consumes all |
| Data model | raw\_files, upload\_rules, parsed\_rows, cleaning\_rules, clean\_rows | matching\_rules, match\_runs, match\_links, manual\_links, follow\_ups | workflow\_state, audit\_log, chat sessions | — |
| Done when | the demo data converts and cleans with 7 decisions on day 1 and 2 on day 8 | the demo data matches 8,639 / 8,784 with the planted exceptions found as listed in the Data guide | Kira answers, asks for approval, stays on topic, survives a restart | the demo script in document 07 can be clicked through |

Person A and B share models.py (agree on it in the first hour). Person C sets up the repository skeleton, the database session and the app factory first, so A and B can add routes immediately.

## **Order of work**

| Phase | A | B | C | D   |
| :---- | :---- | :---- | :---- | :---- |
| 0 · first hour, together | agree on table schemas and the standard columns | agree on the result and record shapes | repo skeleton, AGENTS.md, app factory, db session, test setup, deploy target | page shell, navigation, login page, mock API from document 02 |
| 1 | upload (CSV, Excel), convert with upload rules | matching engine: ID rule and withdrawal rule first (the demo data needs only these) | agent with read tools, chat API, sessions | Workflow steps 1 to 4 against mocks |
| 2 | cleaning recommendations and rules, outlet names from POS | results, records with filters, export; rate table; linked tables | change tools with approval; guardrails; suggestion calls | Overview; Match analysis tabs |
| 3 | PDF statements; AI header mapping | money gaps, manual links, follow-ups, learning, insights | clients, reset with backup, tutorial agent hooks | chat panel, tutorial, follow-up, links |
| 4 · together | load the demo data, fix what breaks, rehearse the demo twice |  |  |  |

If time runs short, cut in this order (the demo still works): PDF upload, composite and batch rules, insights ("Why not 100%?"), Matrix and Chains views, shareable links. Never cut: the two stages with the ID and withdrawal rules, the rate table, linked tables with tick & tie, money gaps, learning panel, Kira with approvals and guardrails.

## **How to use Codex (and show it)**

> * Put an AGENTS.md at the repository root with: the product in five lines, the stack, the layering rule (api and agent → services → core \+ models; only services change data), how to run and test, and the rule "match the API contract in docs/api\_contract.md exactly".  
> * Copy documents 02, 03 and 04 (or the parts you own) into docs/ in the repository so Codex can read them.  
> * One Codex task per endpoint group or screen, each with: the contract section, the acceptance test (from the Data guide numbers or the example responses), and the files it may touch. Ask Codex to write the tests first.  
> * Review each Codex change before merging; keep commits small and named after the feature.  
> * Keep evidence for the "Use of Codex" criterion: the Codex task list, a few prompts and diffs, and the share of commits made through Codex. A slide with "N Codex tasks, M merged, the four of us reviewing" is easy to show.

Starter prompt per person (adapt):  
You are building part of KIRA, a payment reconciliation app (see AGENTS.md and docs/).  
Implement \<area\> exactly as specified in docs/\<document\>, sections \<…\>.  
Endpoints must return the shapes in docs/api\_contract.md. Write pytest tests first using the sample shapes and the  
numbers in docs/data\_guide.md, then the code. Touch only \<files\>. Keep functions small, with docstrings.

## **Interfaces to agree on early**

> * Record shape (/analysis/records): i, g, status, reason, r1, r2, day, outlet, provider, amount, key, rid, pos, stl, bank\_i and banks once per page.  
> * Side row shape (/analysis/side): n, rec, key, day, outlet, rule, link, status, pays?, row.  
> * Rate row (/analysis/rates): keys period, outlet, provider, sums, the five rates r\_pos\_stl, r\_stl\_pos, r\_stl\_bank, r\_bank\_stl, r\_full, money and gap\_sale, gap\_payout.  
> * Agent reply: {reply, pending:\[{id, tool, args}\], tool\_calls:\[{tool, args, result}\]}.  
> * Errors: 409 with detail for a step that doesn't fit; the UI shows detail as a toast.

## **Risks we already hit (avoid them)**

> * **Cloudflare cuts requests over 100 s.** Converting 7 days at once (8,784 sales) took longer with AI suggestions on. Keep each request short (convert per day or in the background with a job id and polling) and never convert a week live in the demo.  
> * **The server froze** when an agent tool waited for the write lock inside the event loop. Run tools in threads and never wait long for the lock (document 04).  
> * **A response before the commit:** with FastAPI, a database session from a yield dependency must close before the response is sent (Depends(db, scope="function")), or the next request can read old data.  
> * **The model sometimes ends without words after calling tools.** Ask it once more (document 04).  
> * **Off-topic questions.** Guardrails from the first day; judges will try "menu McDonald's".
