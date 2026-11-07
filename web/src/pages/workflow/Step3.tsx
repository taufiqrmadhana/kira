import {EvidenceText} from '../../components/EvidenceText';
import {useRovingFocus} from '../../components/useRovingFocus';
import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, Database, Landmark, Store, WalletCards} from 'lucide-react';
import type {ColumnDef} from '@tanstack/react-table';
import {Button, DataTable, ErrorState, Loading, StatusChip} from '../../components';
import {api} from '../../lib/api';
import {count, date, money} from '../../lib/format';
import {areas, areaNames, errorMessage, type Area, type Cleaning, type ExcludeItem, type MapItem, type Recommendation, type RunAction, type Table, type TableRow, type WorkflowData} from './types';
import './workflow-clean.css';

function RecommendationCard({rec, busy, run}: {rec: Recommendation; busy: string; run: RunAction}) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.fromEntries(rec.kind === 'map' ? (rec.items as MapItem[]).map(item => [item.from, item.to]) : []));
  const [exclude, setExclude] = useState<Record<string, boolean>>(() => Object.fromEntries(rec.kind === 'exclude' ? (rec.items as ExcludeItem[]).map(item => [item.pattern, item.exclude]) : []));
  const decide = (decision: 'accept' | 'reject' | null) => run('Saving cleaning decision', async () => {
    await api(`/cleaning/recommendations/${encodeURIComponent(rec.id)}`, {method: 'POST', body: JSON.stringify({decision, ...(rec.kind === 'map' ? {mapping} : {exclude})})});
    return decision === null ? 'Cleaning decision undone.' : `Recommendation ${decision === 'accept' ? 'accepted' : 'rejected'}. Save the cleaning rules when your review is complete.`;
  });
  return <article className="wf-decision wf-clean-decision" aria-labelledby={`rec-${rec.id}`}>
    <div className="wf-recommendation-head"><small>{areaNames[rec.table]} / {rec.column}</small><h3 id={`rec-${rec.id}`}>{rec.title}</h3><p>{rec.why}</p><div className="wf-actions">{rec.decision ? <><StatusChip tone={rec.decision === 'accept' ? 'green' : 'neutral'}>{rec.decision === 'accept' ? 'Accepted' : 'Rejected'}</StatusChip><Button disabled={!!busy} onClick={() => void decide(null)}>Undo<span className="sr-only"> {rec.title}</span></Button></> : <><Button variant="primary" disabled={!!busy} onClick={() => void decide('accept')}><Check size={16}/>Accept<span className="sr-only"> {rec.title}</span></Button><Button disabled={!!busy} onClick={() => void decide('reject')}>Reject<span className="sr-only"> {rec.title}</span></Button></>}</div></div>
    <fieldset disabled={!!busy || !!rec.decision} className="wf-rec-fields"><legend className="sr-only">Decisions for {rec.title}</legend><div className="table-scroll"><table><caption className="sr-only">Values in {rec.title}</caption>{rec.kind === 'map' ? <><thead><tr><th scope="col">Value in file</th><th scope="col">Becomes</th><th scope="col" className="wf-number">Rows</th></tr></thead><tbody>{(rec.items as MapItem[]).map(item => <tr key={item.from}><td className="wf-cell-wrap">{item.from}{item.by === 'ai' && item.why && <small>AI suggestion: {item.why}</small>}</td><td><select aria-label={`Map ${item.from} in ${areaNames[rec.table]} ${rec.column}`} value={mapping[item.from] || ''} onChange={event => setMapping({...mapping, [item.from]: event.target.value})}><option value="">Leave as is</option>{(rec.choices || []).map(choice => <option key={choice} value={choice}>{choice}</option>)}</select></td><td className="wf-number">{count(item.rows)}</td></tr>)}</tbody></> : <><thead><tr><th scope="col">Bank description</th><th scope="col" className="wf-number">Rows</th><th scope="col" className="wf-number">Credit</th><th scope="col" className="wf-number">Debit</th><th scope="col">Include in matching</th></tr></thead><tbody>{(rec.items as ExcludeItem[]).map(item => <tr key={item.pattern}><td className="wf-cell-wrap">{item.example}<small>{item.by === 'ai' ? 'AI suggestion: ' : ''}{item.why}</small></td><td className="wf-number">{count(item.rows)}</td><td className="wf-number">{money(item.credit)}</td><td className="wf-number">{money(item.debit)}</td><td><select aria-label={`Include bank rows ${item.example}`} value={exclude[item.pattern] ? 'exclude' : 'keep'} onChange={event => setExclude({...exclude, [item.pattern]: event.target.value === 'exclude'})}><option value="exclude">Leave out</option><option value="keep">Keep</option></select></td></tr>)}</tbody></>}</table></div></fieldset>
  </article>;
}

