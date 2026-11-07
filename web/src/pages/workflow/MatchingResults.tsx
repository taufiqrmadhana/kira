import {useEffect, useState} from 'react';
import {ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Download} from 'lucide-react';
import {Ring, StatusChip} from '../../components';
import {count, money} from '../../lib/format';
import {stages, titles, type Request, type Results, type WorkflowStatus} from './matchingTypes';

type Source = Record<string, unknown>;
type RecordRow = {i: number; key: string; outlet?: string; status: string; reason: string; r1?: string; r2?: string; pos: Source | null; stl: Source | null; bank_i: number | null};
type RecordPage = {records: RecordRow[]; banks: Record<string, Source>; total: number; offset: number; limit: number};
const value = (row: Source | null | undefined, ...keys: string[]) => keys.map(key => row?.[key]).find(item => item !== undefined && item !== null && item !== '');
const text = (item: unknown) => item == null || item === '' ? '—' : String(item);
const amount = (item: unknown) => item == null || item === '' ? '—' : Number.isFinite(Number(item)) ? money(Number(item)) : String(item);

function CombinedTable({request}: {request: Request}) {
  const [offset, setOffset] = useState(0), [page, setPage] = useState<RecordPage | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const limit = 50;
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    request<RecordPage>('/analysis/records?offset=' + offset + '&limit=' + limit, {signal: abort.signal})
      .then(result => {if (!abort.signal.aborted) setPage(result);}).catch(cause => {if (!abort.signal.aborted) setError(cause.message);}).finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [offset, request, retry]);
  if (loading) return <p role="status">Loading combined records…</p>;
  if (error) return <div className="step4-error" role="alert">{error}<button onClick={() => setRetry(v => v + 1)}>Retry table</button></div>;
  if (!page?.records.length) return <p>No combined records in this result.</p>;
  return <div className="step4-combined">
    <p>Showing {count(page.records.length)} of {count(page.total)} combined rows. A bank credit is shown once for its linked rows on this page.</p>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Combined matching result scrollable table"><table><caption className="sr-only">Combined matching result</caption><thead><tr><th>#</th><th>Status</th><th>POS sale</th><th>Settlement</th><th>Bank credit</th><th>Rules</th><th>Reason</th></tr></thead><tbody>{page.records.map((row, index) => {
      const firstBank = row.bank_i === null || index === 0 || page.records[index - 1].bank_i !== row.bank_i;
      let span = 1;
      if (row.bank_i !== null) while (index + span < page.records.length && page.records[index + span].bank_i === row.bank_i) span++;
      const bank = row.bank_i === null ? undefined : page.banks[String(row.bank_i)];
      return <tr key={row.i}><td className="numeric">{count(offset + index + 1)}</td><td><StatusChip tone={row.status === 'Matched' ? 'green' : row.status === 'Needs review' ? 'amber' : 'red'}>{row.status}</StatusChip></td>
        <td>{text(value(row.pos, 'sales_number', 'id') ?? (row.pos ? row.key : null))}<small>{text(value(row.pos, 'branch'))}</small>{row.pos && <span className="numeric">{amount(value(row.pos, 'payment_amount'))}</span>}</td>
        <td>{text(value(row.stl, 'reference', 'id'))}<small>{text(value(row.stl, 'payment_method'))}</small>{row.stl && <span className="numeric">{amount(value(row.stl, 'nett_amount'))}</span>}</td>
        {firstBank && <td rowSpan={row.bank_i === null ? 1 : span} className="step4-bank-cell">{text(value(bank, 'keterangan', 'id'))}{bank && <span className="numeric">{amount(value(bank, 'kredit'))}</span>}</td>}
        <td>{[row.r1, row.r2].filter(Boolean).map(rule => <span className="step4-rule-id" key={rule}>{rule}</span>)}</td><td>{row.reason || 'All three sources linked'}</td></tr>;
    })}</tbody></table></div>
    <div className="step4-table-pagination"><span>{count(offset + 1)}–{count(offset + page.records.length)} of {count(page.total)}</span><div><button aria-label="Combined table previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={16}/></button><button aria-label="Combined table next page" disabled={offset + limit >= page.total} onClick={() => setOffset(offset + limit)}><ChevronRight size={16}/></button></div></div>
  </div>;
}

