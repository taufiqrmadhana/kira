import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight} from 'lucide-react';
import type {ColumnDef} from '@tanstack/react-table';
import {Button, DataTable, Empty, ErrorState, Loading, StatusChip, Tabs} from '../../components';
import {api} from '../../lib/api';
import {count, date, money} from '../../lib/format';
import {areas, areaNames, errorMessage, type Area, type Cleaning, type ExcludeItem, type MapItem, type Recommendation, type RunAction, type Table, type TableRow, type WorkflowData} from './types';

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

function CleanedTable({revision}: {revision: number}) {
  const [area, setArea] = useState<Area>('pos');
  const [offset, setOffset] = useState(0);
  const [before, setBefore] = useState(false);
  const [table, setTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {setOffset(0);}, [revision]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<Table>(`/tables/clean/${area}?limit=10&offset=${offset}`, {signal: controller.signal}).then(result => {if (!controller.signal.aborted) setTable(result);}).catch(err => {if (!controller.signal.aborted) setError(errorMessage(err));}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [area, offset, revision, retry]);
  const columns: ColumnDef<TableRow, unknown>[] = [
    {id: 'row', header: '#', enableSorting: false, cell: ({row}) => <span className="numeric">{count(offset + row.index + 1)}</span>},
    ...(table?.columns || []).map(column => ({id: column.name, header: column.name, enableSorting: false, cell: ({row}: {row: {original: TableRow}}) => {
      const changed = !!row.original.__was && Object.hasOwn(row.original.__was, column.name);
      const value = before && changed ? row.original.__was![column.name] : row.original[column.name];
      return <span className={`${column.type === 'number' ? 'numeric' : ''} ${changed ? 'wf-changed-cell' : ''}`} title={changed ? `Before: ${valueText(row.original.__was![column.name], column.type)}` : undefined}>{valueText(value, column.type)}{changed && <span className="sr-only">, {before ? 'before cleaning' : 'changed by cleaning'}</span>}</span>;
    }})),
  ];
  return <section className="wf-cleaned-table" aria-labelledby="cleaned-tables-title"><div className="wf-section-head"><h2 id="cleaned-tables-title">Cleaned tables</h2><label className="inline"><input type="checkbox" checked={before} onChange={event => setBefore(event.target.checked)}/>Show before cleaning</label></div><Tabs value={area} onChange={value => {setArea(value as Area); setOffset(0);}} items={areas.map(value => ({value, label: areaNames[value]}))}/>
    {loading ? <Loading/> : error ? <ErrorState message={error} retry={() => setRetry(value => value + 1)}/> : !table?.total ? <Empty title={`No ${areaNames[area]} rows to show`}>Review the upload rule and cleaning choices for this table.</Empty> : <><p className="wf-table-summary">{count(table.total)} rows; {count(table.columns.length)} columns. {count(table.changed || 0)} rows changed; {count(table.dropped || 0)} left out.{before ? ' Showing original values for changed cells.' : ' Changed cells are highlighted.'}</p><div className="wf-server-table"><DataTable key={`${area}-${offset}`} data={table.rows} columns={columns} caption={`${areaNames[area]} ${before ? 'before cleaning' : 'cleaned table'}`}/></div><div className="wf-pagination"><span>Rows {count(offset + 1)}–{count(Math.min(offset + 10, table.total))} of {count(table.total)}</span><div className="wf-actions"><Button disabled={offset === 0} aria-label="Previous table page" onClick={() => setOffset(Math.max(0, offset - 10))}><ChevronLeft size={16}/></Button><Button disabled={offset + 10 >= table.total} aria-label="Next table page" onClick={() => setOffset(offset + 10)}><ChevronRight size={16}/></Button></div></div></>}
  </section>;
}

export default function Step3({data, busy, run, revision, onBack, onNext}: {data: WorkflowData; busy: string; run: RunAction; revision: number; onBack: () => void; onNext: () => void}) {
  const [cleaning, setCleaning] = useState<Cleaning | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {const controller = new AbortController(); api<Cleaning>('/cleaning', {signal: controller.signal}).then(result => {if (!controller.signal.aborted) {setCleaning(result); setError('');}}).catch(err => {if (!controller.signal.aborted) setError(errorMessage(err));}); return () => controller.abort();}, [revision, retry]);
  const recs = data.cleaning.recommendations;
  const open = recs.filter(rec => !rec.decision).length;
  const settled = !!data.cleaning.rules && recs.length === 0;
  return <section className="wf-step-panel" aria-labelledby="wf-clean-title"><div className="wf-section-head"><div><h2 id="wf-clean-title">Clean the data to your standard</h2><p>Review each recommendation, then save the rules. Saved choices are reused on later files.</p></div></div>
    <details className="wf-standard"><summary>Your data standard</summary>{error ? <ErrorState message={error} retry={() => setRetry(value => value + 1)}/> : !cleaning ? <Loading/> : <div><p><strong>Outlet names from POS:</strong> {Object.keys(cleaning.standard.outlets).join(', ') || 'No outlet names yet.'}</p><p><strong>Providers:</strong> {Object.keys(cleaning.standard.providers).join(', ')}</p></div>}</details>
    <div className="wf-section-head"><h3>{recs.length ? `${count(recs.length)} recommendations` : 'No new recommendations'}</h3>{settled && <StatusChip>Cleaning rules v{data.cleaning.rules!.version} saved</StatusChip>}</div>
    {recs.map(rec => <RecommendationCard key={`${rec.id}-${rec.decision}-${JSON.stringify(rec.items)}`} rec={rec} busy={busy} run={run}/>)}
    {!recs.length && <p className="wf-table-summary">{settled ? 'The saved rules cover the current data.' : 'No changes are needed. Save the initial cleaning rules to continue.'}</p>}
    {!settled && <div className="wf-save-cleaning"><p>{open ? `${count(open)} recommendations still need your decision.` : 'Every recommendation has a decision.'}</p><Button variant="primary" disabled={!!busy || open > 0} onClick={() => void run('Saving cleaning rules', async () => {await api('/cleaning/save', {method: 'POST'}); return 'Cleaning rules saved.';})}>Save cleaning rules v{(data.cleaning.rules?.version || 0) + 1}</Button></div>}
    <CleanedTable revision={revision}/><footer className="wf-step-footer"><Button disabled={!!busy} onClick={onBack}><ArrowLeft size={16}/>Back</Button><p>{settled ? 'Cleaning is saved. Matching can begin.' : 'Decide on every recommendation and save first.'}</p><Button variant="primary" disabled={!!busy || !settled} onClick={onNext}>Next: Run matching<ArrowRight size={16}/></Button></footer>
  </section>;
}
