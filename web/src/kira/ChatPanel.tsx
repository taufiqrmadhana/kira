import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {createPortal} from 'react-dom';
import {Paperclip,History} from 'lucide-react';
import {useEndpoint} from '../lib/query';
import {download} from '../lib/api';
import {resolveChatTour,chapters} from '../tour/tours';
import {contextLabel,suggestions,screenContext} from './context';
import GuidedClose from './guided/GuidedClose';
import {useGuidedClose} from './guided/useGuidedClose';
import FileSlot from './guided/FileSlot';
import {stepNames} from './guided/engine';
import type {Area} from '../pages/workflow/types';
import { Markdown } from './Markdown';
import { ApprovalDetails } from './ApprovalDetails';
import { Icon } from './Icons';
import { KiraMascot } from './KiraMascot';
import {
  collectEffects, pendingFromHistory, requestAgent, TOOL_LABELS,
  type ChangeDestination, type ChatReply, type Highlight, type HistoryMessage,
  type PendingApproval, type ScreenContext, type ToolCall,
} from './protocol';

export interface ChatPanelProps {
  client: string;
  user: string;
  context?: ScreenContext;
  apiBase?: string;
  initiallyOpen?: boolean;
  presentation?: 'dock' | 'popup' | 'workspace';
  launcherTargets?: {desktop:string;mobile:string};
  onOpenChange?: (open:boolean)=>void;
  onDataChanged: (calls: ToolCall[], destination?: ChangeDestination) => void | Promise<void>;
  onHighlight: (highlight: Highlight) => void;
  onUnauthorized?: () => void;
}

