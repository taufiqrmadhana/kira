import { useMemo, useState } from 'react';
import './payout-comparison.css';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Button, DataTable, Empty, ErrorState, Loading, StatusChip } from '../../components';
import { clientPath, query } from '../../lib/api';
import { count, date, money } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import {ForceMatchCard, ForceMatchHistory} from './ForceMatch';

interface Withdrawal { n: number; amount: number | null; day: string; row: Record<string, unknown> }
interface BankCandidate {
    bank_n: number; bank_credit: number; day: string; delay_days: number;
    linked: boolean; link: string; row: Record<string, unknown>; evidence_token: string;
}
interface PayoutGroup {
    id: string; entity_id: string; outlet: string; day: string;
    selected_count: number; group_count: number; net_settled: number | null;
    withdrawals: Withdrawal[]; candidates: BankCandidate[]; warning?: string;
    force_match_eligible: boolean;
}
interface ComparisonResponse { total: number; offset: number; limit: number; groups: PayoutGroup[] }
const displayMoney = (value: number | null | undefined) => value == null ? 'Unavailable' : money(value);
const reference = (row: Record<string, unknown>, fallback: string) => String(row.transaction_id || row.external_reference_id || row.reference || fallback);

export default function PayoutComparison({ scope, allowForceMatch = false }: { scope: string; allowForceMatch?: boolean }) {
    return <PayoutSearch key={scope} scope={scope} allowForceMatch={allowForceMatch} />;
}

function PayoutSearch({ scope, allowForceMatch }: { scope: string; allowForceMatch: boolean }) {
    const [notice,setNotice]=useState('');
    const [maxDays, setMaxDays] = useState(3), [offset, setOffset] = useState(0), [groupId, setGroupId] = useState('');
    const path = '/analysis/payout-comparison?' + [scope, query({ min_days: 0, max_days: maxDays, offset, limit: 20 })].filter(Boolean).join('&');
    const resource = useResource<ComparisonResponse>(path);
    const groups = resource.data?.groups || [];
    const group = groups.find(item => item.id === groupId) || groups.find(item=>item.force_match_eligible&&item.candidates.some(bank=>!bank.linked)) || groups[0];
    const ready = !resource.loading && resource.path === path;
    return <section className="payout-comparison" aria-label="Find bank credits">
        {notice&&<p role="status" className="notice">{notice}</p>}
        <ForceMatchHistory scope={scope}/>
        <p className="payout-intro">Compare a daily payout with possible bank credits. Credits can appear after the settlement date or have a different amount.</p>
        <div className="payout-search-controls">
            <label>Bank arrival<select aria-label="Bank arrival" value={maxDays} onChange={event => { setMaxDays(Number(event.target.value)); setOffset(0); setGroupId(''); }}>
                {[3, 7, 14, 30].map(days => <option key={days} value={days}>Same day to {days} days later</option>)}
            </select></label>
            {ready && !resource.error && group && <label className="payout-group-picker">Daily payout<select aria-label="Daily payout" value={group.id} onChange={event => setGroupId(event.target.value)}>
                {groups.map(item => <option key={item.id} value={item.id}>{item.outlet || item.entity_id || 'Unknown outlet'} — {date(item.day)}</option>)}
            </select></label>}
        </div>
        {!ready ? <Loading /> : resource.error ? <ErrorState message={resource.error} retry={resource.retry} /> : !group ?
            <Empty title="No settlement payouts in this selection">Clear the result filter or choose another outlet and date.</Empty> : <>
                {(resource.data?.total || 0) > 20 && <div className="pagination"><span>Payouts {offset + 1}–{offset + groups.length} of {count(resource.data!.total)}</span><div>
                    <Button disabled={!offset} onClick={() => { setOffset(Math.max(0, offset - 20)); setGroupId(''); }}>Previous payouts</Button>
                    <Button disabled={offset + 20 >= resource.data!.total} onClick={() => { setOffset(offset + 20); setGroupId(''); }}>Next payouts</Button>
                </div></div>}
                <PayoutEvidence key={group.id + ':' + maxDays} group={group} scope={scope} maxDays={maxDays} allowForceMatch={allowForceMatch} onSaved={()=>{setNotice('Force match saved. Results have been refreshed; the accepted difference remains visible under Expected.');window.dispatchEvent(new Event('kira:data-changed'));}} />
            </>}
    </section>;
}

