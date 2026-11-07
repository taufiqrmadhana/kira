/* Read-only acceptance against the real Zestly Demo; never sends an AI message. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.KIRA_E2E_BASE || 'http://127.0.0.1:5173';
const out = path.resolve(__dirname, '../../artifacts/match-map/screenshots');
fs.mkdirSync(out, { recursive: true });
const scope = new URLSearchParams({ c: 'zestly-demo', tab: 'map', stage: 'l2', outlet: 'Zestly Harbor Square Surabaya', date_from: '2026-10-24', date_to: '2026-10-24', reason: 'Not in bank yet' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function contained() {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must not scroll horizontally');
    const small = await page.evaluate(() => [...document.querySelectorAll('main *, .kira-dock *')].filter(el => el.getBoundingClientRect().width && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.className));
    assert.deepEqual(small, [], 'All visible text is at least 12 px');
  }
  async function popupFits() {
    const popup = await page.getByRole('dialog', { name: 'Kira', exact: true }).boundingBox();
    const launcher = await page.locator('.kira-launch').boundingBox();
    const viewport = page.viewportSize();
    assert(popup.x >= 8 && popup.y >= 8 && popup.x + popup.width <= viewport.width - 8 && popup.y + popup.height <= launcher.y - 8, 'Popup and launcher stay inside the viewport without overlapping');
    await contained();
  }
  try {
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(`${base}/analysis?${scope}`);
      await page.getByText('142 settlements', { exact: true }).waitFor();
      await page.getByText('No bank rows in this selection', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const launcher = page.getByRole('button', { name: 'Ask Kira', exact: true });
      assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
      await contained();
      await page.screenshot({ path: path.join(out, `match-map-${width}.png`), fullPage: true });
      const before = await page.locator('.integration-page').boundingBox();
      await launcher.click();
      await page.getByRole('dialog', { name: 'Kira', exact: true }).waitFor();
      await popupFits();
      const after = await page.locator('.integration-page').boundingBox();
      assert.equal(after.width, before.width, 'Chat must not resize the page');
      await page.getByRole('textbox', { name: 'Ask Kira', exact: true }).fill('Check this day');
      await page.screenshot({ path: path.join(out, `floating-kira-${width}.png`) });
      await page.keyboard.press('Escape');
      assert(await launcher.evaluate(el => el === document.activeElement), 'Minimizing returns focus to the launcher');
      await launcher.click();
      assert.equal(await page.getByRole('textbox', { name: 'Ask Kira', exact: true }).inputValue(), 'Check this day');
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 600 });
    await page.getByRole('button', { name: 'Ask Kira', exact: true }).click();
    await popupFits();
    await page.screenshot({ path: path.join(out, 'floating-kira-short.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: real Harbor evidence at 1440/768/390, floating chat without reflow, retained draft, Escape/focus, short viewport containment, minimum type size.');
    console.log('Screenshots: ' + out);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
