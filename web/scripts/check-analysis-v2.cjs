const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve(__dirname,'../../docs/screens/dev2/analysis');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await page.goto(`${base}/analysis?c=zestly-demo&tab=records`);
      await page.getByText('7 days, 10 outlets, 8.784 POS sales in this selection.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Export 8.787 rows',exact:true}).waitFor();
      const records=page.getByRole('region',{name:'Records evidence',exact:true});
      await records.getByText('1–20 of 8.787',{exact:true}).waitFor();
      await records.getByRole('button',{name:/^Compare /}).first().click();
      await page.getByRole('table',{name:'Payment comparison'}).waitFor();
      assert.equal(await page.getByText('Information',{exact:true}).count(),1,'Dates are informational');
      await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      await page.locator('.records-filters summary').click();
      await page.getByRole('spinbutton',{name:'Minimum amount (Rp)'}).fill('100000');
      await page.waitForURL(/amount_min=100000/);
      await page.getByRole('button',{name:'Clear all',exact:true}).click();
      await page.getByRole('button',{name:'Export 8.787 rows',exact:true}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: records overflow`);
      await page.screenshot({path:path.join(out,`records-${width}.png`),fullPage:true});
      await page.goto(`${base}/analysis?c=zestly-demo&tab=map&map_view=chains&outlet=Zestly+Harbor+Square+Surabaya&date_from=2026-10-24&date_to=2026-10-24`);
      await page.getByRole('img',{name:'Settlement to bank: 0%'}).waitFor();
      await page.getByText('142 POS sales in this selection',{exact:true}).waitFor();
      assert.equal(await page.getByText('No bank credit yet',{exact:true}).count(),20);
      await page.getByRole('switch',{name:'Only rows with differences'}).click();
      await page.getByText(/Expected rounding and fees are included/).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: chains overflow`);
      await page.screenshot({path:path.join(out,`chains-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);console.log('Analysis Records and Chains passed at 1440/390: POS totals, scoped stage rates, compare, filters, bank absence and honest row counts.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
