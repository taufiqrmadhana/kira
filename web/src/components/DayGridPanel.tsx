import {useCallback, useEffect, useState} from 'react';
import {api, query} from '../lib/api';
import {Empty, ErrorState, Loading} from './index';
import {DayGrid, type DayGridRateRow, type DayGridGap, type DayGridCell} from './DayGrid';

interface DailyData {rows:DayGridRateRow[]; gaps:DayGridGap[]}
/** Fetch every rate page: changing the table's grouping or paging never truncates history. */
export default function DayGridPanel({scope='', latestDay, compact=false, onSelect}: {
  scope?:string; latestDay?:string; compact?:boolean; onSelect:(cell:DayGridCell)=>void;
}) {
  const [state,setState] = useState<{scope:string; data?:DailyData; error?:string}>({scope});
  const [version,setVersion] = useState(0);
  const retry = useCallback(()=>setVersion(v=>v+1),[]);
  useEffect(()=>{
    window.addEventListener('kira:data-changed',retry);
    return ()=>window.removeEventListener('kira:data-changed',retry);
  },[retry]);
  useEffect(()=>{
    const controller = new AbortController();
    const options={signal:controller.signal};
    setState({scope});
    async function rates() {
      const rows:DayGridRateRow[]=[];
      while (true) {
        const page=await api<{rows:DayGridRateRow[];total:number}>('/analysis/rates?'+[scope,query({period:'day',by_outlet:true,by_provider:false,offset:rows.length,limit:1000})].filter(Boolean).join('&'),options);
        rows.push(...page.rows);
        if (rows.length>=page.total) return rows;
        if (!page.rows.length) throw new Error('The daily results changed. Refresh the grid to continue.');
      }
    }
    Promise.all([rates(),api<{days:DayGridGap[]}>('/analysis/gaps?'+[scope,'by_day=true'].filter(Boolean).join('&'),options)])
      .then(([rows,gaps])=>{if(!controller.signal.aborted)setState({scope,data:{rows,gaps:gaps.days??[]}});})
      .catch(error=>{if(!controller.signal.aborted)setState({scope,error:error.message});});
    return ()=>controller.abort();
  },[scope,version]);
  if (state.scope!==scope || !state.data&&!state.error) return <Loading/>;
  if (state.error) return <ErrorState message={state.error} retry={retry}/>;
  if (!state.data?.rows.length) return <Empty title="No daily results in this selection">Choose another period or complete matching to see each day's trail.</Empty>;
  const params=new URLSearchParams(scope);
  return <DayGrid rows={state.data.rows} gaps={state.data.gaps} latestDay={latestDay} compact={compact}
    selected={params.get('date_from') && params.get('date_from')===params.get('date_to') ? {day:params.get('date_from')!,outlet:params.get('outlet')||undefined}:undefined}
    dateFrom={params.get('date_from')||undefined} dateTo={params.get('date_to')||undefined} onSelect={onSelect}/>;
}
