/* Landing acceptance: real client summaries, plus a signed-out identity fixture. No writes. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve(process.env.KIRA_LANDING_OUT||path.join(__dirname,'../../docs/screens/dev2/landing'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),errors=[];
  try{
    for(const signedIn of [false,true]){
      const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      if(!signedIn)await page.route('**/api/me',route=>route.fulfill({json:{user:null,auth:true}}));
      for(const width of [1440,1280,768,390]){
        await page.setViewportSize({width,height:1000});
        await page.goto(base+'/');
        await page.getByRole('heading',{level:1,name:'Match POS sales, provider settlements and bank credits, outlet by outlet.'}).waitFor();
        if(signedIn){
          const choice=page.locator('.landing-client').filter({has:page.locator('input[value="zestly-demo"]')});
          await choice.getByRole('img',{name:'Match rate: 98,3%'}).waitFor();
          await choice.getByText('Last sales: Mon 26 Oct 2026').waitFor();
          await choice.getByText(/\d+ open follow-ups?/).waitFor();
          const contrast=await choice.locator('.landing-client-results small').first().evaluate(el=>{
            const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
            const luminance=channels=>channels.map(value=>{const n=value/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
            const ink=luminance(rgb(getComputedStyle(el).color)),surface=luminance(rgb(getComputedStyle(el.closest('.landing-client')).backgroundColor));
            return (Math.max(ink,surface)+.05)/(Math.min(ink,surface)+.05);
          });
          assert(contrast>=4.5,`${width}: client summary contrast ${contrast}`);
          await page.getByRole('button',{name:'Take the tutorial',exact:true}).waitFor();
          await page.getByRole('button',{name:"Do today's close with Kira",exact:true}).waitFor();
        }else{
          await page.getByRole('textbox',{name:'Username',exact:true}).waitFor();
          assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).count(),1);
          assert.equal(await page.getByRole('radio').count(),0);
        }
        await page.evaluate(()=>document.fonts.ready);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: landing overflow`);
        const tiny=await page.locator('.landing-page').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().width&&[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<12).map(el=>el.className));
        assert.deepEqual(tiny,[],`${width}: text below12 px`);
        const animations=await page.locator('.landing-steps li').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).animationName));
        assert.deepEqual(animations,['none','none','none','none'],'Reduced motion disables step reveals');
        assert.equal(await page.getByText('Payment reconciliation, with the evidence',{exact:true}).count(),0);
        await page.screenshot({path:path.join(out,`landing-${signedIn?'signed-in':'signed-out'}-${width}.png`),fullPage:true});
      }
      await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();
      await page.locator('.landing-steps li').first().waitFor();
      const delays=await page.locator('.landing-steps li').evaluateAll(nodes=>nodes.map(node=>({name:getComputedStyle(node).animationName,delay:getComputedStyle(node).animationDelay})));
      assert.deepEqual(delays.map(value=>value.delay),['0s','0.08s','0.16s','0.24s']);
      assert(delays.every(value=>value.name==='landing-step-enter'));
      await context.close();
    }
    assert.deepEqual(errors,[],'No browser errors');
    console.log('Landing passed signed in/out at 1440,1280,768,390: real summaries, embedded sign-in, overflow and reduced motion.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
