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

Run the browser interaction checks with `npm --prefix web/src/kira run test:ui`. They build and serve the isolated preview, use API fixtures, and cover readable suggestions, panel focus, full follow-up approvals, approve/reject effects, mobile layout, and sign-in errors. Install Playwright Chromium with `npx playwright install chromium` when a local Chrome is unavailable; `CHROME_BIN` can select another executable.

The UI refinement uses `redesign-existing-projects` from the Drive UI skills kit and reviews against Vercel's Web Interface Guidelines. DESIGN.md remains the design authority: DM Sans/Manrope, flat green/neutral surfaces, 8/12 px radii, and status colours only for status. The preview keeps workspace progress compact and reserves a wider column for Kira. Suggestions show in full; after a conversation starts they sit under a disclosure. Pending changes replace the disabled composer with the review, giving the full note and actions more room. Approval focus starts at the review heading. No new application shell or teammate-owned pages were added.

`preview.html` and `preview.tsx` are a temporary platform entry for local verification and the authorized platform deployment before Andrew's shell is integrated. It includes real sign-in, workspace selection, status, and chat. It explicitly labels the remaining team-screen integration. The preview does not replace Andrew's `App.tsx`, shared components, or package configuration. Build it with Vite using this directory as the root and `preview.html` as the input; publish the built HTML as `index.html` with its emitted assets. Remove the preview entry from deployment when the team shell is ready.

Browser checks: sign in, reopen history, send a question, inspect evidence, reject a change, approve all pending changes, verify one refresh, switch clients while a response is in flight, and check keyboard focus at 1280 px and tablet width. Real demo answers require the model key, Rifat's pipeline, Nurwan's analysis services, and the demo dataset.
