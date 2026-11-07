import {useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import {Button, Empty, ErrorState, Loading, PageHeader, Segmented, StatusChip, SummaryBand} from '../../components';
import DayGridPanel from '../../components/DayGridPanel';
import {clientPath, identity} from '../../lib/api';
import {dayEvidenceParams} from '../../lib/dayEvidence';
import {useResource} from '../../lib/useResource';
import {count, date, money, plural} from '../../lib/format';
import {WorkspaceStatus, type WorkflowProgress} from '../../kira/WorkspaceStatus';
import type {FollowRecord} from '../analysis/types';
import MonthCalendar from './MonthCalendar';
import './overview.css';

interface Stage {done:boolean;matched:number;total:number;run_at?:string}
interface OverviewData {
  status:{next?:{say:string};matching:{l1:Stage;l2:Stage}};
  results:null|{run_at?:string;totals:{rows?:number;pos:number;full:number;matched:number;mismatched:number;review:number;credits:number;credits_linked:number;cash:number};by_day:Record<string,{pos:number;matched:number}>;open_items:FollowRecord[]};
  latest_run?:string;
}
interface Summary {totals:{pos:number;matched:number;mismatched:number;review:number;open:number;amount:number;matched_amount:number}}
interface Learning {closes:{questions:number;at:string;pos:number;matched:number}[];knowledge:Record<string,number>}
const runTimestamp=(value:string)=>/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)?value:value+'Z';
function runLabel(value:string) {
  const instant=runTimestamp(value);
  if(Number.isNaN(new Date(instant).getTime()))return 'Match time unavailable';
  return `${date(instant)} at ${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(instant))} WIB`;
}

