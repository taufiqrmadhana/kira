// Real scratch data only. Every API write is blocked, including profiles and chat.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173',out=path.resolve(__dirname,'../../docs/screens/dev2');
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true}),errors=[],writes=[];
  try{for(const width of [1440,768,390]){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    await context.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());return route.abort();}return route.continue();});
    await context.addInitScript(()=>localStorage.setItem('kira-tutorial',JSON.stringify({seen:true,auto:false,large:false})));
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    const home=async()=>{await page.goto(`${base}/insights?c=zestly-demo`);await page.locator('.insights-page[data-ready=true]').waitFor();};
    const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: page overflow`);
    const shot=async name=>{await fit();await page.screenshot({path:path.join(out,`${name}-${width}.png`),timeout:10000});};
    await home();await page.getByRole('button',{name:'Edit city and region',exact:true}).waitFor();
    const periods=page.getByRole('group',{name:'Insights period'});assert.equal(await periods.getByRole('button').count(),5);
    assert.equal(await page.getByRole('combobox',{name:'Provider',exact:true}).count(),1);
    await shot('insights-header');
    const scatter=page.getByRole('group',{name:'Gross sales and money kept in the bank by outlet'}),points=scatter.locator('.insights-point-target');
    assert.equal(await points.count(),10);assert.equal(await points.locator('text').count(),3,'Only flagged outlets are directly labelled');
    assert.equal(await scatter.locator('.insights-label-line').count(),0);assert.equal(await scatter.getByText('100%',{exact:true}).count(),1);
    assert.equal(await scatter.getByText('Rp 0',{exact:true}).count(),1);assert.equal(await scatter.getByText('Median kept 99,9%',{exact:true}).count(),1);
    assert.equal(await scatter.locator('.insights-boundary-mark').count(),1,'Bay View above 100% retains a boundary arrow');
    assert.equal(await page.getByText(/1 outlet exceeds 100%/).count(),1);
    await page.locator('.insights-comparison').evaluate(element=>element.scrollIntoView({block:'start'}));await shot('insights-scatter');
    await points.first().focus();await page.keyboard.press('End');const focused=page.locator('.insights-point-target:focus');
    const dot=focused.locator('.insights-point');await dot.scrollIntoViewIfNeeded();
    const tooltip=page.getByRole('tooltip');await tooltip.waitFor();
    const rect=await dot.boundingBox(),tip=await tooltip.boundingBox();assert(tip.x>=7&&tip.y>=7&&tip.x+tip.width<=width-7&&tip.y+tip.height<=993,'Tooltip stays within viewport');
    assert(tip.y+tip.height<=rect.y||tip.y>=rect.y+rect.height||tip.x+tip.width<=rect.x||tip.x>=rect.x+rect.width,'Tooltip does not cover its dot');
    await shot('insights-tooltip');await page.keyboard.press('Escape');await tooltip.waitFor({state:'hidden'});
    const flagged=page.getByRole('list',{name:'Sells a lot, keeps little outlets'});const filter=flagged.getByRole('button',{name:/Filter to Zestly Harbor/});await filter.click();
    await page.waitForURL(url=>url.pathname==='/insights'&&url.searchParams.get('outlet')==='Zestly Harbor Square Surabaya');
    await page.waitForFunction(()=>document.querySelectorAll('.insights-point-target').length===1);await fit();
    await home();const table=page.getByRole('region',{name:'Outlet performance, lowest keep rate first',exact:true});await table.getByRole('table').waitFor();
    assert.equal(await table.locator('tbody tr').first().locator('td[data-pinned=true]').count(),1);assert.equal(await table.getByRole('img',{name:/Keep rate:/}).count(),10);
    await page.locator('.insights-outlets').evaluate(element=>element.scrollIntoView({block:'start'}));await shot('insights-outlets');
    const anomalies=page.getByRole('table',{name:'Outlet anomalies'});await anomalies.waitFor();
    assert.deepEqual(await anomalies.getByRole('columnheader').allTextContents(),['Severity','Kind','Outlet','Why','Amount','Evidence','Ask Kira']);
    await page.locator('.insights-anomalies-section').evaluate(element=>element.scrollIntoView({block:'start'}));await shot('insights-anomalies');
    await anomalies.getByRole('button',{name:'Ask Kira about this',exact:true}).first().click();await page.getByRole('dialog',{name:'Kira',exact:true}).waitFor();await fit();
    await page.getByRole('button',{name:'Close Kira',exact:true}).click();
    await page.getByRole('button',{name:'Edit city and region',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Edit city and region',exact:true});await dialog.waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await context.close();console.log(`PASS Insights ${width}: honest axes/ceiling, three flagged labels, tooltip keyboard bounds, filtering, compact outlet/anomaly tables, Kira draft, profiles cancel; no writes.`);
  }assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
