import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Markdown } from './Markdown';
import {
  approvalDescription, collectEffects, DEMO_QUESTIONS, pendingFromHistory, requestAgent, TOOL_LABELS,
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

/** Mount in a reserved grid column or footer: this panel never floats over data. */
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
  const approvalRef = useRef<HTMLButtonElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyTicket = useRef(0);
  const panelId = useId();
  const connection = { baseUrl: apiBase, client, user, onUnauthorized };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (busyRef.current) return;
    const ticket = ++historyTicket.current;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setHistoryError(false);
    requestAgent<HistoryMessage[]>(connection, `/history?session_id=${encodeURIComponent(sessionId)}`, undefined, abort.signal)
      .then((history) => {
        if (alive.current && ticket === historyTicket.current) {
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
    if (open) bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [messages, pending, busy, open]);

  useEffect(() => {
    if (!open || loading || busy || !window.matchMedia('(pointer: fine)').matches) return;
    const frame = requestAnimationFrame(() => {
      (pending.length ? approvalRef.current : inputRef.current)?.focus();
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
      if (alive.current) { setBusy(false); inputRef.current?.focus(); }
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
  return <aside className="kira-dock" aria-label="Kira assistant">
    {open && <section className="kira-panel" id={panelId} aria-labelledby={`${panelId}-title`} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
      <header className="kira-header">
        <div className="kira-avatar" aria-hidden="true">K</div>
        <div><h2 id={`${panelId}-title`}>Kira</h2><p>Changes wait for your approval.</p></div>
        <button className="kira-icon-button" type="button" onClick={close} aria-label="Close Kira">×</button>
      </header>
      <div className="kira-context">Looking at <strong>{screen || 'your workspace'}</strong></div>
      <div className="kira-conversation" role="log" aria-live="polite" aria-relevant="additions" aria-busy={loading}>
        {loading && <p className="kira-loading" role="status">Loading your conversation…</p>}
        {!loading && messages.length === 0 && !historyError && <div className="kira-empty"><p>Hi {user || 'there'}, I’m Kira.</p><p>Ask about your match rates, money differences, or the next step in your close.</p></div>}
        {messages.map((message, index) => <article className={`kira-message kira-message-${message.who}`} key={index}>
          <p className="kira-message-author">{message.who === 'user' ? 'You' : 'Kira'}</p>
          <Markdown text={message.text} />
          {message.who === 'kira' && <ToolTrace calls={message.tools || []} />}
        </article>)}
        {pending.length > 0 && <section className="kira-approval" aria-label="Changes awaiting approval">
          <h3>Kira needs your OK</h3>
          {pending.map((item) => <div className="kira-approval-item" key={item.id}>
            <p>{approvalDescription(item)}</p>
            <details><summary>{item.tool === 'save_follow_ups' ? 'View selected records and details' : 'View details'}</summary><pre>{JSON.stringify(item.args, null, 2)}</pre></details>
          </div>)}
          <div className="kira-actions"><button ref={approvalRef} className="kira-primary" type="button" onClick={() => void confirm(true)} disabled={busy}>Approve all</button><button className="kira-secondary" type="button" onClick={() => void confirm(false)} disabled={busy}>Reject</button></div>
        </section>}
        {busy && <p className="kira-loading" role="status">Kira is checking…</p>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="kira-error" role="alert"><p>{error}</p>{historyError && <button className="kira-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}</div>}
      <div className="kira-prompts" aria-label="Suggested questions">{DEMO_QUESTIONS.map((question) => <button type="button" key={question} onClick={() => void send(question)} disabled={disabled}>{question}</button>)}</div>
      <form className="kira-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void send(input); }}>
        <label className="kira-sr-only" htmlFor={`${panelId}-input`}>Ask Kira</label>
        <textarea id={`${panelId}-input`} name="kira-message" autoComplete="off" ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={2} placeholder={pending.length ? 'Approve or reject the changes above…' : 'Ask about your reconciliation…'} disabled={disabled} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); }
        }} />
        <button className="kira-primary" type="submit" disabled={disabled || !input.trim()} aria-label="Send message">Send</button>
      </form>
      <footer className="kira-footer"><span>{input.length.toLocaleString('id-ID')}/{(2000).toLocaleString('id-ID')}</span><button type="button" onClick={newChat} disabled={busy || pending.length > 0}>Start a new chat</button></footer>
    </section>}
    <div className="kira-launch-row"><button ref={launchRef} className="kira-launch" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => open ? close() : setOpen(true)}><span aria-hidden="true">K</span>{open ? 'Close Kira' : 'Ask Kira'}{!open && pending.length > 0 && <span className="kira-pending-count">{pending.length} awaiting approval</span>}</button></div>
  </aside>;
}
