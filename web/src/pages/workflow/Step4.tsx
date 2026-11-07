import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import './Step4.css';
import {count, percent, money} from '../../lib/format';
import {api} from '../../lib/api';
import {fetchResource, queryClient, resourceKey, useEndpoint} from '../../lib/query';
import {useAnimatedNumber} from '../../lib/motion';
import {AnimatedCount, FlowConnector} from './WorkflowMotion';

type Stage = 'l1' | 'l2';
type Params = Record<string, string | number | boolean>;
type Rule = { id?: string; stage: Stage; kind: string; params: Params; name: string; conditions: string[]; why?: string; matches_alone?: number; extra_after_saved?: number; total?: number };
type Run = { matched: number; total: number; hits: Record<string, number>; rules?: string[] };
type Progress = { done: boolean; matched?: number; total?: number; summary?: Run };
type WorkflowStatus = { converted: boolean; upload_rules_pending: string[]; cleaning: { open: number; rules_version: number | null }; matching: Record<Stage, Progress> };
type Results = { totals: { pos: number; full: number; matched: number; mismatched: number; review: number; stl: number; l1: number; l2: number; cash: number; credits: number; credits_linked: number } };
type Preview = Pick<Rule, 'name' | 'conditions' | 'matches_alone' | 'extra_after_saved' | 'total'>;
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type Step4Props = {
  clientId?: string;
  userName?: string;
  onDataChanged?: () => void;
  onOpenAnalysis?: () => void;
};

const titles: Record<Stage, string> = { l1: 'POS to settlement', l2: 'Settlement to bank' };
const stages: Stage[] = ['l1', 'l2'];
const defaults: Record<string, Params> = {
  id: { posCol: '', stlCol: '' },
  composite: { outlet: true, method: true, amountTol: 0, window: 1 },
  withdrawal: { groupBy: 'entity_id', requireId: true, amountTol: 0, maxDays: 3 },
  ref: { amountTol: 0 }, batch: { groupBy: 'merchant_id', requireId: true, amountTol: 0 }, amount: { amountTol: 0 },
};
const names: Record<string, string> = { id: 'Exact ID', composite: 'Outlet, amount and time', withdrawal: 'Withdrawal payout', ref: 'Reference and amount', batch: 'Batch payout', amount: 'Amount only (review)' };
const labels: Record<string, string> = { posCol: 'POS ID column', stlCol: 'Settlement ID column', groupBy: 'Group settlements by column', requireId: 'Require store ID in bank description', amountTol: 'Amount tolerance (Rp)', maxDays: 'Maximum bank delay (days)', outlet: 'Require the same outlet', method: 'Require the same payment method', window: 'Time window' };

function MatchRate({ full, total, animate }: { full: number; total: number; animate: boolean }) {
  const rate = total ? full / total * 100 : 0;
  const display = useAnimatedNumber(rate, {duration: 900, enabled: animate});
  return <div className="step4-rate">
    <div className="step4-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="step4-ring-track" cx="60" cy="60" r="52" />
        <circle className="step4-ring-value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, display))} 100`} transform="rotate(-90 60 60)" />
      </svg>
      <strong aria-label={percent(rate)}><span aria-hidden="true">{percent(display)}</span></strong>
    </div>
    <span>Sales traced to the bank</span><small>{count(full)} of {count(total)} POS sales</small>
  </div>;
}

