// Review the completed scratch close without re-running or mutating it.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173',out=path.resolve(__dirname,'../../docs/screens/dev2/guided-close');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true}),errors=[],writes=[];
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('kira-tutorial',JSON.stringify({seen:true,auto:false,large:false}));localStorage.setItem('kira:guided:zestly-demo-latihan',JSON.stringify({active:true,paused:false,step:9,follow:false,completed:[]}));});
  await context.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/workflow?c=zestly-demo-latihan&step=4`);await page.getByRole('heading',{name:'Run matching',exact:true}).waitFor();
  await page.getByRole('button',{name:/^Ask Kira/}).click();const card=page.getByRole('region',{name:'Guided close',exact:true});
  await card.getByText('9.837 of 9.982 POS sales reached the bank',{exact:true}).waitFor();const summary=card.getByRole('region',{name:'Match summary',exact:true});await summary.waitFor();
  assert.equal(await summary.getByRole('img',{name:'Match rate: 98,5%',exact:true}).count(),1);
  await card.getByRole('list',{name:'Top issues to check'}).getByRole('listitem').nth(2).waitFor();assert.equal(await card.getByRole('list',{name:'Top issues to check'}).getByRole('listitem').count(),3);
  assert.equal(await card.getByText('Rp 9.031.421',{exact:true}).count(),1);assert.equal(await card.getByText('1 unassigned bank credit',{exact:true}).count(),1);
  const geometry=await summary.evaluate(element=>{const ring=element.querySelector('.ring-graphic').getBoundingClientRect(),box=element.getBoundingClientRect();return {ringWidth:ring.width,ringRight:ring.right,right:box.right,overflow:element.scrollWidth-element.clientWidth};});
  assert.equal(geometry.ringWidth,80);assert(geometry.ringRight<=geometry.right&&geometry.overflow<=1,'Mini summary stays inside the guided card');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page has no horizontal overflow');
  await card.evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,`results-final-${width}.png`),timeout:10000});
  await card.getByRole('button',{name:'Not now',exact:true}).click();await card.getByRole('button',{name:'Resume',exact:true}).waitFor();await card.getByRole('button',{name:'Resume',exact:true}).click();
  await card.getByRole('button',{name:'Finish',exact:true}).click();assert.equal(await card.count(),0);await context.close();console.log(`PASS guided Results ${width}: real mini summary, ranked group amounts, pinned client, pause/resume/finish; no writes.`);
 }assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
