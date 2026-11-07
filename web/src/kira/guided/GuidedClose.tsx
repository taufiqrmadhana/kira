import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Pause,Play} from 'lucide-react';
import {Button,ErrorState,SummaryBand} from '../../components';
import {useEndpoint} from '../../lib/query';
import {useReveal} from '../../lib/motion';
import {count,date,money,plural} from '../../lib/format';
import {areas,type Area,type MapItem,type ExcludeItem} from '../../pages/workflow/types';
import {stepNames} from './engine';
import FileSlot,{sourceNames} from './FileSlot';
import UploadDecision from './UploadDecision';
import type {GuidedController} from './useGuidedClose';
import './guided.css';
type Rule={id:string;stage:'l1'|'l2';name:string;kind:string;params:Record<string,unknown>;matches_alone?:number;extra_after_saved?:number};
function CleaningDecisions({guide}:{guide:GuidedController}){
 const [choices,setChoices]=useState<Record<string,'accept'|'reject'>>({}),[itemChoices,setItemChoices]=useState<Record<string,Record<string,string|boolean>>>({});
 const cards=guide.data!.cleaning.recommendations;
 async function save(){await guide.run('Saving cleaning rules',async()=>{
  for(const card of cards){const values=itemChoices[card.id]||{};await guide.request(`/cleaning/recommendations/${card.id}`,{decision:choices[card.id]||card.decision||'accept',...(card.kind==='map'?{mapping:Object.fromEntries((card.items as MapItem[]).map(item=>[item.from,String(values[item.from]??item.to)]))}:{exclude:Object.fromEntries((card.items as ExcludeItem[]).map(item=>[item.pattern,Boolean(values[item.pattern]??item.exclude)]))})});}
  await guide.request('/cleaning/save');
 },true,`Cleaning: ${plural(cards.length,'decision')} saved`);}
 return <><p>{cards.length?`${plural(cards.length,'recommendation')} to review. Each accepted choice becomes a saved rule.`:`Cleaning rules v${guide.data!.cleaning.rules?.version||1} cover everything.`}</p>
  {cards.map(card=><article className="guided-decision" key={card.id}><h4>{card.title}</h4><p>{card.why}</p><label>Recommendation<select aria-label={`Decision for ${card.title}`} disabled={!!guide.busy} value={choices[card.id]||card.decision||'accept'} onChange={event=>setChoices(current=>({...current,[card.id]:event.target.value as 'accept'|'reject'}))}><option value="accept">Accept</option><option value="reject">Reject</option></select></label><ul>{card.items.map((item,index)=>card.kind==='map'?<li key={index}><span>{(item as MapItem).from} → {(item as MapItem).to}</span><small>{plural(item.rows,'row')}</small><label className="inline"><input type="checkbox" checked={(itemChoices[card.id]?.[(item as MapItem).from]??(item as MapItem).to)!==''} disabled={!!guide.busy||(choices[card.id]||card.decision)==='reject'} onChange={event=>setItemChoices(current=>({...current,[card.id]:{...current[card.id],[(item as MapItem).from]:event.target.checked?(item as MapItem).to:''}}))}/>Accept this mapping</label></li>:<li key={index}><span>{(item as ExcludeItem).example}</span><small>{plural(item.rows,'row')}</small><label className="inline"><input type="checkbox" checked={Boolean(itemChoices[card.id]?.[(item as ExcludeItem).pattern]??(item as ExcludeItem).exclude)} disabled={!!guide.busy||(choices[card.id]||card.decision)==='reject'} onChange={event=>setItemChoices(current=>({...current,[card.id]:{...current[card.id],[(item as ExcludeItem).pattern]:event.target.checked}}))}/>Exclude these statement rows</label></li>)}</ul></article>)}
  <Button variant="primary" disabled={!!guide.busy} onClick={()=>cards.length||!guide.data!.cleaning.rules?void save():guide.advance(`Cleaning: rule v${guide.data!.cleaning.rules.version} reused`)}>{cards.length||!guide.data!.cleaning.rules?`Save cleaning rules (${cards.length})`:'Continue'}</Button>
 </>;
}
function MatchingStep({guide,stage}:{guide:GuidedController;stage:'l1'|'l2'}){
 const rules=useEndpoint<Rule[]>('/matching/rules');
 const saved=(rules.data||[]).filter(rule=>rule.stage===stage),suggestions=useEndpoint<Rule[]>(rules.data&&!saved.length?`/matching/${stage}/suggestions`:null);
 const [selected,setSelected]=useState<Record<string,boolean>>({}),[tested,setTested]=useState<{matched:number;total:number;hits:Record<string,number>}|null>(null);
 const choices=(suggestions.data||[]).filter((rule,index)=>selected[rule.kind+index]!==false);
 const stageNumber=stage==='l1'?1:2;
 async function run(){await guide.run(`Running stage ${stageNumber}`,async()=>{for(const rule of saved.length?[]:choices)await guide.request(`/matching/${stage}/rules`,{name:rule.name,kind:rule.kind,params:rule.params});await guide.request(`/matching/${stage}/run`,{});},true,`Stage ${stageNumber}: matching complete`);}
 return <><p>{saved.length?`Use ${saved.map(rule=>rule.id).join(', ')} to ${stage==='l1'?'link POS sales to settlements':'trace settlement payouts to bank credits'}?`:'Review the suggested rules before saving and running this stage.'}</p>
  {rules.error?<ErrorState message={rules.error} retry={rules.retry}/>:rules.loading?<p role="status">Reading matching rules…</p>:<ul className="guided-rules">{(saved.length?saved:suggestions.data||[]).map((rule,index)=><li key={rule.id||rule.kind+index}>{!saved.length&&<input type="checkbox" aria-label={`Use ${rule.name}`} checked={selected[rule.kind+index]!==false} disabled={!!guide.busy} onChange={event=>setSelected(current=>({...current,[rule.kind+index]:event.target.checked}))}/>}<strong>{rule.id||rule.name}</strong><span>{saved.length?rule.name:`${count(rule.matches_alone||0)} links in preview`}</span></li>)}</ul>}
  {suggestions.loading&&<p role="status">Finding matching suggestions…</p>}{suggestions.error&&<ErrorState message={suggestions.error} retry={suggestions.retry}/>}
  {tested&&<p role="status">Test: {count(tested.matched)} of {count(tested.total)} linked. {Object.entries(tested.hits||{}).map(([id,hits])=>`${id}: ${count(hits)}`).join('; ')}. No run saved.</p>}
  <div className="guided-actions">{!!saved.length&&<Button disabled={!!guide.busy} onClick={()=>void guide.run(`Testing stage ${stageNumber}`,async()=>setTested(await guide.request(`/matching/${stage}/test`,{})),false)}>Test first</Button>}<Button variant="primary" disabled={!!guide.busy||rules.loading||!!rules.error||!saved.length&&!choices.length} onClick={()=>void run()}>{saved.length?`Run stage ${stageNumber}`:`Save and run stage ${stageNumber}`}</Button></div>
 </>;
}
type Issue={outlet:string;rupiah:number;why:string;period:{from:string;to:string};filter:Record<string,string>};
function Results({guide,onAsk}:{guide:GuidedController;onAsk:(question:string)=>void}){
 const matching=useEndpoint<{totals:{pos:number;full:number;l1:number;l2:number;stl:number;credits:number;credits_linked:number}}>('/matching/results',guide.client);
 const summary=useEndpoint<{totals:{mismatched:number;review:number;open:number};unassigned?:{credits:number;amount:number}}>('/analysis/summary',guide.client);
 const evidence=useEndpoint<{anomalies:(Issue&{kind:string})[]}>('/performance/anomalies',guide.client);
 const totals=matching.data?.totals,pos=summary.data?.totals;
 const issues:Issue[]=[...(evidence.data?.anomalies||[]).filter(item=>item.kind==='missing_money')];
 if(summary.data?.unassigned?.credits)issues.push({outlet:plural(summary.data.unassigned.credits,'unassigned bank credit'),rupiah:summary.data.unassigned.amount,why:'Credit with no settlement',period:{from:'',to:''},filter:{reason:'Credit with no settlement'}});
 issues.sort((a,b)=>Math.abs(b.rupiah)-Math.abs(a.rupiah));
 return <><div className="guided-results" data-tour="guided-results">{totals&&pos?<><strong>{count(totals.full)} of {count(totals.pos)} POS sales reached the bank</strong><SummaryBand ringSize={80} rate={totals.pos?100*totals.full/totals.pos:null} kpis={[{label:'Matched',value:totals.full,tone:'green'},{label:'Mismatched',value:pos.mismatched,tone:'red'},{label:'Needs review',value:pos.review,tone:'amber'},{label:'Open without a sale',value:pos.open}]}/><p>Stage 1: {count(totals.l1)} of {count(totals.pos)}. Stage 2: {count(totals.l2)} of {count(totals.stl)}. {plural(totals.credits_linked,'bank credit')} explained.</p></>:matching.error||summary.error?<ErrorState message={matching.error||summary.error!} retry={()=>{matching.retry();summary.retry();}}/>:<p>Reading final results…</p>}
  <h4>Top issues to check</h4>{evidence.error?<ErrorState message={evidence.error} retry={evidence.retry}/>:evidence.data?<>{issues.length?<ul aria-label="Top issues to check">{issues.slice(0,3).map((issue,index)=><li key={`${issue.outlet}-${index}`}><strong>{issue.outlet}</strong>{issue.period.from&&<small>{date(issue.period.from)}{issue.period.to!==issue.period.from?' to '+date(issue.period.to):''}</small>}<span>{issue.why}</span><b>{money(issue.rupiah)}</b></li>)}</ul>:<p>No open money issues.</p>}</>:<p>Reading the evidence…</p>}</div>
  <div className="guided-actions"><Button onClick={()=>window.dispatchEvent(new CustomEvent('kira:navigate',{detail:{path:'/analysis',client:guide.client}}))}>Open match analysis</Button><Button onClick={()=>onAsk('Draft follow-up notes for the open records from this close. Ask for my approval before saving.')}>Draft follow-up notes</Button><Button disabled={!!guide.busy} onClick={()=>void guide.run('Exporting results',guide.exportResults,false)}>Export results</Button><Button variant="primary" onClick={guide.finish}>Finish</Button></div>
 </>;
}