export default function MatchingResults({results, status, request, busy, onExport, onOpenAnalysis}: {results: Results | null; status: WorkflowStatus | null; request: Request; busy: boolean; onExport: () => void; onOpenAnalysis?: () => void}) {
  const [expandedResult, setExpandedResult] = useState<Results | null>(null);
  const expanded = results !== null && expandedResult === results;
  const totals = results?.totals;
  return <section data-tour="matching-results" className={'step4-results' + (totals ? ' is-complete' : '')} aria-label="Matching results">
    <div className="step4-results-heading"><div><p className="step4-eyebrow">Results</p><h2>{totals ? <><Check size={20} aria-hidden="true"/>Matching complete</> : 'Matching results'}</h2></div>{totals && <div className="step4-actions">{onOpenAnalysis && <button disabled={busy} onClick={onOpenAnalysis}>Match analysis<ArrowRight size={15}/></button>}<button disabled={busy} onClick={onExport}><Download size={15}/>Export Excel</button></div>}</div>
    {totals ? <><p>{count(totals.pos)} POS sales, {count(totals.stl)} settlement rows and {count(totals.credits)} bank credits checked.{!!totals.many_to_one && ' ' + count(totals.many_to_one) + ' bank credits paid several settlements.'}</p>
      <div className="step4-result-grid"><div className="step4-primary-rate">{totals.pos > 0 ? <Ring value={totals.full / totals.pos * 100} label="Match rate" size={148}/> : <p>No POS sales</p>}</div><div className="step4-result-tiles">
        <article><strong>{count(totals.matched)}</strong><h3>Matched</h3><p>Reconciled without unexplained differences</p></article>
        <article className="step4-result-mismatch"><strong>{count(totals.mismatched)}</strong><h3>Mismatched</h3><p>Missing a link or amounts do not agree</p></article>
        <article className="step4-result-review"><strong>{count(totals.review)}</strong><h3>Needs review</h3><p>Amount only, or several possible credits</p></article>
        <article><strong className="step4-money">{money(totals.cash)}</strong><h3>Bank credits explained</h3><p>{count(totals.credits_linked)} of {count(totals.credits)} bank credits</p></article>
      </div><div className="step4-result-stage-rates">{stages.map(stage => {const saved = status?.matching[stage]; return <div key={stage}>{saved?.total ? <Ring value={(saved.matched ?? 0) / saved.total * 100} label={titles[stage]} size={88}/> : <p>No records</p>}<span>{titles[stage]}</span></div>;})}</div></div>
      <div className="step4-legend" aria-label="Matching result legend"><span><i className="step4-legend-value" aria-hidden="true"/>Green arc: amount reconciled</span><span><i className="step4-legend-track" aria-hidden="true"/>Pale track: total POS sales</span></div>
      <p className="visual-summary">{count(totals.full)} of {count(totals.pos)} sales reconciled end to end; {count(totals.mismatched)} mismatched and {count(totals.review)} need review.</p>
      <p className="step4-export-help">Open the Excel file to edit it, or import it into Google Sheets. Edits stay in the downloaded copy.</p>
      <button className="step4-combined-toggle" aria-expanded={expanded} onClick={() => setExpandedResult(current => current === results ? null : results)}>{expanded ? 'Hide combined table' : 'View combined table'} ({count(totals.rows ?? totals.matched + totals.mismatched + totals.review)} rows)<ChevronDown size={16}/></button>
      {expanded && <CombinedTable request={request}/>}
    </> : <p>Generate both matching stages to see the complete result.</p>}
  </section>;
}
