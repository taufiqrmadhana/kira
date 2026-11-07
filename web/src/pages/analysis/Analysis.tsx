import {useRovingFocus} from '../../components/useRovingFocus';
import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {MessageCircle,X} from 'lucide-react';
import {Button,ErrorState,Loading,PageHeader,Segmented,SummaryBand,Tabs} from '../../components';
import {identity,query} from '../../lib/api';
import {useResource} from '../../lib/useResource';
import {count,date,money,percent,plural} from '../../lib/format';
import LinkedTables from './LinkedTables';
import FollowUps from './FollowUps';
import RateTable,{MoneyGaps} from './RateTable';
import RecordsTable,{type CompareRecord,type EvidenceRow,type ResultRecord} from './RecordsTable';
import Chains from './Chains';
import CompareDialog from './CompareDialog';
import {ratio} from './types';
import {periodRange} from './period';
import './analysis.css';
import './analysis-v2.css';
import DateField from '../../components/DateField';
import DayGridPanel from '../../components/DayGridPanel';
import {dayEvidenceParams} from '../../lib/dayEvidence';
import {CopyLink} from '../../components/CopyLink';
interface Summary {
  days?:string[];outlets?:string[];
  totals:{pos:number;matched:number;mismatched:number;review:number;open?:number;amount?:number;matched_amount?:number;cash?:number;credits_linked?:number};
  unassigned?:{credits:number;amount:number};
  facets:{days:string[];outlets:string[];providers:string[];reasons?:Record<string,number>};
}
interface StageTotals {totals:{pos:number;pos_linked:number;stl:number;stl_bank:number}}
const scopeKeys=['outlet','date_from','date_to','provider','keys','ids','reason','status','q','amount_min','amount_max','only_differences','pos_only'];
function shiftDay(iso:string,days:number){const result=new Date(iso+'T12:00:00Z');result.setUTCDate(result.getUTCDate()+days);return result.toISOString().slice(0,10);}
export default function Analysis(){
  const [params,setParams]=useSearchParams();
  const [dirty,setDirty]=useState(false),[custom,setCustom]=useState(false),[pendingPeriod,setPendingPeriod]=useState('');
  const [comparison,setComparison]=useState<{record:ResultRecord;banks:Record<string,EvidenceRow>;origin?:HTMLElement}|null>(null);
  const tab=params.get('tab')==='map'?'map':params.get('tab')==='records'?'records':['follow','followup'].includes(params.get('tab')||'')?'follow':'rates';
  const mapView=params.get('map_view')==='chains'?'chains':'linked',rateView=params.get('rate_view')==='table'?'table':'grid';
  const from=params.get('date_from')||params.get('from')||'',to=params.get('date_to')||params.get('to')||'',outlet=params.get('outlet')||'',provider=params.get('provider')||'';
  const scope=query({...Object.fromEntries(scopeKeys.map(key=>[key,params.get(key)||''])),date_from:from,date_to:to});
  const summary=useResource<Summary>('/analysis/summary?'+scope);
  const stageTotals=useResource<StageTotals>('/analysis/rates?'+[scope,'period=all&by_outlet=false&by_provider=false&limit=0'].filter(Boolean).join('&'));
  const availableDays=summary.data?.facets.days||[],latest=availableDays.slice().sort().at(-1)||'';
  const days=summary.data?.days??availableDays.filter(day=>(!from||day>=from)&&(!to||day<=to));
  const allowChange=useCallback(()=>!dirty||window.confirm('You have unsaved follow-up notes. Discard them and leave this view?'),[dirty]);
  const update=(key:string,value:string)=>{if(!allowChange())return;setDirty(false);setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set(key,value);else next.delete(key);if(key==='date_from')next.delete('from');if(key==='date_to')next.delete('to');return next;});};
  const updateScope=(scope:string)=>{if(!allowChange())return;setDirty(false);setParams(previous=>{const next=new URLSearchParams(previous),values=new URLSearchParams(scope);for(const key of scopeKeys){if(values.get(key))next.set(key,values.get(key)!);else next.delete(key);}return next;});};
  useEffect(()=>{if(!dirty)return;const handler=(event:MouseEvent)=>{const anchor=(event.target as Element).closest('a');if(anchor&&anchor.origin===location.origin&&!anchor.download&&!event.defaultPrevented&&!allowChange()){event.preventDefault();event.stopPropagation();}};document.addEventListener('click',handler,true);return()=>document.removeEventListener('click',handler,true);},[dirty,allowChange]);
  const choosePeriod=(period:string)=>{if(period==='custom'){setCustom(true);return;}if(!allowChange())return;if(period!=='all'&&!latest){setPendingPeriod(period);return;}setCustom(false);setDirty(false);setParams(previous=>{const next=new URLSearchParams(previous);next.delete('from');next.delete('to');next.delete('date_from');next.delete('date_to');next.set('selection_period',period);if(period!=='all'){next.set('date_to',latest);next.set('date_from',period==='latest'?latest:period==='week'?shiftDay(latest,-6):latest.slice(0,7)+'-01');}return next;});};
  useEffect(()=>{if(latest&&pendingPeriod){choosePeriod(pendingPeriod);setPendingPeriod('');}},[latest,pendingPeriod]);
  const clear=()=>{if(!allowChange())return;setDirty(false);setCustom(false);setParams(previous=>{const next=new URLSearchParams(previous);[...scopeKeys,'from','to','selection_period','highlight'].forEach(key=>next.delete(key));return next;});};
  const selectedPeriod=params.get('selection_period')||(!from&&!to?'all':'custom');
  const periodFocus=useRovingFocus(['all','latest','week','month','custom'],{initial:custom?'custom':selectedPeriod});
  const active=[['outlet',outlet],['date_from',from],['date_to',to],...['provider','reason','keys','status','q','amount_min','amount_max','only_differences'].map(key=>[key,params.get(key)||''])].filter(([,value])=>value);
  const totals=summary.data?.totals,outlets=summary.data?.outlets?.length??(outlet?1:summary.data?.facets.outlets.length??0),stage=stageTotals.data?.totals;
  const onCompare:CompareRecord=(record,banks,origin)=>setComparison({record,banks,origin});
  const onOpenRate=(row:{outlet?:string;provider?:string;period?:string})=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('tab','map');next.set('map_view','linked');next.set('stage','l2');if(row.outlet)next.set('outlet',row.outlet);if(row.provider)next.set('provider',row.provider);const range=periodRange(row.period||'',params.get('period')||'day');if(range){next.set('date_from',from&&from>range[0]?from:range[0]);next.set('date_to',to&&to<range[1]?to:range[1]);next.delete('from');next.delete('to');next.delete('selection_period');}return next;});
  const facets={providers:summary.data?.facets.providers,reasons:Object.keys(summary.data?.facets.reasons??{})};
  return <div className={`analysis-page analysis-page--${tab}`} data-page="analysis" aria-busy={summary.updating||stageTotals.updating} data-ready={!summary.loading&&!stageTotals.loading&&!!summary.data&&!summary.error}>
    <PageHeader title="Match analysis" tutorial="analysis" subtitle={totals?`${plural(days.length,'day')}, ${plural(outlets,'outlet')}, ${plural(totals.pos,'POS sale')} in this selection.`:'Choose a sales period and outlet to trace payments.'} actions={<><CopyLink/><Button data-tour="analysis-ask" onClick={()=>window.dispatchEvent(new CustomEvent('kira:ask',{detail:{message:'Explain the match results and differences in this selection.',context:{page:'Match analysis',tab,map_view:mapView,...Object.fromEntries(new URLSearchParams(scope))}}}))}><MessageCircle size={16} aria-hidden="true"/>Ask Kira about this view</Button></>}/>
    {(summary.updating||stageTotals.updating)&&<p className="updating" role="status">Updating…</p>}
    <section className="selection-bar" aria-label="Select analysis data" data-tour="analysis-selection"><div className="period-picker"><span>Period</span><div className="period-chips" role="group" aria-label="Analysis period">{[['all','All dates'],['latest','Latest day'],['week','Last 7 days'],['month','This month'],['custom','Pick dates']].map(([value,label])=><button type="button" key={value} {...periodFocus(value)} aria-pressed={custom?value==='custom':selectedPeriod===value} onClick={()=>choosePeriod(value)}>{label}</button>)}</div></div>
      {(custom||selectedPeriod==='custom')&&<><DateField label="From" value={from} max={to||undefined} onChange={value=>update('date_from',value)}/><DateField label="To" value={to} min={from||undefined} onChange={value=>update('date_to',value)}/></>}
      <label>Outlet<select value={outlet} onChange={event=>update('outlet',event.target.value)}><option value="">All outlets</option>{outlet&&!summary.data?.facets.outlets.includes(outlet)&&<option>{outlet}</option>}{summary.data?.facets.outlets.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Provider<select value={provider} onChange={event=>update('provider',event.target.value)}><option value="">All providers</option>{provider&&!summary.data?.facets.providers.includes(provider)&&<option>{provider}</option>}{summary.data?.facets.providers.map(value=><option key={value}>{value}</option>)}</select></label>
    </section>
    <div className="filter-summary"><span>{active.length?'Showing only':'Showing everything: all outlets, all dates'}</span>{active.map(([key,value])=><button type="button" className="filter-chip" key={key} onClick={()=>update(key,'')}>{key==='date_from'?'From ':key==='date_to'?'To ':key==='keys'?'Highlighted records: ':key==='amount_min'?'From Rp ':key==='amount_max'?'To Rp ':key==='q'?'Search: ':''}{key.startsWith('date')?date(value):key==='only_differences'?'Source differences':value}<X size={13} aria-hidden="true"/><span className="sr-only">Remove {key} filter</span></button>)}{active.length>0&&<Button variant="quiet" onClick={clear}>Clear all</Button>}</div>
    {summary.error&&<ErrorState message={summary.error} retry={summary.retry}/>}
    {summary.loading&&!totals?<Loading/>:totals&&<div className="analysis-kpis analysis-summary-v2" data-tour="analysis-summary"><SummaryBand rate={ratio(totals.matched,totals.pos)} kpis={[
      {label:'POS sales',value:totals.pos,detail:totals.amount===undefined?'Amount unavailable':money(totals.amount)},
      {label:'Matched',value:totals.matched,tone:'green',detail:totals.matched_amount===undefined?'Amount unavailable':`${money(totals.matched_amount)} (${percent(ratio(totals.matched_amount,totals.amount??0))} of sales value)`},
      {label:'Needs review',value:totals.review,tone:'amber',detail:`${percent(ratio(totals.review,totals.pos))} of POS sales`},
      {label:'Mismatched',value:totals.mismatched,tone:'red',detail:`${percent(ratio(totals.mismatched,totals.pos))} of POS sales`},
      {label:'Open without a sale',value:totals.open??0,detail:'Settlement or bank records outside the POS count'},
      {label:'Bank credits explained',value:totals.cash===undefined?'—':money(totals.cash),numericValue:totals.cash,formatValue:money,detail:plural(totals.credits_linked??0,'linked bank credit')},
    ]} stages={stage&&typeof stage.pos_linked==='number'?[{label:'POS to settlement',value:ratio(stage.pos_linked,stage.pos),detail:`${count(stage.pos_linked)} of ${plural(stage.pos,'sale')} linked`},{label:'Settlement to bank',value:ratio(stage.stl_bank,stage.stl),detail:`${count(stage.stl_bank)} of ${plural(stage.stl,'settlement')} linked`}]:[]}/></div>}
    <Tabs value={tab} onChange={value=>update('tab',value)} items={[{value:'rates',label:'Match rate',subtitle:'Per outlet per day'},{value:'map',label:'Match map',subtitle:'Rows side by side'},{value:'records',label:'Records',subtitle:'Filter and export'},{value:'follow',label:'Follow-up',subtitle:'Who is on it'}]}/>
    {params.get('highlight')&&<p className="highlight-note" role="status">{params.get('highlight')}</p>}
    <div role="tabpanel" aria-label={tab==='rates'?'Match rate':tab==='map'?'Match map':tab==='records'?'Records':'Follow-up'}>
      {tab==='rates'?<><div className="analysis-view-control"><Segmented label="Match rate view" value={rateView} onChange={value=>update('rate_view',value)} items={[{value:'grid',label:'Grid'},{value:'table',label:'Table'}]}/></div>{rateView==='grid'?<><DayGridPanel expectedRows={outlet?1:summary.data?.facets.outlets.length||10} scope={scope} latestDay={latest} compact onSelect={cell=>setParams(previous=>{const next=dayEvidenceParams(previous,cell);next.set('map_view','linked');return next;})}/><MoneyGaps scope={scope}/></>:<RateTable scope={scope} onOpen={onOpenRate}/>}</>:tab==='map'?<><div className="analysis-view-control"><Segmented label="Match map view" value={mapView} onChange={value=>update('map_view',value)} items={[{value:'linked',label:'Linked tables'},{value:'chains',label:'Chains'}]}/></div>{mapView==='chains'?<Chains scope={scope} onScopeChange={updateScope} onCompare={onCompare}/>:<LinkedTables key={scope+params.get('stage')} scope={scope} initialStage={params.get('stage')==='l2'?'l2':'l1'} onStageChange={stage=>update('stage',stage)} onCompare={onCompare}/>}</>:tab==='records'?<RecordsTable view="records" scope={scope} onScopeChange={updateScope} facets={facets} onCompare={onCompare}/>:<FollowUps key={scope} scope={scope} onDirtyChange={setDirty}/>}
    </div>
    {comparison&&<CompareDialog record={comparison.record} banks={comparison.banks} origin={comparison.origin} client={identity.client()} onClose={()=>setComparison(null)}/>}
  </div>;
}