function SourceFields({ row }: { row: Record<string, unknown> }) {
    const [open, setOpen] = useState(false);
    return <details className="payout-source" onToggle={event => setOpen(event.currentTarget.open)}><summary>Source details</summary>{open && <dl>{Object.entries(row).map(([key, value]) =>
        <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value == null ? '—' : String(value)}</dd></div>)}</dl>}</details>;
}

function PayoutEvidence({ group, scope, maxDays, onSaved, allowForceMatch }: { allowForceMatch: boolean; group: PayoutGroup; scope: string; maxDays: number; onSaved:()=>void }) {
    const [forcing,setForcing]=useState(false);
    const [withdrawalId, setWithdrawalId] = useState<number | null>(group.withdrawals.length === 1 ? group.withdrawals[0].n : null);
    const [bankId, setBankId] = useState<number | null>(null), [status, setStatus] = useState('unlinked'), [search, setSearch] = useState(''), [maxDifference, setMaxDifference] = useState('');
    const withdrawal = group.withdrawals.find(item => item.n === withdrawalId);
    const candidates = group.candidates.filter(item => {
        if (status === 'unlinked' && item.linked || status === 'linked' && !item.linked) return false;
        if (search && !Object.values(item.row).join(' ').toLowerCase().includes(search.toLowerCase())) return false;
        return maxDifference === '' || withdrawal?.amount == null || Math.abs(withdrawal.amount - item.bank_credit) <= Number(maxDifference);
    });
    const bank = candidates.find(item => item.bank_n === bankId);
    const difference = bank && withdrawal?.amount != null ? withdrawal.amount - bank.bank_credit : null;
    // A partial withdrawal cannot explain the net total of a day with several withdrawals.
    const netDifference = group.withdrawals.length === 1 && group.net_settled != null && withdrawal?.amount != null ? group.net_settled - withdrawal.amount : null;
    const available = group.candidates.filter(item => !item.linked).length;
    const withdrawalColumns = useMemo<ColumnDef<Withdrawal, unknown>[]>(() => [
        { id: 'choice', header: 'Compare', enableSorting: false, cell: ({ row }) => <Button aria-label={`Compare withdrawal ${row.original.n}`} aria-pressed={withdrawalId === row.original.n} onClick={() => { setWithdrawalId(row.original.n); setBankId(null); }}>{withdrawalId === row.original.n ? 'Selected' : 'Choose'}</Button> },
        { id: 'reference', header: 'Withdrawal', accessorFn: item => reference(item.row, `Row ${item.n}`), cell: ({ row }) => <><span className="payout-reference">{reference(row.original.row, `Row ${row.original.n}`)}</span><small className="muted">{date(row.original.day)}</small><SourceFields row={row.original.row} /></> },
        { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => <span className="numeric">{displayMoney(row.original.amount)}</span> },
    ], [withdrawalId]);
    const bankColumns = useMemo<ColumnDef<BankCandidate, unknown>[]>(() => [
        { id: 'choice', header: 'Compare', enableSorting: false, cell: ({ row }) => <Button aria-label={`Compare bank credit ${row.original.bank_n}`} aria-pressed={bankId === row.original.bank_n} onClick={() => setBankId(row.original.bank_n)}>{bankId === row.original.bank_n ? 'Selected' : 'Compare'}</Button> },
        { id: 'evidence', header: 'Bank evidence', accessorFn: item => String(item.row.keterangan || reference(item.row, `Row ${item.bank_n}`)), cell: ({ row }) => <><span className="payout-reference">{String(row.original.row.keterangan || reference(row.original.row, `Row ${row.original.bank_n}`))}</span><small className="muted">{date(row.original.day)} · {row.original.delay_days} days later</small><StatusChip tone="neutral">{row.original.linked ? `Linked: ${row.original.link}` : 'Not linked'}</StatusChip><SourceFields row={row.original.row} /></> },
        { accessorKey: 'bank_credit', header: 'Credit', cell: ({ row }) => <span className="numeric">{money(row.original.bank_credit)}</span> },
        { id: 'difference', header: 'Withdrawal − credit', accessorFn: item => withdrawal?.amount == null ? undefined : withdrawal.amount - item.bank_credit, cell: ({ row }) => <span className="numeric">{withdrawal?.amount == null ? 'Choose withdrawal' : money(withdrawal.amount - row.original.bank_credit)}</span> },
    ], [bankId, withdrawal]);
    return <>
        <p className="payout-scope">{count(group.selected_count)} of {count(group.group_count)} settlements are in the current filter. The payout uses the full daily group for store {group.entity_id || 'unknown'}.</p>
        {group.warning && <p role="status" className="notice">{group.warning}</p>}
        {group.withdrawals.length > 1 && <p className="notice">This day has several withdrawals. Choose a withdrawal before comparing a bank credit.</p>}
        {difference != null && bank && withdrawal && <section className="payout-selected" aria-label="Selected comparison" aria-live="polite">
            <dl>
                <div><dt>Selected withdrawal</dt><dd>{displayMoney(withdrawal.amount)}</dd></div>
                <div><dt>Selected bank credit</dt><dd>{money(bank.bank_credit)}</dd></div>
                <div><dt>{difference > 0 ? 'Credit is lower by' : difference < 0 ? 'Credit is higher by' : 'Amounts agree'}</dt><dd>{money(Math.abs(difference))}</dd></div>
                {netDifference != null && <div><dt>Net settlement − withdrawal</dt><dd>{money(netDifference)}</dd></div>}
            </dl>
            <p>This comparison does not change matching results. Confirm the payout evidence before recording a follow-up.</p>
            {netDifference != null && netDifference !== 0 && <p>The net-to-withdrawal difference is separate from the bank difference. Check the payout rounding or fee policy.</p>}
            {bank.linked && <p className="notice">This credit already belongs to link {bank.link}. Check that link before treating it as this payout.</p>}
            {allowForceMatch&&group.force_match_eligible&&!bank.linked&&<Button variant="primary" aria-label="Force Match selected payout" onClick={()=>setForcing(true)}>Force Match</Button>}
            <Link className="button secondary" to={clientPath('/analysis?' + [scope, 'tab=follow'].filter(Boolean).join('&'))}>Open follow-up list</Link>
        </section>}
        {allowForceMatch&&forcing&&bank&&withdrawal?.amount!=null&&group.net_settled!=null&&<ForceMatchCard evidence={{groupId:group.id,outlet:group.outlet,day:group.day,count:group.group_count,net:group.net_settled,withdrawal:withdrawal.amount,withdrawalN:withdrawal.n,bank:bank.bank_credit,bankN:bank.bank_n,bankDay:bank.day,delay:bank.delay_days,token:bank.evidence_token,maxDays}} onClose={()=>setForcing(false)} onSaved={()=>{setForcing(false);onSaved();}}/>}
        <div className="payout-grid">
            <section className="payout-side" aria-label="Settlement payout evidence">
                <header><h3>Settlement payout</h3><span>{count(group.group_count)} settlements</span></header>
                <dl className="payout-net"><dt>Net settled for the full day</dt><dd>{displayMoney(group.net_settled)}</dd></dl>
                <DataTable key={group.id} caption="Withdrawals" data={group.withdrawals} columns={withdrawalColumns} getRowId={item => String(item.n)} emptyTitle="No withdrawal found for this day" emptyDescription="Check the provider payout report. A net settlement total alone does not confirm the amount sent to the bank." />
            </section>
            <section className="payout-side" aria-label="Possible bank credits">
                <header><h3>Possible bank credits</h3><span>{count(available)} not linked, {count(group.candidates.length - available)} linked</span></header>
                <p className="muted">Store ID in the description; {date(group.day)} through {maxDays} days later. These are possible credits, not confirmed matches.</p>
                <div className="payout-bank-filters">
                    <label>Bank credit status<select aria-label="Bank credit status" value={status} onChange={event => { setStatus(event.target.value); setBankId(null); }}><option value="unlinked">Not linked</option><option value="all">All possible credits</option><option value="linked">Already linked</option></select></label>
                    <label>Maximum difference (Rp)<input aria-label="Maximum difference (Rp)" type="number" min="0" step="1" placeholder="Any amount" disabled={withdrawal?.amount == null} value={maxDifference} onChange={event => { setMaxDifference(event.target.value === '' ? '' : String(Math.max(0, Number(event.target.value)))); setBankId(null); }} /></label>
                    <label className="payout-bank-search">Find bank text<input type="search" aria-label="Find bank text" placeholder="Reference or bank description" value={search} onChange={event => { setSearch(event.target.value); setBankId(null); }} /></label>
                </div>
                <DataTable key={status + search + maxDifference} caption="Possible credits" data={candidates} columns={bankColumns} getRowId={item => String(item.bank_n)} emptyTitle="No possible credits in this view" emptyDescription="Try All possible credits, clear the bank filters, or widen Bank arrival. Check the bank statement if the store ID is absent." />
            </section>
        </div>
    </>;
}
