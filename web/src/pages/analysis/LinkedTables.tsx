import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Landmark, Link2, X } from 'lucide-react';
import { Button, DataTable, Segmented, StatusChip, LinkChip } from '../../components';
import { EvidenceText } from '../../components/EvidenceText';
import { useRovingFocus } from '../../components/useRovingFocus';
import { api, clientPath, query } from '../../lib/api';
import {columnLabel} from '../../lib/columns';
import ManualLinks from './ManualLinks';
import type {ResultRecord,RecordsResponse} from './RecordsTable';
import './linked-tables-v2.css';
import {revealLinkedEvidence} from '../../lib/evidenceMotion';
import {useReducedMotion,useAnimatedNumber} from '../../lib/motion';
import { useResource } from '../../lib/useResource';
import { count, date, money, plural } from '../../lib/format';
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
const fieldLabels: Record<string, string> = { payment_amount: 'Sale amount', nett_amount: 'Nett amount', gross_amount: 'Gross amount', kredit: 'Bank credit' };

export type CompareSelection=(record:ResultRecord,banks:Record<string,Record<string,unknown>>,origin?:HTMLElement)=>void;
export default function LinkedTables({ scope, initialStage = 'l1', onStageChange,onCompare }: {
    scope: string;
    initialStage?: Stage;
    onStageChange?: (stage: Stage) => void;
    onCompare?:CompareSelection;
}) {
    const [stage, setStage] = useState<Stage>(initialStage);
    return <section className="linked-tables">
        <div className="match-map-heading" data-tour="match-map-heading">
            <div><h2>Compare the evidence</h2><p>Follow a payment from its source to the money received.</p></div>
            <Segmented label="Matching stage" value={stage} onChange={value => { setStage(value as Stage); onStageChange?.(value as Stage); }} items={[{ value: 'l1', label: 'POS → Settlement' }, { value: 'l2', label: 'Settlement → Bank' }]}/>
        </div>
        <StageTables key={`${stage}:${scope}`} stage={stage} scope={scope} onCompare={onCompare}/>
    </section>;
}
function StageTables({ stage, scope,onCompare }: { stage: Stage; scope: string;onCompare?:CompareSelection }) {
    const [left, setLeft] = useState<SideSettings>(defaults), [right, setRight] = useState<SideSettings>(defaults);
    const [selections,setSelections]=useState<{left:SideRow[];right:SideRow[]}>({left:[],right:[]});
    const [activeSide,setActiveSide]=useState<'left'|'right'|null>(null);
    const selection=activeSide&&selections[activeSide].length?{side:activeSide,rows:selections[activeSide]}:null;
    const [compareError,setCompareError]=useState(''),[comparing,setComparing]=useState(false);
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
    const total = (side: 'left' | 'right', data: SideResponse | undefined, field: string) => selections[side].length ? selections[side].reduce((sum, row) => sum + amount(row, field), 0) : data?.aggregates[field]?.sum ?? 0;
    const leftSum = total('left', leftResource.data, leftField), rightSum = total('right', rightResource.data, rightField);
    const selectedCount = selections.left.length || leftResource.data?.total || 0;
    const reason = new URLSearchParams(scope).get('reason');
    const busy = leftResource.loading || rightResource.loading || leftResource.updating || rightResource.updating;
    const failed = leftResource.error || rightResource.error;
    const missingBank = stage === 'l2' && !busy && !failed && selectedCount > 0 && !rightResource.data?.total && !right.search && !right.status && (reason === 'Not in bank yet' || rightFiltered && !links);
    const clearSelection = () => { setSelections({left:[],right:[]});setActiveSide(null); setLeft(v => ({ ...v, offset: 0 })); setRight(v => ({ ...v, offset: 0 })); };
    const run=useResource<{converted:boolean;matching:{l1:{run_id?:number};l2:{run_id?:number}}}>('/status');
    const runKey=`${run.data?.matching?.l1?.run_id}:${run.data?.matching?.l2?.run_id}:${run.data?.converted}`;
    const lastRun=useRef(runKey);
    useEffect(()=>{if(lastRun.current!==runKey){clearSelection();lastRun.current=runKey;}},[runKey]);
    const pick = (side: 'left' | 'right', rows: SideRow[], visible: SideRow[]) => {
        const preserved = selections[side].filter(row => !visible.some(item => item.n === row.n));
        const all = [...preserved, ...rows];
        setSelections(previous=>({...previous,[side]:all}));setActiveSide(all.length?side:null);
        if (side === 'left') setRight(previous => ({ ...previous, offset: 0 }));
        else setLeft(previous => ({ ...previous, offset: 0 }));
    };
    const selected = (side: 'left' | 'right') => Object.fromEntries(selections[side].map(row => [String(row.n), true]));
    const selectedTotal=selections.left.length+selections.right.length;
    useEffect(()=>{window.dispatchEvent(new CustomEvent('kira:selection',{detail:{keys:[...new Set([...selections.left,...selections.right].map(row=>row.key))]}}));return()=>{window.dispatchEvent(new CustomEvent('kira:selection',{detail:{keys:[]}}));};},[selections]);
    async function compare(row:SideRow,origin:HTMLElement){
        if(!onCompare||comparing)return;setComparing(true);setCompareError('');
        try{const result=await api<RecordsResponse>(`/analysis/records?ids=${row.rec}&limit=1`);if(!result.records?.[0])throw new Error('This record changed. Refresh the evidence and try again.');onCompare(result.records[0],result.banks,origin);}
        catch(error){setCompareError(error instanceof Error?error.message:'Could not read this record. Try again.');}finally{setComparing(false);}
    }
    const animatedDifference=useAnimatedNumber(leftSum-rightSum,{duration:300});
    const displayAmount = (value: number) => busy ? '…' : failed ? '—' : money(value);
    return <>
        <div className="link-selection">
            <label className="inline"><input type="checkbox" checked={linkedOnly} onChange={event => { setLinkedOnly(event.target.checked); setLeft(v => ({ ...v, offset: 0 })); setRight(v => ({ ...v, offset: 0 })); }}/><Link2 size={16}/>Tick rows to show their links on the other side</label>
            {selectedTotal>0 && <Button variant="quiet" onClick={clearSelection}>Clear {plural(selectedTotal,'selected row')}<X size={14}/></Button>}
        </div>
        {comparing&&<p role="status">Opening the payment evidence…</p>}{compareError&&<p className="error-inline" role="alert">{compareError} Select the reference to retry.</p>}
        <div data-ready={!busy && !failed} className={`linked-grid${missingBank ? ' linked-grid--missing-bank' : ''}`}>
            <SidePanel label={leftLabel} noun={stage === 'l1' ? 'sales' : 'settlements'} resource={leftResource} field={leftField} settings={left} change={setLeft} selectedIds={selected('left')} onPick={rows => pick('left', rows, leftResource.data?.rows || [])} onLink={row => pick('left', [row], leftResource.data?.rows || [])} onCompare={onCompare?(row,origin)=>void compare(row,origin):undefined} filtered={leftFiltered}/>
            <SidePanel label={rightLabel} noun={stage === 'l1' ? 'settlements' : 'bank credits'} resource={rightResource} field={rightField} settings={right} change={setRight} selectedIds={selected('right')} onPick={rows => pick('right', rows, rightResource.data?.rows || [])} onLink={row => pick('right', [row], rightResource.data?.rows || [])} onCompare={onCompare?(row,origin)=>void compare(row,origin):undefined} filtered={rightFiltered} emptyEvidence={missingBank ? <div className="missing-bank-evidence">
                <div className="missing-bank-mark" aria-hidden="true"><Landmark size={24}/></div>
                <h3>No bank credit found</h3>
                <p><strong>{count(selectedCount)}</strong> {selectedCount===1?'settlement has':'settlements have'} no linked bank credit in this selection.</p>
                <dl><dt>Not in the bank yet</dt><dd>{money(leftSum)}</dd></dl>
                <p>Check the provider payout against your bank statement, then record the next step in the follow-up list.</p>
                <Link className="button" to={clientPath(`/analysis?${addQuery(scope, {tab:'follow'})}`)}>Open follow-up list<ArrowRight size={16}/></Link>
            </div> : undefined}/>
        </div>
        <section className="trail-comparison" data-tour="tick-tie" aria-label="Tick and tie totals">
            <dl>
                <div><dt>{stage === 'l1' ? 'POS sales' : 'Nett settled'}</dt><dd>{displayAmount(leftSum)}</dd></div>
                <div><dt>{stage === 'l1' ? 'Gross settled' : 'In the bank'}</dt><dd>{displayAmount(rightSum)}</dd></div>
                <div className={!busy && !failed && leftSum !== rightSum ? 'trail-difference' : ''}><dt>Difference</dt><dd>{displayAmount(animatedDifference)}</dd></div>
            </dl>
            {!busy && !failed && <p className="visual-summary"><strong>{count(selectedCount)}</strong> {stage === 'l1' ? 'POS sales' : 'settlements'}{reason ? ` marked “${reason}”` : selection ? ' in the selected trail' : ' in this selection'}; <strong>{money(leftSum - rightSum)}</strong> difference from the {stage === 'l1' ? 'settlement' : 'bank'} side.</p>}
        </section>
        <ManualLinks stage={stage} left={selections.left} right={selections.right} onSaved={clearSelection}/>
    </>;
}
function SidePanel({ label, noun, resource, field, settings, change, selectedIds, onPick, onLink,onCompare, filtered, emptyEvidence }: {
    label: string;
    noun: string;
    resource: ReturnType<typeof useResource<SideResponse>>;
    field: string;
    settings: SideSettings;
    change: (settings: SideSettings | ((previous: SideSettings) => SideSettings)) => void;
    selectedIds: Record<string, boolean>;
    onPick: (rows: SideRow[]) => void;
    onLink: (row: SideRow) => void;
    onCompare?: (row:SideRow,origin:HTMLElement)=>void;
    filtered: boolean;
    emptyEvidence?: ReactNode;
}) {
    const data = resource.data;
    const bankIds=label==='Bank'?(data?.rows||[]).map(row=>row.rec).join(','):'';
    const bankEvidence=useResource<RecordsResponse>(bankIds?`/analysis/records?ids=${encodeURIComponent(bankIds)}&limit=200`:null);
    const settlementReferences=useMemo(()=>Object.fromEntries((bankEvidence.data?.records||[]).map(row=>[row.i,String(row.stl?.reference||'No settlement')])),[bankEvidence.data]);
    const panelRef=useRef<HTMLElement>(null);
    const reduce=useReducedMotion();
    useEffect(()=>{if(filtered && !resource.loading && !resource.updating)revealLinkedEvidence(panelRef.current,reduce);},[filtered,resource.updatedAt,resource.loading,resource.updating,reduce]);
    const statusFocus = useRovingFocus(['', 'Linked', 'Review', 'Not found'], {initial:settings.status});
    const sourceColumns = (data?.columns || []).filter(column => column.name !== field);
    const columns = useMemo<ColumnDef<SideRow, unknown>[]>(() => [
        { id: label==='Bank'?'keterangan':'key', accessorKey: 'key', header: label==='Bank'?'Bank description':'Reference', cell: ({ row }) => <EvidenceText onActivate={onCompare?origin=>onCompare(row.original,origin):undefined} className="reference" title={label==='Bank'?String(row.original.row.keterangan??row.original.row.reference??'No bank description'):row.original.key} rows={[{label:'Outlet',value:row.original.outlet || '—'}, {label:'Date',value:date(row.original.day)}, {label:'Link',value:row.original.link || 'No link'}, {label:'Rule',value:row.original.rule || '—'}]}>{label==='Bank'?String(row.original.row.keterangan??row.original.row.reference??'No bank description'):row.original.key}</EvidenceText> },
        { accessorKey: 'status', header: 'Status', cell: ({ row }) => {
            const status = <StatusChip tone={row.original.status === 'Linked' ? 'green' : row.original.status === 'Review' ? 'amber' : 'red'}>{row.original.status}</StatusChip>;
            return row.original.link ? <button type="button" className="linked-status" aria-label={`Show links for ${row.original.key}`} onClick={() => onLink(row.original)}>{status}<Link2 size={12}/></button> : status;
        } },
        { id: field, header: fieldLabels[field], accessorFn: row => amount(row, field), cell: ({ row }) => <span className="numeric">{money(amount(row.original, field))}</span> },
        { accessorKey: 'link', header: 'Link', cell: ({ row }) => row.original.link ? <span data-tour="link-chip" data-link={row.original.link}><LinkChip reference={row.original.link} rule={row.original.rule} pays={row.original.pays} onClick={() => onLink(row.original)}/></span> : <span className="muted">No link</span> },
        ...(label==='Bank'?[{id:'linked_settlement',header:'Linked settlement',enableSorting:false,cell:({row}:{row:{original:SideRow}})=><EvidenceText className="reference" title={settlementReferences[row.original.rec]||'No linked settlement'}>{settlementReferences[row.original.rec]|| (bankEvidence.loading?'Loading…':'No linked settlement')}</EvidenceText>}]:[]),
        { accessorKey: 'outlet', header: 'Outlet' }, { accessorKey: 'day', header: 'Date' }, { accessorKey: 'rule', header: 'Rule' },
        ...sourceColumns.map(column => ({ id: `row.${column.name}`, header: column.name === 'reference' ? 'Source reference' : columnLabel(column.name), accessorFn: (row: SideRow) => row.row[column.name], cell: ({ getValue }: {getValue: () => unknown}) => <span className={column.type === 'number' ? 'numeric' : 'source-field'}>{String(getValue() ?? '—')}</span> }))
    ], [field, data?.columns, onLink,onCompare,label,settlementReferences,bankEvidence.loading]);
    const hiddenColumns = ['outlet', 'day', 'rule', ...sourceColumns.map(column => `row.${column.name}`)];
    const aggregate = data?.aggregates[field];
    const aggregateValue = !aggregate ? 0 : settings.aggregate === 'avg' ? aggregate.sum / (aggregate.count || 1) : settings.aggregate === 'count' ? aggregate.count : settings.aggregate === 'sum' ? aggregate.sum : settings.aggregate === 'min' ? aggregate.min : aggregate.max;
    return <section ref={panelRef} className="side-panel" data-ready={!resource.loading&&!resource.updating&&!bankEvidence.loading} aria-busy={resource.updating||bankEvidence.loading} aria-label={`${label} linked records`}>
        <header className="side-head"><h3>{label}</h3><span>{resource.loading ? 'Loading…' : plural(data?.total||0,noun==='sales'?'sale':noun==='settlements'?'settlement':'bank credit')}</span></header>
        {emptyEvidence || <>
            <div className="status-filters" role="group" aria-label={`${label} link status`}>{['', 'Linked', 'Review', 'Not found'].map(status => <button type="button" key={status} {...statusFocus(status)} aria-pressed={settings.status === status} onClick={() => change(previous => ({ ...previous, status, offset: 0 }))}>{status || 'All'} <span>{count(status ? data?.counts[status] || 0 : Object.values(data?.counts || {}).reduce((a, b) => a + b, 0))}</span></button>)}</div>
            {filtered && <p className="table-note">Showing links from the ticked rows on the other side.</p>}
            <input className="side-search" type="search" aria-label={`Search ${label} records`} placeholder={`Find a reference in ${label.toLowerCase()}…`} value={settings.search} onChange={event => change(previous => ({ ...previous, search: event.target.value, offset: 0 }))}/>
            <DataTable data={data?.rows || []} columns={columns} density="evidence" onRowClick={onCompare} defaultHiddenColumns={hiddenColumns} caption={label} loading={resource.loading || resource.updating} error={resource.error} retry={resource.retry} columnPicker={!!data?.rows.length} selectable getRowId={rowId} selectedIds={selectedIds} onSelectionChange={onPick} server={{ offset: settings.offset, limit: settings.limit, total: data?.total || 0, sort: settings.sort, desc: settings.desc, onPage: (offset, limit) => change(previous => ({ ...previous, offset, limit })), onSort: (sort, desc) => change(previous => ({ ...previous, sort: sort.replace(/^row\./, ''), desc, offset: 0 })) }} emptyTitle={`No ${label.toLowerCase()} rows in this selection`} emptyDescription="No corresponding rows were found. Clear the row selection or change the filters to inspect another trail." footer={!!data?.total && <div className="aggregate-footer"><label className="inline">{fieldLabels[field]}<select aria-label={`${label} aggregate`} value={settings.aggregate} onChange={event => change(previous => ({ ...previous, aggregate: event.target.value }))}>{['sum', 'avg', 'min', 'max', 'count'].map(value => <option key={value}>{value}</option>)}</select></label><strong>{aggregateValue == null ? '—' : settings.aggregate === 'count' ? count(aggregateValue) : money(aggregateValue)}</strong></div>}/>
        </>}
    </section>;
}
