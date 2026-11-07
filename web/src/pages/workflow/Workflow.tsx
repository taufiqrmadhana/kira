import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {Check, RefreshCw} from 'lucide-react';
import {Button, ErrorState, Loading, Toast} from '../../components';
import {clientPath, identity} from '../../lib/api';
import {useResource} from '../../lib/useResource';
import {fetchResource, queryClient, resourceKey} from '../../lib/query';
import {StepTransition} from './WorkflowMotion';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import {availableStep, errorMessage, type RunAction, type WorkflowData} from './types';
import './workflow.css';

const steps = [{title: 'Upload raw files', detail: 'POS, settlement and mutation'}, {title: 'Convert', detail: 'Raw files become tables'}, {title: 'Clean', detail: 'Fix data to your standard'}, {title: 'Run matching', detail: 'Start the automation'}];

function Workspace() {
  const resource = useResource<WorkflowData>('/workflow?rows=5');
  const data = resource.data, loading = resource.loading;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const locked = useRef(false);
  const stepper = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({width:0,height:0,transform:'translate(0,0)'});
  const reload = useCallback(async (force = false) => {
    if (force) await queryClient.invalidateQueries({queryKey: resourceKey('/workflow?rows=5'), refetchType: 'none'});
    await fetchResource<WorkflowData>('/workflow?rows=5');
    setError(''); setRevision(value => value + 1);
  }, []);
  useEffect(() => { if (resource.error) setError(resource.error); }, [resource.error]);
  const max = data ? availableStep(data) : 1;
  const requested = Number(params.get('step') || '1');
  const step = Math.min(max, Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1));
  useLayoutEffect(() => {
    const nav=stepper.current;
    const place=()=>{const active=nav?.querySelector<HTMLElement>('[aria-current="step"]');if(active)setIndicator({width:active.offsetWidth,height:active.offsetHeight,transform:`translate(${active.offsetLeft}px,${active.offsetTop}px)`});};
    place();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(place):null;if(nav)observer?.observe(nav);return()=>observer?.disconnect();
  },[step]);
  const go = (next: number) => {setParams(previous => {const updated = new URLSearchParams(previous); updated.set('step', String(Math.min(next, max))); return updated;}); window.scrollTo({top: 0, behavior: 'instant'});};
  const run: RunAction = async (label, action) => {
    if (locked.current) return false;
    locked.current = true; setBusy(label); setError('');
    try {const message = await action(); await reload(); if (message) setNotice(message); return true;}
    catch (err) {await reload().catch(() => {}); setError(errorMessage(err)); return false;}
    finally {locked.current = false; setBusy('');}
  };
  return <div className="workflow" aria-busy={resource.updating} data-page="workflow" data-ready={!loading && !!data && !error}>
    <div className="page-head"><div><h1>Reconcile your payments.</h1><p>Four steps: upload raw files, convert them into tables, clean them to your standard, then run the matching.</p></div><Button disabled={!!busy || loading} onClick={() => void reload(true).catch(() => {})} aria-label="Refresh workflow"><RefreshCw size={16}/>Refresh</Button></div>
    {resource.updating && <p role="status">Updating…</p>}
    <nav ref={stepper} className="wf-stepper" aria-label="Workflow steps"><span className="wf-step-indicator" style={indicator} aria-hidden="true"/>{steps.map((item, index) => <button key={item.title} className={index + 1 < max && step !== index + 1 ? 'is-complete' : ''} disabled={index + 1 > max || !!busy} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => go(index + 1)}><span className="wf-step-number">{index + 1 < max && step !== index + 1 ? <Check size={16} aria-label="Complete"/> : index + 1}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</nav>
    {error && <div className="wf-request-error" role="alert"><p>{error}</p><Button onClick={() => void reload(true).catch(() => {})} disabled={!!busy}>Retry</Button></div>}
    {loading ? <Loading/> : !data ? <ErrorState message={error || 'No workflow data received.'} retry={() => void reload(true).catch(() => {})}/> : <StepTransition step={step}>
      {step === 1 && <Step1 data={data} busy={busy} run={run} revision={revision} onNext={() => go(2)}/>}
      {step === 2 && <Step2 data={data} busy={busy} run={run} onBack={() => go(1)} onNext={() => go(3)}/>}
      {step === 3 && <Step3 data={data} busy={busy} run={run} revision={revision} onBack={() => go(2)} onNext={() => go(4)}/>}
      {step === 4 && <Step4 clientId={identity.client()} userName={identity.user()} onDataChanged={() => {void reload().catch(() => {});}} onOpenAnalysis={() => navigate(clientPath('/analysis'))}/>}
    </StepTransition>}
    {notice && <Toast onClose={() => setNotice('')}>{notice}</Toast>}
  </div>;
}

export default function Workflow() {return <Workspace key={identity.client()}/>;}