export default function Overview({progress}: {progress?:ReturnType<typeof useResource<WorkflowProgress>>}={}) {
  const overview=useResource<OverviewData>('/overview');
  const learning=useResource<Learning>('/learning');
  const result=overview.data?.results,totals=result?.totals;
  const summary=useResource<Summary>(totals?'/analysis/summary':null);
  const attention=useResource<{records:FollowRecord[]}>(totals?'/analysis/records?status=open&sort=amount&desc=true&limit=4':null);
  const navigate=useNavigate();
  const [history,setHistory]=useState('calendar');
  const revealKey=`kira:seen:overview:${identity.client()}`;
  const [reveal,setReveal]=useState(()=>{try{return !sessionStorage.getItem(revealKey);}catch{return true;}});
  useEffect(()=>{if(!totals || !reveal)return;try{sessionStorage.setItem(revealKey,'1');}catch{/* Session reveal still works without storage. */}const timer=setTimeout(()=>setReveal(false),1000);return()=>clearTimeout(timer);},[!!totals,reveal,revealKey]);
  const days=Object.keys(result?.by_day||{}).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  const latestDay=days.at(-1),latestRun=result?.run_at||overview.data?.latest_run;
  const pos=summary.data?.totals?.pos??totals?.pos??0,matched=summary.data?.totals?.matched??totals?.full??0;
  const open=summary.data?.totals?.open??Math.max(0,(totals?.rows??pos)-pos);
  const mismatch=summary.data?.totals?.mismatched??Math.max(0,(totals?.mismatched??0)-open);
  const review=summary.data?.totals?.review??totals?.review??0;
  const stages=overview.data?.status.matching;
  const finished=stages?.l1.done&&stages.l2.done;
  const items=attention.data?.records??[];
  return <div className="overview-page" data-reveal={reveal} aria-busy={overview.updating} data-page="overview" data-ready={!overview.loading&&!overview.error&&!!overview.data}>
    <div data-tour="overview-title"><PageHeader title="Overview" tutorial="welcome" subtitle={totals&&latestDay?`Sales up to ${date(latestDay)}: ${count(matched)} of ${count(pos)} POS sales reached the bank.`:'Upload POS sales, provider settlements and bank statements to start a close.'} actions={totals&&<><Button data-tour="guided-start" onClick={()=>window.dispatchEvent(new CustomEvent('kira:start-guided-close'))}>Do it with Kira</Button><Link className={`button ${finished?'':'primary'}`} to={clientPath('/workflow')}>Open workflow<ArrowRight size={16}/></Link></>}/></div>
    {overview.updating&&<p className="updating" role="status">Updating…</p>}
    {overview.loading?<Loading/>:overview.error?<ErrorState message={overview.error} retry={overview.retry}/>:!totals?
      progress?<WorkspaceStatus status={progress.data} loading={progress.loading} error={progress.error} onRefresh={()=>{progress.retry();overview.retry();}}/>:<Empty title="Start your first close"><p>Add files from all three sources to trace each payment.</p><Link className="button primary" to={clientPath('/workflow')}>Upload files</Link></Empty>:<>
      <div className="overview-close-banner"><p><strong>{latestDay?`Sales up to ${date(latestDay)}`:'Sales dates unavailable'}{latestRun?`, matched on ${runLabel(latestRun)}.`:'.'}</strong><span>{count(matched)} of {count(pos)} POS sales fully matched.</span></p><Link to={clientPath('/analysis')}>See the evidence<ArrowRight size={14}/></Link></div>
      {summary.error&&<ErrorState message={summary.error} retry={summary.retry}/>}
      <div data-tour="overview-summary"><SummaryBand rate={pos?matched/pos*100:null} animate={reveal} kpis={[
        {label:'POS sales',value:count(pos),numericValue:pos,formatValue:count,detail:summary.data?.totals?.amount!==undefined?money(summary.data.totals.amount):plural(days.length,'sales day')},
        {label:'Matched',value:count(matched),numericValue:matched,formatValue:count,tone:'green',detail:'POS sales traced to a bank credit'},
        {label:'Mismatched',value:count(mismatch),numericValue:mismatch,formatValue:count,tone:'red',detail:'POS sales missing at least one link'},
        {label:'Needs review',value:count(review),numericValue:review,formatValue:count,tone:'amber',detail:'POS sales needing a decision'},
        {label:'Open without a sale',value:count(open),numericValue:open,formatValue:count,detail:'Settlement or bank records outside the POS count'},
        {label:'Bank credits explained',value:money(totals.cash),numericValue:totals.cash,formatValue:money,detail:`${count(totals.credits_linked)} of ${plural(totals.credits,'credit')}`},
      ]} stages={(['l1','l2']as const).map(stage=>({label:stage==='l1'?'POS → Settlement':'Settlement → Bank',value:stages?.[stage].total?stages[stage].matched/stages[stage].total*100:null,detail:`${count(stages?.[stage].matched||0)} of ${count(stages?.[stage].total||0)} linked`}))}/></div>
      <div data-tour="overview-history" className="overview-history-section">
        <div className="section-head"><h2>History</h2><Segmented label="History view" value={history} onChange={setHistory} items={[{value:'calendar',label:'Calendar'},{value:'outlet',label:'By outlet'}]}/></div>
        {history==='calendar'?<MonthCalendar byDay={result!.by_day} latestDay={latestDay} closes={learning.data?.closes} embedded/>:<DayGridPanel compact latestDay={latestDay} onSelect={cell=>navigate(clientPath('/analysis?'+dayEvidenceParams(new URLSearchParams(),cell).toString()))}/>}
      </div>
      <div className="overview-bottom">
        <section className="learning" data-tour="overview-learning"><div className="section-head"><div><h2>KIRA learns as it runs</h2><p>Every decision becomes a rule. Later closes ask only about new data.</p></div></div>
          {learning.loading?<Loading/>:learning.error?<ErrorState message={learning.error} retry={learning.retry}/>:learning.data?.closes?.length?<>
            <div className="learning-bars" aria-label="Decisions per close">{learning.data.closes.slice(-7).map((close,index)=><div className="bar-row" key={index}><span>Close {Math.max(0,learning.data!.closes.length-7)+index+1}</span><div className="bar-track"><div style={{width:`${close.questions/Math.max(1,...learning.data!.closes.map(c=>c.questions))*100}%`}}/></div><strong>{plural(close.questions,'decision')}</strong></div>)}</div>
            <p className="visual-summary">The latest close needed {plural(learning.data.closes.at(-1)!.questions,'decision')}, compared with {count(learning.data.closes[0].questions)} in the first close. Longer green bars mean more decisions.</p>
            <div className="knowledge">{Object.entries(learning.data.knowledge).map(([key,value])=><span key={key}><strong>{count(value)}</strong> {key.replaceAll('_',' ')}</span>)}</div>
          </>:<Empty title="Learning starts with your first close"><Link to={clientPath('/workflow')}>Open workflow to start a close</Link></Empty>}
        </section>
        <section className="attention" data-tour="overview-attention"><div className="section-head"><div><h2>Needs your attention</h2><p>Open records, largest amount first.</p></div><Link to={clientPath('/analysis?tab=records&status=open')}>See all in Records</Link></div>
          {attention.loading?<Loading/>:attention.error?<ErrorState message={attention.error} retry={attention.retry}/>:items.length?<div className="overview-attention-scroll"><table aria-label="Records needing attention"><thead><tr><th>Record</th><th>Outlet</th><th className="numeric">Amount</th><th>Status</th><th>Why</th></tr></thead><tbody>{items.map(item=><tr key={item.rid} onClick={event=>{if(!(event.target as Element).closest('a,button'))navigate(clientPath('/analysis?'+new URLSearchParams({tab:'map',stage:item.reason==='No settlement'?'l1':'l2',keys:item.key})));}}><td><Link to={clientPath('/analysis?'+new URLSearchParams({tab:'map',stage:item.reason==='No settlement'?'l1':'l2',keys:item.key}))}>{item.rid.startsWith('bank:')?'Bank credit':item.key}</Link></td><td>{item.outlet||'Unassigned'}</td><td className="numeric">{money(item.amount)}</td><td><StatusChip tone={item.status==='Needs review'?'amber':'red'}>{item.status}</StatusChip></td><td>{item.reason}</td></tr>)}</tbody></table></div>:<Empty title="No open items">All payments in this close have a complete trail.</Empty>}
        </section>
      </div>
    </>}
  </div>;
}
