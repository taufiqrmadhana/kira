import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalDescription, collectEffects, pendingFromHistory, requestAgent, safeLink } from './protocol.ts';

test('approval describes full note, selected records, assignee, and status', () => {
  const text = approvalDescription({ id: 'confirm-1', tool: 'save_follow_ups', args: {
    keys: ['sale-1', 'sale-2'], status: 'investigating', assignee: 'Andrew',
    note: 'Payout Rp 9.031.421 is missing. Check the next statement.',
  } });
  assert.match(text, /2 records/);
  assert.match(text, /Andrew/);
  assert.match(text, /investigating/);
  assert.match(text, /Payout Rp 9\.031\.421 is missing\. Check the next statement\./);
});

test('only successful changes refresh data; only verified highlights navigate', () => {
  const effects = collectEffects([
    { tool: 'run_matching', args: { stage: 'l2' }, result: { status: 'error', message: 'busy' } },
    { tool: 'save_follow_ups', args: {}, result: { status: 'ok', result: { saved: 142 } } },
    { tool: 'highlight_records', args: {}, result: { status: 'ok', result: { highlighted: ['sale-1', 'sale-2'], note: 'Missing payout' } } },
  ]);
  assert.deepEqual(effects.changed.map((call) => call.tool), ['save_follow_ups']);
  assert.equal(effects.destination, 'follow-up');
  assert.deepEqual(effects.highlights, [{ keys: ['sale-1', 'sale-2'], note: 'Missing payout' }]);
  assert.equal(collectEffects([{ tool: 'convert_files', args: {}, result: { status: 'error' } }]).changed.length, 0);
});

test('API requests send the client, user, cookies, and confirmation ids together', async () => {
  let seen;
  const fetcher = async (url, options) => {
    seen = { url, options };
    return new Response(JSON.stringify({ reply: 'Saved', pending: [], tool_calls: [] }), { status: 200 });
  };
  await requestAgent({ baseUrl: '/api', client: 'zestly-demo', user: 'Taufiq' }, '/confirm', {
    session_id: 'session-1', answers: { a: true, b: true },
  }, undefined, fetcher);
  assert.equal(seen.url, '/api/agent/confirm');
  assert.equal(seen.options.credentials, 'same-origin');
  assert.equal(seen.options.headers['X-Kira-Client'], 'zestly-demo');
  assert.equal(seen.options.headers['X-Kira-User'], 'Taufiq');
  assert.deepEqual(JSON.parse(seen.options.body).answers, { a: true, b: true });
});

test('API errors show the server detail and notify an expired sign-in', async () => {
  let unauthorized = false;
  await assert.rejects(requestAgent({ baseUrl: '/api', client: 'demo', user: 'Taufiq', onUnauthorized: () => { unauthorized = true; } }, '/history', undefined, undefined,
    async () => new Response(JSON.stringify({ detail: 'Sign in again' }), { status: 401 })), /Sign in again/);
  assert.equal(unauthorized, true);
});

test('markdown links cannot execute javascript or embed data', () => {
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('data:text/html,unsafe'), null);
  assert.equal(safeLink('//evil.example'), null);
  assert.equal(safeLink('https://example.com/evidence'), 'https://example.com/evidence');
  assert.equal(safeLink('/analysis?tab=map'), '/analysis?tab=map');
});

test('history restores server-pending cards and removes locally stale approvals', () => {
  assert.deepEqual(pendingFromHistory([{ who: 'kira', text: 'Approval needed', tools: [{
    tool: 'convert_files', args: {}, result: { status: 'pending', confirmation_id: 'approval-1' },
  }] }]), [{ id: 'approval-1', tool: 'convert_files', args: {} }]);
  assert.deepEqual(pendingFromHistory([{ who: 'kira', text: 'Converted', tools: [{
    tool: 'convert_files', args: {}, result: { status: 'ok', result: {} },
  }] }]), []);
});
