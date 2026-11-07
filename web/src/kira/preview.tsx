import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChatPanel } from './ChatPanel';
import { Icon } from './Icons';
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

export function Preview({ onAuthenticated }: { onAuthenticated?: (identity: Identity) => void } = {}) {
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
  const [showPassword, setShowPassword] = useState(false);
  const loginError = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (identity) onAuthenticated?.(identity); }, [identity, onAuthenticated]);

  useEffect(() => {
    if (error && !identity) loginError.current?.focus({ preventScroll: true });
  }, [error, identity]);

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

  const brand = <span className="kira-preview-wordmark" translate="no"><span aria-hidden="true">K</span>KIRA<span className="kira-preview-brand-dot" aria-hidden="true">.</span></span>;
  if (checking) return <main className="kira-preview kira-preview-opening">{brand}<p role="status">Opening your workspace…</p></main>;
  if (!identity) return <div className="kira-preview kira-preview-login">
    <header className="kira-preview-header">{brand}<span className="kira-preview-product">Payment reconciliation</span></header>
    <main className="kira-preview-login-layout">
      <section className="kira-preview-intro" aria-labelledby="intro-title">
        <p className="kira-preview-intro-label">Daily close, with the evidence</p>
        <h2 id="intro-title">Trace sales to the<br />money received.</h2>
        <p>Compare POS sales, provider settlements and bank credits. See where they agree and what needs a closer look.</p>
        <ol className="kira-preview-sources" aria-label="The reconciliation trail">
          <li><span>01</span><strong>POS sales</strong><Icon name="arrow" /></li>
          <li><span>02</span><strong>Settlement</strong><Icon name="arrow" /></li>
          <li><span>03</span><strong>Bank credit</strong></li>
        </ol>
        <p className="kira-preview-intro-foot">Every link keeps its source record and matching rule.</p>
      </section>
      <section className="kira-preview-login-form" aria-labelledby="login-title">
        <h1 id="login-title">Sign in to your workspace</h1>
        <p>Continue your reconciliation with KIRA.</p>
        <form onSubmit={(event) => void login(event)}>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" spellCheck={false} required aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
          <label htmlFor="password">Password</label>
          <div className="kira-preview-password">
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
            <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          {error && <p ref={loginError} id="login-error" className="kira-preview-error" role="alert" tabIndex={-1}>{error}</p>}
          <button className="kira-preview-primary" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}<Icon name="arrow" /></button>
        </form>
        <p className="kira-preview-sign-in-note">Use the credentials shared by your workspace owner.</p>
      </section>
    </main>
    <footer className="kira-preview-page-footer"><span>POS → Settlement → Bank</span><span>Changes made by Kira need your approval.</span></footer>
  </div>;

  const workspaceName = clients.find(item => item.id === client)?.name || 'Your workspace';
  const fileCount = status ? Object.values(status.files).reduce((total, count) => total + count, 0) : 0;
  const steps = status ? [
    { name: 'Upload', done: Object.values(status.files).every(count => count > 0), detail: fileCount ? `${fileCount.toLocaleString('id-ID')} source files` : 'Waiting for source files' },
    { name: 'Convert', done: status.converted, detail: status.converted ? 'Source tables converted' : 'Apply saved upload rules' },
    { name: 'Clean', done: status.cleaning.rules_version !== null && !status.cleaning.open, detail: status.cleaning.open ? `${status.cleaning.open} decisions to review` : 'Standardise names and values' },
    { name: 'Match', done: status.matching.l1.done && status.matching.l2.done, detail: 'Link POS, settlement and bank' },
  ] : [];
  return <div className="kira-preview">
    <a className="kira-preview-skip" href="#workspace-main">Skip to workspace</a>
    <header className="kira-preview-header"><a href="/" aria-label="KIRA home">{brand}</a><span className="kira-preview-product">Payment reconciliation</span><div className="kira-preview-account"><span>{identity.user}</span>{identity.auth && <button type="button" onClick={() => void logout()}>Sign out</button>}</div></header>
    <main id="workspace-main">
      <div className="kira-preview-heading"><div><h1>{workspaceName}</h1><p>Reconciliation workspace</p></div>
        <label>Workspace<select value={client} onChange={(event) => setClient(event.target.value)}>{clients.length ? clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Main workspace</option>}</select></label>
      </div>
      {error && <p className="kira-preview-error" role="alert">{error}</p>}
      <div className="kira-preview-layout">
        <section className="kira-preview-status" aria-labelledby="workspace-status-title">
          <div className="kira-preview-section-heading"><h2 id="workspace-status-title">Workspace status</h2><button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={refreshing}><Icon name="refresh" />Refresh</button></div>
          {refreshing && <div className="kira-preview-status-loading" role="status"><span>Checking the workspace…</span><i /><i /><i /></div>}
          {statusError && <div className="kira-preview-error" role="alert"><p>{statusError}</p><button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
          {status && <>
            <div className="kira-preview-state"><span className={fileCount ? 'has-files' : ''} aria-hidden="true" />{steps.every(step => step.done) ? 'Matching complete' : fileCount ? 'Close in progress' : 'Waiting for files'}</div>
            <div className="kira-preview-next"><h3>{fileCount ? 'Continue your close' : 'No source files yet'}</h3><p>{fileCount ? status.next.say : 'Your close starts with POS sales, provider settlements and a bank statement.'}</p></div>
            <dl className="kira-preview-files">{(['pos', 'settlement', 'bank'] as const).map(kind => <div key={kind}><dt>{kind === 'pos' ? 'POS sales' : kind === 'bank' ? 'Bank statements' : 'Provider settlements'}</dt><dd>{status.files[kind].toLocaleString('id-ID')} <span>files</span></dd></div>)}</dl>
            <h3 className="kira-preview-progress-title">Close progress</h3>
            <ol className="kira-preview-steps">
              {steps.map((step, index) => <li key={step.name} className={step.done ? 'is-done' : status.step === index + 1 ? 'is-current' : ''} aria-current={!step.done && status.step === index + 1 ? 'step' : undefined}><span className="kira-preview-step-number">{step.done ? <Icon name="check" /> : String(index + 1).padStart(2, '0')}</span><div><strong>{step.name}</strong><p>{step.detail}</p></div><span className="kira-preview-step-state">{step.done ? 'Done' : status.step === index + 1 ? 'Current' : ''}</span></li>)}
            </ol>
          </>}
          {highlight && <section className="kira-preview-highlight"><h3>Kira highlighted {highlight.keys.length.toLocaleString('id-ID')} records</h3><p>{highlight.note}</p><details><summary>Record keys</summary><pre>{highlight.keys.join('\n')}</pre></details></section>}
          <p className="kira-preview-hint">Workflow and analysis views are being connected. You can check workspace progress with Kira.</p>
        </section>
        <ChatPanel client={client} user={identity.user} context={{ page: 'Workspace status', workspace: workspaceName }} initiallyOpen onDataChanged={() => { setRefresh((value) => value + 1); }} onHighlight={setHighlight} onUnauthorized={() => setIdentity(null)} />
      </div>
    </main>
  </div>;
}
