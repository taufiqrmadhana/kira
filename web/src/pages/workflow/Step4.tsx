import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {ArrowLeft,ArrowRight,Check,ChevronDown,MoreHorizontal} from 'lucide-react';
import {Button,ErrorState,Loading,Menu,Modal,SummaryBand} from '../../components';
import './Step4.css';
import {count, money, plural} from '../../lib/format';
import {api} from '../../lib/api';
import {fetchResource, queryClient, resourceKey, useEndpoint} from '../../lib/query';
import {AnimatedCount, FlowConnector} from './WorkflowMotion';
import WorkflowGlossary from './WorkflowGlossary';
const RecordsTable=lazy(()=>import('../analysis/RecordsTable'));

type Stage = 'l1' | 'l2';
type Params = Record<string, string | number | boolean>;
type Rule = { id?: string; stage: Stage; kind: string; params: Params; name: string; conditions: string[]; why?: string; matches_alone?: number; extra_after_saved?: number; total?: number };
type Run = { matched: number; total: number; hits: Record<string, number>; rules?: string[]; unmatched_left?:number; unmatched_right?:number; batches?:number };
type Progress = { done: boolean; matched?: number; total?: number; summary?: Run };
type WorkflowStatus = { converted: boolean; upload_rules_pending: string[]; cleaning: { open: number; rules_version: number | null }; matching: Record<Stage, Progress> };
type Results = { totals: { rows?:number; pos: number; full: number; matched: number; mismatched: number; review: number; stl: number; l1: number; l2: number; cash: number; credits: number; credits_linked: number } };
type AnalysisSummary = {totals:{pos:number;matched:number;mismatched:number;review:number;open:number;records:number;amount:number;matched_amount:number}};
type Preview = Pick<Rule, 'name' | 'conditions' | 'matches_alone' | 'extra_after_saved' | 'total'>;
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type Step4Props = {
  clientId?: string;
  userName?: string;
  onDataChanged?: () => void;
  onOpenAnalysis?: () => void;
  onBack?: () => void;
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

function RuleActions({rule,index,total,disabled,onMove,onEdit,onDelete}:{rule:Rule;index:number;total:number;disabled:boolean;onMove:(direction:number)=>void;onEdit:()=>void;onDelete:()=>void}){
  const anchor=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
  return <div className="step4-rule-actions"><button ref={anchor} type="button" aria-label={`Actions for ${rule.id}`} aria-expanded={open} aria-haspopup="menu" disabled={disabled} onClick={()=>setOpen(!open)}><MoreHorizontal size={18} aria-hidden="true"/></button>{open&&<Menu label={`Actions for ${rule.id}`} anchorRef={anchor} onClose={()=>setOpen(false)} width={220} align="end" items={[
    {id:'up',label:'Move up',disabled:index===0,onSelect:()=>onMove(-1)},
    {id:'down',label:'Move down',disabled:index===total-1,onSelect:()=>onMove(1)},
    {id:'edit',label:'Edit rule',onSelect:onEdit},
    {id:'delete',label:'Delete rule',danger:true,onSelect:onDelete},
  ]}/>}</div>;
}

function stageSentence(stage:Stage,progress:Progress,confirmed?:Run){
  const matched=confirmed?.matched??progress.matched??0,total=confirmed?.total??progress.total??0;
  const left=confirmed?.unmatched_left??Math.max(0,total-matched),right=confirmed?.unmatched_right;
  return `${count(matched)} of ${count(total)} ${stage==='l1'?'POS sales':'settlements'} linked; ${count(left)} not linked${right===undefined?'':`; ${plural(right,stage==='l1'?'settlement row':'bank credit')} left over`}${stage==='l2'&&confirmed?.batches!==undefined?`; ${plural(confirmed.batches,'batch payout')} (many → 1)`:''}.`;
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

function Step4Workspace({ clientId = '', userName = '', onDataChanged, onOpenAnalysis, onBack }: Step4Props) {
  const savedRules = useEndpoint<Rule[]>('/matching/rules', clientId);
  const progress = useEndpoint<WorkflowStatus>('/status', clientId);
  const final = useEndpoint<Results | null>('/matching/results', clientId);
  const summary = useEndpoint<AnalysisSummary>(final.data?'/analysis/summary':null,clientId);
  const rules = savedRules.data ?? [];
  const status = progress.data ?? null;
  const results = final.data ?? null;
  const [focusedRule, setFocusedRule] = useState<Partial<Record<Stage,string>>>({});
  const [selected, setSelected] = useState<Record<Stage, string[]>>({ l1: [], l2: [] });
  const [suggestions, setSuggestions] = useState<Partial<Record<Stage, Rule[]>>>({});
  const [tested, setTested] = useState<Partial<Record<Stage, Run>>>({});
  const [editing, setEditing] = useState<Rule | null>(null);
  const loading = savedRules.loading || progress.loading || final.loading || summary.loading;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [runningStage, setRunningStage] = useState<Stage | null>(null);
  const [completed, setCompleted] = useState<{stage:Stage;result:Run;at:number} | null>(null);
  const [deleting,setDeleting]=useState<Rule|null>(null);
  const [combined,setCombined]=useState(false);

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

  const analysis=summary.data?.totals;
  const open=analysis?.open??Math.max(0,(totals?.rows??totals?.pos??0)-(totals?.pos??0));
  const mismatched=analysis?.mismatched??Math.max(0,(totals?.mismatched??0)-open);
  const review=analysis?.review??totals?.review??0;
  const complete=!!status?.matching.l1.done&&!!status.matching.l2.done;
  const recordCount=analysis?.records??totals?.rows??0;
  const confirmedFor=(stage:Stage)=>completed?.stage===stage?completed.result:status?.matching[stage].summary;

  return <section className="step4 wf-step-panel" data-ready={!loading && !!status && !error} aria-labelledby="step4-heading" aria-busy={loading || !!busy || savedRules.updating || progress.updating || final.updating}>
    <header className="wf-section-head step4-heading" data-tour="workflow-match-title"><div><p className="wf-step-label">Step 4 of 4</p><h2 id="step4-heading">Run matching</h2><p>Link each POS sale to its settlement, then trace the settlement to a bank credit.</p></div></header>
    {error && !deleting && <div className="step4-error" role="alert">{error}<Button disabled={!!busy} onClick={() => void act('Retrying…', async () => { await refresh(true); })}>Retry</Button></div>}
    <p className={`step4-live ${completed&&!busy?'step4-completed':''}`} role="status" aria-live="polite">{completed&&!busy&&<strong>Matching complete. </strong>}{busy || (savedRules.updating || progress.updating || final.updating ? 'Updating…' : notice)}</p>
    {loading ? <div className="step4-loading-layout"><Loading/></div> : <div className="step4-layout"><div className="step4-main">
      {!ready && <p className="step4-empty">Complete conversion and save the cleaning rules in Step 3 before matching.</p>}
      <section className="step4-matching-strip" data-tour="workflow-matching-flow" aria-label="Matching rules">
        <div className="step4-flow" role="group" aria-label="Matching flow"><div className="step4-flow-node"><strong>POS</strong><span>{totals?plural(totals.pos,'sale'):'Cleaned sales'}</span></div><FlowConnector active={runningStage==='l1'}/><div className="step4-flow-node"><strong>Settlement</strong><span>{totals?plural(totals.stl,'row'):'Provider reports'}</span></div><FlowConnector active={runningStage==='l2'}/><div className="step4-flow-node"><strong>Bank</strong><span>{totals?plural(totals.credits,'credit'):'Bank credits'}</span></div>{runningStage&&<p className="step4-flow-status" role="status">{busy} Saved counts update when the stage finishes.</p>}</div>
        <div className="step4-rules-strip">{stages.map(stage=>{const confirmed=confirmedFor(stage);return <div key={stage}><strong>{titles[stage]}</strong><div>{rules.filter(rule=>rule.stage===stage).map(rule=>confirmed?.hits&&rule.id&&Object.hasOwn(confirmed.hits,rule.id)?<span className="step4-rule-hits" data-new={completed?.stage===stage&&!runningStage} key={`${rule.id}-${completed?.at||'saved'}`} aria-label={`${rule.id}: ${count(confirmed.hits[rule.id])} confirmed matches`}><b>{rule.id}</b><AnimatedCount value={confirmed.hits[rule.id]} enabled={completed?.stage===stage&&!runningStage}/> matches</span>:<span className="step4-rule-pending" key={rule.id}><b>{rule.id}</b><span>No saved count</span></span>)}</div><span>{status?.matching[stage].done?`${count(confirmed?.matched??status.matching[stage].matched??0)} of ${count(confirmed?.total??status.matching[stage].total??0)} linked`:'No saved result'}</span></div>;})}</div>
      </section>
      {stages.map((stage, stageIndex) => {
        const saved = rules.filter(r => r.stage === stage);
        const locked = !ready || stage === 'l2' && !status?.matching.l1.done;
        const disabled = !!busy || locked;
        const isNextStage = !locked && !status?.matching[stage].done;
        const activeRule = saved.some(rule => rule.id === focusedRule[stage]) ? focusedRule[stage] : saved[0]?.id;
        const confirmed = confirmedFor(stage);
        return <section key={stage} className="step4-stage" data-tour={`workflow-match-${stage}`} aria-labelledby={`step4-${stage}`}>
          <div className="step4-stage-heading"><div className="step4-stage-title"><span className={`step4-number ${status?.matching[stage].done?'is-done':''}`} aria-label={status?.matching[stage].done?'Stage complete':`Stage ${stageIndex+1}`}>{status?.matching[stage].done?<Check size={20} aria-hidden="true"/>:stageIndex+1}</span><h3 id={`step4-${stage}`}>{titles[stage]}</h3></div><span className={`step4-status ${status?.matching[stage].done ? 'step4-ok' : ''}`}>{status?.matching[stage].done ? 'Saved result' : locked ? 'Waiting' : 'Ready'}</span></div>
          {status?.matching[stage].done&&<p className="step4-stage-result">{stageSentence(stage,status.matching[stage],confirmed)}</p>}
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
            <RuleActions rule={rule} index={index} total={saved.length} disabled={disabled} onMove={direction=>reorder(stage,index,direction)} onEdit={()=>setEditing(rule)} onDelete={()=>{setError('');setDeleting(rule);}}/>
          </li>)}</ol> : <p className="step4-empty">No rules saved. Find suggestions from the cleaned data or create a rule.</p>}
          <div data-tour="workflow-stage-actions" className="step4-actions"><Button disabled={disabled} onClick={() => void act('Finding suggestions…', async () => { const proposals = await request<Rule[]>(`/matching/${stage}/suggestions`); setSuggestions(previous => ({ ...previous, [stage]: proposals })); })}>Find suggestions</Button><Button disabled={disabled} onClick={() => setEditing({ stage, kind: stage === 'l1' ? 'id' : 'withdrawal', params: { ...defaults[stage === 'l1' ? 'id' : 'withdrawal'] }, name: '', conditions: [] })}>Create rule</Button><Button disabled={disabled || saved.length === 0} onClick={() => execute(stage, 'test')}>Test selected rules</Button><Button variant={isNextStage?"primary":"secondary"} className={isNextStage?"step4-primary":undefined} disabled={disabled || saved.length === 0} onClick={() => execute(stage, 'run')}>Run matching</Button></div>
          {tested[stage] && <p className="step4-preview" role="status">Test: {count(tested[stage]!.matched)} of {count(tested[stage]!.total)} linked. No results saved.</p>}
          {suggestions[stage]?.length === 0 && <p className="step4-empty">No additional rules found. Review the remaining rows in Match analysis.</p>}
          {suggestions[stage]?.map((rule, i) => <div className="step4-suggestion" key={`${rule.kind}-${i}`}><div><h3>{rule.name}</h3><p>{rule.why}</p><p>{count(rule.matches_alone ?? 0)} matches on its own; {count(rule.extra_after_saved ?? 0)} additional after saved rules.</p></div><Button disabled={disabled} onClick={() => save(rule)}>Save suggestion</Button></div>)}
          {editing?.stage === stage && <RuleEditor key={`${editing.id ?? 'new'}-${stage}`} rule={editing} request={request} busy={!!busy} onSave={save} onCancel={() => setEditing(null)} />}
        </section>;
      })}
      <Button data-tour="workflow-ask-kira" onClick={()=>window.dispatchEvent(new CustomEvent('kira:ask',{detail:{message:'Why is the match rate not 100%?',context:{page:'Workflow',step:4}}}))}>Why not 100%? Ask Kira</Button>
      <section className="step4-results" data-tour="workflow-results" aria-labelledby="step4-results-heading"><div className="step4-stage-heading"><h3 id="step4-results-heading">Results</h3><div className="step4-actions">{onOpenAnalysis && <Button disabled={!results || !!busy} onClick={onOpenAnalysis}>Open match analysis</Button>}<Button data-tour="workflow-export" disabled={!results || !!busy} onClick={exportResults}>Export results</Button></div></div>
        {summary.error?<ErrorState message={summary.error} retry={summary.retry}/>:totals?<>
          <p>The ring shows the share of POS sales traced through settlement to a bank credit.</p>
          <SummaryBand key={completed?.at||'saved'} rate={totals.pos?totals.full/totals.pos*100:null} animate={!!completed} stages={stages.map(stage=>{const result=confirmedFor(stage)??status!.matching[stage];const matched=result.matched??(stage==='l1'?totals.l1:totals.l2),total=result.total??(stage==='l1'?totals.pos:totals.stl);return {label:titles[stage],value:total?matched/total*100:null,detail:`${count(matched)} of ${plural(total,stage==='l1'?'POS sale':'settlement')} linked`};})} kpis={[
            {label:'POS sales',numericValue:totals.pos,detail:analysis?.amount===undefined?undefined:money(analysis.amount)},
            {label:'Matched',numericValue:analysis?.matched??totals.full,tone:'green',detail:'POS sales traced to a bank credit'},
            {label:'Mismatched',numericValue:mismatched,tone:'red',detail:'POS sales missing a link'},
            {label:'Needs review',numericValue:review,tone:'amber'},
            {label:'Open without a sale',numericValue:open,detail:'Settlement or bank records outside the POS count'},
            {label:'Bank credits explained',numericValue:totals.cash,formatValue:money,detail:`${count(totals.credits_linked)} of ${plural(totals.credits,'credit')}`},
          ]}/>
          <div className="step4-legend" aria-label="Matching result legend"><span><i className="step4-legend-value" aria-hidden="true"/>Green arc: traced to bank</span><span><i className="step4-legend-track" aria-hidden="true"/>Pale track: total POS sales</span></div>
          <p className="visual-summary">{`${count(totals.full)} of ${count(totals.pos)} sales reached the bank; ${count(mismatched)} mismatched and ${count(review)} need review, with ${money(totals.cash)} in linked bank credits.`}</p>
          <Button data-tour="workflow-combined-table" aria-expanded={combined} aria-controls="workflow-combined-records" onClick={()=>setCombined(!combined)}>{combined?'Hide':'Show'} the combined table ({plural(recordCount,'row')})<ChevronDown size={16} aria-hidden="true"/></Button>
          {combined&&<div id="workflow-combined-records"><Suspense fallback={<Loading/>}><RecordsTable caption="Combined records" client={clientId}/></Suspense></div>}
        </>:<p className="step4-empty">Run both stages to see the complete result. Changing an input or a used rule clears affected results.</p>}
      </section>
    </div><WorkflowGlossary/></div>}
    <footer className="wf-step-footer"><Button disabled={!!busy||!onBack} onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>Back</Button><p>{complete?'Both stages are saved. Open Match analysis to inspect the evidence.':'Run both stages to finish this close.'}</p>{onOpenAnalysis&&<Button variant="primary" disabled={!!busy||!complete} onClick={onOpenAnalysis}>Next: Match analysis<ArrowRight size={16} aria-hidden="true"/></Button>}</footer>
    {deleting&&<Modal title={`Delete ${deleting.id}?`} onClose={()=>{if(!busy)setDeleting(null);}}><p>Delete this matching rule? Results that used it will be cleared. The source files stay available.</p>{error&&<p role="alert" className="step4-error">{error}</p>}<div className="step4-actions"><Button onClick={()=>setDeleting(null)} disabled={!!busy}>Cancel</Button><Button variant="danger" disabled={!!busy} onClick={()=>void act('Deleting rule…',async()=>{await request(`/matching/rules/${deleting.id}`,{method:'DELETE'});setDeleting(null);await changed();})}>Delete rule</Button></div></Modal>}
  </section>;
}

export function Step4(props: Step4Props) {
  // Remount on workspace changes so results from an old request cannot cross clients.
  return <Step4Workspace key={props.clientId ?? ''} {...props} />;
}

export default Step4;
