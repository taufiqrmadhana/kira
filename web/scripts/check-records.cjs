/* Read-only combined-records acceptance against the real demo matching run. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve(process.env.KIRA_RECORDS_OUT||path.join(__dirname,'../../docs/screens/dev2/records'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      const reads=[];const capture=request=>{if(request.url().includes('/api/analysis/records?'))reads.push(request.url());};
      page.on('request',capture);
      await page.goto(`${base}/workflow?c=zestly-demo&step=4`);
      await page.getByText('Show the combined table (8.787 rows)',{exact:true}).waitFor();
      assert.equal(reads.length,0,'Closed disclosure does not fetch combined records');
      await page.getByText('Show the combined table (8.787 rows)',{exact:true}).click();
      const table=page.getByRole('region',{name:'Combined records',exact:true});
      await table.getByText('1–20 of 8.787',{exact:true}).waitFor();
      assert.equal(await table.getByText('Rp 5.853.000',{exact:true}).count(),1,'Bank credit is shown once');
      assert.equal(await table.getByText('pays 92',{exact:true}).count(),1);
      assert.equal(await table.getByText('Same bank credit (M2-0001)',{exact:true}).count(),19);
      const bankReference=table.locator('.records-reference').filter({hasText:'TRSF E-BANKING CR 2110/FTSCY/WS95051'});
      assert.equal(await bankReference.count(),1,'Bank uses its own statement reference');
      assert(Math.abs((await table.locator('tbody tr').first().boundingBox()).height-36)<1,'Compact record rows are 36 px');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: page overflow`);
      await table.getByRole('button',{name:'Combined records next page'}).click();
      await table.getByText('21–40 of 8.787',{exact:true}).waitFor();
      assert(reads.some(url=>new URL(url).searchParams.get('offset')==='20'),'Paging uses the server');
      assert.equal(await table.getByText('Rp 5.853.000',{exact:true}).count(),1,'Continued page repeats its bank context once');
      await table.getByRole('button',{name:'Combined records previous page'}).click();
      await table.getByText('1–20 of 8.787',{exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(out,`records-${width}.png`),fullPage:true});
      page.off('request',capture);
    }
    assert.deepEqual(errors,[],'No browser errors');
    console.log('Combined records passed at 1440/390: 8787 total, true bank reference, one credit per page group, server pagination.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
