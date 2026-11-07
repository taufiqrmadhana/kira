// Run against the separate sample-bertingkat local fixture, never a live client.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.KIRA_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.KIRA_PREVIEW_URL || 'http://127.0.0.1:5175';
const url = new URL(base);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Use a local preview');
const client = 'sample-bertingkat';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 },
  extraHTTPHeaders: { 'X-Kira-Client': client, 'X-Kira-User': 'Local QA' } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => route.continue({ headers: {
  ...route.request().headers(), 'x-kira-user': 'Local QA',
} }));
const idle = () => page.waitForFunction(() => document.querySelector('.step4')?.getAttribute('aria-busy') === 'false');
const get = async path => {
  const response = await context.request.get(`${base}/api${path}`);
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
const stage = name => page.getByRole('region', { name, exact: true });
const run = async name => { await stage(name).getByRole('button', { name: 'Run matching', exact: true }).click(); await idle(); };
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    ready = await context.request.get(`${base}/api/status`).then(r => r.ok()).catch(() => false);
    if (!ready) await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Start the local API before this test');
  await page.goto(`${base}/Step4.preview.html?client=${client}`);
  await page.getByRole('heading', { name: 'Matching results', exact: true }).waitFor();
  await idle();
  for (const id of ['PS2', 'PS3', 'PS4', 'SM2', 'SM3', 'SM4']) {
    const saved = (await get('/matching/rules')).find(r => r.id === id);
    assert.ok(saved, `Prepare the ${client} sample fixture before this test`);
    if (saved.params.enabled !== false) {
      await page.getByRole('switch', { name: `Activate ${id}`, exact: true }).click();
      await idle();
    }
    await page.getByRole('switch', { name: `Activate ${id}`, exact: true }).click();
    await page.getByRole('heading', { name: `Edit rule ${id}`, exact: true }).waitFor();
    // Opening the approval form must not activate the stored rule.
    assert.equal((await get('/matching/rules')).find(r => r.id === id).params.enabled, false);
    if (id === 'PS4' || id === 'SM4') {
      await page.getByLabel('Maximum difference per pair or payout (Rp)', { exact: true }).fill(id === 'PS4' ? '20000' : '2500');
    }
    await page.getByRole('button', { name: 'Save and activate', exact: true }).click();
    await idle();
  }
  await run('POS to settlement');
  await run('Settlement to bank');
  let result = await get('/matching/results');
  assert.equal(result.totals.full, 14736);
  assert.equal(result.totals.mismatched, 125);
  assert.equal(result.totals.linked, 14857);
  assert.equal(result.totals.credits_linked, 110);
  const gaps = await get('/analysis/gaps');
  assert.equal(gaps.kinds.find(g => g.kind === 'sale_diff').amount, 38000);
  assert.equal(gaps.kinds.find(g => g.kind === 'payout_diff').amount, 2500);
  await page.screenshot({ path: 'artifacts/step4-layered-results.png', fullPage: true });
  console.log('PASS: approval gates and full-sample results');

  await page.getByRole('switch', { name: 'Activate SM4', exact: true }).click();
  await idle();
  assert.equal(await get('/matching/results'), null);
  await page.reload(); await idle();
  assert.equal(await page.getByRole('switch', { name: 'Activate SM4', exact: true }).isChecked(), false);
  await run('Settlement to bank');
  assert.equal((await get('/matching/results')).totals.credits_linked, 109);
  await page.getByRole('switch', { name: 'Activate SM4', exact: true }).click();
  await page.getByRole('button', { name: 'Save and activate', exact: true }).click(); await idle();
  await page.getByRole('button', { name: 'Move SM4 up', exact: true }).click(); await idle();
  assert.equal((await get('/matching/rules')).filter(r => r.stage === 'l2')[2].id, 'SM4');
  await page.getByRole('button', { name: 'Move SM4 down', exact: true }).click(); await idle();
  await run('Settlement to bank');

  console.log('PASS: activation persists and rule order is saved');
  await stage('POS to settlement').getByRole('button', { name: 'Create rule', exact: true }).click();
  await page.getByRole('button', { name: /4\. Amount tolerance, date range/ }).click();
  await page.getByLabel('Rule name', { exact: true }).fill('Browser QA scratch rule');
  await page.getByLabel('Maximum difference per pair or payout (Rp)', { exact: true }).fill('');
  assert.equal(await page.getByLabel('Maximum difference per pair or payout (Rp)', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('combobox', { name: 'Amount', exact: true }).inputValue(), 'range');
  await page.getByLabel('Maximum difference per pair or payout (Rp)', { exact: true }).fill('500');
  await page.getByLabel('Maximum time difference', { exact: true }).fill('');
  assert.equal(await page.getByLabel('Maximum time difference', { exact: true }).inputValue(), '');
  await page.getByLabel('Maximum time difference', { exact: true }).fill('3');
  await page.getByText('More conditions and column mapping', { exact: true }).click();
  await page.getByLabel('POS amount', { exact: true }).selectOption('payment_amount');
  await page.getByLabel('Settlement amount', { exact: true }).selectOption('gross_amount');
  await page.getByRole('button', { name: 'Save inactive rule', exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/step4-layered-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Save inactive rule', exact: true }).click(); await idle();
  const scratch = (await get('/matching/rules')).find(r => r.name === 'Browser QA scratch rule');
  assert.equal(scratch.params.enabled, false);
  assert.equal((await get('/matching/results')).totals.credits_linked, 110);
  await page.reload(); await idle();
  assert.equal(await page.getByRole('switch', { name: `Activate ${scratch.id}`, exact: true }).isChecked(), false);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete ${scratch.id}`, exact: true }).click(); await idle();

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  const download = await downloaded;
  await download.saveAs('artifacts/step4-browser-export.csv');
  assert.match(await readFile('artifacts/step4-browser-export.csv', 'utf8'), /Bank payout amount differs/);
  await idle();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 1024 });
    await page.getByRole('button', { name: 'Edit PS4', exact: true }).click();
    await page.getByRole('heading', { name: 'Edit rule PS4', exact: true }).waitFor();
    await page.waitForFunction(() => {
      const button = document.querySelector('.step4-presets button');
      return button && !button.matches(':disabled');
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
    await page.getByRole('heading', { name: 'Edit rule PS4', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
    await page.screenshot({ path: `artifacts/step4-layered-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  result = await get('/matching/results');
  assert.equal(result.totals.full, 14736);
  assert.equal(result.totals.mismatched, 125);
  assert.deepEqual(errors, []);
  console.log('PASS: approved layers, edits, create inactive, toggle persistence, order, run, export, keyboard focus, tablet and mobile layout');
} catch (error) {
  await page.screenshot({ path: 'artifacts/step4-browser-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
