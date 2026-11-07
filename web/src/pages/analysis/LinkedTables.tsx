import {useRovingFocus} from '../../components/useRovingFocus';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PayoutComparison from './PayoutComparison';
import type { ColumnDef } from '@tanstack/react-table';
import { Link2, X } from 'lucide-react';
import { Button, DataTable, Segmented, StatusChip } from '../../components';
import { clientPath, query } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { count, money } from '../../lib/format';
import type { SideResponse, SideRow, Stage } from './types';
interface SideSettings {
    offset: number;
    limit: number;
    status: string;
    search: string;
    sort: string;
    desc: boolean;
    aggregate: string;
}
const defaults: SideSettings = { offset: 0, limit: 20, status: '', search: '', sort: '', desc: false, aggregate: 'sum' };
const rowId = (row: SideRow) => String(row.n);
const amount = (row: SideRow, field: string) => Number(row.row[field] || 0);
const addQuery = (scope: string, params: Record<string, string | number | boolean>) => [scope, query(params)].filter(Boolean).join('&');
export default function LinkedTables({ scope, initialStage = 'l1', onStageChange }: {
    scope: string;
    initialStage?: Stage;
    onStageChange?: (stage: Stage) => void;
}) {
    const [stage, setStage] = useState<Stage>(initialStage);
    const [bankView, setBankView] = useState('linked');
    return <section className="linked-tables">
        <div className="table-toolbar">
            <Segmented label="Matching stage" value={stage} onChange={value => { setStage(value as Stage); onStageChange?.(value as Stage); }} items={[{ value: 'l1', label: '01 POS ↔ 02 Settlement' }, { value: 'l2', label: '02 Settlement ↔ 03 Bank' }]}/>
            {stage === 'l2' && <Segmented label="Bank evidence view" value={bankView} onChange={setBankView} items={[{value: 'linked', label: 'Linked records'}, {value: 'find', label: 'Find bank credits'}]}/>}
        </div>
        {stage === 'l2' && bankView === 'find' ? <PayoutComparison key={scope} scope={scope}/> : <StageTables key={`${stage}:${scope}`} stage={stage} scope={scope} onFindBank={() => setBankView('find')}/>}
    </section>;
}
function StageTables({ stage, scope, onFindBank }: {
    onFindBank: () => void;
    stage: Stage;
    scope: string;
}) {
    const [left, setLeft] = useState<SideSettings>(defaults), [right, setRight] = useState<SideSettings>(defaults);
    const [selection, setSelection] = useState<{
        side: 'left' | 'right';
        rows: SideRow[];
    } | null>(null);
    const [linkedOnly, setLinkedOnly] = useState(true);
    const links = [...new Set(selection?.rows.map(row => row.link).filter(Boolean))].join(',');
    const leftFiltered = !!selection && selection.side === 'right' && linkedOnly;
    const rightFiltered = !!selection && selection.side === 'left' && linkedOnly;
    const leftTable = stage === 'l1' ? 'pos' : 'settlement', rightTable = stage === 'l1' ? 'settlement' : 'bank';
    const leftLabel = stage === 'l1' ? 'POS' : 'Settlement', rightLabel = stage === 'l1' ? 'Settlement' : 'Bank';
    const leftField = stage === 'l1' ? 'payment_amount' : 'nett_amount', rightField = stage === 'l1' ? 'gross_amount' : 'kredit';
    const sidePath = (table: string, settings: SideSettings, filtered: boolean) => filtered && !links ? null : `/analysis/side/${stage}/${table}?${addQuery(scope, { offset: settings.offset, limit: settings.limit, link_status: settings.status, search: settings.search, sort: settings.sort, desc: settings.desc, links: filtered ? links : '' })}`;
    const leftResource = useResource<SideResponse>(sidePath(leftTable, left, leftFiltered));
    const rightResource = useResource<SideResponse>(sidePath(rightTable, right, rightFiltered));
    const total = (side: 'left' | 'right', data: SideResponse | undefined, field: string) => selection?.side === side ? selection.rows.reduce((sum, row) => sum + amount(row, field), 0) : data?.aggregates[field]?.sum ?? 0;
    const leftSum = total('left', leftResource.data, leftField), rightSum = total('right', rightResource.data, rightField);
    const pick = (side: 'left' | 'right', rows: SideRow[], visible: SideRow[]) => {
        const preserved = selection?.side === side ? selection.rows.filter(row => !visible.some(item => item.n === row.n)) : [];
        const all = [...preserved, ...rows];
        setSelection(all.length ? { side, rows: all } : null);
        if (side === 'left')
            setRight(previous => ({ ...previous, offset: 0 }));
        else
            setLeft(previous => ({ ...previous, offset: 0 }));
    };
    const selected = (side: 'left' | 'right') => Object.fromEntries((selection?.side === side ? selection.rows : []).map(row => [String(row.n), true]));
    const busy = leftResource.loading || rightResource.loading;
    const failed = leftResource.error || rightResource.error;
    const selectedCount = selection?.side === 'left' ? selection.rows.length : leftResource.data?.total || 0;
    const reason = new URLSearchParams(scope).get('reason');
    const missingBank = stage === 'l2' && !busy && !failed && selectedCount > 0 && !rightResource.data?.total && !right.search && !right.status && (reason === 'Not in bank yet' || rightFiltered && !links);
    return <>
    <div className="link-selection"><label className="inline"><input type="checkbox" checked={linkedOnly} onChange={event => { setLinkedOnly(event.target.checked); setLeft(v => ({ ...v, offset: 0 })); setRight(v => ({ ...v, offset: 0 })); }}/><Link2 size={16}/>Tick rows to show their links on the other side</label>{selection && <Button variant="quiet" onClick={() => { setSelection(null); setLeft(v => ({ ...v, offset: 0 })); setRight(v => ({ ...v, offset: 0 })); }}>Clear {selection.rows.length} selected rows<X size={14}/></Button>}</div>
    <div className="tick-tie" aria-label="Tick and tie totals"><div><small>{selection ? 'Selected trail' : 'Current selection'}</small><h3>Tick &amp; tie</h3></div><div><small>{leftLabel} {leftField.replaceAll('_', ' ')}</small><strong>{busy ? '…' : failed ? '—' : money(leftSum)}</strong></div><span aria-hidden="true">−</span><div><small>{rightLabel} {rightField.replaceAll('_', ' ')}</small><strong>{busy ? '…' : failed ? '—' : money(rightSum)}</strong></div><div><small>Difference</small><strong className={!busy && !failed && leftSum !== rightSum ? 'error-text' : ''}>{busy ? '…' : failed ? '—' : money(leftSum - rightSum)}</strong></div></div>
    {!busy && !failed && <p className="visual-summary"><strong>{count(selectedCount)}</strong> {stage === "l1" ? "POS sales" : "settlements"}{new URLSearchParams(scope).get("reason") ? ` marked “${new URLSearchParams(scope).get("reason")}”` : " in this selection"}; <strong>{money(leftSum - rightSum)}</strong> difference from the {stage === "l1" ? "settlement" : "bank"} side.{stage === 'l2' && ' An unlinked amount does not confirm missing money.'}</p>}
    <div className="linked-grid">
      <SidePanel label={leftLabel} noun={stage === 'l1' ? 'sales' : 'settlements'} resource={leftResource} field={leftField} settings={left} change={setLeft} selectedIds={selected('left')} onPick={rows => pick('left', rows, leftResource.data?.rows || [])} onLink={row => pick('left', [row], leftResource.data?.rows || [])} filtered={leftFiltered}/>
      <SidePanel label={rightLabel} noun={stage === 'l1' ? 'settlements' : 'bank credits'} resource={rightResource} field={rightField} settings={right} change={setRight} selectedIds={selected('right')} onPick={rows => pick('right', rows, rightResource.data?.rows || [])} onLink={row => pick('right', [row], rightResource.data?.rows || [])} filtered={rightFiltered} emptyEvidence={missingBank ? <div className="empty">
          <h3>No linked bank credit</h3>
          <p><strong>{count(selectedCount)}</strong> settlements have no linked bank credit in this selection.</p>
          <p><span>Not linked amount</span>: <strong>{money(leftSum)}</strong></p>
          <p>A credit may still exist in the bank statement. Compare the payout amount and possible credits.</p>
          <div className="table-toolbar"><Button onClick={onFindBank}>Find bank credits</Button>
            <Link className="button secondary" to={clientPath(`/analysis?${addQuery(scope, {tab:'follow'})}`)}>Open follow-up list</Link></div>
        </div> : undefined}/>
    </div>
  </>;
}
function SidePanel({ label, noun, resource, field, settings, change, selectedIds, onPick, onLink, filtered, emptyEvidence }: {
    label: string;
    noun: string;
    resource: ReturnType<typeof useResource<SideResponse>>;
    field: string;
    settings: SideSettings;
    change: (settings: SideSettings | ((previous: SideSettings) => SideSettings)) => void;
    selectedIds: Record<string, boolean>;
    onPick: (rows: SideRow[]) => void;
    onLink: (row: SideRow) => void;
    filtered: boolean;
    emptyEvidence?: ReactNode;
}) {
    const data = resource.data;
    const statusFocus=useRovingFocus(['','Linked','Review','Not found'],{initial:settings.status});
    const columns = useMemo<ColumnDef<SideRow, unknown>[]>(() => [
        { id: 'key', accessorKey: 'key', header: 'Reference', cell: ({ row }) => <span className="reference">{row.original.key}</span> },
        { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusChip tone={row.original.status === 'Linked' ? 'green' : row.original.status === 'Review' ? 'amber' : 'red'}>{row.original.status}</StatusChip> },
        { accessorKey: 'link', header: 'Link', cell: ({ row }) => row.original.link ? <button type="button" className="text-button" onClick={() => onLink(row.original)}>{row.original.link}</button> : <span className="muted">No link</span> },
        { id: field, header: field.replaceAll('_', ' '), accessorFn: row => amount(row, field), cell: ({ row }) => <span className="numeric">{money(amount(row.original, field))}</span> },
        { accessorKey: 'outlet', header: 'Outlet' }, { accessorKey: 'day', header: 'Date' }, { accessorKey: 'rule', header: 'Rule' },
        ...(data?.columns || []).filter(column => column.name !== field && !['reference', 'id'].includes(column.name)).map(column => ({ id: `row.${column.name}`, header: column.name.replaceAll('_', ' '), accessorFn: (row: SideRow) => row.row[column.name], cell: ({ getValue }: {
                getValue: () => unknown;
            }) => <span className={column.type === 'number' ? 'numeric' : ''}>{String(getValue() ?? '—')}</span> }))
    ], [field, data?.columns, onLink]);
    const aggregate = data?.aggregates[field];
    const aggregateValue = !aggregate ? 0 : settings.aggregate === 'avg' ? aggregate.sum / (aggregate.count || 1) : settings.aggregate === 'count' ? aggregate.count : settings.aggregate === 'sum' ? aggregate.sum : settings.aggregate === 'min' ? aggregate.min : aggregate.max;
    return <section className="side-panel" aria-label={`${label} linked records`}><header className="side-head"><h2>{label}</h2><span>{resource.loading ? 'Loading…' : `${count(data?.total || 0)} ${noun}`}</span></header>
    <div className="status-filters" role="group" aria-label={`${label} link status`}>{['', 'Linked', 'Review', 'Not found'].map(status => <button type="button" key={status} {...statusFocus(status)} aria-pressed={settings.status === status} onClick={() => change(previous => ({ ...previous, status, offset: 0 }))}>{status || 'All'} <span>{count(status ? data?.counts[status] || 0 : Object.values(data?.counts || {}).reduce((a, b) => a + b, 0))}</span></button>)}</div>
    {filtered && <p className="table-note">Showing links from the ticked rows on the other side.</p>}
    <input className="side-search" type="search" aria-label={`Search ${label} records`} placeholder={`Find in ${label.toLowerCase()}…`} value={settings.search} onChange={event => change(previous => ({ ...previous, search: event.target.value, offset: 0 }))}/>
    {emptyEvidence || <DataTable data={data?.rows || []} columns={columns} caption={label} loading={resource.loading} error={resource.error} retry={resource.retry} columnPicker selectable getRowId={rowId} selectedIds={selectedIds} onSelectionChange={onPick} server={{ offset: settings.offset, limit: settings.limit, total: data?.total || 0, sort: settings.sort, desc: settings.desc, onPage: (offset, limit) => change(previous => ({ ...previous, offset, limit })), onSort: (sort, desc) => change(previous => ({ ...previous, sort: sort.replace(/^row\./, ''), desc, offset: 0 })) }} emptyTitle={`No ${label.toLowerCase()} rows in this selection`} emptyDescription="No corresponding rows were found. Clear the row selection or change the filters to inspect another trail." footer={<div className="aggregate-footer"><label className="inline">{field.replaceAll('_', ' ')}<select aria-label={`${label} aggregate`} value={settings.aggregate} onChange={event => change(previous => ({ ...previous, aggregate: event.target.value }))}>{['sum', 'avg', 'min', 'max', 'count'].map(value => <option key={value}>{value}</option>)}</select></label><strong>{aggregateValue == null ? '—' : settings.aggregate === 'count' ? count(aggregateValue) : money(aggregateValue)}</strong></div>}/>}
  </section>;
}
