# KIRA

KIRA reconciles payments for Indonesian merchants. It traces every POS sale to the payment provider's settlement and to the
bank credit that paid it, labels every rupiah that doesn't agree, and keeps the evidence for every number. A person uploads
three kinds of files, KIRA converts and cleans them with rules it learns from each decision, matches in two stages
(POS ↔ settlement, settlement ↔ bank), and shows the match rate, the money gaps and a follow-up list. Kira, the assistant,
answers from the data and runs the workflow with the user's approval.

## Who you are working with

Four people build this, each with Codex. When someone says "I'm <name>, let's start to build", open
docs/12-team-assignments.md, find their section, and follow it: their reading list, their files, their tasks in order.

| Person | Area |
| --- | --- |
| Taufiq | Kira agent, platform, sign-in, deploy, integration (lead) |
| Andrew | Web app shell, design system (DESIGN.md), Overview, Match analysis screens |
| Rifat | Upload, convert, clean (steps 1–3), backend and screens; loading demo data |
| Nurwan | Matching engine, results, analysis, follow-ups, learning; step 4 screen |

Work only in the files your person owns (table in docs/12). For anything else, tell them who owns it.

## Documents (docs/)

00 start here · 01 product and architecture · 02 API contract · 03 backend reference · 04 Kira agent · 05 frontend flow ·
06 build plan · 07 demo · 08 gaps and fixes · 09 engine rules · 10 UI reference (+ screens/) · 11 UI skills · 12 team
assignments · data-guide. Where 01 or 05 disagree with 08 or 09, 08 and 09 win. docs/08 "Added on 5 November" lists what was
added after 01–07 were written (Kira drafts follow-up notes, rule order and edit, simpler filters, per-stage rule totals);
the endpoints are also at the end of 02 and the Kira tools at the end of 04.

## Rules

- Endpoints and response shapes match docs/02-api-contract.md exactly. Other people code against them; if one must change,
  say so to your person first.
- Engine behaviour follows docs/09-engine-rules.md, and the results must match the numbers in docs/data-guide.md.
- Layering: api and agent → services → core + models. Only services change data. core has no database access.
- Every write endpoint takes the session with Depends(db, scope="function") so the commit lands before the response.
- A step that doesn't fit the workflow raises WorkflowError → HTTP 409 with detail.
- Screens follow DESIGN.md and the anti-slop checklist in docs/11-ui-skills.md. Use the shared components in web/src/components.
- Tests first: write the test from the task's "Done when" check, then the code.
- Commits: small, one-line subject naming the feature, no body. git pull --rebase before every push. Push often.
- No code from the old prototype. The screenshots in docs/screens/ are the visual reference; don't open kira.madgun.us's source.
- Log each Codex task in docs/codex-log/<name>.md: time, task, merged yes/no.

## Stack

- Backend: Python 3.13, uv, FastAPI, SQLAlchemy 2 (SQLite, one file per client), google-adk==2.12.0, litellm==1.106.2,
  mcp==2.3.0, python-multipart, python-dotenv, openpyxl, pdfplumber, greenlet. Model: KIRA_MODEL (deepseek/deepseek-chat)
  with DEEPSEEK_API_KEY.
- Web: React + Vite + TypeScript, Tailwind (theme from DESIGN.md), TanStack Table, React Router.

## Run and test

```
cd backend && uv sync && uv run uvicorn kira.api.app:app --reload --port 8000   # API at /api, docs at /docs
cd backend && uv run pytest -q
cd web && npm install && npm run dev       # http://localhost:5173, /api proxied to :8000
cd web && npm run build                    # web/dist, served by the backend at /
```

Settings come from the environment or backend/.env (never committed): DEEPSEEK_API_KEY, KIRA_MODEL, KIRA_DATABASE_URL,
KIRA_USER, KIRA_AI (off turns AI suggestions off), KIRA_USERNAME, KIRA_PASSWORD (empty = no sign-in), KIRA_SECRET,
KIRA_CLIENT_NAME.

