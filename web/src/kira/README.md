# Kira panel integration

This directory is Taufiq's ownership boundary. `ChatPanel` needs React and React DOM only. It uses the API contract in docs/02 and docs/04; it never generates demo numbers.

```tsx
import { ChatPanel } from './kira';

<ChatPanel
  client={clientId}
  user={userName}
  context={{ page: 'Match analysis', tab: 'Linked tables', outlet, period }}
  onDataChanged={async (_calls, destination) => {
    await reloadPageData();
    // destination is workflow step 2/3/4, 'follow-up', or 'analysis'.
    navigateToDestination(destination);
  }}
  onHighlight={({ keys, note }) => {
    // Open Match analysis > Match map > Linked tables, filter to keys,
    // and show note above the tables. Keys come from verified tool results.
    openHighlightedLinkedTables(keys, note);
  }}
  onUnauthorized={() => navigate('/login')}
/>
```

Andrew owns mounting this in the app shell and adapting the shared buttons once those components exist. Reserve a grid column or footer area for the dock; it intentionally uses normal document flow, so the launcher and panel do not cover table data. Do not position it fixed over the tables. Pass the authenticated user and active client; changing either remounts the panel and aborts old requests.

The panel keeps a session ID and pending approvals per client and user in local storage. History comes from the server each time it opens; pending tool traces (`result.status: "pending"`, `confirmation_id`) reconcile cached cards with the server. Approved/rejected IDs are sent together. Only successful change tools call `onDataChanged`; reading history does not replay effects. The backend remains authoritative for approval validity. While an approval is pending, approve or reject it before sending another message or starting a new chat. The full follow-up note, selected records, status and assignee are visible before approval.

Markdown supports paragraphs, bold, emphasis, lists, quotes, code and HTTP(S)/same-origin links. Raw HTML is rendered as text. The stylesheet follows DESIGN.md, with darker secondary text for contrast and scoped classes. The four demo questions come from docs/07.

Run protocol tests from the repository root:

```sh
node --experimental-strip-types --test web/src/kira/protocol.test.mjs
```

Run the main web tests with `npm --prefix web test`; `ChatPanel.test.tsx`, `Integration.test.tsx` and `pages/Login.test.tsx` cover the mounted companion, approvals, client changes and sign-in. Run browser checks against the main Vite app with `npm --prefix web run test:browser`. There is one web dependency tree and one application entry point.

Browser checks: sign in, reopen history, send a question, inspect evidence, reject a change, approve all pending changes, verify one refresh, switch clients while a response is in flight, and check keyboard focus at 1280 px and tablet width. Real demo answers require the model key, Rifat's pipeline, Nurwan's analysis services, and the demo dataset.
