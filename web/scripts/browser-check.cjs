/* Browser acceptance checks use explicit API fixtures, never production fallbacks.
 * Start Vite first. Screenshots go to ignored .verification/screenshots.
 * Set KIRA_PLAYWRIGHT_MODULE to a local Playwright installation if needed. */
const {chromium}=require(process.env.KIRA_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5173';
const outlet='Zestly Harbor Square Surabaya';
const records=Array.from({length:142},(_,i)=>({i,rid:`pos:HARBOR-${i+1}`,key:`HARBOR-${i+1}`,day:'2026-10-24',outlet,provider:'SHOPEEPAY',status:'Mismatched',reason:'Not in bank yet',amount:i===141?43094:63747}));
const screenshots=path.resolve('.verification/screenshots');fs.mkdirSync(screenshots,{recursive:true});
const notes=new Map();let bulkCalls=0,failSave=false,authenticated=false;
const status={step:4,next:{say:'Review the reconciliation results.'},files:{pos:7,settlement:7,bank:7},converted:true,upload_rules_pending:[],cleaning:{open:0,rules_version:1},matching:{l1:{done:true,matched:8781,total:8784,rules:1},l2:{done:true,matched:8641,total:8783,rules:1}}};
const ratio=(a,b)=>b?a/b*100:0;
const fixture=(u,method,body)=>{
  const p=u.pathname,s=u.searchParams;
  if(p==='/api/me')return authenticated?{user:'Andrew',auth:true}:{__error:'Sign in required',__status:401};
  if(p==='/api/login'){authenticated=true;return {ok:true};}
  if(p==='/api/logout'){authenticated=false;return {ok:true};}
  if(p==='/api/clients')return [{id:'',name:'Zestly Demo'},{id:'zestly-demo',name:'Zestly Demo'}];
  if(p==='/api/status')return status;
  if(p==='/api/agent/history')return [];
  if(p==='/api/overview')return {status:{matching:{l1:{done:true,matched:8781,total:8784},l2:{done:true,matched:8641,total:8783}}},results:{totals:{pos:8784,full:8639,matched:8639,mismatched:143,review:2,credits:70,credits_linked:69,cash:550000000},by_day:{'2026-10-20':{pos:1200,matched:1200},'2026-10-26':{pos:1250,matched:1250}},open_items:[{status:'Mismatched',reason:'Not in bank yet',pos:{branch:outlet}}]}};
  if(p==='/api/learning')return {closes:[{questions:7,at:'2026-10-20',pos:1200,matched:1200},{questions:2,at:'2026-10-27',pos:1250,matched:1250}],knowledge:{file_formats:3,cleaning_values:10,bank_kinds:2,matching_rules:2}};
  if(p==='/api/analysis/summary')return {totals:s.get('outlet')?{pos:142,matched:0,mismatched:142,review:0}:{pos:8784,matched:8639,mismatched:143,review:2},facets:{days:['2026-10-20','2026-10-24','2026-10-26'],outlets:[outlet,'Zestly Central Plaza Jakarta'],providers:['SHOPEEPAY']}};
  if(p==='/api/analysis/rates'){
    let rows=[{period:'2026-10-24',outlet,provider:'SHOPEEPAY',pos:142,pos_linked:142,full:0,stl:142,stl_pos:142,stl_bank:0,bank:0,bank_linked:0,pos_amount:9037000,stl_nett:9031421,bank_credit:0,gap_payout:9031421},{period:'2026-10-26',outlet:'Zestly Central Plaza Jakarta',provider:'SHOPEEPAY',pos:100,pos_linked:100,full:100,stl:100,stl_pos:100,stl_bank:100,bank:1,bank_linked:1,pos_amount:6400000,stl_nett:6374700,bank_credit:6374700,gap_payout:0}];
    rows=rows.filter(r=>(!s.get('outlet')||s.get('outlet')===r.outlet)&&(!['1','true'].includes(s.get('below'))||r.full<r.pos)&&(!s.get('search')||r.outlet.toLowerCase().includes(s.get('search').toLowerCase())));
    const totals=rows.reduce((t,r)=>{for(const k of ['pos','full','stl','bank'])t[k]=(t[k]||0)+r[k];return t;},{});return {rows,total:rows.length,totals,unassigned:{credits:1,amount:1250000}};
  }
  if(p==='/api/analysis/gaps')return {kinds:[{kind:'not_in_bank',label:'Settled, not in the bank yet',explained:false,count:142,amount:9031421},{kind:'rounding',label:'Rounding and withdrawal fee',explained:true,count:69,amount:26361}],explained:26361,unexplained:10671421};
  if(p.includes('/analysis/side/')){
    const table=p.split('/').at(-1),stage=p.split('/').at(-2),linked=stage==='l1';
    let rows=linked?[1,2].map(n=>({n,rec:n,key:`${table==='pos'?'POS':'PAY'}-${n}`,day:'2026-10-24',outlet,rule:'PS1',link:`M1-000${n}`,status:'Linked',row:table==='pos'?{payment_amount:63747}:{gross_amount:63747}})):table==='bank'?[]:records.map((r,i)=>({n:i+1,rec:i,key:r.key,day:r.day,outlet,rule:'',link:'',status:'Not found',row:{reference:r.key,nett_amount:r.amount}}));
    const counts={Linked:linked?rows.length:0,Review:0,'Not found':linked?0:rows.length};
    if(s.get('links'))rows=rows.filter(r=>s.get('links').split(',').includes(r.link));
    if(s.get('link_status'))rows=rows.filter(r=>r.status===s.get('link_status'));
    if(s.get('search'))rows=rows.filter(r=>r.key.includes(s.get('search')));
    const field=linked?table==='pos'?'payment_amount':'gross_amount':table==='bank'?'kredit':'nett_amount';
    const values=rows.map(r=>r.row[field]||0),sum=values.reduce((a,b)=>a+b,0),offset=Number(s.get('offset')||0),limit=Number(s.get('limit')||20);
    return {total:rows.length,offset,limit,counts,columns:[{name:field,type:'number'}],aggregates:{[field]:{sum,count:rows.length,min:Math.min(...values),max:Math.max(...values)}},rows:rows.slice(offset,offset+limit)};
  }
  if(p==='/api/analysis/follow-ups/draft'){
    const selected=records.filter(r=>(!body.rids||body.rids.includes(r.rid))&&(!body.only_empty||!notes.has(r.rid)));
    const note=body.lang==='id'?'Pencairan SHOPEEPAY belum masuk ke bank: Rp 9.031.421. Hubungi SHOPEEPAY.':'SHOPEEPAY payout has not reached the bank: Rp 9.031.421. Ask SHOPEEPAY for the payout status.';
    return {drafts:selected.map(r=>({rid:r.rid,key:r.key,status:'investigating',assignee:'',note,by:'rule',group:outlet})),groups:[{label:outlet,records:selected.length,total:9031421}],by:'rule',skipped:142-selected.length};
  }
  if(p==='/api/analysis/follow-ups/bulk'){bulkCalls++;if(failSave)return {__error:'KIRA is busy',__status:409};for(const item of body.items)notes.set(item.rid,{status:item.status,assignee:item.assignee,note:item.note,by:'Andrew',at:'2026-11-07T00:00:00Z'});return {saved:body.items.length,follow_ups:Object.fromEntries(notes)};}
  if(p==='/api/analysis/follow-ups'&&method==='POST'){notes.set(body.rid,{status:body.status,assignee:body.assignee,note:body.note,by:'Andrew'});return notes.get(body.rid);}
  if(p==='/api/analysis/follow-ups'){
    const counts={open:0,investigating:0,resolved:0};for(const r of records)counts[notes.get(r.rid)?.status||'open']++;
    const filtered=records.filter(r=>(!s.get('follow')||(notes.get(r.rid)?.status||'open')===s.get('follow'))&&(!s.get('search')||JSON.stringify([r,notes.get(r.rid)]).includes(s.get('search'))));
    const offset=Number(s.get('offset')||0),limit=Number(s.get('limit')||20);
    return {total:filtered.length,offset,counts,records:filtered.slice(offset,offset+limit).map(r=>({...r,follow_up:notes.get(r.rid)}))};
  }
  if(p==='/api/analysis/export')return {__csv:'status,amount\nMismatched,9031421\n'};
  return {__error:'Fixture route not found: '+p,__status:404};
};

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-GB',reducedMotion:'reduce'});
  const errors=[];const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());const result=fixture(url,request.method(),request.postDataJSON?.()||{});if(result.__csv)return route.fulfill({status:200,contentType:'text/csv',body:result.__csv});return route.fulfill({status:result.__status||200,contentType:'application/json',body:JSON.stringify(result.__error?{detail:result.__error}:result)});});
  const screenshot=async name=>{await page.screenshot({path:path.join(screenshots,name+'.png'),fullPage:true});};
  try {
    await page.goto(base+'/');await page.getByRole('heading',{name:/Every rupiah/}).waitFor();await page.getByRole('button',{name:'Sign in to enter',exact:true}).click();
    await page.getByRole('heading',{name:'Sign in to your workspace'}).waitFor();await screenshot('01-login');
    await page.getByLabel('Username').fill('andrew');await page.getByLabel('Password',{exact:true}).fill('test');await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('heading',{name:/Every rupiah/}).waitFor();await page.getByRole('button',{name:'Enter workspace',exact:true}).click();
    await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();await page.getByText('8.639 of 8.784 sales reconciled end to end').waitFor();await screenshot('02-overview');
    await page.getByRole('button',{name:'Ask Kira',exact:true}).click();await page.getByLabel('Ask Kira',{exact:true}).waitFor();await page.getByRole('button',{name:'Close Kira',exact:true}).click();
    await page.goto(base+'/analysis?c=zestly-demo&below=1');await page.getByRole('button',{name:/Open linked tables for Zestly Harbor/}).waitFor();await screenshot('03-rate-table');
    await page.getByRole('button',{name:/Open linked tables for Zestly Harbor/}).click();await page.getByText('142 settlements',{exact:true}).waitFor();await page.getByText('No bank rows in this selection').waitFor();assert(await page.getByText('Rp 9.031.421',{exact:true}).count()>=1);await screenshot('04-linked-harbor');
    await page.getByRole('tab',{name:'Follow-up',exact:true}).click();await page.getByText('142 records',{exact:true}).waitFor();await page.getByLabel('Draft language').selectOption('id');await page.getByRole('button',{name:'Draft notes for this list'}).click();await page.getByRole('button',{name:'Save 142 notes',exact:true}).waitFor();assert.equal(bulkCalls,0);await screenshot('05-follow-up-drafts');
    const note=page.getByLabel('Note for HARBOR-1',{exact:true});await note.fill('Ask SHOPEEPAY. Reviewed by Andrew.');await page.getByLabel('Assignee for HARBOR-1',{exact:true}).fill('Andrew');await page.getByRole('button',{name:'Follow-up next page',exact:true}).click();await page.getByLabel('Note for HARBOR-21',{exact:true}).waitFor();await page.getByRole('button',{name:'Save 142 notes',exact:true}).click();await page.getByText('Saved 142 notes.',{exact:true}).waitFor();assert.equal(notes.size,142);assert.equal(notes.get('pos:HARBOR-1').assignee,'Andrew');
    await page.reload();await page.getByLabel('Note for HARBOR-1',{exact:true}).waitFor();assert.equal(await page.getByLabel('Note for HARBOR-1',{exact:true}).inputValue(),'Ask SHOPEEPAY. Reviewed by Andrew.');await screenshot('06-follow-up-saved');
    notes.clear();await page.reload();await page.getByRole('button',{name:'Draft notes for this list'}).click();await page.getByRole('button',{name:'Save 142 notes',exact:true}).waitFor();const before=bulkCalls;await page.getByRole('button',{name:'Discard drafts'}).click();assert.equal(bulkCalls,before);await page.getByRole('button',{name:'Draft notes for this list'}).click();await page.getByRole('button',{name:'Save 142 notes',exact:true}).waitFor();failSave=true;await page.getByRole('button',{name:'Save 142 notes',exact:true}).click();await page.getByText('KIRA is busy',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Save 142 notes',exact:true}).isEnabled());await page.getByRole('button',{name:'Discard drafts'}).click();failSave=false;
    await page.goto(base+'/analysis?tab=map&stage=l1');await page.getByText('POS-1',{exact:true}).waitFor();await page.getByLabel('Select POS row 1',{exact:true}).check();await page.getByText('1 settlements',{exact:true}).waitFor();await screenshot('07-linked-selection');
    for(const width of [1280,768,390]){await page.setViewportSize({width,height:1000});await page.goto(base+'/analysis?tab=map&stage=l2&outlet='+encodeURIComponent(outlet));await page.getByText('142 settlements',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Page overflows at ${width}px`);await screenshot('08-responsive-'+width);}
    assert.deepEqual(errors,[],'Unexpected browser errors');
    console.log('PASS: login, Overview, rate drill-down, Harbor totals, all-page draft/save/reload, discard, failed-save recovery, cross-selection and responsive layouts.');
    console.log('Screenshots: '+screenshots);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
