// Read-only rendered audit. Findings are evidence for review, not a replacement for a WCAG audit.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const base=process.env.KIRA_E2E_BASE||'http://127.0.0.1:5174',root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/codex-log/accessibility-final.json');
const routes=[['landing','/'],['overview','/overview'],...[1,2,3,4].map(n=>[`workflow-${n}`,`/workflow?step=${n}`]),['analysis-grid','/analysis?tab=rates'],['analysis-table','/analysis?tab=rates&rate_view=table'],['analysis-map','/analysis?tab=map&stage=l2'],['analysis-records','/analysis?tab=records'],['analysis-chains','/analysis?tab=map&map_view=chains'],['analysis-follow','/analysis?tab=follow'],['insights','/insights']];
function audit(){
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility==='visible'&&s.display!=='none'&&!e.closest('[inert],.sr-only')&&r.right>0&&r.left<innerWidth&&![e,...parents(e)].some(p=>getComputedStyle(p).opacity==='0');};
 function parents(e){const a=[];while(e.parentElement){e=e.parentElement;a.push(e);}return a;}
 const color=s=>{const m=s.match(/[\d.]+/g)||[];return [Number(m[0]||0),Number(m[1]||0),Number(m[2]||0),m[3]===undefined?1:Number(m[3])];};
 const mix=(f,b)=>[...f.slice(0,3).map((v,i)=>v*f[3]+b[i]*(1-f[3])),1];
 const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const label=e=>`${e.tagName.toLowerCase()}${e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/).slice(0,3).join('.'):''}`;
 const textNodes=[...document.querySelectorAll('body *')].filter(e=>!['SCRIPT','STYLE','OPTION','SVG','PATH'].includes(e.tagName)&&visible(e)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
 const small=[],contrast=[],seen=new Set();
 for(const e of textNodes){const s=getComputedStyle(e),size=parseFloat(s.fontSize),text=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').slice(0,100),key=label(e)+'|'+s.color+'|'+s.backgroundColor+'|'+size;
  if(seen.has(key))continue;seen.add(key);const item={element:label(e),text,size};if(size<12)small.push(item);
  if(e.closest(':disabled,[aria-disabled=true]'))continue;
  const chain=[...parents(e)].reverse().concat(e);if(chain.some(p=>getComputedStyle(p).backgroundImage!=='none'))continue;
  let bg=[255,255,255,1];for(const p of chain)bg=mix(color(getComputedStyle(p).backgroundColor),bg);
  const fg=mix(color(s.color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),minimum=size>=24||(size>=18.67&&parseFloat(s.fontWeight)>=700)?3:4.5;
  if(ratio<minimum-.02)contrast.push({...item,foreground:s.color,background:bg.slice(0,3),ratio:Number(ratio.toFixed(2)),minimum});
 }
 const unnamed=[...document.querySelectorAll('button,input,textarea,select')].filter(visible).filter(e=>!['hidden','submit','button'].includes(e.type)).filter(e=>!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.labels?.length&&!e.textContent.trim()&&!e.title).map(e=>({element:label(e),type:e.type}));
 const focusable=[...document.querySelectorAll('button,a[href],input,textarea,select,summary,[tabindex]')].filter(visible);
 const positiveTabindex=focusable.filter(e=>Number(e.getAttribute('tabindex'))>0).map(label);
 const primary=[...document.querySelectorAll('.button.primary')].filter(visible).map(e=>({text:e.textContent.trim(),disabled:e.disabled}));
 return {overflow:document.documentElement.scrollWidth>innerWidth+1,small,contrast,unnamed,positiveTabindex,primary};
}
(async()=>{const browser=await chromium.launch({headless:true}),selected=process.env.KIRA_A11Y_PAGES?.split(','),report=selected&&fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):{at:new Date().toISOString(),base,mode:'production preview; reduced motion; GET-only scratch API; contrast composited from rendered CSS (gradients excluded); disabled controls excluded from contrast',pages:[],errors:[],writes:[]};
 const save=result=>{const index=report.pages.findIndex(p=>p.name===result.name&&p.width===result.width);if(index<0)report.pages.push(result);else report.pages[index]=result;fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
 if(selected)report.rechecks=[...(report.rechecks||[]),{at:new Date().toISOString(),pages:selected}];try{
 for(const width of (process.env.KIRA_A11Y_WIDTHS||'1440,1280,768,390').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:width===1440?2:1,reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('kira-tutorial',JSON.stringify({seen:true,auto:false,large:false})));
  await context.route('**/api/**',route=>{if(!['GET','HEAD'].includes(route.request().method())){report.writes.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  for(const [name,route] of routes.filter(([name])=>!selected||selected.includes(name))){
   await page.goto(base+route+(route.includes('?')?'&':'?')+'c=zestly-demo',{waitUntil:'domcontentloaded'});await page.waitForLoadState('networkidle');
   if(name!=='landing')await page.waitForFunction(()=>{const r=document.querySelector('[data-page][data-ready=true]');return r&&!r.querySelector('[data-ready=false]');});
   const result={name,width,...await page.evaluate(audit)};
   if(width===1440||width===390||selected){const aliases={'analysis-grid':'analysis-rates','analysis-table':'analysis-rate-table'};await page.screenshot({path:path.join(root,`docs/screens/dev2/${aliases[name]||name}-${width}.png`),timeout:10000});}
   await page.keyboard.press('Tab');result.keyboardFocus=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {tag:e.tagName,text:(e.getAttribute('aria-label')||e.textContent).trim().slice(0,80),visible:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0||s.boxShadow!=='none'};});
   if(name==='analysis-grid'){const tabs=page.getByRole('tablist',{name:'Analysis views'});await tabs.getByRole('tab',{name:/^Match rate/}).focus();await page.keyboard.press('ArrowRight');await tabs.getByRole('tab',{name:/^Match map/,selected:true}).waitFor();result.tabsKeyboard=await tabs.getByRole('tab',{name:/^Match map/}).getAttribute('aria-selected')==='true';await page.keyboard.press('Home');await tabs.getByRole('tab',{name:/^Match rate/,selected:true}).waitFor();result.tabsKeyboard=result.tabsKeyboard&&await tabs.getByRole('tab',{name:/^Match rate/}).getAttribute('aria-selected')==='true';}
   if(name==='workflow-4')result.singlePrimary=result.primary.filter(p=>!p.disabled).length===1;
   save(result);console.log(`${name} ${width}: overflow=${result.overflow}, small=${result.small.length}, contrast=${result.contrast.length}, labels=${result.unnamed.length}`);
  }
  if(!selected||selected.includes('guided-results')){
  await page.goto(`${base}/workflow?c=zestly-demo-latihan&step=4`);await page.evaluate(()=>{localStorage.setItem('kira:guided:zestly-demo-latihan',JSON.stringify({active:true,paused:false,step:9,follow:false,completed:['Stage 2: matching complete']}));});await page.reload();await page.getByRole('button',{name:/^Ask Kira/}).click();await page.getByText('9.837 of 9.982 POS sales reached the bank',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  save({name:'guided-results',width,...await page.evaluate(audit)});
  if(width===1440||width===390){await page.getByRole('region',{name:'Guided close',exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(root,`docs/screens/dev2/guided-close/results-final-${width}.png`),timeout:10000});}
  }
  await context.close();
 }
 console.log(`Rendered audit saved: ${out}`);if(report.errors.length||report.writes.length||report.pages.some(p=>p.overflow||p.small.length||p.contrast.length||p.unnamed.length||p.positiveTabindex.length||p.tabsKeyboard===false||p.singlePrimary===false))process.exitCode=1;
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
