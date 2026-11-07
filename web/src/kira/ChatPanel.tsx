import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Markdown } from './Markdown';
import { ApprovalDetails } from './ApprovalDetails';
import { Icon } from './Icons';
import {
  collectEffects, DEMO_QUESTIONS, pendingFromHistory, requestAgent, TOOL_LABELS,
  type ChangeDestination, type ChatReply, type Highlight, type HistoryMessage,
  type PendingApproval, type ScreenContext, type ToolCall,
} from './protocol';
import './kira.css';

export interface ChatPanelProps {
  client: string;
  user: string;
  context?: ScreenContext;
  apiBase?: string;
  initiallyOpen?: boolean;
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
  return <details className="kira-trace">
    <summary>How Kira got this <span>({calls.length})</span></summary>
    <ol>{calls.map((call, index) => <li key={index}>
      <span>{call.result?.status === 'pending' ? `Awaiting approval: ${call.tool.replaceAll('_', ' ')}` : call.result?.status === 'error' ? `${call.tool.replaceAll('_', ' ')}: ${call.result.message || 'could not finish'}` : TOOL_LABELS[call.tool] || call.tool.replaceAll('_', ' ')}</span>
      <details><summary>View evidence</summary><pre>{JSON.stringify({ inputs: call.args, result: call.result }, null, 2).slice(0, 16000)}</pre></details>
    </li>)}</ol>
  </details>;
}

function Suggestions({ disabled, onSelect }: { disabled: boolean; onSelect: (question: string) => void }) {
  return <div className="kira-prompts" role="group" aria-label="Suggested questions">
    {DEMO_QUESTIONS.map(question => <button type="button" key={question} onClick={() => onSelect(question)} disabled={disabled}><span>{question}</span><Icon name="arrow" /></button>)}
  </div>;
}

/** A viewport companion: minimizing preserves the current conversation and work in progress. */
export function ChatPanel(props: ChatPanelProps) {
  return <ScopedChat key={`${props.client}\u0000${props.user}`} {...props} />;
}

