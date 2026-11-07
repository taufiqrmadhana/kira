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
    for(const width of [1440,1280,768,390]){
      const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:width===1440?2:1,locale:'en-GB',reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
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
      if(width<800)await page.getByRole('button',{name:'Toggle navigation'}).click();
      const clientButton=page.getByRole('button',{name:/^Choose client:/});await clientButton.click();
      const clientMenu=page.getByRole('menu',{name:'Clients'});await clientMenu.waitFor();
      assert(await clientMenu.getByRole('menuitem',{name:'Switch client',exact:true}).count());
      assert(await clientMenu.getByRole('menuitem',{name:'Add client',exact:true}).count());
      await page.keyboard.press('Escape');
      assert(await clientButton.evaluate(element=>element===document.activeElement),'Client menu restores trigger focus');
      if(width<800)await page.getByRole('button',{name:'Toggle navigation'}).click();
      await page.getByRole('button',{name:'Tutorial',exact:true}).waitFor();
      const account=page.getByRole('button',{name:/^Account:/});await account.click();
      await page.getByRole('menu',{name:'Account'}).getByText('Reconciliation workspace').waitFor();
      await page.keyboard.press('Escape');
      assert(await account.evaluate(element=>element===document.activeElement),'Account menu restores trigger focus');
      assert.equal(await page.getByRole('button',{name:'Reset demo',exact:true}).count(),0);
      assert.equal(await page.locator('[tabindex]').evaluateAll(elements=>elements.filter(element=>Number(element.getAttribute('tabindex'))>0).length),0,'Keyboard navigation follows document order');
      await shot('empty-overview');
      await page.getByRole('button',{name:'Do it with Kira'}).click();await page.getByRole('textbox',{name:'Ask Kira',exact:true}).waitFor();
      await page.getByRole('button',{name:'Close Kira',exact:true}).click();
      await page.goto(base+'/analysis?c=dev2-empty',{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:'Run both matching stages to see the evidence.'}).waitFor();
      assert.equal(await page.getByRole('link',{name:'Open matching'}).getAttribute('href'),'/workflow?step=4&c=dev2-empty');await shot('empty-analysis');
      await page.goto(base+'/workflow?step=4&c=zestly-demo',{waitUntil:'domcontentloaded'});
      await page.locator('.step4[data-ready="true"]').waitFor();await shot('workflow-4');
      await page.getByRole('button',{name:'Reset demo',exact:true}).click();
      const reset=page.getByRole('dialog',{name:'Reset demo',exact:true});await reset.waitFor();
      assert(await reset.getByRole('button',{name:'Back up and reset'}).isDisabled(),'Reset requires an exact typed confirmation');
      await shot('reset-demo');await page.keyboard.press('Escape');
      for(const route of ['/analysis?c=zestly-demo&tab=map&stage=l2&outlet=Zestly+Harbor+Square+Surabaya&date_from=2026-10-24&date_to=2026-10-24','/insights?c=zestly-demo&city=Surabaya&date_from=2026-10-24&date_to=2026-10-24']){
        await page.goto(base+route,{waitUntil:'domcontentloaded'});
        await page.locator('[data-page][data-ready=true]').waitFor();
        await page.getByRole('button',{name:'Copy link',exact:true}).click();
        await page.getByText('Link copied. Anyone signed in opens this exact view.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),page.url());
        await page.getByRole('button',{name:'Dismiss notification'}).click();
        await shot(route.startsWith('/analysis')?'analysis-controls':'insights-controls');
      }
      await context.close();
    }
    assert.deepEqual(errors,[]);console.log('PASS: one sign-in form, password visibility, first-close steps, Kira entry, brand/client links, locked analysis, typed reset confirmation, exact view links and 1440/1280/768/390 control layouts.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