export default function GuidedClose({guide,onAsk}:{guide:GuidedController;onAsk:(question:string)=>void}){
 const ref=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null),completed=useRef<HTMLParagraphElement>(null),previousStep=useRef(guide.step);
 useEffect(()=>{if(previousStep.current===guide.step)return;previousStep.current=guide.step;if(document.activeElement?.matches('input,textarea,[contenteditable=true]'))return;heading.current?.focus({preventScroll:true});},[guide.step]);
 useReveal(ref,`${guide.step}:${guide.state.paused}`);
 useReveal(completed,guide.state.completed.at(-1)||'',{y:-8,duration:220});
 const [sampleDay,setSampleDay]=useState('8'),[pendingFiles,setPendingFiles]=useState(false);
 const {state,step,data,area,busy}=guide;
 const show=()=>{const chapter=step<4?'upload':step<6?'convert':step===6?'clean':step<9?'match':'results';window.dispatchEvent(new CustomEvent('kira:start-tutorial',{detail:{chapter}}));};
 if(!state.active)return null;
 if(!data)return <section className="guided-close" data-tour="guided-card">{guide.workflow.error?<ErrorState message={guide.workflow.error} retry={guide.workflow.retry}/>:<p role="status">Reading the current close…</p>}</section>;
 const files=area?data.files.filter(file=>file.type===area):[];
 const pending=data.status.upload_rules_pending as Area[];
 return <section ref={ref} className="guided-close" data-tour="guided-card" aria-label="Guided close" aria-busy={!!busy}>
  {!!state.completed.length&&<p ref={completed} className="guided-completed-latest"><Check size={14}/>{state.completed.at(-1)}</p>}
  {state.completed.length>1&&<details className="guided-completed"><summary>{plural(state.completed.length-1,'earlier step')}</summary><ol>{state.completed.slice(0,-1).map((line,index)=><li key={index}><Check size={14}/>{line}</li>)}</ol></details>}
  <header><h3 ref={heading} tabIndex={-1}>Step {step+1} of 10: {stepNames[step]}</h3><div className="guided-progress" aria-label={`Step ${step+1} of 10`}>{stepNames.map((name,index)=><span key={name} data-done={index<step} data-active={index===step}/>)}</div></header>
  {state.paused?<><p>Paused at {stepNames[step]}. Press Resume or say “continue”.</p><Button variant="primary" onClick={guide.resume}><Play size={14}/>Resume</Button></>:<>
   {step===0&&<><p>{areas.map(source=>`${sourceNames[source]} ${plural(data.status.files[source],'file')}`).join('; ')}. Choose the files for this close, review what changed, then run both matching stages.</p><Button data-tour="guided-start" variant="primary" onClick={()=>guide.advance('Start: current files reviewed')}>Start</Button></>}
   {area&&<><p>{sourceNames[area]} already has {plural(files.length,'file')}{files.length?`, ${plural(files.reduce((sum,file)=>sum+file.rows,0),'source row')}`:''}.</p><FileSlot key={area} area={area} busy={!!busy} progress={guide.progress} onPendingChange={setPendingFiles} onUpload={picks=>void guide.upload(picks)}/>
    {guide.wrong.map(file=><div key={file.id} className="guided-wrong"><p>{file.name} looks like a {file.looks_like?sourceNames[file.looks_like]:'different'} report.</p><div className="guided-actions"><Button disabled={!!busy||!file.looks_like} onClick={()=>void guide.run('Moving file',()=>guide.request(`/files/${file.id}/move`,{to:file.looks_like}),false)}>Move it to {file.looks_like?sourceNames[file.looks_like]:'another area'}</Button><Button disabled={!!busy} onClick={()=>guide.keep(file.id)}>Keep in {sourceNames[area]}</Button></div></div>)}
    {['zestly-demo','zestly-demo-latihan'].includes(new URLSearchParams(location.search).get('c')||localStorage.getItem('kira-client')||'')&&<details><summary>Use sample files</summary><p>Add one day of POS, settlement and bank sample files to this demo workspace.</p><label>Sample day<select value={sampleDay} onChange={event=>setSampleDay(event.target.value)}>{Array.from({length:8},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><Button disabled={!!busy} onClick={()=>void guide.run('Adding sample files',()=>guide.request(`/files/samples/${sampleDay}`),false)}>Add sample day {sampleDay} (all three sources)</Button></details>}
    {pendingFiles&&<p>Upload or remove the selected files before continuing.</p>}
    <Button variant="primary" disabled={!!busy||!files.length||!!guide.wrong.length||pendingFiles} onClick={()=>guide.advance(`${sourceNames[area]}: ${plural(files.length,'file')}, ${plural(files.reduce((sum,file)=>sum+file.rows,0),'source row')}`)}>Continue<ArrowRight size={14}/></Button>
   </>}
   {step===4&&<><p>Convert {plural(data.files.length,'file')} into tables. Your files are not changed.</p>{areas.map(source=><p key={source}>{sourceNames[source]}: {busy?'Reading files…':`${count(data.tables.parsed[source]?.total||0)} converted rows`}</p>)}<Button variant="primary" disabled={!!busy} onClick={()=>data.status.converted?guide.advance('Convert: current tables reused'):void guide.run('Converting files',()=>guide.request('/convert'),true,`Convert: ${plural(data.files.length,'file')} read`)}>{data.status.converted?'Continue':`Convert ${plural(data.files.length,'file')}`}</Button></>}
   {step===5&&<>{pending.length?pending.map(source=>data.conversion?.proposals[source]&&<UploadDecision key={`${source}:${data.conversion.at}`} area={source} proposal={data.conversion.proposals[source]!} version={data.upload_rules[source]?.version} busy={!!busy} onSave={body=>void guide.run('Saving upload rule',()=>guide.request(`/upload-rules/${source}`,body),pending.length===1,`${sourceNames[source]}: upload rule saved`)} onReview={show}/>):<><p>Saved rules {areas.map(source=>`${sourceNames[source]} v${data.upload_rules[source]?.version||1}`).join(', ')} fit all three sources.</p><Button variant="primary" onClick={()=>guide.advance('Upload rules reused')}>Continue</Button></>}</>}
   {step===6&&<CleaningDecisions guide={guide}/>}{(step===7||step===8)&&<MatchingStep key={step} guide={guide} stage={step===7?'l1':'l2'}/>} {step===9&&<Results guide={guide} onAsk={onAsk}/>}
   {busy&&<p className="guided-working" role="status">{busy}… Waiting for the confirmed result.</p>}
   <footer className="guided-actions"><Button data-tour="guided-stop" variant="quiet" disabled={!!busy} onClick={guide.pause}><Pause size={14}/>Not now</Button><Button data-tour="guided-show" variant="quiet" onClick={show}>Show me on the page</Button><Button variant="quiet" onClick={()=>onAsk(`Explain ${stepNames[step]} for my current close.`)}>Explain</Button></footer>
  </>}
  {guide.error&&<p role="alert" className="error-inline">{guide.error}</p>}
 </section>;
}