function ScopedChat({ client, user, context = {}, apiBase = '/api', initiallyOpen = false, onDataChanged, onHighlight, onUnauthorized }: ChatPanelProps) {
  const storageKey = `kira:chat:${encodeURIComponent(client)}:${encodeURIComponent(user)}`;
  const [sessionId, setSessionId] = useState(() => initialSession(storageKey));
  const pendingKey = `${storageKey}:pending:${sessionId}`;
  const [open, setOpen] = useState(initiallyOpen);
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>(() => readPending(pendingKey));
  const [input, setInput] = useState('');
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
  const conversationRef = useRef<HTMLDivElement>(null);
  const historyTicket = useRef(0);
  const loadedHistory = useRef('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const connection = { baseUrl: apiBase, client, user, onUnauthorized };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

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
  }, [messages, pending, busy, open]);

  useEffect(() => {
    if (!open || loading || busy) return;
    const frame = requestAnimationFrame(() => {
      (pending.length ? approvalRef.current : window.matchMedia('(pointer: fine)').matches ? inputRef.current : headingRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, loading, busy, pending.length]);

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
  }

  async function send(message: string) {
    const text = message.trim();
    if (!text || text.length > 2000 || busyRef.current || loading || historyError || pending.length) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setInput('');
    setMessages((current) => [...current, { who: 'user', text }]);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await requestAgent<ChatReply>(connection, '/chat', { session_id: sessionId, message: text, context }, abort.signal);
      if (alive.current) await acceptReply(response);
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
      const response = await requestAgent<ChatReply>(connection, '/confirm', { session_id: sessionId, answers }, abort.signal);
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
    setError('');
    setInput('');
  }

  function close() {
    setOpen(false);
    requestAnimationFrame(() => launchRef.current?.focus());
  }

  const screen = [context.page, context.tab, context.outlet, context.period].filter(Boolean).join(' / ');
  const disabled = busy || loading || historyError || pending.length > 0;
  const launcherStatus = busy ? 'Working…' : pending.length ? `${pending.length.toLocaleString('id-ID')} awaiting approval` : '';
  return <aside className="kira-dock" aria-label="Kira assistant" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    {open && <section className="kira-panel" id={panelId} role="dialog" aria-modal="false" aria-labelledby={`${panelId}-title`}>
      <header className="kira-header">
        <div className="kira-avatar" aria-hidden="true"><Icon name="chat" /></div>
        <div className="kira-header-title"><h2 id={`${panelId}-title`} ref={headingRef} tabIndex={-1}>Kira</h2><p>Reconciliation assistant</p></div>
        <button className="kira-new-chat" type="button" onClick={newChat} disabled={busy || pending.length > 0} aria-label="Start a new chat"><Icon name="plus" /><span>New chat</span></button>
        <button className="kira-icon-button" type="button" onClick={close} aria-label="Close Kira"><Icon name="close" /></button>
      </header>
      <div className="kira-context"><span>Looking at</span><strong>{screen || 'your workspace'}</strong></div>
      <div ref={conversationRef} className="kira-conversation" role="log" aria-live="polite" aria-relevant="additions" aria-busy={loading}>
        {loading && <div className="kira-history-loading" role="status"><span>Loading your conversation…</span><i /><i /><i /></div>}
        {!loading && messages.length === 0 && !historyError && <div className="kira-empty"><h3>Ask about this workspace</h3><p>Check a match, understand a money difference, or find the next step in your close.</p><Suggestions disabled={disabled} onSelect={question => void send(question)} /></div>}
        {messages.map((message, index) => <article className={`kira-message kira-message-${message.who}`} key={index}>
          <p className="kira-message-author">{message.who === 'user' ? 'You' : 'Kira'}</p>
          <Markdown text={message.text} />
          {message.who === 'kira' && <ToolTrace calls={message.tools || []} />}
        </article>)}
        {pending.length > 0 && <section className="kira-approval" aria-label="Changes awaiting approval">
          <div className="kira-approval-heading"><h3 ref={approvalRef} tabIndex={-1}>Review changes</h3><span>{pending.length.toLocaleString('id-ID')} awaiting approval</span></div>
          {pending.map((item) => <div className="kira-approval-item" key={item.id}>
            <ApprovalDetails item={item} />
            <details><summary>{item.tool === 'save_follow_ups' ? 'Selected records and details' : 'Change details'}</summary><pre>{JSON.stringify(item.args, null, 2)}</pre></details>
          </div>)}
          <p className="kira-approval-hint">Nothing is saved until you approve.</p>
          <div className="kira-actions"><button className="kira-primary" type="button" onClick={() => void confirm(true)} disabled={busy}><Icon name="check" />Approve all</button><button className="kira-secondary" type="button" onClick={() => void confirm(false)} disabled={busy}>Reject</button></div>
        </section>}
        {busy && <p className="kira-loading" role="status"><span aria-hidden="true" />Checking your workspace…</p>}
      </div>
      {error && <div className="kira-error" role="alert"><p>{error}</p>{historyError && <button className="kira-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}</div>}
      {messages.length > 0 && pending.length === 0 && <details className="kira-suggestions"><summary>Suggested questions</summary><Suggestions disabled={disabled} onSelect={question => void send(question)} /></details>}
      {pending.length === 0 && <form className="kira-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void send(input); }}>
        <label className="kira-sr-only" htmlFor={`${panelId}-input`}>Ask Kira</label>
        <textarea id={`${panelId}-input`} name="kira-message" autoComplete="off" ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={2} placeholder={pending.length ? 'Approve or reject the changes above…' : 'Ask about your reconciliation…'} disabled={disabled} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); }
        }} />
        <button className="kira-primary kira-send" type="submit" disabled={disabled || !input.trim()} aria-label="Send message"><Icon name="send" /></button>
      </form>}
      {pending.length === 0 && <footer className="kira-footer"><span>Changes always need your approval.</span><span>{input.length ? `${input.length.toLocaleString('id-ID')} / ${(2000).toLocaleString('id-ID')}` : <><kbd>Enter</kbd> to send</>}</span></footer>}
    </section>}
    <div className="kira-launch-row">
      <button ref={launchRef} className="kira-launch" type="button" aria-label={open ? 'Minimize Kira' : 'Ask Kira'}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-describedby={!open && launcherStatus ? `${panelId}-status` : undefined}
        onClick={() => open ? close() : setOpen(true)}>
        <span className="kira-launch-avatar" aria-hidden="true"><Icon name={open ? 'close' : 'chat'} /></span>
        <span>{open ? 'Minimize' : 'Ask Kira'}</span>
        {!open && launcherStatus && <span id={`${panelId}-status`} className="kira-pending-count" role="status">{launcherStatus}</span>}
      </button>
    </div>
  </aside>;
}
