// Local real-API acceptance. Each run creates its own tiny QA workspace.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.KIRA_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KIRA_PREVIEW_URL || 'http://127.0.0.1:5175';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local preview');
const client = `suggestions-qa-${process.pid}`;
execFileSync(resolve('backend/.venv/Scripts/python.exe'), ['-c', `
import sys
sys.path[:0] = ['backend', 'backend/tests']
from test_matching_engine import tables
from kira import db
from kira.config import settings
from kira.models import CleaningRules, CleanRow
from kira.services import state
settings.database_url = ${JSON.stringify('sqlite:///' + resolve('artifacts/step4-preview.db').replaceAll('\\', '/'))}
db.current_client.set(${JSON.stringify(client)})
t = tables()
for i in range(2):
    t['pos']['rows'][i]['trace_number'] = f'payment-000{i}'
    t['settlement']['rows'][i]['external_reference_id'] = f'payment-000{i}'
    t['pos']['rows'][i]['payment_amount'] *= 100
    t['settlement']['rows'][i]['gross_amount'] *= 100
    t['settlement']['rows'][i]['nett_amount'] *= 100
t['settlement']['rows'][2]['nett_amount'] *= 100
t['bank']['rows'][0]['kredit'] *= 100
with db.session_scope() as s:
    state.put(s, 'conversion', {'stale': False})
    s.add(CleaningRules(version=1, maps={}, exclude={}, created_by='Local QA'))
    for area, table in t.items():
        s.add_all(CleanRow(type=area, row_no=i, source_row=i, data=row, was={}) for i, row in enumerate(table['rows']))
db.dispose_engines()
`], { stdio: 'pipe' });
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 },
  extraHTTPHeaders: { 'X-Kira-Client': client, 'X-Kira-User': 'Local QA' } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const stage = page.getByRole('region', { name: 'POS to settlement', exact: true });
const proposals = stage.locator('.step4-suggestion');
const idle = () => page.waitForFunction(() => document.querySelector('.step4')?.getAttribute('aria-busy') === 'false');
const get = async path => {
  const response = await context.request.get(`${base}/api${path}`);
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
const find = async () => { await stage.getByRole('button', { name: 'Find suggestions', exact: true }).click(); await idle(); };
try {
  await page.goto(`${base}/Step4.preview.html?client=${client}`);
  await idle();
  await find();
  assert.ok(await proposals.count() >= 2, 'Offer alternatives for the same sales');
  await stage.getByRole('button', { name: 'Add all suggestions', exact: true }).waitFor();
  const originalCount = await proposals.count();
  await proposals.first().getByRole('button', { name: 'Review suggestion', exact: true }).click();
  await page.getByRole('button', { name: 'Save inactive rule', exact: true }).waitFor();
  assert.deepEqual(await get('/matching/rules'), []);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await proposals.first().getByRole('button', { name: 'Add rule', exact: true }).click(); await idle();
  assert.equal(await proposals.count(), originalCount - 1, 'Keep other suggestions after saving one');
  let saved = await get('/matching/rules');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].params.enabled, false, 'Adding is not approval');
  const firstId = saved[0].id;
  await page.getByRole('switch', { name: `Activate ${firstId}`, exact: true }).click();
  assert.equal((await get('/matching/rules'))[0].params.enabled, false);
  await page.getByRole('button', { name: 'Save and activate', exact: true }).click(); await idle();
  await find();
  const pending = await get('/matching/l1/suggestions');
  assert.ok(pending.length >= 2);
  assert.ok(pending.every(r => r.matches_alone === 2 && r.extra_after_saved === 0));

  // A failed second save must preserve the remaining choices and never retry the first.
  let writes = 0;
  await page.route('**/api/matching/l1/rules', route => {
    if (route.request().method() === 'POST' && ++writes === 2) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Temporary QA failure' }) });
    }
    return route.continue();
  });
  await stage.getByRole('button', { name: 'Add all suggestions', exact: true }).click(); await idle();
  assert.match(await page.getByRole('alert').innerText(), /Temporary QA failure/);
  assert.equal((await get('/matching/rules')).length, 2);
  assert.equal(await proposals.count(), pending.length - 1);
  await page.unroute('**/api/matching/l1/rules');
  await stage.getByRole('button', { name: 'Add all suggestions', exact: true }).click(); await idle();
  saved = await get('/matching/rules');
  assert.equal(saved.length, 1 + pending.length);
  assert.deepEqual(saved.slice(1).map(r => r.params.amountTol), pending.map(r => r.params.amountTol));
  assert.ok(saved.slice(1).every(r => r.params.enabled === false));
  assert.equal(await proposals.count(), 0);
  await page.reload(); await idle();
  assert.equal(await stage.getByRole('switch').count(), saved.length);
  console.log('PASS: add one/all, zero-additional suggestions, partial failure, retry and inactive persistence');

  // Two active rules may cover identical sales; only the earlier rule gets the rows.
  const alternative = saved[1];
  await page.getByRole('switch', { name: `Activate ${alternative.id}`, exact: true }).click();
  await page.getByRole('button', { name: 'Save and activate', exact: true }).click(); await idle();
  await stage.getByRole('button', { name: 'Run matching', exact: true }).click(); await idle();
  let summary = (await get('/status')).matching.l1.summary;
  assert.equal(summary.matched, 2);
  assert.equal(summary.hits[firstId], 2);
  assert.equal(summary.hits[alternative.id], 0);
  await page.getByRole('button', { name: `Move ${alternative.id} up`, exact: true }).click(); await idle();
  await page.reload(); await idle();
  assert.equal((await get('/matching/rules'))[0].id, alternative.id);
  await stage.getByRole('button', { name: 'Run matching', exact: true }).click(); await idle();
  summary = (await get('/status')).matching.l1.summary;
  assert.equal(summary.matched, 2);
  assert.equal(summary.hits[alternative.id], 2);
  assert.equal(summary.hits[firstId], 0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete ${alternative.id}`, exact: true }).click(); await idle();
  assert.ok(!(await get('/matching/rules')).some(r => r.id === alternative.id));
  await find();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    await stage.screenshot({ path: `artifacts/step4-suggestions-${width}.png` });
  }
  const beforeReview = await proposals.count();
  await proposals.first().getByRole('button', { name: 'Review suggestion', exact: true }).click();
  await page.getByLabel('Rule name', { exact: true }).fill('Reviewed alternative');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await idle();
  await page.getByRole('button', { name: 'Save inactive rule', exact: true }).click(); await idle();
  assert.equal(await proposals.count(), beforeReview - 1);
  assert.equal((await get('/matching/rules')).find(r => r.name === 'Reviewed alternative').params.enabled, false);
  assert.deepEqual(errors, []);
  console.log('PASS: approval, priority persistence, no double counting, deletion and responsive suggestion layout');
  console.log(`Local QA workspace: ${client}`);
} catch (error) {
  await page.screenshot({ path: 'artifacts/step4-suggestions-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
