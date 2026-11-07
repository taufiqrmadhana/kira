/* Real API acceptance: run against an isolated copy of the Zestly Demo database.
 * No API fixtures or writes; screenshots are local artifacts, not a deployment. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve('../artifacts/day-grid/screenshots');fs.mkdirSync(out,{recursive:true});
const harbor='Zestly Harbor Square Surabaya';
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function closeKira() {
    const close=page.getByRole('button',{name:'Close Kira',exact:true});
    if(await close.isVisible())await close.click();
  }
  async function overview(width) {
    await page.setViewportSize({width,height:1100});
    await page.goto(base+'/overview?c=zestly-demo');
    await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();
    await page.getByRole('grid',{name:'Match history for October 2026'}).getByRole('link').last().waitFor();
    await closeKira();
    await page.evaluate(()=>document.fonts.ready);
  }
  async function analysisGrid(width) {
    await page.setViewportSize({width,height:1100});
    await page.goto(base+'/analysis?c=zestly-demo');
    await page.getByRole('heading',{name:'Every day at a glance'}).waitFor();
    await page.getByRole('grid').getByRole('button').last().waitFor();
    await closeKira();
    await page.evaluate(()=>document.fonts.ready);
  }
  async function noOverflow() {assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page has horizontal overflow');}
  try {
    for(const width of [1440,768,390]) {
      await overview(width);await noOverflow();
      const history=page.getByRole('grid',{name:'Match history for October 2026'});
      assert.equal(await history.getByRole('link').count(),7);
      assert.equal(await history.locator('.overview-day-missing').count(),24);
      assert.equal(await history.getByRole('link',{name:/Mon 26 Oct 2026/}).getAttribute('tabindex'),'0');
      await page.screenshot({path:path.join(out,`overview-${width}.png`),fullPage:true});
    }
    const historyDay=page.getByRole('grid',{name:'Match history for October 2026'}).getByRole('link',{name:/Sat 24 Oct 2026/});
    await historyDay.click();
    assert.equal(new URL(page.url()).pathname,'/analysis');
    assert.equal(new URL(page.url()).searchParams.get('date_from'),'2026-10-24');
    assert.equal(new URL(page.url()).searchParams.get('date_to'),'2026-10-24');
    assert.equal(new URL(page.url()).searchParams.get('c'),'zestly-demo');
    await analysisGrid(1440);
    const grid=page.getByRole('grid');
    assert.equal(await grid.getByRole('button').count(),70);
    assert.equal(await grid.locator('.day-grid-cell--red').count(),1);
    assert.equal(await grid.locator('.day-grid-corner--red').count(),4);
    const bad=grid.getByRole('button',{name:new RegExp(harbor+', Sat 24 Oct 2026')});
    assert.match(await bad.getAttribute('aria-label'),/end to end 0 percent, Rp 9\.031\.421 to check, waiting for the bank/);
    assert.equal(await bad.locator('.day-grid-waiting').count(),1);
    assert.equal(await grid.getByRole('button',{name:/Lakeside.*Mon 26 Oct 2026/}).locator('.day-grid-corner').count(),0);
    for(const amount of ['9.031.421','171.000','151.000','68.000']) assert((await page.getByTestId('day-grid-summary').innerText()).includes(amount));
    // Real Tab entry, then arrows keep the day column while moving between outlets.
    await page.getByRole('button',{name:'By outlet',exact:true}).focus();
    await page.keyboard.press('Tab');
    assert(await grid.locator('button:focus').count());
    for(let i=0;i<4;i++)await page.keyboard.press('ArrowRight');
    const outletNames=await grid.locator('[role=rowheader]').allTextContents();
    const row=outletNames.findIndex(name=>name.includes('Harbor Square'));
    for(let i=0;i<row;i++)await page.keyboard.press('ArrowDown');
    assert.equal(await bad.evaluate(el=>el===document.activeElement),true);
    await page.getByRole('tooltip').waitFor();
    assert(await bad.getAttribute('aria-describedby'));
    assert((await page.getByRole('tooltip').innerText()).includes('(3 days)'));
    const tip=await page.getByRole('tooltip').boundingBox(), target=await bad.boundingBox();
    assert(tip.x>=8&&tip.y>=8&&tip.x+tip.width<=1440-8&&tip.y+tip.height<=1100-8);
    assert(tip.x+tip.width<=target.x||tip.x>=target.x+target.width||tip.y+tip.height<=target.y||tip.y>=target.y+target.height,'Tooltip covers its box');
    await page.screenshot({path:path.join(out,'tooltip-keyboard-1440.png'),fullPage:true});
    await page.keyboard.press('Enter');
    console.log('Harbor drilldown:',page.url());
    await page.getByText('142 settlements',{exact:true}).waitFor();
    await page.getByText('No linked bank credit',{exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('reason'),'Not in bank yet');
    assert.equal(new URL(page.url()).searchParams.get('date_from'),'2026-10-24');
    await page.screenshot({path:path.join(out,'harbor-evidence-1440.png'),fullPage:true});
    for(const width of [1440,768,390]) {
      await analysisGrid(width);await noOverflow();
      const panel=page.locator('.day-grid-panel');await page.mouse.move(0,0);await panel.scrollIntoViewIfNeeded();
      await page.getByRole('tooltip').waitFor({state:'hidden'});
      await panel.screenshot({path:path.join(out,`grid-${width}.png`)});
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(out,`analysis-grid-${width}.png`),fullPage:true});
      const tooSmall=await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().width&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&Number.parseFloat(getComputedStyle(el).fontSize)<12).map(el=>el.className));
      assert.deepEqual(tooSmall,[],`Text below 12px at ${width}`);
      if(width<680){
        assert.equal(await page.locator('.day-grid-number').first().isVisible(),false);
        const label=page.getByRole('grid').locator('[role=rowheader]').first();
        const before=await label.boundingBox();
        await page.locator('.day-grid-scroll').evaluate(el=>el.scrollLeft=180);
        const after=await label.boundingBox();
        assert(Math.abs(after.x-before.x)<=8,'Outlet labels should remain sticky');
        await noOverflow();
        await page.locator('.day-grid-scroll').evaluate(el=>el.scrollLeft=0);
      }
      await page.getByRole('button',{name:'By month',exact:true}).click();await noOverflow();
      assert.equal(await page.getByRole('grid').getByRole('button').count(),7);
      assert.equal(await page.getByRole('grid').locator('.day-grid-empty').count(),24);
      await panel.screenshot({path:path.join(out,`month-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:1100});
    await page.goto(base+'/analysis?c=zestly-demo');
    await page.getByRole('heading',{name:'Every day at a glance'}).waitFor();
    await page.getByRole('grid').getByRole('button').last().waitFor();
    assert.equal(await page.getByRole('grid').getByRole('button').count(),70);
    await closeKira();
    await page.screenshot({path:path.join(out,'analysis-1440.png'),fullPage:true});
    for(const [outlet,day] of [['Bay View Cilegon','Fri 23 Oct 2026'],['Riverside Center Jogja','Wed 21 Oct 2026']]) {
      await page.goto(base+'/analysis?c=zestly-demo');
      const cell=page.getByRole('grid').getByRole('button',{name:new RegExp(outlet+', '+day)});
      await cell.click();
      assert.equal(new URL(page.url()).searchParams.get('stage'),'l1',outlet+' needs POS-to-settlement evidence');
      await page.getByRole('heading',{name:'POS',exact:true}).waitFor();
    }
    await page.goto(base+'/insights?c=zestly-demo');
    await page.getByRole('heading',{name:'Sales and money kept'}).waitFor();
    await page.getByRole('list',{name:'Outlet anomalies'}).waitFor();
    await page.getByRole('combobox',{name:'City',exact:true}).locator('option').filter({hasText:'Surabaya'}).waitFor({state:'attached'});
    await closeKira();
    await page.screenshot({path:path.join(out,'insights-registration-1440.png'),fullPage:true});
    await noOverflow();
    assert.deepEqual(errors,[]);
    console.log('PASS: Overview month history and dated drilldown, real 10 × 7 Analysis grid, four money corners, Harbor keyboard drilldown to 142 records, month/no-data layout, responsive typography and containment, Insights registration.');
    console.log('Screenshots: '+out);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