function RuleEditor({ rule, request, busy, onSave, onCancel }: { rule: Rule; request: Request; busy: boolean; onSave: (rule: Rule) => void; onCancel: () => void }) {
  const id = useId();
  const [draft, setDraft] = useState<Rule>(rule);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError('');
    setLoading(true);
    const timer = setTimeout(() => {
      request<Preview>(`/matching/${draft.stage}/preview`, { method: 'POST', body: JSON.stringify({ kind: draft.kind, params: draft.params, exclude: draft.id ?? null }), signal: controller.signal })
        .then(value => { if (!controller.signal.aborted) setPreview(value); })
        .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, request]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (preview && !loading) onSave(draft); };
  return <form className="step4-editor" onSubmit={submit} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{rule.id ? `Edit ${rule.id}` : 'Create a matching rule'}</h3>
    <p>Preview uses the current cleaned data. Saving an edit clears results that used this rule.</p>
    <fieldset disabled={busy}>
      <div className="step4-fields">
        <label htmlFor={`${id}-name`}>Rule name<input id={`${id}-name`} maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label htmlFor={`${id}-kind`}>Rule type<select id={`${id}-kind`} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value, params: { ...defaults[e.target.value] } })}>
          {(rule.stage === 'l1' ? ['id', 'composite'] : ['withdrawal', 'ref', 'batch', 'amount']).map(kind => <option key={kind} value={kind}>{names[kind]}</option>)}
        </select></label>
        {Object.entries(draft.params).map(([key, value]) => typeof value === 'boolean'
          ? <label className="step4-check" key={key}><input type="checkbox" checked={value} onChange={e => setDraft({ ...draft, params: { ...draft.params, [key]: e.target.checked } })} />{labels[key]}</label>
          : <label key={key} htmlFor={`${id}-${key}`}>{labels[key] ?? key}{key === 'window'
            ? <select id={`${id}-${key}`} value={String(value)} onChange={e => setDraft({ ...draft, params: { ...draft.params, window: e.target.value === 'day' ? 'day' : Number(e.target.value) } })}>{[1, 5, 15, 60, 'day'].map(v => <option key={v} value={v}>{v === 'day' ? 'Same day' : `${v} minutes`}</option>)}</select>
            : <input id={`${id}-${key}`} required min={0} step="any" type={typeof value === 'number' ? 'number' : 'text'} value={value} onChange={e => setDraft({ ...draft, params: { ...draft.params, [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value } })} />}</label>)}
      </div>
    </fieldset>
    <div className="step4-preview" role="status" aria-live="polite">{loading ? 'Calculating preview…' : preview ? `${count(preview.matches_alone ?? 0)} matches on its own; ${count(preview.extra_after_saved ?? 0)} additional matches after the other saved rules.` : 'Complete the conditions to preview.'}</div>
    {error && <p className="step4-error" role="alert">{error}</p>}
    <div className="step4-actions"><button className="step4-primary" disabled={busy || loading || !preview} type="submit">{rule.id ? 'Save changes' : 'Save rule'}</button><button disabled={busy} type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function Step4Workspace({ clientId = '', userName = '', onDataChanged, onOpenAnalysis }: Step4Props) {
  const savedRules = useEndpoint<Rule[]>('/matching/rules', clientId);
  const progress = useEndpoint<WorkflowStatus>('/status', clientId);
  const final = useEndpoint<Results | null>('/matching/results', clientId);
  const rules = savedRules.data ?? [];
  const status = progress.data ?? null;
  const results = final.data ?? null;
  const [focusedRule, setFocusedRule] = useState<Partial<Record<Stage,string>>>({});
  const [selected, setSelected] = useState<Record<Stage, string[]>>({ l1: [], l2: [] });
  const [suggestions, setSuggestions] = useState<Partial<Record<Stage, Rule[]>>>({});
  const [tested, setTested] = useState<Partial<Record<Stage, Run>>>({});
  const [editing, setEditing] = useState<Rule | null>(null);
  const loading = savedRules.loading || progress.loading || final.loading;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [runningStage, setRunningStage] = useState<Stage | null>(null);
  const [completed, setCompleted] = useState<{stage:Stage;result:Run;at:number} | null>(null);

  const request = useCallback(<T,>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    headers.set('X-Kira-Client', clientId);
    if (userName) headers.set('X-Kira-User', userName);
    return api<T>(path, {...init, headers});
  }, [clientId, userName]);

  const refresh = useCallback(async (force = false) => {
    const paths = ['/matching/rules', '/status', '/matching/results'];
    if (force) await Promise.all(paths.map(path => queryClient.invalidateQueries({queryKey: resourceKey(path, clientId), refetchType: 'none'})));
    await Promise.all(paths.map(path => fetchResource(path, clientId)));
  }, [clientId]);
  useEffect(() => {
    if (!savedRules.data) return;
    setSelected({l1: savedRules.data.filter(rule => rule.stage === 'l1').map(rule => rule.id!), l2: savedRules.data.filter(rule => rule.stage === 'l2').map(rule => rule.id!)});
  }, [savedRules.data]);
  useEffect(() => {setError(savedRules.error || progress.error || final.error || '');}, [savedRules.error, progress.error, final.error]);

  const act = async (message: string, operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(message); setError(''); setNotice('');
    try { await operation(); } catch (err) { setError(err instanceof Error ? err.message : 'The request failed. Try again.'); }
    finally { setBusy(''); }
  };
  const changed = async () => { setTested({}); setSuggestions({}); setCompleted(null); await refresh(); onDataChanged?.(); };
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
    setRunningStage(stage);
    try {
      const result = await request<Run>(`/matching/${stage}/${mode}`, { method: 'POST', body: JSON.stringify({ rule_ids: selected[stage] }) });
      if (mode === 'test') { setTested(previous => ({ ...previous, [stage]: result })); setNotice('Test complete. No matching results were saved.'); }
      else { await changed(); setCompleted({stage,result,at:Date.now()}); setNotice(`${titles[stage]} complete: ${count(result.matched)} of ${count(result.total)} linked.`); }
    } finally {setRunningStage(null);}
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

  return <section className="step4" data-ready={!loading && !!status && !error} aria-labelledby="step4-heading" aria-busy={loading || !!busy || savedRules.updating || progress.updating || final.updating}>
    <header className="step4-heading"><div><h1 id="step4-heading">Match payments</h1><p>Trace each sale through its settlement to the bank.</p></div><button disabled={!!busy || loading} onClick={() => void act('Refreshing…', async () => { await refresh(true); })}>Refresh</button></header>
    {error && <div className="step4-error" role="alert">{error}<button disabled={!!busy} onClick={() => void act('Retrying…', async () => { await refresh(true); })}>Retry</button></div>}
    <p className={`step4-live ${completed&&!busy?'step4-completed':''}`} role="status" aria-live="polite">{busy || (savedRules.updating || progress.updating || final.updating ? 'Updating…' : notice)}</p>
    {loading ? <div className="step4-loading" role="status">Loading rules and latest results…</div> : <>
      {!ready && <p className="step4-empty">Complete conversion and save the cleaning rules in Step 3 before matching.</p>}
      <div className="step4-flow" role="group" aria-label="Matching flow"><div className="step4-flow-node"><strong>POS</strong><span>{totals?`${count(totals.pos)} sales`:'Cleaned sales'}</span></div><FlowConnector active={runningStage==='l1'}/><div className="step4-flow-node"><strong>Settlement</strong><span>{totals?`${count(totals.stl)} rows`:'Provider reports'}</span></div><FlowConnector active={runningStage==='l2'}/><div className="step4-flow-node"><strong>Bank</strong><span>{totals?`${count(totals.credits)} credits`:'Bank credits'}</span></div>{runningStage&&<p className="step4-flow-status" role="status">{busy} Saved counts update when the stage finishes.</p>}</div>
      <div className="step4-stage-totals" aria-label="Latest saved results per stage">{stages.map((stage, index) => <div key={stage}><span>{index + 1}. {titles[stage]}</span><strong>{status?.matching[stage].done ? count(status.matching[stage].matched ?? 0) : 'Not run'}</strong><span>{status?.matching[stage].done ? `of ${count(status.matching[stage].total ?? 0)} linked` : 'No saved result'}</span></div>)}</div>
      {stages.map((stage, stageIndex) => {
        const saved = rules.filter(r => r.stage === stage);
        const locked = !ready || stage === 'l2' && !status?.matching.l1.done;
        const disabled = !!busy || locked;
        const activeRule = saved.some(rule => rule.id === focusedRule[stage]) ? focusedRule[stage] : saved[0]?.id;
        const confirmed = completed?.stage===stage?completed.result:status?.matching[stage].summary;
        return <section key={stage} className="step4-stage" aria-labelledby={`step4-${stage}`}>
          <div className="step4-stage-heading"><div className="step4-stage-title"><span className="step4-number" aria-hidden="true">{stageIndex + 1}</span><h2 id={`step4-${stage}`}>{titles[stage]}</h2></div><span className={`step4-status ${status?.matching[stage].done ? 'step4-ok' : ''}`}>{status?.matching[stage].done ? 'Saved result' : locked ? 'Waiting' : 'Ready'}</span></div>
          {locked && <p>{stage === 'l2' && ready ? 'Run POS to settlement first.' : 'Waiting for cleaned data.'}</p>}
          <p>Rules run from top to bottom. A linked row is used once per stage.</p>
          {saved.length > 0 ? <ol className="step4-rules">{saved.map((rule, index) => <li key={rule.id}>
            <label className="step4-rule-select"><input type="checkbox" disabled={disabled} aria-label={`Select ${rule.id}: ${rule.name}`} tabIndex={activeRule === rule.id ? 0 : -1} onFocus={() => setFocusedRule(previous => ({...previous,[stage]:rule.id}))} onKeyDown={event => {
              const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
              if (!delta && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const ticks = event.currentTarget.closest('ol')?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? saved.length - 1 : Math.max(0, Math.min(saved.length - 1,index + delta));
              ticks?.[next]?.focus();
            }} checked={selected[stage].includes(rule.id!)} onChange={e => { setSelected(previous => ({ ...previous, [stage]: e.target.checked ? [...previous[stage], rule.id!] : previous[stage].filter(id => id !== rule.id) })); setTested(previous => ({ ...previous, [stage]: undefined })); }} /><span><span className="step4-rule-id">{rule.id}</span><strong>{rule.name}</strong><small>{rule.conditions.join('; ')}</small></span></label>
            {confirmed?.hits&&rule.id&&Object.hasOwn(confirmed.hits,rule.id)&&<span className="step4-rule-hits" data-new={completed?.stage===stage&&!runningStage} key={`${rule.id}-${completed?.at||'saved'}`} aria-label={`${rule.id}: ${count(confirmed.hits[rule.id])} confirmed matches`}><AnimatedCount value={confirmed.hits[rule.id]} enabled={completed?.stage===stage&&!runningStage}/> matches</span>}
            <div className="step4-rule-actions"><button disabled={disabled || index === 0} aria-label={`Move ${rule.id} up`} onClick={() => reorder(stage, index, -1)}>↑</button><button disabled={disabled || index === saved.length - 1} aria-label={`Move ${rule.id} down`} onClick={() => reorder(stage, index, 1)}>↓</button><button disabled={disabled} onClick={() => setEditing(rule)}>Edit<span className="step4-sr-only"> {rule.id}</span></button><button disabled={disabled} onClick={() => { if (window.confirm(`Delete ${rule.id}? Results that used it will be cleared.`)) void act('Deleting rule…', async () => { await request(`/matching/rules/${rule.id}`, { method: 'DELETE' }); await changed(); }); }}>Delete<span className="step4-sr-only"> {rule.id}</span></button></div>
          </li>)}</ol> : <p className="step4-empty">No rules saved. Find suggestions from the cleaned data or create a rule.</p>}
          <div className="step4-actions"><button disabled={disabled} onClick={() => void act('Finding suggestions…', async () => { const proposals = await request<Rule[]>(`/matching/${stage}/suggestions`); setSuggestions(previous => ({ ...previous, [stage]: proposals })); })}>Find suggestions</button><button disabled={disabled} onClick={() => setEditing({ stage, kind: stage === 'l1' ? 'id' : 'withdrawal', params: { ...defaults[stage === 'l1' ? 'id' : 'withdrawal'] }, name: '', conditions: [] })}>Create rule</button><button disabled={disabled || saved.length === 0} onClick={() => execute(stage, 'test')}>Test selected rules</button><button className="step4-primary" disabled={disabled || saved.length === 0} onClick={() => execute(stage, 'run')}>Run matching</button></div>
          {tested[stage] && <p className="step4-preview" role="status">Test: {count(tested[stage]!.matched)} of {count(tested[stage]!.total)} linked. No results saved.</p>}
          {suggestions[stage]?.length === 0 && <p className="step4-empty">No additional rules found. Review the remaining rows in Match analysis.</p>}
          {suggestions[stage]?.map((rule, i) => <div className="step4-suggestion" key={`${rule.kind}-${i}`}><div><h3>{rule.name}</h3><p>{rule.why}</p><p>{count(rule.matches_alone ?? 0)} matches on its own; {count(rule.extra_after_saved ?? 0)} additional after saved rules.</p></div><button disabled={disabled} onClick={() => save(rule)}>Save suggestion</button></div>)}
          {editing?.stage === stage && <RuleEditor key={`${editing.id ?? 'new'}-${stage}`} rule={editing} request={request} busy={!!busy} onSave={save} onCancel={() => setEditing(null)} />}
        </section>;
      })}
      <section className="step4-results" aria-labelledby="step4-results-heading"><div className="step4-stage-heading"><h2 id="step4-results-heading">Matching results</h2><div className="step4-actions">{onOpenAnalysis && <button disabled={!results || !!busy} onClick={onOpenAnalysis}>Match analysis</button>}<button disabled={!results || !!busy} onClick={exportResults}>Export results</button></div></div>
        {totals ? <><p>The ring shows the share of POS sales traced through settlement to a bank credit.</p><div className="step4-result-grid" key={completed?.at||'saved'}><MatchRate full={totals.full} total={totals.pos} animate={!!completed}/><dl><div><dt>Matched</dt><dd><AnimatedCount value={totals.matched} enabled={!!completed}/></dd></div><div><dt>Mismatched</dt><dd className="step4-mismatch"><AnimatedCount value={totals.mismatched} enabled={!!completed}/></dd></div><div><dt>Needs review</dt><dd className="step4-review"><AnimatedCount value={totals.review} enabled={!!completed}/></dd></div><div><dt>Bank credits explained</dt><dd><AnimatedCount value={totals.credits_linked} enabled={!!completed}/> / {count(totals.credits)}</dd></div></dl></div><div className="step4-legend" aria-label="Matching result legend"><span><i className="step4-legend-value" aria-hidden="true"/>Green arc: traced to bank</span><span><i className="step4-legend-track" aria-hidden="true"/>Pale track: total POS sales</span></div><p className="visual-summary">{`${count(totals.full)} of ${count(totals.pos)} sales reached the bank; ${count(totals.mismatched)} mismatched and ${count(totals.review)} need review, with ${money(totals.cash)} in linked bank credits.`}</p></> : <p className="step4-empty">Run both stages to see the complete result. Changing an input or a used rule clears affected results.</p>}
      </section>
    </>}
  </section>;
}

export function Step4(props: Step4Props) {
  // Remount on workspace changes so results from an old request cannot cross clients.
  return <Step4Workspace key={props.clientId ?? ''} {...props} />;
}

export default Step4;
