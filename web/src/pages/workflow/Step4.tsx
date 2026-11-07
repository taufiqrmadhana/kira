import { useCallback, useEffect, useState } from 'react';
import { newRule, RuleEditor } from './Step4.rules';
import type { Rule, Stage, Request } from './Step4.rules';
import './Step4.css';

type Run = { matched: number; total: number; hits: Record<string, number>; rules?: string[] };
type Progress = { done: boolean; matched?: number; total?: number; summary?: Run };
type WorkflowStatus = { converted: boolean; upload_rules_pending: string[]; cleaning: { open: number; rules_version: number | null }; matching: Record<Stage, Progress> };
type Results = { totals: { pos: number; full: number; linked: number; matched: number; mismatched: number; review: number; stl: number; l1: number; l2: number; cash: number; credits: number; credits_linked: number } };
type Gap = { kind: string; label: string; amount: number; count: number; explained: boolean };

export type Step4Props = {
  clientId?: string;
  userName?: string;
  onDataChanged?: () => void;
  onOpenAnalysis?: () => void;
};

const titles: Record<Stage, string> = { l1: 'POS to settlement', l2: 'Settlement to bank' };
const stages: Stage[] = ['l1', 'l2'];
const count = (value: number) => new Intl.NumberFormat('id-ID').format(value);
const percent = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value) + '%';
function MatchRate({ full, total }: { full: number; total: number }) {
  const rate = total ? full / total * 100 : 0;
  return <div className="step4-rate">
    <div className="step4-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="step4-ring-track" cx="60" cy="60" r="52" />
        <circle className="step4-ring-value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, rate))} 100`} transform="rotate(-90 60 60)" />
      </svg>
      <strong>{percent(rate)}</strong>
    </div>
    <span>Sales reconciled without unexplained differences</span><small>{count(full)} of {count(total)} POS sales</small>
  </div>;
}