const memory = new Map<string, string>();
function readStorage(key: string) {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
}
function writeStorage(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Keep this tab usable in private storage modes. */ }
}
function createSession() {
  return globalThis.crypto?.randomUUID?.() ?? `kira-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function initialSession(key: string) {
  const value = readStorage(key) || createSession();
  writeStorage(key, value);
  return value;
}
function readPending(key: string): PendingApproval[] {
  try {
    const value: unknown = JSON.parse(readStorage(key) || '[]');
    return Array.isArray(value) ? value.filter((item): item is PendingApproval =>
      typeof item?.id === 'string' && typeof item?.tool === 'string' && item?.args && typeof item.args === 'object') : [];
  } catch { return []; }
}

function ToolTrace({ calls }: { calls: ToolCall[] }) {
  if (!calls.length) return null;
  return <details className="kira-trace" data-tour="kira-trace">
    <summary>How Kira got this <span>({calls.length})</span></summary>
    <ol>{calls.map((call, index) => <li key={index}>
      <span>{call.result?.status === 'pending' ? `Awaiting approval: ${call.tool.replaceAll('_', ' ')}` : call.result?.status === 'error' ? `${call.tool.replaceAll('_', ' ')}: ${call.result.message || 'could not finish'}` : TOOL_LABELS[call.tool] || call.tool.replaceAll('_', ' ')}</span>
      <details><summary>View evidence</summary><pre>{JSON.stringify({ inputs: call.args, result: call.result }, null, 2).slice(0, 16000)}</pre></details>
    </li>)}</ol>
  </details>;
}

function Suggestions({ disabled, onSelect,questions }: { disabled: boolean; onSelect: (question: string) => void;questions:string[] }) {
  return <div className="kira-prompts" data-tour="kira-chips" role="group" aria-label="Suggested questions">
    {questions.map(question => <button type="button" key={question} onClick={() => onSelect(question)} disabled={disabled}><span>{question}</span><Icon name="arrow" /></button>)}
  </div>;
}

/** Docked by default; the workspace can opt into the mascot popup. */
export function ChatPanel(props: ChatPanelProps) {
  return <ScopedChat key={`${props.client}\u0000${props.user}`} {...props} />;
}

function ScopedChat({ client, user, context = {}, apiBase = '/api', initiallyOpen = false, presentation = 'dock', launcherTargets, onOpenChange, onDataChanged, onHighlight, onUnauthorized }: ChatPanelProps) {
  const popup = presentation === 'popup';
  const workspace = presentation === 'workspace';
  const [mobile,setMobile]=useState(()=>window.matchMedia?.('(max-width: 799px)').matches ?? false);
  const [launchTarget,setLaunchTarget]=useState<HTMLElement|null>(null);
  const storageKey = `kira:chat:${encodeURIComponent(client)}:${encodeURIComponent(user)}`;
  const [sessionId, setSessionId] = useState(() => initialSession(storageKey));
  const pendingKey = `${storageKey}:pending:${sessionId}`;
  const [open, setOpen] = useState(initiallyOpen);
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>(() => readPending(pendingKey));
  const [input, setInput] = useState('');
  const [askContext,setAskContext]=useState<ScreenContext>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const approvalRef = useRef<HTMLHeadingElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const historyTicket = useRef(0);
  const loadedHistory = useRef('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const connection = { baseUrl: apiBase, client, user, onUnauthorized };
  const guide=useGuidedClose(client,user,initiallyOpen&&new URLSearchParams(location.search).get('guide')==='1',open);
  const [requestedArea,setRequestedArea]=useState<Area|null>(null),[fileNote,setFileNote]=useState(''),[tourDemo,setTourDemo]=useState<'guided'|'kira'|null>(null);
  const [selectedKeys,setSelectedKeys]=useState<string[]>([]);
  const [activeTutorial,setActiveTutorial]=useState<string|null>(null),[offerTours,setOfferTours]=useState(false);
  const effectiveContext={...screenContext(location.pathname,location.search),...context,...(guide.state.active?{guided_step:stepNames[guide.step]}:{}),...(selectedKeys.length?{selected_record_keys:selectedKeys.join(',')}:{}),...askContext,tutorial:activeTutorial};
  const rates=useEndpoint<{rows:{outlet:string;pos:number;full:number}[]}>(open&&context.page==='Overview'?'/analysis/rates?period=all&by_outlet=true&limit=1000':null,client);
  const gaps=useEndpoint<{unexplained:number}>(open&&context.page==='Match analysis'?'/analysis/gaps':null,client);
  const lowest=rates.data?.rows?.filter(row=>row.pos>0).reduce<{outlet:string;rate:number}|undefined>((result,row)=>{const rate=row.full/row.pos*100;return !result||rate<result.rate?{outlet:row.outlet,rate}:result;},undefined);
  const questions=offerTours?chapters.map(chapter=>`Show me how to use ${chapter.title}`):suggestions(effectiveContext,{lowest,toCheck:gaps.data?.unexplained});
  const intake=guide.state.active&&!guide.state.paused?guide.area:requestedArea;


  useEffect(()=>{
    const selection=(event:Event)=>setSelectedKeys((event as CustomEvent<{keys:string[]}>).detail.keys);
    const openChat=()=>setOpen(true);
    const tourState=(event:Event)=>setActiveTutorial((event as CustomEvent<{tutorial:string|null}>).detail?.tutorial||null);
    const tourEnded=()=>{setOfferTours(true);setOpen(true);};
    const demo=(event:Event)=>{const mode=(event as CustomEvent<{mode:'guided'|'kira'|null}>).detail?.mode;setTourDemo(mode||null);if(mode)setOpen(true);};
    const exchange=(event:Event)=>{const detail=(event as CustomEvent<{client:string;session_id:string;question:string;reply:ChatReply}>).detail;if(detail?.client!==client||detail.session_id!==sessionId)return;setMessages(current=>[...current,{who:'user',text:detail.question},{who:'kira',text:detail.reply.reply,tools:detail.reply.tool_calls||[]}]);if(detail.reply.pending?.length)rememberPending(detail.reply.pending);};
    window.addEventListener('kira:selection',selection);window.addEventListener('kira:tutorial-state',tourState);window.addEventListener('kira:tour-ended',tourEnded);window.addEventListener('kira:open-chat',openChat);window.addEventListener('kira:tour-demo',demo);window.addEventListener('kira:tutorial-exchange',exchange);window.dispatchEvent(new CustomEvent('kira:request-tutorial-state'));
    return()=>{window.removeEventListener('kira:selection',selection);window.removeEventListener('kira:tutorial-state',tourState);window.removeEventListener('kira:tour-ended',tourEnded);window.removeEventListener('kira:open-chat',openChat);window.removeEventListener('kira:tour-demo',demo);window.removeEventListener('kira:tutorial-exchange',exchange);};
  },[client,sessionId]);
  useEffect(()=>{onOpenChange?.(open);},[open,onOpenChange]);
  useEffect(()=>{setLaunchTarget(launcherTargets ? document.getElementById(mobile ? launcherTargets.mobile : launcherTargets.desktop) : null);},[mobile,launcherTargets?.desktop,launcherTargets?.mobile]);
  useEffect(()=>{
    const media=window.matchMedia?.('(max-width: 799px)');
    const change=()=>setMobile(media?.matches ?? false);change();
    media?.addEventListener('change',change);return()=>media?.removeEventListener('change',change);
  },[]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  useEffect(()=>{
    const ask=(event:Event)=>{
      const detail=(event as CustomEvent<{message?:string;context?:ScreenContext}>).detail;
      if(!detail?.message)return;
      setOpen(true);setInput(current=>(current?current+'\n'+detail.message:detail.message!).slice(0,2000));
      setAskContext(detail.context||{});
    };
    window.addEventListener('kira:ask',ask);return()=>window.removeEventListener('kira:ask',ask);
  },[]);

  useEffect(() => {
    if (!open) return;
    if (busyRef.current) return;
    const historyKey = `${apiBase}:${sessionId}:${retry}`;
    if (loadedHistory.current === historyKey) return;
    const ticket = ++historyTicket.current;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setHistoryError(false);
    requestAgent<HistoryMessage[]>(connection, `/history?session_id=${encodeURIComponent(sessionId)}`, undefined, abort.signal)
      .then((history) => {
        if (alive.current && ticket === historyTicket.current) {
          loadedHistory.current = historyKey;
          setMessages(history);
          rememberPending(pendingFromHistory(history));
        }
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted && alive.current && ticket === historyTicket.current) {
          setError(cause instanceof Error ? cause.message : 'Could not load this chat.');
          setHistoryError(true);
        }
      })
      .finally(() => { if (alive.current && ticket === historyTicket.current) setLoading(false); });
    return () => abort.abort();
    // A new screen context does not start a different conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, retry, apiBase, client, user]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!open || !conversation) return;
    const approval = conversation.querySelector<HTMLElement>('.kira-approval');
    if (pending.length && approval) {
      conversation.scrollTop += approval.getBoundingClientRect().top - conversation.getBoundingClientRect().top - 20;
    } else {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [messages, pending, busy, open,guide.step,guide.busy,guide.state.active]);

  useEffect(() => {
    // Escape must work as soon as the popup opens, including during history loading.
    if ((popup || workspace) && open) panelRef.current?.focus({preventScroll:true});
  }, [open, popup, workspace]);

  useEffect(() => {
    if (!open || loading || busy) return;
    const frame = requestAnimationFrame(() => {
      (pending.length ? approvalRef.current : historyError ? panelRef.current : window.matchMedia('(pointer: fine)').matches ? inputRef.current : headingRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, loading, busy, pending.length, popup, historyError]);

  useEffect(() => {
    const openGuide = () => {setOpen(true);guide.start();};
    window.addEventListener('kira:start-guided-close', openGuide);
    return () => window.removeEventListener('kira:start-guided-close', openGuide);
  }, []);

  useEffect(()=>{
    const reset=(event:Event)=>{
      if((event as CustomEvent<{client:string}>).detail.client!==client)return;
      controller.current?.abort();busyRef.current=false;setBusy(false);
      guide.finish();setRequestedArea(null);writeStorage(pendingKey,'[]');
      const next=createSession();writeStorage(storageKey,next);setSessionId(next);
      setPending([]);setMessages([]);setInput('');setError('');loadedHistory.current='';
    };
    window.addEventListener('kira:workspace-reset',reset);return()=>window.removeEventListener('kira:workspace-reset',reset);
  },[client,pendingKey,storageKey]);

  function rememberPending(next: PendingApproval[]) {
    setPending(next);
    writeStorage(pendingKey, JSON.stringify(next));
  }

  async function acceptReply(response: ChatReply) {
    rememberPending(response.pending || []);
    setMessages((current) => [...current, { who: 'kira', text: response.reply, tools: response.tool_calls || [] }]);
    const effects = collectEffects(response.tool_calls || []);
    if (effects.changed.length) {
      try { await onDataChanged(effects.changed, effects.destination); }
      catch { if (alive.current) setError('The change was saved, but the page could not refresh. Refresh the page to see it.'); }
    }
    if (alive.current) effects.highlights.forEach(onHighlight);
    for(const call of response.tool_calls||[]){
      if(call.result?.status!=='ok')continue;const result=call.result.result as Record<string,unknown>|undefined;
      if(call.tool==='start_guided_close'){guide.start();setOpen(true);}
      if(call.tool==='start_tour')window.dispatchEvent(new CustomEvent('kira:start-tutorial',{detail:{chapter:result?.tour||'welcome'}}));
      if(call.tool==='request_files'&&['pos','settlement','bank'].includes(String(result?.area))){setRequestedArea(result!.area as Area);setFileNote(String(result?.note||''));}
      if(call.tool==='export_results'&&typeof result?.download==='string'&&result.download.startsWith('/api/analysis/export')){try{await download(result.download.slice(4),String(result.filename||'kira-results.csv'),typeof result.client_id==='string'?result.client_id:client);}catch(cause){setError(cause instanceof Error?cause.message:'Could not download results.');}}
    }
  }

  async function send(message: string) {
    const text = message.trim();
    if (!text || text.length > 2000 || busyRef.current || loading || historyError || pending.length) return;
    if(/^(continue|resume|lanjut(?:kan)?)$/i.test(text)&&guide.state.active){guide.resume();setInput('');return;}
    if(/(?:do (?:today.?s |the )?close|start (?:the |a )?close|close with (?:me|kira))/i.test(text)){guide.start();setInput('');return;}
    const requestedTour=resolveChatTour(text)||(/^(?:how (?:do|can|does)|cara\b|gimana\b|bagaimana\b)/i.test(text)?(/match/i.test(text)?'match':'welcome'):null);
    if(requestedTour){window.dispatchEvent(new CustomEvent('kira:start-tutorial',{detail:{chapter:requestedTour,mode:'chat'}}));setOfferTours(false);setInput('');return;}
    busyRef.current = true;
    setBusy(true);
    setError('');
    setInput('');
    setMessages((current) => [...current, { who: 'user', text }]);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await requestAgent<ChatReply>(connection, '/chat', { session_id: sessionId, message: text, context:effectiveContext }, abort.signal);
      if (alive.current) {await acceptReply(response);setAskContext({});}
    } catch (cause) {
      if (alive.current && !abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not send your message.');
        setInput(text);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function confirm(approved: boolean) {
    if (!pending.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const answers = Object.fromEntries(pending.map((item) => [item.id, approved]));
      const response = await requestAgent<ChatReply>(connection, '/confirm', { session_id: sessionId, answers, context:{tutorial:activeTutorial} }, abort.signal);
      if (alive.current) await acceptReply(response);
    } catch (cause) {
      if (alive.current && !abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not confirm the change.');
        // Another tab may have answered already. Reconcile without replaying a write.
        try {
          const history = await requestAgent<HistoryMessage[]>(connection, `/history?session_id=${encodeURIComponent(sessionId)}`, undefined, abort.signal);
          if (alive.current) { setMessages(history); rememberPending(pendingFromHistory(history)); }
        } catch { /* Keep the last known cards when the connection is unavailable. */ }
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function newChat() {
    if (busyRef.current || pending.length) return;
    const next = createSession();
    writeStorage(storageKey, next);
    setSessionId(next);
    setMessages([]);
    setPending([]);
    setRequestedArea(null);setFileNote('');setAskContext({});
    setError('');
    setInput('');
  }

  function close() {
    setOpen(false);
    requestAnimationFrame(() => launchRef.current?.focus());
  }

  const screen = contextLabel(effectiveContext);
  const disabled = busy || loading || historyError || pending.length > 0;
  const launcherStatus = busy ? 'Working…' : guide.busy ? guide.busy+'…' : pending.length ? `${pending.length.toLocaleString('id-ID')} awaiting approval` : guide.state.active ? `${guide.state.paused?'Close paused at':'Close: '}${stepNames[guide.step]}` : '';
  const launcher=<div className="kira-launch-row"><button ref={launchRef} data-tour="kira-launcher" className={`kira-launch${popup ? ' kira-mascot-launch' : ''}${workspace ? ' kira-shell-launch' : ''}`} type="button" aria-label={workspace ? `Ask Kira${launcherStatus ? `: ${launcherStatus}` : ''}` : undefined} aria-haspopup={popup || workspace ? 'dialog' : undefined} aria-controls={open ? panelId : undefined} aria-expanded={open} aria-describedby={!open && launcherStatus ? `${panelId}-status` : undefined} onClick={() => open ? close() : setOpen(true)}>{popup || workspace ? <KiraMascot busy={busy}/> : <Icon name="chat" />}<span className="kira-launch-copy">{workspace ? 'Kira' : 'Ask Kira'}{workspace ? <span id={`${panelId}-status`} className="kira-pending-count" role="status">{launcherStatus || 'Ready'}</span> : !open && launcherStatus && <span id={`${panelId}-status`} className="kira-pending-count" role="status">{launcherStatus}</span>}</span>{workspace && <span className="kira-status-dot" data-busy={busy} data-pending={pending.length>0} aria-hidden="true"/>}</button></div>;
  return <aside className={`kira-dock${popup ? ' kira-popup-dock' : ''}${workspace ? ' kira-workspace-dock' : ''}`} aria-label="Kira assistant" data-open={open} onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}} onDrop={event=>{if(event.dataTransfer.files.length){event.preventDefault();setError("I'll ask for files when the close needs them. Start the close to add files.");}}} onKeyDown={event => {if (event.key === 'Escape' && open) {event.preventDefault(); event.stopPropagation(); close();}}}>
    {open && <section ref={panelRef} className="kira-panel" id={panelId} role={popup || workspace ? 'dialog' : undefined} aria-modal={popup || workspace ? false : undefined} tabIndex={-1} aria-labelledby={`${panelId}-title`}>
      <header className="kira-header" data-tour="kira-header">
        <div className="kira-avatar" aria-hidden="true">{popup || workspace ? <KiraMascot busy={busy}/> : <Icon name="chat" />}</div>
        <div className="kira-header-title"><h2 id={`${panelId}-title`} ref={headingRef} tabIndex={-1}>Kira</h2><p>Reconciliation assistant</p></div>
        <button className="kira-new-chat" type="button" onClick={newChat} disabled={busy || pending.length > 0} aria-label="Start a new chat"><Icon name="plus" /><span>New chat</span></button>
        <button className="kira-icon-button" type="button" aria-label="Chat history" title="Chat history" onClick={()=>{conversationRef.current?.scrollTo({top:0});headingRef.current?.focus();}}><History size={16}/></button>
        <button className="kira-icon-button" type="button" onClick={close} aria-label="Close Kira"><Icon name="close" /></button>
      </header>
      <div className="kira-context" data-tour="kira-context"><span>Looking at</span><strong>{screen || 'your workspace'}</strong></div>
      {guide.state.active&&<label className="guided-follow"><input type="checkbox" checked={guide.state.follow} onChange={guide.toggleFollow}/>Follow along on the page</label>}
      <div ref={conversationRef} className="kira-conversation" role="log" aria-live="polite" aria-relevant="additions" aria-busy={loading}>
        {loading && <div className="kira-history-loading" role="status"><span>Loading your conversation…</span><i /><i /><i /></div>}
        {!loading && messages.length === 0 && !historyError && <div className="kira-empty"><h3>Ask about this workspace</h3><p>Check a match, understand a money difference, or find the next step in your close.</p><Suggestions questions={questions} disabled={disabled} onSelect={question => void send(question)} /></div>}
        {messages.map((message, index) => <article className={`kira-message kira-message-${message.who}`} key={index}>
          <p className="kira-message-author">{message.who === 'user' ? 'You' : 'Kira'}</p>
          <Markdown text={message.text} />
          {message.who === 'kira' && <ToolTrace calls={message.tools || []} />}
        </article>)}
        {pending.length > 0 && <section className="kira-approval" data-tour="kira-approval" aria-label="Changes awaiting approval">
          <div className="kira-approval-heading"><h3 ref={approvalRef} tabIndex={-1}>Review changes</h3><span>{pending.length.toLocaleString('id-ID')} awaiting approval</span></div>
          {pending.map((item) => <div className="kira-approval-item" key={item.id}>
            <ApprovalDetails item={item} />
            <details><summary>{item.tool === 'save_follow_ups' ? 'Selected records and details' : 'Change details'}</summary><pre>{JSON.stringify(item.args, null, 2)}</pre></details>
          </div>)}
          <p className="kira-approval-hint">Nothing is saved until you approve.</p>
          <div className="kira-actions"><button className="kira-primary" type="button" onClick={() => void confirm(true)} disabled={busy}><Icon name="check" />Approve all</button><button className="kira-secondary" type="button" onClick={() => void confirm(false)} disabled={busy}>Reject</button></div>
        </section>}
        {!guide.state.active&&!tourDemo&&guide.status&&Object.values(guide.status.files||{}).every(value=>!value)&&<div className="guided-start-greeting"><p>No files yet. Want me to walk you through today's close?</p><button data-tour="guided-start" className="kira-primary" onClick={guide.start}>Start the close</button></div>}
        {guide.state.active&&!tourDemo&&<GuidedClose guide={guide} onAsk={question=>void send(question)}/>}
        {requestedArea&&!guide.state.active&&!tourDemo&&<section className="guided-close"><p>{fileNote}</p><FileSlot area={requestedArea} busy={!!guide.busy} progress={guide.progress} onUpload={files=>void guide.upload(files,requestedArea)}/>{guide.error&&<p role="alert">{guide.error}</p>}<button className="kira-secondary" onClick={()=>setRequestedArea(null)}>Done adding files</button></section>}
        {tourDemo&&<section className="guided-close guided-demo" data-tour="guided-card"><p>Tutorial preview: no changes are made</p><h3>Step 2 of 10: POS files</h3><div data-tour="guided-files"><p>Kira asks for files here. Choose files and folders becomes available during a real guided close.</p></div><div className="guided-actions"><button className="kira-secondary" data-tour="guided-start" type="button" aria-disabled="true">Start the close</button><button className="kira-secondary" data-tour="guided-show" type="button" aria-disabled="true">Show me on the page</button><button className="kira-secondary" data-tour="guided-stop" type="button" aria-disabled="true">Not now</button></div><div data-tour="kira-approval"><h4>Review changes</h4><p>During a real close, Kira describes the proposed change and waits for your approval.</p></div><details data-tour="kira-trace" open><summary>How Kira got this</summary><p>Tool inputs and results provide the evidence for each answer.</p></details></section>}
        {busy && <p className="kira-loading" role="status"><span aria-hidden="true" />Checking your workspace…</p>}
      </div>
      {error && <div className="kira-error" role="alert"><p>{error}</p>{historyError && <button className="kira-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}</div>}
      {messages.length > 0 && pending.length === 0 && <details className="kira-suggestions"><summary>Suggested questions</summary><Suggestions questions={questions} disabled={disabled} onSelect={question => void send(question)} /></details>}
      {pending.length === 0 && <form className="kira-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void send(input); }}>
        <label className="kira-sr-only" htmlFor={`${panelId}-input`}>Ask Kira</label>
        <textarea data-tour="kira-input" id={`${panelId}-input`} name="kira-message" autoComplete="off" ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={2} placeholder={pending.length ? 'Approve or reject the changes above…' : 'Ask about your reconciliation…'} disabled={disabled} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); }
        }} />
        <button className="kira-icon-button guided-attach" type="button" aria-label="Attach requested files" title={intake?`Attach ${intake} files`:"Start the close; Kira will ask for files when needed"} disabled={!intake||!!guide.busy||disabled||!!tourDemo} onClick={()=>window.dispatchEvent(new CustomEvent('kira:attach-files'))}><Paperclip size={18}/></button>
        <button className="kira-primary kira-send" type="submit" disabled={disabled || !input.trim()} aria-label="Send message"><Icon name="send" /></button>
      </form>}
      {pending.length === 0 && <footer className="kira-footer"><span>Changes always need your approval.</span><span>{input.length ? `${input.length.toLocaleString('id-ID')} / ${(2000).toLocaleString('id-ID')}` : <><kbd>Enter</kbd> to send</>}</span></footer>}
    </section>}
    {(!open || popup || workspace) && (launchTarget ? createPortal(launcher,launchTarget) : launcher)}
  </aside>;
}
