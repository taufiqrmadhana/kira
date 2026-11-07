/* Real scratch API only. KIRA_LOADING_LABEL=before|after selects the report.
 * Default uses a warm Vite development server: React StrictMode requests are
 * retained and aborted requests are reported separately from completed repeats.
 * KIRA_E2E_BASE may point at the production preview for a comparable second run.
 */
const {chromium} = require(process.env.KIRA_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.KIRA_E2E_BASE || 'http://127.0.0.1:5173';
const client = process.env.KIRA_E2E_CLIENT || 'zestly-demo';
const label = process.env.KIRA_LOADING_LABEL || 'after';
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.env.KIRA_LOADING_OUTPUT || path.join(root, `docs/codex-log/loading-${label}.json`));
const screenshots = path.join(root, `docs/screens/dev2${label === 'before' ? '-before' : ''}`);
const pages = [
  ['overview', '/overview'],
  ...[1,2,3,4].map(step => [`workflow-${step}`, `/workflow?step=${step}`]),
  ['analysis-rates', '/analysis?tab=rates'],
  ['analysis-map', '/analysis?tab=map&stage=l2'],
  ['analysis-follow', '/analysis?tab=follow'],
  ['insights', '/insights'],
];
const urlFor = route => `${base}${route}${route.includes('?') ? '&' : '?'}c=${client}`;
const canonical = raw => {const u = new URL(raw); u.searchParams.sort(); return u.pathname + (u.searchParams.size ? '?' + u.searchParams.toString() : '');};

(async () => {
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.mkdirSync(screenshots, {recursive:true});
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {})});
  const report = {at:new Date().toISOString(), base, client, label, mode:process.env.KIRA_LOADING_MODE || 'Vite development (React StrictMode)', note:'Ready means page root and all primary-data child markers ready. All API attempts are recorded; completed duplicate requests exclude aborted StrictMode attempts. CLS uses the largest session window.', pages:[]};
  try {
    for (const width of (process.env.KIRA_LOADING_WIDTHS || '1440,390').split(',').map(Number)) {
      const context = await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:width === 1440 ? 2 : 1,locale:'en-GB'});
      // Warm module loading separately so it does not masquerade as data loading.
      const warm = await context.newPage(); await warm.goto(base); await warm.waitForLoadState('networkidle'); await warm.close();
      for (const [name, route] of pages.filter(([name]) => !process.env.KIRA_LOADING_PAGES || process.env.KIRA_LOADING_PAGES.split(',').includes(name))) {
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.__loading = {readyAt:null,preview:false,cls:0,sessionValue:0,sessionStart:0,lastShift:0,shifts:[]};
          new PerformanceObserver(list => {
            for(const entry of list.getEntries()) if(!entry.hadRecentInput) {
              const m=window.__loading;
              if(entry.startTime-m.lastShift<1000 && entry.startTime-m.sessionStart<5000) m.sessionValue+=entry.value;
              else {m.sessionValue=entry.value;m.sessionStart=entry.startTime;}
              m.lastShift=entry.startTime;m.cls=Math.max(m.cls,m.sessionValue);
              m.shifts.push({at_ms:Math.round(entry.startTime),value:entry.value,sources:(entry.sources||[]).map(source=>({tag:source.node?.tagName,class:typeof source.node?.className==='string'?source.node.className:'',before:source.previousRect.toJSON(),after:source.currentRect.toJSON()}))});
            }
          }).observe({type:'layout-shift',buffered:true});
          const inspect = () => {
            const m=window.__loading;
            if(document.querySelector('[class*="kira-preview"]'))m.preview=true;
            const root=document.querySelector('[data-page][data-ready="true"]');
            if(root && !root.querySelector('[data-ready="false"]') && m.readyAt===null) m.readyAt=performance.now();
          };
          new MutationObserver(inspect).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-ready']});
        });
        const requests=[], byRequest=new Map(), errors=[];
        const start=Date.now();
        page.on('pageerror',error=>errors.push(error.message));
        page.on('request',request=>{if(!new URL(request.url()).pathname.startsWith('/api/'))return;const item={method:request.method(),url:canonical(request.url()),start_ms:Date.now()-start,end_ms:null,status:null,error:null};requests.push(item);byRequest.set(request,item);});
        page.on('response',response=>{const item=byRequest.get(response.request());if(item)item.status=response.status();});
        page.on('requestfinished',request=>{const item=byRequest.get(request);if(item)item.end_ms=Date.now()-start;});
        page.on('requestfailed',request=>{const item=byRequest.get(request);if(item){item.end_ms=Date.now()-start;item.error=request.failure()?.errorText||'failed';}});
        let failure=null;
        await page.goto(urlFor(route), {waitUntil:'domcontentloaded'});
        try {await page.waitForFunction(()=>window.__loading.readyAt!==null,{},{timeout:30000});} catch(error) {failure=error.message;}
        await page.waitForLoadState('networkidle', {timeout:10000}).catch(()=>{});
        // Include late responses and final page layout, without counting screenshot latency.
        const metrics=await page.evaluate(()=>({...window.__loading,overflow:document.documentElement.scrollWidth>innerWidth+1}));
        const groups=new Map();for(const request of requests){const key=request.method+' '+request.url;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(request);}
        const duplicates=[...groups].filter(([,items])=>items.length>1).map(([request,items])=>({request,attempts:items.length,completed:items.filter(item=>!item.error && item.status!==null).length}));
        const result={name,width,data_ready_ms:metrics.readyAt===null?null:Math.round(metrics.readyAt),cls:Number(metrics.cls.toFixed(5)),preview_seen:metrics.preview,layout_shifts:metrics.shifts,overflow:metrics.overflow,duplicates,completed_duplicate_count:duplicates.reduce((sum,item)=>sum+Math.max(0,item.completed-1),0),requests,errors,failure};
        report.pages.push(result);
        fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
        try {await page.screenshot({path:path.join(screenshots,`${name}-${width}.png`),fullPage:false,timeout:10000});} catch(error) {result.screenshot_error=error.message;fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
        console.log(`${name} ${width}: ${result.data_ready_ms} ms, CLS ${result.cls}, ${result.completed_duplicate_count} completed duplicates, preview ${result.preview_seen}${failure ? ', FAILED readiness' : ''}`);
        await page.close();
      }
      // Additional pages are screenshots only because they do not use reconciliation data.
      const page=await context.newPage();
      await page.goto(urlFor('/'));await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(screenshots,`landing-${width}.png`),fullPage:false});
      await page.goto(urlFor('/overview'));await page.waitForLoadState('networkidle');
      const launcher=page.getByRole('button',{name:'Ask Kira',exact:true});if(await launcher.count()){await launcher.click();await page.screenshot({path:path.join(screenshots,`chat-${width}.png`),fullPage:false});}
      await context.close();
    }
    console.log(`Report: ${output}`);
    if(report.pages.some(page=>page.failure || page.errors.length))process.exitCode=1;
    if(process.env.KIRA_LOADING_ASSERT==='1' && report.pages.some(page=>page.data_ready_ms>=1000 || page.cls>=0.05 || page.completed_duplicate_count || page.preview_seen))process.exitCode=1;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
