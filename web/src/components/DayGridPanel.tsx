import {useQuery, keepPreviousData} from '@tanstack/react-query';
import {query, identity} from '../lib/api';
import {fetchResource, queryClient, resourceKey} from '../lib/query';
import {useResource} from '../lib/useResource';
import {Empty, ErrorState, GridSkeleton} from './index';
import {DayGrid, type DayGridRateRow, type DayGridGap, type DayGridCell} from './DayGrid';

/** Fetch every rate page: changing the table's grouping or paging never truncates history. */
export default function DayGridPanel({scope='', latestDay, compact=false, onSelect, expectedRows=10}: {
  scope?:string; latestDay?:string; compact?:boolean; expectedRows?:number; onSelect:(cell:DayGridCell)=>void;
}) {
  const client = identity.client();
  const rates = useQuery({
    queryKey: [...resourceKey('/analysis/rates?' + scope, client), 'all-daily-pages'],
    queryFn: async () => {
      const rows:DayGridRateRow[]=[];
      while (true) {
        const page=await fetchResource<{rows:DayGridRateRow[];total:number}>('/analysis/rates?'+[scope,query({period:'day',by_outlet:true,by_provider:false,offset:rows.length,limit:1000})].filter(Boolean).join('&'),client);
        rows.push(...page.rows);
        if (rows.length>=page.total) return rows;
        if (!page.rows.length) throw new Error('The daily results changed. Refresh the grid to continue.');
      }
    },
    placeholderData: (previous, prior) => prior?.queryKey[1] === client ? keepPreviousData(previous) : undefined,
  }, queryClient);
  // Daily gaps carry a distinct response shape; both requests start together.
  // The metadata request is shared with the money-differences section.
  const gaps = useResource<{days:DayGridGap[]}>('/analysis/gaps?'+[scope,'by_day=true'].filter(Boolean).join('&'));
  const meta = useResource<{latest_bank_date?:string}>('/analysis/gaps?'+scope);
  const loading = rates.isPending || gaps.loading || meta.loading;
  const error = rates.error?.message || gaps.error || meta.error;
  const retry = () => {void rates.refetch(); gaps.retry(); meta.retry();};
  if (error) return <ErrorState message={error} retry={retry}/>;
  if (loading) return <GridSkeleton rows={expectedRows}/>;
  if (!rates.data?.length) return <Empty title="No daily results in this selection">Choose another period or complete matching to see each day's trail.</Empty>;
  const params=new URLSearchParams(scope);
  return <div data-ready="true" aria-busy={rates.isFetching || gaps.updating || meta.updating}>
    <DayGrid rows={rates.data} gaps={gaps.data?.days ?? []} latestDay={latestDay} bankAsOf={meta.data?.latest_bank_date} compact={compact}
      selected={params.get('date_from') && params.get('date_from')===params.get('date_to') ? {day:params.get('date_from')!,outlet:params.get('outlet')||undefined}:undefined}
      dateFrom={params.get('date_from')||undefined} dateTo={params.get('date_to')||undefined} onSelect={onSelect}/>
  </div>;
}
