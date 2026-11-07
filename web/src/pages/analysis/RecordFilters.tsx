import {useCallback,useEffect,useState} from 'react';
import {FilterChip,MoreFilters,Switch} from '../../components';
import {useRovingFocus} from '../../components/useRovingFocus';
import {count} from '../../lib/format';

export interface RecordFacets {providers?:string[];reasons?:string[]}
export default function RecordFilters({scope,counts={},onChange,facets={},chains=false,grouped=true,onGroup}:{scope:string;counts?:Record<string,number>;onChange:(scope:string)=>void;facets?:RecordFacets;chains?:boolean;grouped?:boolean;onGroup?:(grouped:boolean)=>void}){
  const params=new URLSearchParams(scope),query=params.get('q')||'',status=params.get('status')||'';
  const [search,setSearch]=useState(query);
  const change=useCallback((key:string,value:string)=>{const next=new URLSearchParams(scope);if(value)next.set(key,value);else next.delete(key);onChange(next.toString());},[scope,onChange]);
  useEffect(()=>setSearch(query),[query]);
  useEffect(()=>{if(search===query)return;const timer=setTimeout(()=>change('q',search),250);return()=>clearTimeout(timer);},[search,query,change]);
  const statuses=['','Matched','Needs review','Mismatched'];
  const focus=useRovingFocus(statuses,{initial:status});
  const more=['reason','provider','amount_min','amount_max'].filter(key=>params.get(key));
  const options=(values:string[]|undefined,current:string)=>current&&!values?.includes(current)?[current,...values??[]]:values??[];
  return <div className="records-filters" data-tour={chains?'chains-filters':'records-filters'}>
    <div className="record-status-filters" role="group" aria-label={chains?'Chain status':'Record status'}>{statuses.map(value=><button {...focus(value)} key={value} type="button" aria-pressed={status===value} onClick={()=>change('status',value)}>{value||'All'} <span>{count(value?counts[value]??0:Object.values(counts).reduce((sum,n)=>sum+n,0))}</span></button>)}</div>
    <div className="records-filter-controls"><input type="search" aria-label={chains?'Search chains':'Search records'} placeholder="Find a reference, outlet or reason…" value={search} onChange={event=>setSearch(event.target.value)}/>
      {chains?<Switch label="Only rows with differences" checked={params.get('only_differences')==='true'} onChange={value=>change('only_differences',value?'true':'')}/>:<Switch label="Group by bank credit" checked={grouped} onChange={value=>onGroup?.(value)}/>}
      {!chains&&<MoreFilters count={more.length}><label>Reason<select aria-label="Record reason" value={params.get('reason')||''} onChange={event=>change('reason',event.target.value)}><option value="">All reasons</option>{options(facets.reasons,params.get('reason')||'').map(value=><option key={value}>{value}</option>)}</select></label><label>Provider<select aria-label="Record provider" value={params.get('provider')||''} onChange={event=>change('provider',event.target.value)}><option value="">All providers</option>{options(facets.providers,params.get('provider')||'').map(value=><option key={value}>{value}</option>)}</select></label><label>Minimum amount (Rp)<input type="number" inputMode="decimal" value={params.get('amount_min')||''} onChange={event=>change('amount_min',event.target.value)}/></label><label>Maximum amount (Rp)<input type="number" inputMode="decimal" value={params.get('amount_max')||''} onChange={event=>change('amount_max',event.target.value)}/></label></MoreFilters>}
    </div>
    {(status||query||more.length>0)&&<div className="records-active-filters">{status&&<FilterChip label={status} onRemove={()=>change('status','')}/>} {query&&<FilterChip label={`Search: ${query}`} onRemove={()=>{setSearch('');change('q','');}}/>}{more.map(key=><FilterChip key={key} label={`${key==='amount_min'?'From Rp ':key==='amount_max'?'To Rp ':''}${params.get(key)}`} onRemove={()=>change(key,'')}/>)}</div>}
    {chains&&params.get('only_differences')==='true'&&<p className="records-filter-note">Expected rounding and fees are included when source values differ. This view also includes missing links and rows needing review.</p>}
  </div>;
}
