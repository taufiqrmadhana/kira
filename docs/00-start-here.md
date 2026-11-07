# **KIRA: rebuild and demo kit**

KIRA reconciles payments for Indonesian merchants: it traces every POS sale to the payment provider's settlement and to the money that reached the bank, explains every rupiah that doesn't agree, and keeps the evidence for every number. This folder has everything needed to rebuild it from scratch during the hackathon (with Codex, four people) and to present it.  
Rules of the event, as we understand them: data may be brought in advance; code may not. So this kit is specifications, contracts and data, not code. The working prototype at https\://kira.madgun.us (sign in: shopeeavengers / shopeeavengers) is the reference for how everything should look and behave.

**How to start:** open Codex, say “I'm \<your name\>, let's start to build” and paste this folder's link. A coding agent reading this: open 12 Team assignments first and follow that person's section.

## **What's in the folder**

| Document | Read it if you   |
| :---- | :---- |
| 01 Product and architecture | want the whole picture: the problem, the four steps, the data layers, the matching rules, Match analysis, Kira |
| 02 API contract | build the backend or the frontend: every endpoint with parameters, body and a real example response |
| 03 Backend reference | build the backend: every module, class and function with parameters and what it does |
| 04 Kira agent (Google ADK) | build the assistant: tools, approvals, sessions, guardrails, the full instruction |
| 05 Frontend flow and reference | build the page: every screen and flow, which API each step calls, every script and function |
| 06 Build plan: four people with Codex | split the work: who builds what, the order, the hand-offs, how to use Codex |
| 07 Demo and presentation | prepare the 6-minute live demo: script, clicks, links, questions for Kira, backup plan |
| Data (folder) | need the demo data: two datasets in the competition's file format, with answer keys and a guide |
| 08 Gaps and fixes before the build | read right after this page: what 00–07 get wrong or leave out, the stack, a two-hour plan, ADK details, the pre-event checklist |
| 09 Engine rules: convert, clean, match | build the engine: how files are read, cleaned and matched, in words, with the column aliases the Zestly files need |
| 10 UI reference and Screens (folder) | build or improve the page: 20 screenshots, layout, design tokens, components, what not to copy, a starter DESIGN.md |
| 11 UI skills and plugins, and UI skills.zip | make the UI not look AI-generated: which skills and plugins to install for Codex and Claude Code, a workflow, an anti-slop checklist |
| 12 Team assignments | know your part: who builds what (Taufiq, Andrew, Rifat, Nurwan), which files you own, your tasks in order with checks, the timeline; Codex starts here |
| Repo starter (folder) | start the repo: AGENTS.md, DESIGN.md and every document as Markdown in docs/ with the screenshots; Taufiq pushes it as the first commit |

## **Suggested reading order**

> 1. Everyone: this page, 12 (your section), 08, 01, 06\.  
> 2. Backend people: 02, 03, 09, then 04 for the agent.  
> 3. Frontend people: 05, 10, 11, then 02\.  
> 4. Whoever presents: 07 and the Data guide.

## **The product in one paragraph**

A finance team uploads three kinds of files: POS sales from the cashier system, settlement reports from payment providers (ShopeePay, DANA, GoPay…), and the bank statement. KIRA converts them into clean tables (remembering each file format as an upload rule), standardises names (outlets, providers) with cleaning rules, then matches in two stages: POS sale to settlement, settlement to bank credit (one credit can pay hundreds of settlements). Every decision a person makes becomes a rule that is reused, so each day needs fewer decisions. Match analysis shows the match rate per outlet and day from both sides, the linked rows side by side with tick and tie, every money difference labelled (rounding and fees are expected; not in the bank yet needs a look), and a follow-up list. Kira, the AI assistant, answers questions from the data, highlights records, runs the workflow step by step with the user's approval, and gives guided tours.

## **Numbers to remember**

|  |   |
| :---- | :---- |
| Demo dataset | 7 days, 10 outlets, 8,784 POS sales, 8,785 settlement payments, 70 bank payouts |
| With planted exceptions | 8,639 of 8,784 sales traced to the bank (98.3%); Rp 10.67 million to check, Rp 26,361 expected (rounding and a fee) |
| Learning | the first close needs about 7 decisions; the next day with a new column and a new spelling needs 2 |
| Matching rules KIRA finds by itself | ID rule trace\_number \= external\_reference\_id; withdrawal payout by entity\_id |


