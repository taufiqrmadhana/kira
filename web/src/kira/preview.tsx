import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from './ChatPanel';
import type { Highlight } from './protocol';
import './preview.css';

interface Identity { user: string; auth: boolean }
interface IdentityResponse { user: string | null; auth: boolean }
interface Client { id: string; name: string }
interface Status {
  step: number;
  next: { say: string };
  files: Record<string, number>;
  converted: boolean;
  cleaning: { open: number; rules_version: number | null };
  matching: Record<string, { done: boolean; rules: number }>;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof data?.detail === 'string' ? data.detail : 'The request could not be completed.');
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data as T;
}

function Preview() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [checking, setChecking] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    api<IdentityResponse>('/me', { signal: abort.signal })
      .then((value) => { if (value.user) setIdentity({ user: value.user, auth: value.auth }); })
      .catch((cause) => { if (!abort.signal.aborted && cause.status !== 401) setError(cause.message); })
      .finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!identity) return;
    const abort = new AbortController();
    api<Client[]>('/clients', { signal: abort.signal }).then(setClients).catch((cause) => {
      if (!abort.signal.aborted) setError(cause.message);
    });
    return () => abort.abort();
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    const abort = new AbortController();
    setStatus(null);
    setStatusError('');
    setHighlight(null);
    setRefreshing(true);
    api<Status>('/status', { signal: abort.signal, headers: { 'X-Kira-Client': client, 'X-Kira-User': identity.user } })
      .then(setStatus)
      .catch((cause) => {
        if (!abort.signal.aborted) {
          if (cause.status === 401) setIdentity(null);
          else setStatusError(cause.message);
        }
      })
      .finally(() => { if (!abort.signal.aborted) setRefreshing(false); });
    return () => abort.abort();
  }, [identity, client, refresh]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      await api('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
      const value = await api<IdentityResponse>('/me');
      if (!value.user) throw new Error('Sign-in could not be verified. Please try again.');
      setIdentity({ user: value.user, auth: value.auth });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed.'); }
    finally { setSubmitting(false); }
  }

  async function logout() {
    try { await api('/logout', { method: 'POST' }); setIdentity(null); setStatus(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-out failed.'); }
  }

  if (checking) return <main className="kira-preview"><p role="status">Opening KIRA…</p></main>;
  if (!identity) return <main className="kira-preview kira-preview-login">
    <div className="kira-preview-wordmark"><span>K</span>KIRA</div>
    <h1>Sign in to your workspace</h1>
    <p>Check your reconciliation with Kira.</p>
    <form onSubmit={(event) => void login(event)}>
      <label>Username<input name="username" autoComplete="username" spellCheck={false} required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="kira-preview-error" role="alert">{error}</p>}
      <button className="kira-preview-primary" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="kira-preview-build">Taufiq’s platform build. Team workflow screens are pending integration.</p>
  </main>;

  return <div className="kira-preview">
    <a className="kira-preview-skip" href="#workspace-main">Skip to workspace</a>
    <header className="kira-preview-header"><a className="kira-preview-wordmark" href="/" translate="no"><span aria-hidden="true">K</span>KIRA</a><div>{identity.user}{identity.auth && <button onClick={() => void logout()}>Sign out</button>}</div></header>
    <main id="workspace-main">
      <div className="kira-preview-heading"><div><h1>Reconciliation workspace</h1><p>Taufiq’s platform build. Team workflow screens are pending integration.</p></div>
        <label>Workspace<select value={client} onChange={(event) => setClient(event.target.value)}>{clients.length ? clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Main workspace</option>}</select></label>
      </div>
      {error && <p className="kira-preview-error" role="alert">{error}</p>}
      <div className="kira-preview-layout">
        <section className="kira-preview-status" aria-labelledby="workspace-status-title">
          <div className="kira-preview-section-heading"><h2 id="workspace-status-title">Workspace status</h2><button onClick={() => setRefresh((value) => value + 1)} disabled={refreshing}>Refresh</button></div>
          {refreshing && <p role="status">Checking the workspace…</p>}
          {statusError && <div role="alert"><p>{statusError}</p><button onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
          {status && <>
            <p className="kira-preview-next">{status.next.say}</p>
            <dl className="kira-preview-files">{Object.entries(status.files).map(([kind, count]) => <div key={kind}><dt>{kind === 'pos' ? 'POS files' : kind === 'bank' ? 'Bank files' : 'Settlement files'}</dt><dd>{count.toLocaleString('id-ID')}</dd></div>)}</dl>
            <ol className="kira-preview-steps">
              <li><span>1</span><div><strong>Upload</strong><p>{Object.values(status.files).every((count) => count > 0) ? 'Files present in every area' : 'Waiting for source files'}</p></div></li>
              <li><span>2</span><div><strong>Convert</strong><p>{status.converted ? 'Tables converted' : 'Not converted yet'}</p></div></li>
              <li><span>3</span><div><strong>Clean</strong><p>{status.cleaning.open ? `${status.cleaning.open} decisions waiting` : status.cleaning.rules_version ? `Rules version ${status.cleaning.rules_version}` : 'No cleaning rules saved'}</p></div></li>
              <li><span>4</span><div><strong>Match</strong><p>POS to settlement: {status.matching.l1.done ? 'complete' : 'not run'}. Settlement to bank: {status.matching.l2.done ? 'complete' : 'not run'}.</p></div></li>
            </ol>
          </>}
          {highlight && <section className="kira-preview-highlight"><h3>Kira highlighted {highlight.keys.length.toLocaleString('id-ID')} records</h3><p>{highlight.note}</p><p>The linked-table screen will show these records after Andrew’s app shell is integrated.</p><details><summary>Record keys</summary><pre>{highlight.keys.join('\n')}</pre></details></section>}
          <p className="kira-preview-hint">Ask Kira to check workflow progress. Analysis answers become available when the team’s data services and demo files are connected.</p>
        </section>
        <ChatPanel client={client} user={identity.user} context={{ page: 'Workspace status' }} initiallyOpen onDataChanged={() => { setRefresh((value) => value + 1); }} onHighlight={setHighlight} onUnauthorized={() => setIdentity(null)} />
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