function valueText(value: unknown, type: string): string {
  if (value == null || value === '') return '—';
  if (type === 'number' && typeof value === 'number') return new Intl.NumberFormat('id-ID', {maximumFractionDigits: 6}).format(value);
  if (type === 'bool' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'date' && typeof value === 'string') return date(value);
  if (type === 'datetime' && typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return `${date(value)}, ${new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit'}).format(parsed)} WIB`;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const typeNames = {text: 'Text', number: 'Number', date: 'Date', datetime: 'Date & time', bool: 'Yes / No'};

function CleanedTable({revision, data}: {revision: number; data: WorkflowData}) {
  const [area, setArea] = useState<Area>('pos');
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [before, setBefore] = useState(false);
  const [table, setTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [totals, setTotals] = useState<Partial<Record<Area, number>>>({});
  const tabFocus = useRovingFocus([...areas], {initial: area});
  useEffect(() => {setOffset(0);}, [revision]);
  useEffect(() => {setTotals({});}, [revision]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<Table>(`/tables/clean/${area}?limit=${limit}&offset=${offset}`, {signal: controller.signal}).then(result => {if (!controller.signal.aborted) {setTable(result); if (Number.isFinite(result.total)) setTotals(previous => ({...previous, [area]: result.total}));}}).catch(err => {if (!controller.signal.aborted) setError(errorMessage(err));}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [area, offset, limit, revision, retry]);
  const columns: ColumnDef<TableRow, unknown>[] = [
    {id: 'row', header: '#', enableSorting: false, cell: ({row}) => <span className="numeric">{count(offset + row.index + 1)}</span>},
    ...(table?.columns || []).map(column => ({id: column.name, header: () => <span className="wf-clean-column-name"><span>{column.name}</span>{' '}<small>{typeNames[column.type] || column.type}</small></span>, enableSorting: false, cell: ({row}: {row: {original: TableRow}}) => {
      const changed = !!row.original.__was && Object.hasOwn(row.original.__was, column.name) && !Object.is(row.original.__was[column.name], row.original[column.name]);
      const value = before && changed ? row.original.__was![column.name] : row.original[column.name];
      return changed ? <EvidenceText className={`${column.type === 'number' ? 'numeric' : ''} wf-clean-evidence ${before ? '' : 'wf-changed-cell'}`} title={`${column.name.replaceAll('_',' ')}: cleaning evidence`} rows={[{label:'Before cleaning',value:valueText(row.original.__was![column.name],column.type)},{label:'After cleaning',value:valueText(row.original[column.name],column.type)}]} flags={[{tone:'amber',text:'Changed by a cleaning rule.'}]} action="Use Show before cleaning to compare the whole table.">{valueText(value,column.type)}<span className="sr-only">, {before?'before cleaning':'changed by cleaning'}</span></EvidenceText> : <span className={column.type==='number'?'numeric':''}>{valueText(value,column.type)}</span>;
    }})),
  ];
  const total = table?.total ?? table?.rows.length ?? 0;
  const changedRows = table?.changed ?? 0;
  const dropped = table?.dropped ?? 0;
  return <section className="wf-cleaned-table" aria-labelledby="cleaned-tables-title"><h2 id="cleaned-tables-title">Cleaned tables</h2><div className="wf-clean-table-toolbar"><div className="wf-clean-tabs" role="tablist" aria-label="Cleaned table sources">{areas.map(value => {
    const Icon = {pos: Store, settlement: WalletCards, bank: Landmark}[value];
    const rows = totals[value] ?? data.tables.clean[value]?.total;
    const label = Number.isFinite(rows) ? count(rows!) : '—';
    return <button key={value} type="button" role="tab" aria-label={`${areaNames[value]} ${label} rows`} aria-selected={area === value} {...tabFocus(value)} onClick={() => {if (value === area) return; setArea(value); setOffset(0); setTable(null);}}><Icon size={15} aria-hidden="true"/>{areaNames[value]}<span>{label}</span></button>;
  })}</div><label className="inline"><input type="checkbox" checked={before} onChange={event => setBefore(event.target.checked)}/>Show before cleaning</label></div>
    {!loading && !error && table && <div className="wf-clean-table-summary"><p>Showing {count(table.rows.length)} of {count(total)} rows <span>{count(table.columns.length)} columns</span>{dropped > 0 && <span>{count(dropped)} left out by cleaning</span>}</p>{!before && changedRows > 0 && <span className="wf-clean-changed-count">{count(changedRows)} {changedRows === 1 ? 'row' : 'rows'} changed by cleaning</span>}{before && <p>Original values for retained rows.</p>}</div>}
    <div className="wf-clean-grid"><DataTable key={area} data={table?.rows || []} columns={columns} caption={`${areaNames[area]} ${before ? 'before cleaning' : 'cleaned table'}`} loading={loading} error={error} retry={() => setRetry(value => value + 1)} server={{offset, limit, total, onPage: (nextOffset, nextLimit) => {setOffset(nextOffset); setLimit(nextLimit);}}} emptyTitle={`No ${areaNames[area]} rows to show`} emptyDescription="Review the upload rule and cleaning choices for this table."/></div>
  </section>;
}

function DataStandard({cleaning, error, retry}: {cleaning: Cleaning | null; error: string; retry: () => void}) {
  const columns = Object.entries(cleaning?.standard.columns || {}).flatMap(([area, fields]) => Object.entries(fields || {}).map(([field, target]) => `${areaNames[area as Area] || area} ${field} → ${target}`));
  return <section className="wf-clean-standard" aria-labelledby="wf-clean-standard-title"><h3 id="wf-clean-standard-title"><Database size={15} aria-hidden="true"/>Your data standard</h3>{error ? <ErrorState message={error} retry={retry}/> : !cleaning ? <Loading/> : <>
    <dl>{(['outlets', 'providers'] as const).map(kind => <div key={kind}><dt>{kind === 'outlets' ? 'Outlets' : 'Providers'}</dt><dd>{Object.keys(cleaning.standard[kind] || {}).length ? Object.entries(cleaning.standard[kind]).map(([name, aliases]) => <span className="wf-standard-chip" key={name}><strong>{name}</strong>{aliases.length > 0 && <span>{aliases.join(', ')}</span>}</span>) : <span className="wf-clean-muted">No {kind} in the current standard.</span>}</dd></div>)}</dl>
    {columns.length > 0 && <p>Columns checked: {columns.join('; ')}.</p>}{!!cleaning.standard.payout_words?.length && <p>Bank payout words: {cleaning.standard.payout_words.join(', ')}.</p>}
  </>}</section>;
}

export default function Step3({data, busy, run, revision, onBack, onNext}: {data: WorkflowData; busy: string; run: RunAction; revision: number; onBack: () => void; onNext: () => void}) {
  const [cleaning, setCleaning] = useState<Cleaning | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {const controller = new AbortController(); api<Cleaning>('/cleaning', {signal: controller.signal}).then(result => {if (!controller.signal.aborted) {setCleaning(result); setError('');}}).catch(err => {if (!controller.signal.aborted) setError(errorMessage(err));}); return () => controller.abort();}, [revision, retry]);
  const recs = data.cleaning.recommendations;
  const open = recs.filter(rec => !rec.decision).length;
  const settled = !!data.cleaning.rules && recs.length === 0;
  return <section className="wf-step-panel wf-clean-panel" aria-labelledby="wf-clean-title"><div className="wf-section-head"><div><p className="wf-clean-step-label">Step 3 of 4</p><h2 id="wf-clean-title">Clean the data to your standard</h2><p>KIRA compares the converted tables with your data standard and recommends fixes. Accept or reject each one, then save. Saved fixes become cleaning rules and are applied the same way on every run.</p></div></div>
    <DataStandard cleaning={cleaning} error={error} retry={() => setRetry(value => value + 1)}/>
    {settled ? <p className="wf-clean-covered" role="status"><Check size={16} aria-hidden="true"/>Cleaning rules v{data.cleaning.rules!.version} cover these files. Nothing new to decide.</p> : <div className="wf-section-head"><h3>{recs.length ? `${count(recs.length)} recommendations` : 'No new recommendations'}</h3></div>}
    {recs.map(rec => <RecommendationCard key={`${rec.id}-${rec.decision}-${JSON.stringify(rec.items)}`} rec={rec} busy={busy} run={run}/>)}
    {!recs.length && !settled && <p className="wf-table-summary">No changes are needed. Save the initial cleaning rules to continue.</p>}
    {!settled && <div className="wf-save-cleaning"><p>{open ? `${count(open)} recommendations still need your decision.` : 'Every recommendation has a decision.'}</p><Button variant="primary" disabled={!!busy || open > 0} onClick={() => void run('Saving cleaning rules', async () => {await api('/cleaning/save', {method: 'POST'}); return 'Cleaning rules saved.';})}>Save cleaning rules v{(data.cleaning.rules?.version || 0) + 1}</Button></div>}
    {busy && <p role="status" className="wf-working">{busy}…</p>}<CleanedTable revision={revision} data={data}/><footer className="wf-step-footer"><Button disabled={!!busy} onClick={onBack}><ArrowLeft size={16}/>Back</Button><p>{settled ? 'Cleaning is saved. Matching can begin.' : 'Decide on every recommendation and save first.'}</p><Button variant="primary" disabled={!!busy || !settled} onClick={onNext}>Next: Run matching<ArrowRight size={16}/></Button></footer>
  </section>;
}
