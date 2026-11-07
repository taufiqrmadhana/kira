/* Uses the local isolated demo API; does not mock or change reconciliation data. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve('../artifacts/day-grid/screenshots');
const base = process.env.KIRA_E2E_BASE || 'http://127.0.0.1:5173';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({reducedMotion:'reduce'});
  page.setDefaultTimeout(60000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  try {
    for(const width of [1440,768,390]) {
      await page.setViewportSize({width,height:1100});
      await page.goto(`${base}/insights?c=zestly-demo`);
      await page.getByRole('heading',{name:'Sales and money kept'}).waitFor();
      await page.getByRole('list',{name:'Outlet anomalies'}).waitFor();
      await page.getByRole('combobox',{name:'City',exact:true}).locator('option').filter({hasText:'Surabaya'}).waitFor({state:'attached'});
      const close=page.getByRole('button',{name:'Close Kira',exact:true});
      if(await close.isVisible())await close.click();
      await page.evaluate(()=>document.fonts.ready);
      const points=page.locator('.insights-point-target');
      assert.equal(await points.count(),10);
      assert.equal(await page.locator('.insights-point-target[tabindex="0"]').count(),1);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Page overflow at ${width}`);
      const tooSmall=await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().width&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&Number.parseFloat(getComputedStyle(el).fontSize)<12).map(el=>el.className));
      assert.deepEqual(tooSmall,[],`Text below 12px at ${width}`);
      await page.screenshot({path:path.join(out,`insights-${width}.png`),fullPage:true});
      const chart=page.locator('.insights-chart-scroll');
      await chart.scrollIntoViewIfNeeded();
      await points.first().focus();
      await page.keyboard.press('End');
      const target=page.locator('.insights-point-target:focus');
      assert.equal(await target.count(),1);
      const tooltip=page.getByRole('tooltip');await tooltip.waitFor();
      const rect=await target.boundingBox(),tip=await tooltip.boundingBox();
      assert(rect&&tip);
      assert(tip.x>=7&&tip.y>=7&&tip.x+tip.width<=width-7&&tip.y+tip.height<=1100-7,`Tooltip edges at ${width}`);
      assert(tip.y+tip.height<=rect.y||tip.y>=rect.y+rect.height||tip.x+tip.width<=rect.x||tip.x>=rect.x+rect.width,`Tooltip overlaps target at ${width}`);
      await page.screenshot({path:path.join(out,`insights-tooltip-${width}.png`)});
      await page.keyboard.press('Escape');await tooltip.waitFor({state:'hidden'});
      const lastLabel=points.last().locator('text');
      await lastLabel.scrollIntoViewIfNeeded();await lastLabel.hover();await tooltip.waitFor();
      assert.match(await tooltip.innerText(),/Click to open this outlet in Match analysis/);
      if(width===390)assert(await chart.evaluate(el=>el.scrollWidth>el.clientWidth),'Chart should scroll within its panel on phones');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Page overflow after chart scroll at ${width}`);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: Insights real demo, ten outlets, tooltip focus/hover and edge containment, roving keyboard, no page overflow at 1440/768/390; no browser/API errors.');
  } catch(error) {
    console.error('Observed API errors:',errors);
    console.error('Visible page:',(await page.locator('body').innerText()).slice(0,2600));
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
