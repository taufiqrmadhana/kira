/* Development gallery acceptance. Reads only; exported examples use sample rows. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve(process.env.KIRA_COMPONENTS_OUT||path.join(__dirname,'../../docs/screens/dev2/components'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await page.goto(`${base}/dev/components?c=zestly-demo`);
      await page.getByRole('heading',{level:1,name:'Components',exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: page overflow`);
      const tiny=await page.locator('.component-gallery').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().width&&[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<12).map(el=>el.className));
      assert.deepEqual(tiny,[],`${width}: text smaller than 12 px`);
      for(const [caption,height] of [['Compact payments',36],['Evidence payments',44]]){
        const row=page.getByRole('region',{name:caption,exact:true}).locator('tbody tr').first();
        assert(Math.abs((await row.boundingBox()).height-height)<1,`${caption}: expected ${height} px rows`);
      }
      const rings=await page.locator('.ring-v2').evaluateAll(nodes=>nodes.map(node=>{
        const graphic=node.querySelector('.ring-graphic'),value=node.querySelector('.ring-value strong'),circle=node.querySelector('circle');
        const box=graphic.getBoundingClientRect(),text=value.getBoundingClientRect(),stroke=parseFloat(getComputedStyle(circle).strokeWidth);
        return {width:box.width,textWidth:text.width,stroke};
      }));
      assert(rings.every(ring=>ring.textWidth<=ring.width-ring.stroke*2),`${width}: ring value overflow`);
      assert.equal(rings[0].width,160);assert.equal(rings[0].stroke,12);
      const compact=page.getByRole('region',{name:'Compact payments',exact:true});
      const scroller=compact.locator('.table-scroll'),reference=compact.locator('tbody tr').first().locator('td').nth(1);
      const before=(await reference.boundingBox()).x;
      await scroller.evaluate(el=>{el.scrollLeft=300;});
      assert(Math.abs((await reference.boundingBox()).x-before)<1,`${width}: pinned reference moved`);
      await scroller.evaluate(el=>{el.scrollLeft=0;});
      await compact.getByRole('button',{name:'Columns',exact:true}).click();
      assert(await page.getByRole('dialog',{name:'Compact payments columns'}).evaluate(el=>!!el.closest('[data-overlay-root]')));
      await page.keyboard.press('Escape');
      assert(await compact.getByRole('button',{name:'Columns',exact:true}).evaluate(el=>el===document.activeElement));
      await page.getByRole('button',{name:'Open modal',exact:true}).click();
      const modal=page.getByRole('dialog',{name:'Review 2 selected records'});
      const modalBox=await modal.boundingBox();assert(modalBox.x>=12&&modalBox.x+modalBox.width<=width-12,`${width}: modal overflow`);
      await page.screenshot({path:path.join(out,`components-modal-${width}.png`)});
      await page.keyboard.press('Escape');
      assert(await page.getByRole('button',{name:'Open modal',exact:true}).evaluate(el=>el===document.activeElement));
      await page.getByRole('button',{name:'Replay result reveal'}).click();
      assert.equal(await page.getByRole('img',{name:'Match rate: 99,97%'}).locator('strong').innerText(),'99,97%','Reduced motion shows final result immediately');
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(out,`components-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[],'No browser errors');
    console.log('Components passed at 1440 and 390 px: density, rings, overflow, portal and keyboard focus.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
