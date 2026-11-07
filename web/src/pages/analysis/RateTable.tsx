import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Download } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button, DataTable, Empty, ErrorState, Loading, StatusChip } from '../../components';
import { api, query } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { count, date, money, percent } from '../../lib/format';
import { ratio } from './types';
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
    }[];
    explained: number;
    unexplained: number;
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
    const gaps = useResource<Gaps>('/analysis/gaps?' + scope);
    const setting = (key: string, value: string) => { setOffset(0); setSelected([]); setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; }); };
    const columns = useMemo<ColumnDef<Rate, unknown>[]>(() => [
        { accessorKey: 'period', header: 'Period', cell: ({ row }) => !row.original.period || row.original.period === 'all' ? 'Whole period' : row.original.period.length === 10 ? date(row.original.period) : row.original.period },
        ...(byOutlet ? [{ accessorKey: 'outlet', header: 'Outlet' }] : []), ...(byProvider ? [{ accessorKey: 'provider', header: 'Provider' }] : []),
        { header: 'Rows', columns: [{ accessorKey: 'pos', header: 'POS', cell: ({ row }) => <span className="numeric">{count(row.original.pos)}</span> }, { accessorKey: 'stl', header: 'Settlement', cell: ({ row }) => <span className="numeric">{count(row.original.stl)}</span> }, { accessorKey: 'bank', header: 'Bank', cell: ({ row }) => <span className="numeric">{count(row.original.bank)}</span> }] },
        { header: 'Match rate', columns: [
                { id: 'r_pos_stl', header: 'POS → Settlement', accessorFn: r => ratio(r.pos_linked, r.pos), cell: ({ getValue }) => <span className="numeric">{percent(getValue() as number | null)}</span> },
                { id: 'r_stl_pos', header: 'Settlement → POS', accessorFn: r => ratio(r.stl_pos, r.stl), cell: ({ getValue }) => <span className="numeric">{percent(getValue() as number | null)}</span> },
                { id: 'r_stl_bank', header: 'Settlement → Bank', accessorFn: r => ratio(r.stl_bank, r.stl), cell: ({ getValue }) => <span className="numeric">{percent(getValue() as number | null)}</span> },
                { id: 'r_bank_stl', header: 'Bank → Settlement', accessorFn: r => ratio(r.bank_linked, r.bank), cell: ({ getValue }) => <span className="numeric">{percent(getValue() as number | null)}</span> },
                { id: 'r_full', header: 'End to end', accessorFn: r => ratio(r.full, r.pos), cell: ({ row }) => <button type="button" className={`rate-link ${row.original.full === 0 ? 'bad' : ''}`} onClick={() => onOpen(row.original)} aria-label={`Open linked tables for ${row.original.outlet || 'all outlets'}, ${row.original.period}`}>{percent(ratio(row.original.full, row.original.pos))}<ArrowUpRight size={13}/></button> }
            ] },
        { header: 'Money', columns: [{ accessorKey: 'pos_amount', header: 'POS amount', cell: ({ row }) => <span className="numeric">{money(row.original.pos_amount || 0)}</span> }, { accessorKey: 'stl_nett', header: 'Settlement nett', cell: ({ row }) => <span className="numeric">{money(row.original.stl_nett || 0)}</span> }, { accessorKey: 'bank_credit', header: 'Bank credit', cell: ({ row }) => <span className="numeric">{money(row.original.bank_credit || 0)}</span> }, { accessorKey: 'gap_payout', header: 'Payout difference', cell: ({ row }) => <span className="numeric">{money(row.original.gap_payout || 0)}</span> }] }
    ], [byOutlet, byProvider, onOpen]);
    const chosenTotal = selected.reduce((sum, row) => ({ pos: sum.pos + row.pos, full: sum.full + row.full }), { pos: 0, full: 0 });
    async function exportRows() {
        setExporting(true);
        setExportError('');
        try {
            const all: Rate[] = [];
            let start = 0;
            while (true) {
                const result = await api<Rates>('/analysis/rates?' + [scope, query({ period, by_outlet: byOutlet, by_provider: byProvider, below, search, sort, desc, offset: start, limit: 1000 })].filter(Boolean).join('&'));
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
    return <>
    <div className="table-toolbar" data-ready={!rates.loading && !gaps.loading && !!rates.data && !!gaps.data && !rates.error && !gaps.error}><div><span>One row per</span><select aria-label="Group rates by period" value={period} onChange={event => setting('period', event.target.value)}>{['day', 'week', 'month', 'all'].map(value => <option key={value} value={value}>{value === 'all' ? 'Whole period' : value[0].toUpperCase() + value.slice(1)}</option>)}</select><span>and</span><label className="inline"><input type="checkbox" checked={byOutlet} onChange={event => setting('by_outlet', String(event.target.checked))}/>Outlet</label><label className="inline"><input type="checkbox" checked={byProvider} onChange={event => setting('by_provider', String(event.target.checked))}/>Provider</label></div><div><label className="inline"><input type="checkbox" role="switch" checked={below} onChange={event => setting('below', event.target.checked ? '1' : '0')}/>Only rows under 100%</label><input type="search" aria-label="Find in rate table" placeholder="Find in this table…" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); setSelected([]); }}/><Button disabled={exporting} onClick={exportRows}><Download size={15}/>{exporting ? 'Exporting…' : 'Export table'}</Button></div></div>
    {exportError && <p role="alert" className="error-inline">{exportError}</p>}
    <DataTable key={scope + period + byOutlet + byProvider + below + search + offset + limit} caption="Match rate" data={rates.data?.rows || []} columns={columns} loading={rates.loading || rates.updating} error={rates.error} retry={rates.retry} columnPicker selectable onSelectionChange={setSelected} server={{ offset: activeOffset, limit, total: rates.data?.total || 0, sort, desc, onPage: (next, size) => { setOffset(next); setLimit(size); setSelected([]); }, onSort: (next, descending) => { setSort(next); setDesc(descending); setOffset(0); setSelected([]); } }} footer={rates.data && <div className="totals-row"><strong>Total for selection</strong><span>{count(rates.data.totals.pos)} sales</span><strong>{percent(ratio(rates.data.totals.full, rates.data.totals.pos))} end to end</strong></div>}/>
    {selected.length > 0 && <p className="selection-subtotal" role="status">{selected.length} ticked rows: {count(chosenTotal.pos)} sales, {percent(ratio(chosenTotal.full, chosenTotal.pos))} end to end</p>}
    {!!rates.data?.unassigned.credits && <p className="table-note">{count(rates.data.unassigned.credits)} bank credits ({money(rates.data.unassigned.amount)}) have no settlement and cannot be assigned to an outlet.</p>}
    <section className="money-gaps"><div className="section-head"><div><h2>Where the money differs</h2><p>Expected differences and items to investigate.</p></div>{gaps.data && <div className="gap-totals"><span>Expected <strong>{money(gaps.data.explained)}</strong></span><span>To check <strong>{money(gaps.data.unexplained)}</strong></span></div>}</div>{gaps.loading ? <Loading /> : gaps.error ? <ErrorState message={gaps.error} retry={gaps.retry}/> : !gaps.data?.kinds.length ? <Empty title="No money differences"/> : gaps.data.kinds.map(kind => <div className="gap-row" key={kind.kind}><StatusChip tone={kind.explained ? 'green' : 'amber'}>{kind.explained ? 'Expected' : 'To check'}</StatusChip><strong>{kind.label}</strong><span>{count(kind.count)} records</span><strong className="numeric">{money(kind.amount)}</strong></div>)}</section>
  </>;
}