function Step4Workspace({ clientId = '', userName = '', onDataChanged, onOpenAnalysis }: Step4Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [suggestions, setSuggestions] = useState<Partial<Record<Stage, Rule[]>>>({});
  const [tested, setTested] = useState<Partial<Record<Stage, Run>>>({});
  const [editing, setEditing] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set('Content-Type', 'application/json');
    if (clientId) headers.set('X-Kira-Client', clientId);
    if (userName) headers.set('X-Kira-User', userName);
    const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(response.status === 401 ? 'Your session expired. Sign in again.' : typeof payload.detail === 'string' ? payload.detail : `Request failed (${response.status}). Try again.`);
    }
    return response.json() as Promise<T>;
  }, [clientId, userName]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [saved, progress, final] = await Promise.all([
      request<Rule[]>('/matching/rules', { signal }), request<WorkflowStatus>('/status', { signal }), request<Results | null>('/matching/results', { signal }),
    ]);
    if (signal?.aborted) return;
    setRules(saved); setStatus(progress); setResults(final);
    const differences = final ? await request<{ kinds: Gap[] }>('/analysis/gaps', { signal }) : null;
    if (!signal?.aborted) setGaps(differences?.kinds ?? []);
  }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const act = async (message: string, operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(message); setError(''); setNotice('');
    try { await operation(); } catch (err) { setError(err instanceof Error ? err.message : 'The request failed. Try again.'); }
    finally { setBusy(''); }
  };
  const changed = async () => { setTested({}); setSuggestions({}); await refresh(); onDataChanged?.(); };
  const save = (rule: Rule) => void act('Saving rule…', async () => {
    await request(rule.id ? `/matching/rules/${rule.id}` : `/matching/${rule.stage}/rules`, { method: rule.id ? 'PATCH' : 'POST', body: JSON.stringify({ kind: rule.kind, params: rule.params, name: rule.name }) });
    setEditing(null); await changed(); setNotice('Rule saved. Test and run the stage to update its results.');
  });
  const reorder = (stage: Stage, index: number, direction: number) => void act('Updating rule order…', async () => {
    const ids = rules.filter(r => r.stage === stage).map(r => r.id!);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await request(`/matching/${stage}/order`, { method: 'POST', body: JSON.stringify({ rule_ids: ids }) });
    await changed(); setNotice('Rule order saved. Results affected by this change were cleared.');
  });
  const execute = (stage: Stage, mode: 'test' | 'run') => void act(mode === 'test' ? `Testing ${titles[stage]}…` : `Matching ${titles[stage]}…`, async () => {
    const result = await request<Run>(`/matching/${stage}/${mode}`, { method: 'POST', body: JSON.stringify({ rule_ids: rules.filter(r => r.stage === stage && r.params.enabled !== false).map(r => r.id!) }) });
    if (mode === 'test') { setTested(previous => ({ ...previous, [stage]: result })); setNotice('Test complete. No matching results were saved.'); }
    else { await changed(); setNotice(`${titles[stage]} complete: ${count(result.matched)} of ${count(result.total)} linked.`); }
  });
  const exportResults = () => void act('Preparing export…', async () => {
    const headers = new Headers();
    if (clientId) headers.set('X-Kira-Client', clientId);
    if (userName) headers.set('X-Kira-User', userName);
    const response = await fetch('/api/matching/export', { headers, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Export failed. Refresh the results and try again.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kira-results.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const ready = !!status?.converted && status.cleaning.rules_version !== null && status.cleaning.open === 0 && status.upload_rules_pending.length === 0;
  const totals = results?.totals;

  return <section className="step4" aria-labelledby="step4-heading" aria-busy={loading || !!busy}>
    <header className="step4-heading"><div><h1 id="step4-heading">Match payments</h1><p>Trace each sale through its settlement to the bank.</p></div><button disabled={!!busy || loading} onClick={() => void act('Refreshing…', async () => { await changed(); })}>Refresh</button></header>
    {error && <div className="step4-error" role="alert">{error}<button disabled={!!busy} onClick={() => void act('Retrying…', async () => { await refresh(); setLoading(false); })}>Retry</button></div>}
    <p className="step4-live" role="status" aria-live="polite">{busy || notice}</p>
    {loading ? <div className="step4-loading" role="status">Loading rules and latest results…</div> : <>
      {!ready && <p className="step4-empty">Complete conversion and save the cleaning rules in Step 3 before matching.</p>}
      <div className="step4-stage-totals" aria-label="Latest saved results per stage">{stages.map((stage, index) => <div key={stage}><span>{index + 1}. {titles[stage]}</span><strong>{status?.matching[stage].done ? count(status.matching[stage].matched ?? 0) : 'Not run'}</strong><span>{status?.matching[stage].done ? `of ${count(status.matching[stage].total ?? 0)} linked` : 'No saved result'}</span></div>)}</div>
      {stages.map((stage, stageIndex) => {
        const saved = rules.filter(r => r.stage === stage);
        const locked = !ready || stage === 'l2' && !status?.matching.l1.done;
        const disabled = !!busy || !ready;
        return <section key={stage} className="step4-stage" aria-labelledby={`step4-${stage}`}>
          <div className="step4-stage-heading"><div className="step4-stage-title"><span className="step4-number" aria-hidden="true">{stageIndex + 1}</span><h2 id={`step4-${stage}`}>{titles[stage]}</h2></div><span className={`step4-status ${status?.matching[stage].done ? 'step4-ok' : ''}`}>{status?.matching[stage].done ? 'Saved result' : locked ? 'Waiting' : 'Ready'}</span></div>
          {locked && <p>{stage === 'l2' && ready ? 'Run POS to settlement first.' : 'Waiting for cleaned data.'}</p>}
          <p>Active rules run from top to bottom. Each layer sees only rows left by earlier rules. Switch a rule off to leave those rows for follow-up.</p>
          {saved.length > 0 ? <ol className="step4-rules">{saved.map((rule, index) => <li key={rule.id}>
            <label className="step4-rule-select"><input type="checkbox" role="switch" aria-label={`Activate ${rule.id}`} disabled={disabled} checked={rule.params.enabled !== false} onChange={e => {
              const next = { ...rule, params: { ...rule.params, enabled: e.target.checked } };
              if (e.target.checked) setEditing(next); else save(next);
            }} /><span><span className="step4-rule-id">{rule.id}</span> <span>{rule.params.enabled === false ? 'Inactive' : 'Active'}</span><strong title={rule.name}>{rule.name}</strong><small>{rule.conditions.join('. ')}</small>{(tested[stage]?.hits ?? status?.matching[stage].summary?.hits)?.[rule.id!] !== undefined && <small>{count((tested[stage]?.hits ?? status?.matching[stage].summary?.hits)?.[rule.id!] ?? 0)} rows linked by this layer</small>}</span></label>
            <div className="step4-rule-actions"><button disabled={disabled || index === 0} aria-label={`Move ${rule.id} up`} onClick={() => reorder(stage, index, -1)}>↑</button><button disabled={disabled || index === saved.length - 1} aria-label={`Move ${rule.id} down`} onClick={() => reorder(stage, index, 1)}>↓</button><button disabled={disabled} onClick={() => setEditing(rule)}>Edit<span className="step4-sr-only"> {rule.id}</span></button><button disabled={disabled} onClick={() => { if (window.confirm(`Delete ${rule.id}? Results that used it will be cleared.`)) void act('Deleting rule…', async () => { await request(`/matching/rules/${rule.id}`, { method: 'DELETE' }); await changed(); }); }}>Delete<span className="step4-sr-only"> {rule.id}</span></button></div>
          </li>)}</ol> : <p className="step4-empty">No rules saved. Find suggestions from the cleaned data or create a rule.</p>}
          <div className="step4-actions"><button disabled={disabled} onClick={() => void act('Finding suggestions…', async () => { const proposals = await request<Rule[]>(`/matching/${stage}/suggestions`); setSuggestions(previous => ({ ...previous, [stage]: proposals })); })}>Find suggestions</button><button disabled={disabled} onClick={() => setEditing(newRule(stage))}>Create rule</button><button disabled={disabled || locked || saved.length === 0} onClick={() => execute(stage, 'test')}>Test active rules</button><button className="step4-primary" disabled={disabled || locked || saved.length === 0} onClick={() => execute(stage, 'run')}>Run matching</button></div>
          {tested[stage] && <p className="step4-preview" role="status">Test: {count(tested[stage]!.matched)} of {count(tested[stage]!.total)} linked. No results saved.</p>}
          {suggestions[stage]?.length === 0 && <p className="step4-empty">No additional rules found. Review the remaining rows in Match analysis.</p>}
          {suggestions[stage]?.map((rule, i) => <div className="step4-suggestion" key={`${rule.kind}-${i}`}><div><h3>{rule.name}</h3><p>{rule.why}</p><p>{count(rule.matches_alone ?? 0)} matches on its own; {count(rule.extra_after_saved ?? 0)} additional after saved rules.</p></div><button disabled={disabled} onClick={() => setEditing({ ...rule, params: { ...rule.params, enabled: false } })}>Review suggestion</button></div>)}
          {editing?.stage === stage && <RuleEditor key={`${editing.id ?? 'new'}-${stage}-${String(editing.params.enabled)}`} rule={editing} request={request} busy={!!busy} onSave={save} onCancel={() => setEditing(null)} />}
        </section>;
      })}
      <section className="step4-results" aria-labelledby="step4-results-heading"><div className="step4-stage-heading"><h2 id="step4-results-heading">Matching results</h2><div className="step4-actions">{onOpenAnalysis && <button disabled={!results || !!busy} onClick={onOpenAnalysis}>Match analysis</button>}<button disabled={!results || !!busy} onClick={exportResults}>Export results</button></div></div>
        {totals ? <><div className="step4-result-grid"><MatchRate full={totals.full} total={totals.pos} /><dl><div><dt>Matched</dt><dd>{count(totals.matched)}</dd></div><div><dt>Mismatched</dt><dd className="step4-mismatch">{count(totals.mismatched)}</dd></div><div><dt>Needs review</dt><dd className="step4-review">{count(totals.review)}</dd></div><div><dt>Bank credits linked</dt><dd>{count(totals.credits_linked)} / {count(totals.credits)}</dd></div></dl></div><p>{count(totals.linked)} of {count(totals.pos)} POS sales are linked through both stages. A linked sale can still have a difference. Status counts also include records without a POS sale.</p>
          {gaps.filter(g => g.kind === 'sale_diff' || g.kind === 'payout_diff').map(g => <p className="step4-difference" key={g.kind}>{g.label}: <strong>Rp {count(g.amount)}</strong> across {count(g.count)} {g.kind === 'sale_diff' ? 'sales' : 'payout differences'}.</p>)}
          <p className="step4-cash">Linked bank credits <strong>Rp {count(totals.cash)}</strong></p></> : <p className="step4-empty">Run both stages to see the complete result. Changing an input or a used rule clears affected results.</p>}
      </section>
    </>}
  </section>;
}

export function Step4(props: Step4Props) {
  // Remount on workspace changes so results from an old request cannot cross clients.
  return <Step4Workspace key={props.clientId ?? ''} {...props} />;
}

export default Step4;
