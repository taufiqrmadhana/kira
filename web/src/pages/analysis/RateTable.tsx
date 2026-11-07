import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Download } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button, DataTable, Empty, ErrorState, Loading, RateCell, Segmented, StatusChip, Switch, ToggleChip } from '../../components';
import { api, identity, query } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { count, date, money, percent, plural } from '../../lib/format';
import { ratio } from './types';
import {useAnimatedNumber} from '../../lib/motion';
import './rate-table-v2.css';
export interface Rate {
    period: string;
    outlet: string;
    provider: string;
    pos: number;
    pos_linked: number;
    full: number;
    stl: number;
    stl_pos: number;
    stl_bank: number;
    bank: number;
    bank_linked: number;
    pos_amount: number;
    stl_nett: number;
    bank_credit: number;
    gap_sale: number;
    gap_payout: number;
}
interface Rates {
    rows: Rate[];
    total: number;
    totals: Rate;
    unassigned: {
        credits: number;
        amount: number;
    };
}
interface Gaps {
    kinds: {
        kind: string;
        label: string;
        explained: boolean;
        count: number;
        amount: number;
        samples?: {key:string}[];
    }[];
    explained: number;
    unexplained: number;
    latest_bank_date?:string;
}
const evidenceReasons:Record<string,string>={not_in_bank:'Not in bank yet',credit_no_settlement:'Credit with no settlement',pos_no_settlement:'No settlement',stl_no_pos:'No POS sale'};
function evidenceHref(params:URLSearchParams,scope:string,kind:string,keys:string[]=[]) {
    const next=new URLSearchParams(scope);
    if(params.get('c'))next.set('c',params.get('c')!);
    next.set('tab','map');next.set('map_view','linked');next.set('stage',['pos_no_settlement','stl_no_pos','sale_diff','promo'].includes(kind)?'l1':'l2');
    next.delete('keys');next.delete('reason');
    if(evidenceReasons[kind])next.set('reason',evidenceReasons[kind]);else if(keys.length)next.set('keys',keys.join(','));
    return '/analysis?'+next.toString();
}
export function MoneyGaps({scope}:{scope:string}) {
    const [params]=useSearchParams();
    const gaps=useResource<Gaps>('/analysis/gaps?'+scope);
    const kinds=[...(gaps.data?.kinds||[])].sort((a,b)=>Number(a.explained)-Number(b.explained)||Math.abs(b.amount)-Math.abs(a.amount));
    return <section className="money-gaps money-gaps-v2" aria-label="Money differences" data-tour="money-differences" data-ready={!gaps.loading&&!!gaps.data&&!gaps.error}>
      <div className="section-head"><div><h2>Money differences</h2><p>{gaps.data?.latest_bank_date?`Bank data until ${date(gaps.data.latest_bank_date)}`:'Bank date unavailable'}</p></div>
      {gaps.data&&<div className="gap-totals"><span className="gap-total" data-tone="green">Expected <strong>{money(gaps.data.explained)}</strong></span><span className="gap-total" data-tone="amber">To check <strong>{money(gaps.data.unexplained)}</strong></span></div>}</div>
      {gaps.loading?<Loading/>:gaps.error?<ErrorState message={gaps.error} retry={gaps.retry}/>:!kinds.length?<Empty title="No money differences"/>:kinds.map(kind=>{
        const sampled=!evidenceReasons[kind.kind],keys=(kind.samples||[]).map(sample=>sample.key);
        const content=<><StatusChip tone={kind.explained?'green':'amber'}>{kind.explained?'Expected':'To check'}</StatusChip><span className="gap-label"><strong>{kind.label}</strong>{sampled&&keys.length>0&&<small>Sample evidence: {count(keys.length)} of {plural(kind.count,'record')}</small>}</span><span className="gap-count">{plural(kind.count,'record')}</span><strong className="numeric">{money(kind.amount)}</strong><ArrowUpRight size={16} aria-hidden="true"/></>;
        return sampled&&!keys.length?<div className="gap-row" key={kind.kind}>{content}</div>:<Link className="gap-row" key={kind.kind} to={evidenceHref(params,scope,kind.kind,keys)}>{content}</Link>;
      })}
    </section>;
}
function TickedSubtotal({rows}:{rows:Rate[]}) {
    const sum=rows.reduce((total,row)=>({pos:total.pos+row.pos,full:total.full+row.full,stl_nett:total.stl_nett+row.stl_nett,bank_credit:total.bank_credit+row.bank_credit,gap_payout:total.gap_payout+row.gap_payout}),{pos:0,full:0,stl_nett:0,bank_credit:0,gap_payout:0});
    const pos=useAnimatedNumber(sum.pos,{duration:300}),nett=useAnimatedNumber(sum.stl_nett,{duration:300}),cash=useAnimatedNumber(sum.bank_credit,{duration:300}),difference=useAnimatedNumber(sum.gap_payout,{duration:300});
    return <div className="rate-subtotal" role="status" aria-label="Ticked rows subtotal"><span className="sr-only">{plural(rows.length,'ticked row')}: {count(sum.pos)} sales, {percent(ratio(sum.full,sum.pos))} end to end. Settlement nett {money(sum.stl_nett)}. Bank {money(sum.bank_credit)}. Difference {money(sum.gap_payout)}.</span><div aria-hidden="true"><strong>{plural(rows.length,'ticked row')}</strong><span>{count(Math.round(pos))} sales</span><span>{percent(ratio(sum.full,sum.pos))} end to end</span><span>Settlement <b>{money(nett)}</b></span><span>Bank <b>{money(cash)}</b></span><span>Difference <b>{money(difference)}</b></span></div></div>;
}
export default function RateTable({ scope, onOpen }: {
    scope: string;
    onOpen: (row: Rate) => void;
}) {
    const [params, setParams] = useSearchParams();
    const period = params.get('period') || 'day', byOutlet = params.get('by_outlet') !== 'false', byProvider = params.get('by_provider') === 'true', below = ['1', 'true'].includes(params.get('below') || '');
    const [search, setSearch] = useState(''), [offset, setOffset] = useState(0), [limit, setLimit] = useState(20), [sort, setSort] = useState(''), [desc, setDesc] = useState(false);
    const [selected, setSelected] = useState<Rate[]>([]), [exportError, setExportError] = useState(''), [exporting, setExporting] = useState(false);
    const [previousScope, setPreviousScope] = useState(scope);
    const activeOffset = previousScope === scope ? offset : 0;
    useEffect(() => { setPreviousScope(scope); setOffset(0); setSelected([]); }, [scope]);
    const rateQuery = [scope, query({ period, by_outlet: byOutlet, by_provider: byProvider, below, search, sort, desc, offset: activeOffset, limit })].filter(Boolean).join('&');
    const rates = useResource<Rates>('/analysis/rates?' + rateQuery);
    const setting = (key: string, value: string) => { setOffset(0); setSelected([]); setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; }); };
    const columns = useMemo<ColumnDef<Rate, unknown>[]>(() => [
        { accessorKey: 'period', header: 'Date', size:130, cell: ({ row }) => !row.original.period || row.original.period === 'all' ? 'Whole period' : row.original.period.length === 10 ? date(row.original.period) : row.original.period },
        ...(byOutlet ? [{ accessorKey: 'outlet', header: 'Outlet',size:220 }] : []), ...(byProvider ? [{ accessorKey: 'provider', header: 'Provider' }] : []),
        { header: 'Rows', columns: [{ accessorKey: 'pos', header: 'POS', cell: ({ row }) => <span className="numeric">{count(row.original.pos)}</span> }, { accessorKey: 'stl', header: 'Settlement', cell: ({ row }) => <span className="numeric">{count(row.original.stl)}</span> }, { accessorKey: 'bank', header: 'Bank', cell: ({ row }) => <span className="numeric">{count(row.original.bank)}</span> }] },
        { header: 'Match rate', columns: [
                { id: 'r_pos_stl', header: 'POS → Settlement', accessorFn: r => ratio(r.pos_linked, r.pos), cell: ({ getValue }) => <RateCell label="POS → Settlement" value={getValue() as number | null}/> },
                { id: 'r_stl_pos', header: 'Settlement → POS', accessorFn: r => ratio(r.stl_pos, r.stl), cell: ({ getValue }) => <RateCell label="Settlement → POS" value={getValue() as number | null}/> },
                { id: 'r_stl_bank', header: 'Settlement → Bank', accessorFn: r => ratio(r.stl_bank, r.stl), cell: ({ getValue }) => <RateCell label="Settlement → Bank" value={getValue() as number | null}/> },
                { id: 'r_bank_stl', header: 'Bank → Settlement', accessorFn: r => ratio(r.bank_linked, r.bank), cell: ({ getValue }) => <RateCell label="Bank → Settlement" value={getValue() as number | null}/> },
                { id: 'r_full', header: 'End to end', accessorFn: r => ratio(r.full, r.pos), cell: ({ row }) => <button type="button" className={`rate-link ${row.original.full === 0 ? 'bad' : ''}`} onClick={() => onOpen(row.original)} aria-label={`Open linked tables for ${row.original.outlet || 'all outlets'}, ${row.original.period}`}><RateCell label="End to end" value={ratio(row.original.full,row.original.pos)}/><ArrowUpRight size={13} aria-hidden="true"/></button> }
            ] },
        { header: 'Money', columns: [{ accessorKey: 'pos_amount', header: 'POS Rp', cell: ({ row }) => <span className="numeric">{money(row.original.pos_amount || 0)}</span> }, { accessorKey: 'stl_nett', header: 'Settlement nett Rp', cell: ({ row }) => <span className="numeric">{money(row.original.stl_nett || 0)}</span> }, { accessorKey: 'bank_credit', header: 'Bank Rp', cell: ({ row }) => <span className="numeric">{money(row.original.bank_credit || 0)}</span> }, { accessorKey: 'gap_payout', header: 'Difference Rp', cell: ({ row }) => <span className="numeric">{money(row.original.gap_payout || 0)}</span> }] }
    ], [byOutlet, byProvider, onOpen]);
    const unassignedScope=new URLSearchParams(scope);unassignedScope.delete('outlet');unassignedScope.delete('provider');
    const unassignedHref=evidenceHref(params,unassignedScope.toString(),'credit_no_settlement');
    async function exportRows() {
        setExporting(true);
        setExportError('');
        try {
            const client=identity.client();
            const all: Rate[] = [];
            let start = 0;
            while (true) {
                const result = await api<Rates>('/analysis/rates?' + [scope, query({ period, by_outlet: byOutlet, by_provider: byProvider, below, search, sort, desc, offset: start, limit: 1000 })].filter(Boolean).join('&'),{headers:{'X-Kira-Client':client}});
                all.push(...result.rows);
                start += result.rows.length;
                if (start >= result.total)
                    break;
                if (!result.rows.length)
                    throw new Error('The matching results changed during export. Refresh and try again.');
            }
            const keys: (keyof Rate)[] = ['period', ...(byOutlet ? ['outlet' as const] : []), ...(byProvider ? ['provider' as const] : []), 'pos', 'stl', 'bank', 'pos_linked', 'stl_pos', 'stl_bank', 'bank_linked', 'full', 'pos_amount', 'stl_nett', 'bank_credit', 'gap_payout'];
            const csvValue = (value: unknown) => { let text = String(value ?? ''); if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text))
                text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
            const csv = [keys.join(','), ...all.map(row => keys.map(key => csvValue(row[key])).join(','))].join('\r\n');
            const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'kira-match-rates.csv';
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        catch (error) {
            setExportError((error as Error).message);
        }
        finally {
            setExporting(false);
        }
    }
    return <div className="rate-table-v2" data-tour="rate-header">
    <div className="rate-toolbar" data-tour="rate-toolbar" data-ready={!rates.loading&&!!rates.data&&!rates.error}>
      <div className="rate-grouping"><span>One row per</span><Segmented label="Group rates by period" value={period} onChange={value=>setting('period',value)} items={[{value:'day',label:'Day'},{value:'week',label:'Week'},{value:'month',label:'Month'},{value:'all',label:'Whole period'}]}/><span>and</span><ToggleChip label="Outlet" checked={byOutlet} onChange={value=>setting('by_outlet',String(value))}/><ToggleChip label="Provider" checked={byProvider} onChange={value=>setting('by_provider',String(value))}/></div>
      <div className="rate-tools"><Switch label="Only rows under 100%" checked={below} onChange={value=>setting('below',value?'1':'0')}/><input type="search" aria-label="Find in rate table" placeholder="Find in this table…" value={search} onChange={event=>{setSearch(event.target.value);setOffset(0);setSelected([]);}}/><Button disabled={exporting} onClick={exportRows}><Download size={15}/>{exporting?'Exporting…':'Export table'}</Button></div>
    </div>
    {exportError&&<p role="alert" className="error-inline">{exportError}</p>}
    <div data-tour="rate-ticks"><DataTable key={scope+period+byOutlet+byProvider+below+search+offset+limit} caption="Match rate" data={rates.data?.rows||[]} columns={columns} loading={rates.loading||rates.updating} error={rates.error} retry={rates.retry} columnPicker selectable density="compact" stickyColumns={byOutlet?2:1} onRowClick={row=>onOpen(row)} onSelectionChange={setSelected} server={{offset:activeOffset,limit,total:rates.data?.total||0,sort,desc,onPage:(next,size)=>{setOffset(next);setLimit(size);setSelected([]);},onSort:(next,descending)=>{setSort(next);setDesc(descending);setOffset(0);setSelected([]);}}} footer={rates.data&&<div className="rate-total"><strong>Total for selection</strong><span>{plural(rates.data.totals.pos,'sale')}</span><span>{plural(rates.data.totals.stl,'settlement')}</span><span>{plural(rates.data.totals.bank,'bank credit')}</span><strong>{percent(ratio(rates.data.totals.full,rates.data.totals.pos))} end to end</strong><span>POS <b>{money(rates.data.totals.pos_amount)}</b></span><span>Settlement <b>{money(rates.data.totals.stl_nett)}</b></span><span>Bank <b>{money(rates.data.totals.bank_credit)}</b></span><span>Difference <b>{money(rates.data.totals.gap_payout)}</b></span></div>}/></div>
    {selected.length>0&&<TickedSubtotal rows={selected}/>}
    {!!rates.data?.unassigned.credits&&<p className="table-note">{plural(rates.data.unassigned.credits,'bank credit')} ({money(rates.data.unassigned.amount)}) {rates.data.unassigned.credits===1?'has':'have'} no settlement and cannot be assigned to an outlet. <Link to={unassignedHref}>See it</Link></p>}
    <MoneyGaps scope={scope}/>
  </div>;
}
