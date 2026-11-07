// Read-only Phase6 acceptance. Any attempted API mutation is blocked and fails the check.
const {chromium}=require(process.env.KIRA_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve(__dirname,'../../docs/screens/dev2/workflow-v2');
const titles=['Upload raw files','Convert','Clean','Run matching'];
const steps=[1,2,3,4];
const internal=new Set(['matchmade_bq_id','partner_merchant_id','parent_id','terminal_id','entity_id']);

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const errors=[],writes=[],report=[];
  try{
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',locale:'en-GB'});
      await context.route('**/api/**',route=>{
        const request=route.request();
        if(!['GET','HEAD','OPTIONS'].includes(request.method())){
          writes.push(`${request.method()} ${request.url()}`);
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      const page=await context.newPage();page.setDefaultTimeout(15000);
      page.on('pageerror',error=>errors.push(error.message));
      const screenshot=async name=>{
        const detail=name==='standard-alias-focus';
        if(!detail){
          await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal page overflow`);
        await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:!detail,timeout:15000});
      };
      for(const step of steps){
        await page.goto(`${base}/workflow?c=zestly-demo&step=${step}`,{waitUntil:'domcontentloaded'});
        await page.locator('.workflow[data-ready=true]').waitFor();
        await page.getByRole('heading',{name:'Reconcile your payments',exact:true}).waitFor();
        await page.getByRole('heading',{name:titles[step-1],exact:true}).waitFor();
        if(step===4)await page.locator('.step4[data-ready=true]').waitFor();
        assert.equal(await page.getByText(`Step ${step} of 4`,{exact:true}).count(),1);
        assert.equal(await page.getByRole('button',{name:/^Refresh/}).count(),1,'One page Refresh only');
        assert.equal(await page.locator('.wf-stepper button').last().getByLabel('Complete',{exact:true}).count(),1,'Step4 is checked after both matching stages');
        await page.evaluate(()=>document.fonts.ready);
        if(step===1){
          assert.equal(await page.getByRole('button',{name:'Use sample files',exact:true}).count(),1);
          assert.equal(await page.getByLabel('Sample day',{exact:true}).locator('option').count(),8);
          assert.equal(await page.getByRole('button',{name:'Next: Convert',exact:true}).isEnabled(),true);
        }
        if(step===2){
          const lanes=page.locator('.wf-convert-lane');
          assert.equal(await lanes.count(),3);
          for(let index=0;index<3;index++){
            const lane=lanes.nth(index),table=lane.locator('.wf-convert-output table');
            const headings=await table.locator('th').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('title')||node.textContent));
            assert(headings.length>0&&headings.length<=5);
            assert(!headings.some(name=>internal.has(name)),`Internal column appears in useful preview: ${headings}`);
            const rows=await table.locator('tbody tr').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll('td')].map(cell=>cell.textContent.trim())));
            assert(rows.length>0&&rows.length<=4);
            assert(rows.every(row=>row.some(value=>value!==''&&value!=='—')),'Preview must not contain empty rows');
            report.push({width,step,area:index,headings,rows:rows.length});
          }
        }
        if(step===3){
          const chips=page.locator('.wf-standard-chip');await chips.first().waitFor();
          assert((await chips.count())>=10);
          assert.equal(await page.getByRole('tooltip').count(),0,'Aliases stay hidden until requested');
          assert.equal(await page.locator('.wf-clean-saved').getAttribute('open'),null,'Saved cleaning rules start collapsed');
          assert.equal(await page.locator('.wf-clean-grid th [title="matchmade_bq_id"]:visible').count(),0,'Internal UUID is hidden by default');
          assert(await chips.evaluateAll(nodes=>nodes.every(node=>node.textContent.trim()===node.querySelector('strong').textContent.trim())));
          await screenshot('step-3');
          await chips.first().scrollIntoViewIfNeeded();await chips.first().focus();
          const tooltip=page.getByRole('tooltip');await tooltip.waitFor();
          assert((await tooltip.innerText()).includes('Source spellings'));
          assert(await chips.first().getAttribute('aria-describedby'));
          const box=await tooltip.boundingBox();
          assert(box.x>=7&&box.y>=7&&box.x+box.width<=width-7&&box.y+box.height<=1000-7,'Alias tooltip stays inside viewport');
          await screenshot('standard-alias-focus');
          await page.keyboard.press('Escape');assert.equal(await page.getByRole('tooltip').count(),0);
          await page.getByLabel('Show before cleaning',{exact:true}).check();
          await page.getByRole('table',{name:'POS before cleaning',exact:true}).waitFor();
          await page.getByLabel('Show before cleaning',{exact:true}).uncheck();
          await page.getByRole('table',{name:'POS cleaned table',exact:true}).waitFor();
        }else await screenshot(`step-${step}`);
        if(step===4){
          const sentences=await page.locator('.step4-stage-result').allTextContents();
          assert(sentences[0].includes('8.781 of 8.784 POS sales linked')&&sentences[0].includes('3 not linked')&&sentences[0].includes('2 settlement rows left over'));
          assert(sentences[1].includes('69 batch payouts'));
          const glossary=page.locator('[data-tour="workflow-glossary"]');
          assert.equal(await glossary.getAttribute('data-docked'),width>=1280?'true':'false');
          if(width<1280){await glossary.locator('summary').click();await glossary.getByText('Batch payout',{exact:true}).waitFor();await glossary.locator('summary').click();}
          await page.getByRole('button',{name:'Show the combined table (8.787 rows)',exact:true}).click();
          await page.locator('#workflow-combined-records .records-table[data-ready=true]').waitFor();
          await page.getByRole('table',{name:'Combined records',exact:true}).waitFor();
          await screenshot('step-4-combined');
          await page.getByRole('button',{name:'Hide the combined table (8.787 rows)',exact:true}).click();
          await page.getByRole('button',{name:'Why not 100%? Ask Kira',exact:true}).click();
          const composer=page.getByRole('textbox',{name:'Ask Kira',exact:true});await composer.waitFor();
          assert.equal(await composer.inputValue(),'Why is the match rate not 100%?');
          await page.getByRole('button',{name:'Close Kira',exact:true}).click();
        }
        report.push({width,step,passed:true});console.log(`PASS workflow step ${step}: ${width}px`);
      }
      for(const client of ['zestly-demo-latihan','dev2-empty']){
        await page.goto(`${base}/workflow?c=${client}&step=1`,{waitUntil:'domcontentloaded'});
        await page.locator('.workflow[data-ready=true]').waitFor();
        assert.equal(await page.getByRole('button',{name:'Use sample files',exact:true}).count(),client==='zestly-demo-latihan'?1:0);
      }
      await context.close();
    }
    assert.deepEqual(writes,[],'This check must never send API mutations');
    assert.deepEqual(errors,[],'No browser errors');
    fs.writeFileSync('/tmp/kira-dev2-workflow-v2-browser.json',JSON.stringify({report,writes,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
