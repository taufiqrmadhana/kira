import {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight} from 'lucide-react';
import type {ColumnDef} from '@tanstack/react-table';
import {Button, DataTable, StatusChip} from '../../components';
import {clientPath, query} from '../../lib/api';
import {money} from '../../lib/format';
import type {AnomaliesResponse,Anomaly} from './api';

const names:Record<string,string>={missing_money:'Missing money',low_match:'Low match rate',high_deduction:'High payment cost',sales_drop:'Sales drop',sales_spike:'Sales spike'};
export default function AnomalyList({anomalies,skipped}:AnomaliesResponse){
  const checks=new Map<string,string[]>();
  for(const check of skipped){const kinds=checks.get(check.why)||[],name=names[check.kind]||check.kind;if(!kinds.includes(name))kinds.push(name);checks.set(check.why,kinds);}
  const columns=useMemo<ColumnDef<Anomaly,unknown>[]>(()=>[
    {accessorKey:'severity',header:'Severity',cell:({row})=><StatusChip tone={row.original.severity==='high'?'red':row.original.severity==='low'?'amber':'neutral'}>{row.original.severity.charAt(0).toUpperCase()+row.original.severity.slice(1)}</StatusChip>},
    {accessorKey:'kind',header:'Kind',cell:({row})=>names[row.original.kind]||row.original.kind},
    {accessorKey:'outlet',header:'Outlet',cell:({row})=><span className="insights-anomaly-outlet">{row.original.outlet}</span>},
    {accessorKey:'why',header:'Why',cell:({row})=><span className="insights-anomaly-why">{row.original.why}</span>},
    {accessorKey:'rupiah',header:'Amount',cell:({row})=><span className="numeric">{money(row.original.rupiah)}</span>},
    {id:'evidence',header:'Evidence',enableSorting:false,cell:({row})=><Link aria-label={`${names[row.original.kind]||row.original.kind}: ${row.original.outlet}. Open evidence`} to={clientPath('/analysis?'+query({...row.original.filter,tab:row.original.filter.reason?'follow':'map',...(row.original.filter.reason?{}:{stage:'l2',map_view:'linked'})}))}>Open evidence <ArrowUpRight size={14} aria-hidden="true"/></Link>},
    {id:'ask',header:'Ask Kira',enableSorting:false,cell:({row})=><Button variant="quiet" onClick={()=>window.dispatchEvent(new CustomEvent('kira:ask',{detail:{message:`Explain ${names[row.original.kind]?.toLowerCase()||row.original.kind} at ${row.original.outlet}: ${row.original.why}`,context:{page:'Insights',...row.original.filter,kind:row.original.kind,rupiah:row.original.rupiah}}}))}>Ask Kira about this</Button>},
  ],[]);
  return <><DataTable caption="Outlet anomalies" data={anomalies} columns={columns} density="compact" emptyTitle="No anomalies in this selection" emptyDescription="All available checks passed for the reconciled results shown."/>{!!checks.size&&<p className="insights-muted insights-skipped">Checks skipped: {Array.from(checks,([why,kinds])=>`${kinds.join(' and ')}: ${why}`).join('; ')}.</p>}</>;
}
