/* Writes only the named scratch latihan client through explicit chat buttons. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const out=path.resolve(__dirname,'../../docs/screens/dev2/guided-close');fs.mkdirSync(out,{recursive:true});
const folder=path.resolve(__dirname,'../../data/with-exceptions/day-08-20261027-new-format');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2,reducedMotion:'reduce'}),errors=[],writes=[];
 page.setDefaultTimeout(90000);page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD'].includes(request.method()))writes.push({url:request.url(),method:request.method(),headers:request.headers()});});
 const card=page.getByRole('region',{name:'Guided close',exact:true});
 async function shot(n){for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await card.scrollIntoViewIfNeeded();await page.waitForTimeout(100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`step${n}/${width}: page overflow`);await page.screenshot({path:path.join(out,`step-${String(n).padStart(2,'0')}-${width}.png`)});}await page.setViewportSize({width:1440,height:1000});}
 async function step(n){await card.getByRole('heading',{name:new RegExp(`^Step ${n} of 10:`)}).waitFor();await shot(n);}
 try{
  await page.addInitScript(()=>{localStorage.setItem('kira-tutorial',JSON.stringify({seen:true,auto:false,large:false}));localStorage.removeItem('kira:guided:zestly-demo-latihan');});
  await page.goto(`${base}/overview?c=zestly-demo-latihan&guide=1`);await step(1);assert.equal(writes.length,0);await card.getByRole('button',{name:'Start',exact:true}).click();
  for(const [n,area,prefix] of [[2,'POS','POS'],[3,'Settlement','SET'],[4,'Bank','STA']]){
   await step(n);await card.getByLabel(`${area} files for Kira`,{exact:true}).setInputFiles(path.join(folder,`${prefix}_20261027.csv`));
   const before=writes.length;assert.equal(await card.getByRole('button',{name:'Upload 1 file',exact:true}).count(),1);assert.equal(writes.length,before);
   await card.getByRole('button',{name:'Upload 1 file',exact:true}).click();await card.getByText('Uploaded',{exact:true}).waitFor();await card.getByRole('button',{name:'Continue',exact:true}).click();
  }
  await step(5);await card.getByRole('button',{name:'Convert 24 files',exact:true}).click();
  await step(6);await card.getByText('order_channel',{exact:true}).waitFor();await card.getByRole('button',{name:'Save rule v2',exact:true}).click();
  await step(7);assert(await card.getByText(/Zestly - Central Plz/).count());await card.getByRole('button',{name:'Save cleaning rules (1)',exact:true}).click();
  await step(8);await card.getByRole('button',{name:'Run stage 1',exact:true}).click();
  await step(9);await card.getByRole('button',{name:'Run stage 2',exact:true}).click();
  await step(10);await card.getByText('9.837 of 9.982 POS sales reached the bank',{exact:true}).waitFor();
  const result=await page.request.get(`${base}/api/matching/results`,{headers:{'X-Kira-Client':'zestly-demo-latihan'}});const totals=(await result.json()).totals;
  assert.equal(totals.pos,9982);assert.equal(totals.full,9837);assert.equal(totals.l1,9979);assert.equal(totals.l2,9839);assert.equal(totals.credits_linked,79);
  const learning=await page.request.get(`${base}/api/learning`,{headers:{'X-Kira-Client':'zestly-demo-latihan'}});const learned=await learning.json();assert.deepEqual(learned.closes.map(close=>close.questions),[7,2]);
  fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify({totals,learning:learned,writes:writes.map(({url,method,headers})=>({url,method,client:headers['x-kira-client'],origin:headers['x-kira-origin']})),errors},null,2));
  assert(writes.every(write=>write.headers['x-kira-client']==='zestly-demo-latihan'&&write.headers['x-kira-origin']==='guided'),'Every write is client-bound and explicitly guided');
  assert.deepEqual(errors,[]);await card.getByRole('button',{name:'Finish',exact:true}).click();console.log('Day8 guided close passed using only chat buttons/FileSlots: 9982 POS,9837 fully matched,79 linked credits. All10 steps captured1440/390.');
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),`${error.stack}\nErrors:${errors.join('\n')}`);throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
