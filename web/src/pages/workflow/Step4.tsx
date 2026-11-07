import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowRight, Check, Info, Layers, RefreshCw} from 'lucide-react';
import {count} from '../../lib/format';
import {ApiError} from '../../lib/api';
import {streamProgress, type ProgressUpdate} from '../../lib/progress';
import {blockTourNavigation, TOUR_NAVIGATION_EVENT} from '../../kira/tourNavigation';
import MatchingResults from './MatchingResults';
import {stages, titles, type Rule, type Run, type WorkflowStatus, type Results, type Request, type Stage} from './matchingTypes';
import './Step4.css';
import {newRule as createRule, RuleEditor} from './Step4.rules';
export type Step4Props = {clientId?: string; userName?: string; onDataChanged?: () => void; onOpenAnalysis?: () => void;};
function HitBadges({hits}: {hits?: Record<string, number>}) {
  return <div className="step4-hit-badges">{Object.entries(hits || {}).map(([id, hits]) => <span key={id}><b className="step4-rule-id">{id}</b>{count(hits)} hits</span>)}</div>;
}
function RunSummary({result, stage}: {result: Run; stage: Stage}) {
  const left = stage === 'l1' ? 'POS sales' : 'settlement rows';
  const right = stage === 'l1' ? 'settlement rows' : 'bank credits';
  return <><div className="step4-run-summary"><p><strong>{count(result.matched)}</strong>{' of ' + count(result.total) + ' ' + left + ' matched'}</p><p><strong>{count(result.unmatched_left ?? Math.max(0, result.total - result.matched))}</strong>{' ' + left + ' unmatched'}</p>{result.unmatched_right !== undefined && <p><strong>{count(result.unmatched_right)}</strong>{' ' + right + ' left over'}</p>}</div><HitBadges hits={result.hits}/></>;
}
function Glossary() {
  return <aside className="step4-glossary" aria-labelledby="step4-glossary-title"><h2 id="step4-glossary-title"><Info size={16}/>Glossary</h2><dl>
    <div><dt>Run</dt><dd>Links sales to settlements, then settlements to the money received in your bank.</dd></div>
    <div><dt>Matching rule</dt><dd>Saved conditions such as a reference, outlet or amount. Rules run in order and can be reused.</dd></div>
    <div><dt>Test</dt><dd>Tries the selected rules without saving a matching result.</dd></div>
    <div><dt>Batch payout</dt><dd>One bank credit pays several settlements. It appears once beside those rows in the combined table.</dd></div>
    <div><dt>Match rate</dt><dd>POS sales traced all the way to the bank, divided by all POS sales.</dd></div>
    <div><dt>Mismatched</dt><dd>A record is missing a link or has an unexplained amount difference.</dd></div>
    <div><dt>Needs review</dt><dd>Only the amount agrees, or several credits could fit. Check the evidence before deciding.</dd></div>
  </dl></aside>;
}
function Step4Workspace({clientId = '', userName = '', onDataChanged, onOpenAnalysis}: Step4Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [status, setStatus] = useState<WorkflowStatus | null>(null), [results, setResults] = useState<Results | null>(null);
  const [focusedRule, setFocusedRule] = useState<Partial<Record<Stage,string>>>({});
  const [selected, setSelected] = useState<Record<Stage, string[]>>({l1: [], l2: []});
  const [suggestions, setSuggestions] = useState<Partial<Record<Stage, Rule[]>>>({});
  const [tested, setTested] = useState<Partial<Record<Stage, Run>>>({});
  const [expanded, setExpanded] = useState<Partial<Record<Stage, boolean>>>({});
  const [editing, setEditing] = useState<Rule | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [running, setRunning] = useState<Stage | null>(null), [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const scope = useRef<AbortController | null>(null), busyRef = useRef(false);
  useEffect(() => {
    const guard = (event: Event) => {if (busyRef.current) blockTourNavigation(event, 'Finish the current matching action before starting the tour.');};
    document.addEventListener(TOUR_NAVIGATION_EVENT, guard);
    return () => document.removeEventListener(TOUR_NAVIGATION_EVENT, guard);
  }, []);
  const headers = useCallback(() => new Headers({'X-Kira-Client': clientId, 'X-Kira-User': userName}), [clientId, userName]);
  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const boundHeaders = headers();
    new Headers(init?.headers).forEach((value, key) => boundHeaders.set(key, value));
    if (init?.body) boundHeaders.set('Content-Type', 'application/json');
    const response = await fetch('/api' + path, {...init, headers: boundHeaders, credentials: 'include', signal: init?.signal ?? scope.current?.signal});
    if (!response.ok) {const payload = await response.json().catch(() => ({})); throw new Error(response.status === 401 ? 'Your session expired. Sign in again.' : typeof payload.detail === 'string' ? payload.detail : 'The request failed. Try again.');}
    return response.json() as Promise<T>;
  }, [headers]);
  const refresh = useCallback(async (signal = scope.current?.signal) => {
    const [saved, current, final] = await Promise.all([request<Rule[]>('/matching/rules', {signal}), request<WorkflowStatus>('/status', {signal}), request<Results | null>('/matching/results', {signal})]);
    if (signal?.aborted) return;
    setRules(saved); setStatus(current); setResults(final); setRefreshRequired(false);
    setSelected({l1: saved.filter(r => r.stage === 'l1' && r.params.enabled !== false).map(r => r.id!), l2: saved.filter(r => r.stage === 'l2' && r.params.enabled !== false).map(r => r.id!)});
  }, [request]);
  useEffect(() => {
    const abort = new AbortController(); scope.current = abort;
    refresh(abort.signal).catch(cause => {if (!abort.signal.aborted) setError(cause.message);}).finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [refresh]);
  const act = async (message: string, operation: () => Promise<void>) => {
    if (busyRef.current || scope.current?.signal.aborted) return;
    busyRef.current = true; setBusy(message); setError(''); setNotice('');
    try {await operation();} catch (cause) {if (!scope.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'The request failed. Try again.');}
    finally {busyRef.current = false; if (!scope.current?.signal.aborted) {setBusy(''); setRunning(null); setProgress(null);}}
  };
  const changed = async () => {
    if (scope.current?.signal.aborted) return;
    setTested({}); setSuggestions({}); await refresh();
    if (!scope.current?.signal.aborted) onDataChanged?.();
  };
  const editRule = (rule: Rule) => {setTested(previous => ({...previous, [rule.stage]: undefined})); setEditing(rule);};
  const newRule = (stage: Stage) => editRule(createRule(stage));
  const save = (rule: Rule) => void act('Saving rule…', async () => {
    await request(rule.id ? '/matching/rules/' + rule.id : '/matching/' + rule.stage + '/rules', {method: rule.id ? 'PATCH' : 'POST', body: JSON.stringify({kind: rule.kind, params: rule.params, name: rule.name})});
    if (scope.current?.signal.aborted) return;
    setEditing(null); await changed(); setNotice(rule.params.enabled === false ? 'Rule saved inactive. Review and activate it when you are ready.' : 'Rule saved. Test it before generating the result.');
  });
  const reorder = (stage: Stage, index: number, direction: number) => void act('Updating rule order…', async () => {
    const ids = rules.filter(r => r.stage === stage).map(r => r.id!);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await request('/matching/' + stage + '/order', {method: 'POST', body: JSON.stringify({rule_ids: ids})});
    await changed(); if (!scope.current?.signal.aborted) setNotice('Rule order saved. Results affected by this change were cleared.');
  });
  const test = (stage: Stage) => void act('Testing ' + titles[stage] + '…', async () => {
    const ids = [...selected[stage]];
    const result = await request<Run>('/matching/' + stage + '/test', {method: 'POST', body: JSON.stringify({rule_ids: ids})});
    if (scope.current?.signal.aborted) return;
    setTested(previous => ({...previous, [stage]: result})); setNotice('Test complete. No matching results were saved.');
  });
  const generate = (stage: Stage) => {
    if (!tested[stage]) return;
    void act('Generating ' + titles[stage] + '…', async () => {
      setRunning(stage); setProgress(null); setResults(null);
      const signal = scope.current!.signal, ids = [...selected[stage]];
      let result: Run;
      try {
        result = await streamProgress<Run>('/matching/' + stage + '/run/stream', {method: 'POST', headers: headers(), signal, body: JSON.stringify({rule_ids: ids})}, update => {if (!signal.aborted) setProgress(update);});
      } catch (cause) {
        if (signal.aborted) return;
        if (cause instanceof ApiError) throw cause;
        setTested({}); setStatus(null); setRefreshRequired(true);
        setError('The matching result could not be confirmed. Refresh results before continuing.');
        return;
      }
      if (signal.aborted) return;
      setExpanded(previous => ({...previous, [stage]: false}));
      try {await changed();} catch {
        if (!signal.aborted) {setStatus(null); setRefreshRequired(true); setError('The matching result was saved, but could not be refreshed. Refresh results before continuing.');}
        return;
      }
      if (!signal.aborted) setNotice(titles[stage] + ' complete: ' + count(result.matched) + ' of ' + count(result.total) + ' linked.');
    });
  };
  const exportResults = () => void act('Preparing Excel file…', async () => {
    const response = await fetch('/api/matching/export.xlsx', {headers: headers(), credentials: 'include', signal: scope.current?.signal});
    if (!response.ok) throw new Error('Export failed. Refresh the results and try again.');
    const blob = await response.blob(); if (scope.current?.signal.aborted) return;
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'kira-results.xlsx'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const ready = !!status?.converted && status.cleaning.rules_version !== null && status.cleaning.open === 0 && status.upload_rules_pending.length === 0;
  return <section className="step4" aria-labelledby="step4-heading" aria-busy={loading || !!busy}>
    <header className="step4-heading"><div><p className="step4-eyebrow">Step 4 of 4</p><h1 id="step4-heading">Run matching</h1><p>Choose and test your rules, then generate the result for each stage.</p></div><button disabled={!!busy || loading} onClick={() => void act('Refreshing…', changed)}><RefreshCw size={15}/>Refresh</button></header>
    {error && <div className="step4-error" role="alert">{error}<button disabled={!!busy} onClick={() => void act('Refreshing…', async () => {await changed(); setLoading(false);})}>Refresh results</button></div>}
    {(busy || notice) && <p className="step4-live" role="status" aria-live="polite">{busy || notice}</p>}
    {loading ? <p role="status">Loading rules and latest results…</p> : <>
      {!ready && <p className="step4-empty">Complete conversion and save the cleaning rules in Step 3 before matching.</p>}
      <div className="step4-workspace"><div className="step4-stage-list">
      <section className="step4-rule-summary" aria-label="Matching rules"><header><h2><Layers size={16}/>Matching rules</h2><span>{count(rules.length)} saved</span></header><div className="step4-rule-summary-stages">{stages.map(stage => <div key={stage}><h3>{titles[stage]}</h3>{rules.filter(rule => rule.stage === stage).map(rule => {const hits = status?.matching[stage].summary?.hits[rule.id!]; return <div className="step4-rule-summary-item" key={rule.id}><b className="step4-rule-id">{rule.id}</b><span>{rule.name}</span><small>{['withdrawal', 'batch'].includes(rule.kind) ? 'Many → 1' : '1 → 1'}</small>{hits !== undefined && <strong>{count(hits)} hits</strong>}</div>;})}{!rules.some(rule => rule.stage === stage) && <p>No rules yet.</p>}</div>)}</div></section>
      {stages.map((stage, stageIndex) => {
        const saved = rules.filter(r => r.stage === stage), savedResult = status?.matching[stage];
        const locked = !ready || stage === 'l2' && !status?.matching.l1.done, disabled = !!busy || locked || refreshRequired;
        const compact = savedResult?.done && !expanded[stage], activeRule = saved.some(rule => rule.id === focusedRule[stage]) ? focusedRule[stage] : saved[0]?.id;
        return <section data-tour={`matching-stage-${stage}`} key={stage} className={'step4-stage' + (compact ? ' is-complete' : '') + (running === stage ? ' is-running' : '')} aria-labelledby={'step4-' + stage}>
          <div className="step4-stage-heading"><div className="step4-stage-title"><span className="step4-number" aria-hidden="true">{compact ? <Check size={18}/> : stageIndex + 1}</span><div><p className="step4-eyebrow">Stage {stageIndex + 1}</p><h2 id={'step4-' + stage}>{titles[stage]}</h2></div></div><span className={'step4-status' + (savedResult?.done ? ' step4-ok' : '')}>{running === stage ? 'Matching' : savedResult?.done ? 'Done' : locked ? 'Waiting' : 'Ready'}</span></div>
          {running === stage ? <div className="step4-progress" role="region" aria-label={titles[stage] + ' live progress'}><div><strong>Applying the selected rules…</strong><span>{progress ? count(progress.completed) + ' of ' + count(progress.total) + ' checks' : 'Waiting for the first progress update…'}</span></div><progress aria-label={titles[stage] + ' matching progress'} max={progress ? Math.max(1, progress.total) : undefined} value={progress?.completed}/>{progress?.matched !== undefined && <p>{count(progress.matched)} linked so far</p>}<HitBadges hits={progress?.hits}/><small>Checks count each rule's work; a row can be checked by more than one rule.</small></div>
          : compact ? <><RunSummary stage={stage} result={savedResult.summary || {matched: savedResult.matched ?? 0, total: savedResult.total ?? 0, hits: {}}}/><button className="step4-change-rules" disabled={!!busy} onClick={() => setExpanded(previous => ({...previous, [stage]: true}))}>Change rules</button></>
          : <>
          {locked && <p>{stage === 'l2' && ready ? 'Generate the POS to settlement result first.' : 'Waiting for cleaned data.'}</p>}
          <p>Active rules run from top to bottom. Each linked row is used once.</p>{stage === 'l1' && <p>When several settlements meet a rule, POS rows are paired in source order. Composite rules choose the nearest time, then settlement source order to break ties.</p>}
{saved.length > 0 ? <ol className="step4-rules">{saved.map((rule, index) => <li key={rule.id}>
            <label className="step4-rule-select"><input type="checkbox" disabled={disabled || rule.params.enabled === false} aria-label={`Select ${rule.id}: ${rule.name}`} tabIndex={activeRule === rule.id ? 0 : -1} onFocus={() => setFocusedRule(previous => ({...previous,[stage]:rule.id}))} onKeyDown={event => {
              const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
              if (!delta && event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const ticks = event.currentTarget.closest('ol')?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? saved.length - 1 : Math.max(0, Math.min(saved.length - 1,index + delta));
              ticks?.[next]?.focus();
            }} checked={selected[stage].includes(rule.id!)} onChange={e => { setSelected(previous => ({ ...previous, [stage]: e.target.checked ? [...previous[stage], rule.id!] : previous[stage].filter(id => id !== rule.id) })); setTested(previous => ({ ...previous, [stage]: undefined })); }} /><span><span className="step4-rule-id">{rule.id}</span><strong>{rule.name}</strong><small>Priority {index + 1} · {rule.params.enabled === false ? 'Inactive' : 'Active'}</small><small>{rule.conditions.join('; ')}</small></span></label>
            <div className="step4-rule-actions"><button disabled={disabled} aria-label={`${rule.params.enabled === false ? 'Activate' : 'Deactivate'} ${rule.id}`} onClick={()=>{const next={...rule,params:{...rule.params,enabled:rule.params.enabled===false}};if(next.params.enabled)editRule(next);else save(next);}}>{rule.params.enabled === false ? 'Activate' : 'Deactivate'}</button><button disabled={disabled || index === 0} aria-label={`Move ${rule.id} up`} onClick={() => reorder(stage, index, -1)}>↑</button><button disabled={disabled || index === saved.length - 1} aria-label={`Move ${rule.id} down`} onClick={() => reorder(stage, index, 1)}>↓</button><button disabled={disabled} onClick={() => editRule(rule)}>Edit<span className="step4-sr-only"> {rule.id}</span></button><button disabled={disabled} onClick={() => { if (window.confirm(`Delete ${rule.id}? Results that used it will be cleared.`)) void act('Deleting rule…', async () => { await request(`/matching/rules/${rule.id}`, { method: 'DELETE' }); await changed(); }); }}>Delete<span className="step4-sr-only"> {rule.id}</span></button></div>
          </li>)}</ol> : <p className="step4-empty">No rules saved. Find suggestions from the cleaned data or create a rule.</p>}

          <div className="step4-actions"><button disabled={disabled} onClick={() => void act('Finding suggestions…', async () => {const proposals = await request<Rule[]>('/matching/' + stage + '/suggestions'); if (!scope.current?.signal.aborted) setSuggestions(previous => ({...previous, [stage]: proposals}));})}>Find suggestions</button><button disabled={disabled} onClick={() => newRule(stage)}>Create rule</button><button className="step4-primary" disabled={disabled || selected[stage].length === 0 || !!editing} onClick={() => test(stage)}>Test selected rules<ArrowRight size={15}/></button></div>
          {tested[stage] && <><section className="step4-test-overview" aria-label={titles[stage] + ' test results'}><RunSummary stage={stage} result={tested[stage]!}/><small>Test only. No matching results saved.</small></section><div className="step4-test-decision"><strong>Do you want to try creating a new matching rule?</strong><div className="step4-actions"><button disabled={disabled} onClick={() => newRule(stage)}>Yes, create a new rule</button><button className="step4-primary" disabled={disabled} onClick={() => generate(stage)}>No, generate matching result<ArrowRight size={15}/></button></div></div></>}
          {suggestions[stage]?.length === 0 && <p className="step4-empty">No additional rules found. Review the remaining rows in Match analysis.</p>}
          {suggestions[stage]?.map((rule, i) => <div className="step4-suggestion" key={rule.kind + '-' + i}><div><h3>{rule.name}</h3><p>{rule.why}</p><p>{count(rule.matches_alone ?? 0)} matches on its own; {count(rule.extra_after_saved ?? 0)} additional after saved rules.</p></div><button disabled={disabled} onClick={() => save({...rule,params:{...rule.params,enabled:false}})}>Save suggestion</button></div>)}
          {editing?.stage === stage && <RuleEditor key={(editing.id ?? 'new') + stage} rule={editing} request={request} busy={!!busy} onSave={save} onCancel={() => setEditing(null)}/>}
          </>}
        </section>;
      })}</div><Glossary/></div>
      <MatchingResults results={results} status={status} request={request} busy={!!busy} onExport={exportResults} onOpenAnalysis={onOpenAnalysis}/>
    </>}
  </section>;
}
export function Step4(props: Step4Props) {return <Step4Workspace key={props.clientId ?? ''} {...props}/>;}
export default Step4;
