# Taufiq platform handoff

The `taufiq` branch contains the shared backend foundation, sign-in, workspace registry, Kira's ADK agent, and the chat panel. The pipeline and matching implementations and Andrew's application shell remain with their assigned owners.

## Run

```sh
cd backend
uv sync --frozen
cp .env.example .env # fill model and sign-in settings
uv run uvicorn kira.api.app:app --reload --port 8000
uv run pytest -q
```

The isolated platform preview builds without creating Andrew's web package or app shell:

```sh
npm --prefix web/src/kira ci
npm --prefix web/src/kira run typecheck
npm --prefix web/src/kira test
npm --prefix web/src/kira run build
```

Open port 8000 after building. Once Andrew's app is ready, use his normal `web/` build and mount `ChatPanel` as shown in [its integration guide](../web/src/kira/README.md). The isolated preview is only the initial deployment entry.

## Shared interfaces

- `config.settings`: the documented settings; optional model calls require a key. Public sign-in refuses startup without `KIRA_SECRET`.
- `db.current_client`: request-selected `ContextVar`. `session_scope(write=True, wait=None)` commits writes, rolls back failures/reads, and serializes changes. Kira passes `wait=2`. Use one Uvicorn process for the shared write lock.
- All twelve models in docs/03 are present. `state.get/put`, `audit`, `clear_matching`, `clean_tables`, `drop_rows`, and `WorkflowError` are available. JSON values are copied so nested updates persist through `put`.
- Pipeline state consumed by status: `conversion = {at, stale, proposals, decisions}` and `recommendations = [{id, decision, ...}]`. Agree these with Rifat when integrating; cleaning decisions are incomplete until saved.
- `learning.note(s, kind, **data)` appends `{kind, at, **data}` events to the `learning` state key. Nurwan owns its summary.
- `clients.list_clients(*, session=None)` and `save_client(name, cid=None, *, session=None)` use the default workspace registry. Routes supply a committed default session even when a client header selects another workspace.
- `/api/status`, `/workflow`, `/audit`, `/login`, `/logout`, `/me`, `/clients`, and `/agent/{chat,confirm,history}` are registered. The app discovers the feature routers `files`, `convert`, `clean`, `match`, `analysis`, `overview` when their modules arrive.
- `chat.send/confirm/history` follow docs/04. Chat ownership includes client and signed-in identity. Approvals survive restarts; exact current IDs must be answered together. Write tools own their service transactions rather than holding a request write lock during a model call.
- Kira calls documented service functions lazily. Missing teammate services return an explicit tool error. Nothing fabricates analysis or demo results.
- Follow-up draft integration expects `services.followup.draft(s, keys=..., f={date_from,date_to,outlet,reason}, lang=..., only_empty=...)`. This signature is an integration proposal because docs/03 did not specify the new module. Nurwan should align it or request a tool adapter change. Saving uses `analysis.find_keys`, `follow_ups`, and `set_follow_up` with at most 1,000 records in one transaction.
- Successful chat writes invoke the panel's `onDataChanged`; verified highlights invoke `onHighlight`. Andrew owns connecting those callbacks to navigation and table filters.

## Deployment and rollback

`backend/deploy-local.sh` deploys the committed `taufiq` revision to an immutable local release under `~/.local/share/kira-build/releases/`. It runs checks and builds before restarting the existing user service. The service retains `~/.config/kira/env` for model/sign-in credentials and uses a new database at `~/.local/share/kira-build/data/kira.db`. The prototype's checkout and database are preserved.

The existing Cloudflare tunnel reaches `127.0.0.1:4174` for `kira.madgun.us`. This deployment changes that origin process, retaining the existing tunnel/DNS route.

To restore the prototype:

```sh
rm ~/.config/systemd/user/kira.service.d/taufiq.conf
systemctl --user daemon-reload
systemctl --user restart kira.service
```

For a previous new-build release, restore the saved drop-in from `~/.local/share/kira-build/backups/` instead. Restart and verify sign-in/status through the public hostname. Business and chat databases are shared across new-build releases, so back them up before future schema changes.

## Validation and remaining integration

Backend tests cover schema/workspace isolation, commit/rollback/locking, sign-in, static routing, guardrails, real ADK approval/rejection/replay prevention, durable history, and service adapters. The panel has protocol tests, strict TypeScript checking, and browser checks at desktop/tablet widths.

Verified on 7 November 2026: 34 backend tests and 6 panel protocol tests passed; Ruff, strict TypeScript and the production build passed. Chrome checks covered sign-in/out, full approval text, approve/reject, exactly one refresh after a successful change, guarded replies, restored history, focus and tablet overflow with no browser errors. Public Cloudflare checks passed for Secure/HttpOnly sign-in, protected APIs, workspace isolation, a live DeepSeek answer using database evidence, and durable chat history. Empty workspaces `zestly-demo` and `zestly-demo-latihan` are ready for Rifat's demo-data loading.

The four data-analysis demo questions and the Harbor Square follow-up scenario require Rifat's pipeline/demo files and Nurwan's analysis/follow-up services. Andrew must mount the panel in the final shell and connect highlights. No full reconciliation or demo-number check is claimed for this platform-only release.
