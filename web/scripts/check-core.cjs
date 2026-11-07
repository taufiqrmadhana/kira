// Run the dependency-free UI helpers even when the browser toolchain is unavailable.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require(process.env.KIRA_TYPESCRIPT_MODULE||'typescript');
function load(file,globals={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports:module.exports,module,Intl,Date,URL,URLSearchParams,Headers,FormData,Response,...globals});return module.exports;}
(async()=>{
  const format=load('src/lib/format.ts');
  assert.equal(format.money(9031421),'Rp 9.031.421');assert.equal(format.count(8639),'8.639');assert.equal(format.percent(8639/8784*100),'98,3%');assert.equal(format.percent(null),'—');assert.equal(format.percent(0),'0%');assert.equal(format.date('2026-10-24'),'Sat 24 Oct 2026');assert.equal(format.date(''),'—');
  assert.equal(format.parseDisplayDate('24/10/2026'),'2026-10-24');assert.equal(format.parseDisplayDate('29/02/2028'),'2028-02-29');assert.equal(format.parseDisplayDate('30/02/2026'),null);assert.equal(format.parseDisplayDate('10/24/2026'),null);
  const periods=load('src/pages/analysis/period.ts');
  assert.equal(JSON.stringify(periods.periodRange('2026-10-19','week')),'["2026-10-19","2026-10-25"]');assert.equal(JSON.stringify(periods.periodRange('2028-02','month')),'["2028-02-01","2028-02-29"]');assert.equal(periods.periodRange('','all'),null);
  const requests=[],redirects=[];let response=new Response('{"user":"Andrew"}');
  const client=load('src/lib/api.ts',{location:{search:'?c=zestly-demo',origin:'http://localhost',pathname:'/analysis',assign:url=>redirects.push(url)},localStorage:{getItem:key=>key==='kira-user'?'Andrew':null},fetch:async(url,init)=>{requests.push({url,init});return response;}});
  assert.equal((await client.api('/me')).user,'Andrew');assert.equal(requests[0].init.headers.get('X-Kira-Client'),'zestly-demo');assert.equal(requests[0].init.headers.get('X-Kira-User'),'Andrew');assert.equal(requests[0].init.credentials,'include');
  assert.equal(client.query({outlet:'Harbor Square',by_outlet:false}),'outlet=Harbor+Square&by_outlet=false');assert.equal(client.clientPath('/analysis?tab=follow'),'/analysis?tab=follow&c=zestly-demo');
  response=new Response('{"detail":"Run stage 1 first"}',{status:409});await assert.rejects(client.api('/overview'),error=>error.message==='Run stage 1 first'&&error.status===409);
  response=new Response('{"detail":"Sign in required"}',{status:401});await assert.rejects(client.api('/overview'));assert.equal(redirects.length,1);assert(redirects[0].startsWith('/login?next='));
  response=new Response(null,{status:204});assert.equal(await client.api('/logout',{method:'POST'}),undefined);
  console.log('PASS: formatting, period drill-down, actor/client headers, cookies, query encoding, client-preserving links, 409 details, 401 redirect and 204 response.');
})().catch(error=>{console.error(error);process.exitCode=1;});
