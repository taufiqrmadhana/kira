// Main app shell checks. Reconciliation data comes from the scratch API.
// Only /me is stubbed for the signed-out screenshot, since scratch auth is off.
const {chromium}=require(process.env.KIRA_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE || 'http://127.0.0.1:5173';
const screenshots=path.resolve(__dirname,'../../docs/screens/dev2');
(async()=>{
  fs.mkdirSync(screenshots,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const errors=[];
  try{
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:width===1440?2:1,locale:'en-GB',reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      const shot=async name=>{
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflows at ${width}`);
        assert.equal(await page.locator('[class*="kira-preview"]').count(),0);
        await page.screenshot({path:path.join(screenshots,`${name}-${width}.png`),timeout:10000});
      };
      await context.route('**/api/me',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({detail:'Sign in required'})}));
      await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:'Sign in to your workspace'}).waitFor();
      await page.getByLabel('Username').fill('taufiq');await page.getByLabel('Password',{exact:true}).fill('example');
      await page.getByRole('button',{name:'Show password'}).click();
      assert.equal(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');
      await page.getByRole('button',{name:'Hide password'}).click();await shot('login');
      await context.unroute('**/api/me');
      await page.goto(base+'/overview?c=dev2-empty',{waitUntil:'domcontentloaded'});
      await page.getByRole('region',{name:'Start your first close'}).waitFor();
      assert.equal(await page.getByRole('region',{name:'Start your first close'}).getByRole('listitem').count(),4);
      assert.equal(await page.getByRole('link',{name:'KIRA home'}).getAttribute('href'),'/overview?c=dev2-empty');
      assert.equal(await page.getByRole('link',{name:'Switch client'}).getAttribute('href'),'/');
      await shot('empty-overview');
      await page.getByRole('button',{name:'Do it with Kira'}).click();await page.getByLabel('Ask Kira',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Close Kira',exact:true}).click();
      await page.goto(base+'/analysis?c=dev2-empty',{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:'Run both matching stages to see the evidence.'}).waitFor();
      assert.equal(await page.getByRole('link',{name:'Open matching'}).getAttribute('href'),'/workflow?step=4&c=dev2-empty');await shot('empty-analysis');
      await page.goto(base+'/workflow?step=4&c=zestly-demo',{waitUntil:'domcontentloaded'});
      await page.locator('.step4[data-ready="true"]').waitFor();await shot('workflow-4');
      await context.close();
    }
    assert.deepEqual(errors,[]);console.log('PASS: one sign-in form, password visibility, first-close steps, Kira entry, brand/client links, locked analysis, matching and 1440/390 layouts.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
