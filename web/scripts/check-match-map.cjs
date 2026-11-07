/* Read-only acceptance against the real Zestly Demo; never sends an AI message. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.KIRA_E2E_BASE || 'http://127.0.0.1:5173';
const out = path.resolve(process.env.KIRA_MATCH_MAP_OUT || path.join(__dirname, '../../docs/screens/dev2/match-map'));
fs.mkdirSync(out, { recursive: true });
const scope = new URLSearchParams({ c: 'zestly-demo', tab: 'map', stage: 'l2', outlet: 'Zestly Harbor Square Surabaya', date_from: '2026-10-24', date_to: '2026-10-24', reason: 'Not in bank yet' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function contained() {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must not scroll horizontally');
    const small = await page.evaluate(() => [...document.querySelectorAll('main *, .kira-dock *')].filter(el => el.getBoundingClientRect().width && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.className));
    assert.deepEqual(small, [], 'All visible text is at least 12 px');
    const wrapped=await page.locator('.analysis-kpis .kpi>strong').evaluateAll(values=>values.filter(value=>{
      const tops=new Set();const walker=document.createTreeWalker(value,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim()||node.parentElement.closest('.sr-only'))continue;const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())if(rect.width>1&&rect.height>1)tops.add(Math.round(rect.top));}
      return tops.size>1;
    }).map(value=>value.textContent));
    assert.deepEqual(wrapped,[],'KPI numbers remain on one readable line');
  }
  async function panelFits() {
    const panel = await page.getByRole('dialog', { name: 'Kira', exact: true }).boundingBox();
    const viewport = page.viewportSize();
    assert(panel.x >= 8 && panel.y >= 8 && panel.x + panel.width <= viewport.width && panel.y + panel.height <= viewport.height + 1, 'Kira stays inside the viewport');
    if(viewport.width>=1280){
      const content=await page.locator('.integration-page').boundingBox();
      assert(Math.abs(panel.width-400)<1,'Desktop Kira is 400 px wide');
      assert(content.x+content.width<=panel.x-20,'Desktop Kira never covers data');
    }
    await contained();
  }
  async function launcherFits() {
    const viewport=page.viewportSize();
    const launcher=await page.locator('.kira-launch').boundingBox();
    const host=await page.locator(viewport.width>=800?'.sidebar':'.topbar').boundingBox();
    assert(launcher.x>=host.x&&launcher.y>=host.y&&launcher.x+launcher.width<=host.x+host.width+1&&launcher.y+launcher.height<=host.y+host.height+1,'Closed Kira lives in the sidebar or topbar');
  }

  try {
    for (const width of [1440, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(`${base}/analysis?${scope}`);
      await page.getByText('142 settlements', { exact: true }).waitFor();
      await page.getByText('No bank credit found', { exact: true }).waitFor();
      await page.locator('.analysis-kpis').waitFor();
      await launcherFits();
      const launcher = page.getByRole('button', { name: 'Ask Kira', exact: true });
      assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
      await contained();
      await page.screenshot({ path: path.join(out, `match-map-${width}.png`), timeout: 10000 });
      const before = await page.locator('.integration-page').boundingBox();
      await launcher.click();
      await page.getByRole('dialog', { name: 'Kira', exact: true }).waitFor();
      await panelFits();
      const after = await page.locator('.integration-page').boundingBox();
      if(width>=1280)assert(Math.abs(before.width-after.width-424)<2,'Desktop dock narrows the page by its width and gap');
      else assert.equal(after.width,before.width,'The narrow-screen sheet preserves the page width');
      await page.getByRole('textbox', { name: 'Ask Kira', exact: true }).fill('Check this day');
      await page.screenshot({ path: path.join(out, `${width>=1280?'docked-kira':'kira-sheet'}-${width}.png`),timeout:10000 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.matches('.kira-launch'));
      assert(await launcher.evaluate(el => el === document.activeElement), 'Minimizing returns focus to the launcher');
      await launcher.click();
      assert.equal(await page.getByRole('textbox', { name: 'Ask Kira', exact: true }).inputValue(), 'Check this day');
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 600 });
    await page.getByRole('button', { name: 'Ask Kira', exact: true }).click();
    await panelFits();
    await page.screenshot({ path: path.join(out, 'kira-sheet-short.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: real Harbor evidence at 1440/1280/768/390, 400 px desktop dock, narrow-screen sheet, retained draft, Escape/focus, short viewport containment, minimum type size.');
    console.log('Screenshots: ' + out);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
