// Overview acceptance against the scratch demo. Every API request must be read-only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const client=process.env.KIRA_E2E_CLIENT||'zestly-demo';
const screenshots=path.resolve(__dirname,'../../docs/screens/dev2');
const harbor='Zestly Harbor Square Surabaya';
const read=async endpoint=>{const response=await fetch(`http://127.0.0.1:8000/api${endpoint}`,{headers:{'X-Kira-Client':client}});assert(response.ok);return response.json();};
const formatDate=value=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(value)).replaceAll(',','');
const utc=value=>/[zZ]|[+-]\d{2}:\d{2}$/.test(value)?value:value+'Z';
(async()=>{
  const [overview,summary]=await Promise.all([read('/overview'),read('/analysis/summary')]);
  const salesDay=Object.keys(overview.results.by_day).sort().at(-1);
  const run=utc(overview.results.run_at);
  const runDate=formatDate(run),runTime=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Jakarta'}).format(new Date(run));
  assert.equal(salesDay,'2026-10-26');assert.equal(summary.totals.mismatched,145);assert.equal(summary.totals.open,3);
  fs.mkdirSync(screenshots,{recursive:true});
  const browser=await chromium.launch({headless:true});const errors=[],writes=[];
  try{for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',timezoneId:'Asia/Jakarta'});
    await context.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());return route.abort();}return route.continue();});
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    const home=async()=>{await page.goto(base+`/overview?c=${client}`,{waitUntil:'domcontentloaded'});await page.locator('.overview-page[data-ready=true]').waitFor();};
    const contain=async()=>{
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overview must fit at ${width}px`);
      if(width<680&&await page.locator('.summary-main-rate .ring-graphic').count()){
        const ring=await page.locator('.summary-main-rate .ring-graphic').boundingBox(),first=await page.locator('.summary-kpis .kpi').first().boundingBox();
        assert(first.y>=ring.y+ring.height,'The full main ring must end before the first KPI card starts');
      }
    };
    const shot=async name=>{await contain();await page.screenshot({path:path.join(screenshots,`${name}-${width}.png`),timeout:10000});};
    await home();
    const header=page.locator('.overview-page .page-head');
    assert((await header.innerText()).includes('Sales up to Mon 26 Oct 2026: 8.639 of 8.784 POS sales reached the bank.'));
    assert(!(await header.innerText()).includes(runDate),'Sales coverage must not become the run date');
    const banner=await page.locator('.overview-close-banner').innerText();
    assert(banner.includes('Sales up to Mon 26 Oct 2026'));
    assert(banner.includes(`matched on ${runDate} at ${runTime} WIB`),'Run time must be UTC normalized and formatted in Jakarta');
    assert(banner.includes('8.639 of 8.784 POS sales fully matched.'));
    assert.equal(await page.getByRole('link',{name:'See the evidence',exact:true}).count(),1);
    const band=page.getByRole('region',{name:'Match summary',exact:true});await band.waitFor();
    const value=label=>band.locator('.kpi').filter({has:page.getByText(label,{exact:true})}).locator('strong').evaluate(element=>{const copy=element.cloneNode(true);copy.querySelectorAll('.sr-only').forEach(node=>node.remove());return copy.textContent.trim();});
    assert.equal(await value('Mismatched'),'145');assert.equal(await value('Open without a sale'),'3');
    assert.equal(await page.locator('.overview-page .page-head .button.primary').count(),0,'A complete close does not advertise a waiting step');
    await page.getByRole('grid',{name:'Match history for October 2026'}).waitFor();
    assert.equal(await page.getByRole('grid',{name:'Match history for October 2026'}).getByRole('link').count(),7);
    await shot('overview-calendar');
    const before=await page.locator('.integration-page').boundingBox();
    await page.getByRole('button',{name:'Do it with Kira',exact:true}).click();
    await page.getByRole('dialog',{name:'Kira',exact:true}).waitFor();
    const after=await page.locator('.integration-page').boundingBox();
    if(width>=1280)assert(Math.abs(before.width-after.width-424)<2);else assert.equal(before.width,after.width);
    await shot('overview-kira');await page.getByRole('button',{name:'Close Kira',exact:true}).click();
    await page.getByRole('button',{name:'By outlet',exact:true}).click();
    const grid=page.getByRole('grid',{name:'Daily match by outlet'});await grid.waitFor();
    assert.equal(await page.getByRole('button',{name:'By outlet',exact:true}).count(),1,'History has one layout switch');
    const cell=grid.getByRole('button',{name:new RegExp(harbor+', Sat 24 Oct 2026')});
    assert.match(await cell.getAttribute('aria-label'),/end to end 0 percent, Rp 9\.031\.421 to check, waiting for the bank/);
    assert.equal(await cell.locator('.day-grid-corner--red').count(),1);assert.equal(await cell.locator('.day-grid-waiting').count(),1);
    await page.locator('.day-grid-panel').scrollIntoViewIfNeeded();await shot('overview-outlets');
    await cell.click();await page.waitForURL(url=>url.pathname==='/analysis');
    const target=new URL(page.url());assert.equal(target.searchParams.get('date_from'),'2026-10-24');assert.equal(target.searchParams.get('date_to'),'2026-10-24');assert.equal(target.searchParams.get('outlet'),harbor);assert.equal(target.searchParams.get('stage'),'l2');assert.equal(target.searchParams.get('reason'),'Not in bank yet');assert.equal(target.searchParams.get('c'),client);
    await page.getByText('142 settlements',{exact:true}).waitFor();
    await home();await page.getByRole('heading',{name:'KIRA learns as it runs',exact:true}).waitFor();
    const attention=page.locator('.attention');await attention.getByRole('table').waitFor();
    assert.deepEqual(await attention.getByRole('columnheader').allTextContents(),['Record','Outlet','Amount','Status','Why']);
    const contrast=await attention.getByRole('columnheader').first().evaluate(element=>{
      const luminance=color=>{const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>value/255).map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
      const style=getComputedStyle(element),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert(contrast>=4.5,'Compact table headers need readable contrast');
    assert.equal(await attention.locator('.attention-index').count(),0);
    const record=attention.locator('a[href*="keys="]').first();await record.waitFor();
    assert(!/^[0-9a-f]{32,}$/i.test((await record.innerText()).trim()),'Show a human record label, not its internal hash');
    const expectedRecord=new URL(await record.getAttribute('href'),base);
    assert.equal(expectedRecord.searchParams.get('tab'),'map');assert(expectedRecord.searchParams.get('keys'));
    const records=attention.getByRole('link',{name:'See all in Records',exact:true});assert.equal(new URL(await records.getAttribute('href'),base).searchParams.get('tab'),'records');
    await attention.scrollIntoViewIfNeeded();await shot('overview-attention');
    await record.click();await page.waitForURL(url=>url.pathname==='/analysis'&&url.searchParams.get('keys')===expectedRecord.searchParams.get('keys'));
    assert.equal(new URL(page.url()).searchParams.get('c'),client);
    await home();await page.getByRole('grid',{name:'Match history for October 2026'}).getByRole('link',{name:/Sat 24 Oct 2026/}).click();
    await page.waitForURL(url=>url.pathname==='/analysis');assert.equal(new URL(page.url()).searchParams.get('date_from'),'2026-10-24');assert.equal(new URL(page.url()).searchParams.get('date_to'),'2026-10-24');
    await context.close();console.log(`PASS Overview at ${width}px: sales/run dates, 145 POS mismatches + 3 open records, day evidence, record links and closed/open Kira.`);
  }assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
