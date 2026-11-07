import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, GitCompareArrows, ChartNoAxesCombined, Menu } from 'lucide-react';
import Overview from './pages/overview/Overview';
import Analysis from './pages/analysis/Analysis';
import Insights from './pages/insights/Insights';
import Landing from './pages/landing/Landing';
import { api, clientPath } from './lib/api';
import { useResource } from './lib/useResource';
import { ChatPanel } from './kira/ChatPanel';
import { Preview } from './kira/preview';
import Workflow from './pages/workflow/Workflow';
import { WorkspaceStatus, type WorkflowProgress } from './kira/WorkspaceStatus';
import { Empty, ErrorState, Loading } from './components';
import type { ChangeDestination, Highlight } from './kira/protocol';
import './kira/integration.css';

interface User { user: string; auth: boolean }
interface Client { id: string; name: string }
const refreshData = () => window.dispatchEvent(new Event('kira:data-changed'));

function AnalysisRoute({progress}: {progress: ReturnType<typeof useResource<WorkflowProgress>>}) {
  if (progress.loading && !progress.data) return <Loading />;
  if (progress.error) return <ErrorState message={progress.error} retry={progress.retry} />;
  if (progress.data && !(progress.data.matching.l1.done && progress.data.matching.l2.done)) return <><div className="page-head"><div><h1>Match analysis</h1><p>Complete both matching stages to see the evidence.</p></div></div><WorkspaceStatus status={progress.data} onRefresh={progress.retry} /><Link className="button secondary" to="/workflow">Open workflow</Link></>;
  return <Analysis />;
}

function Workspace({ user, client, clients, onClient, onSignOut }: { user: User; client: string; clients: Client[]; onClient: (id: string) => void; onSignOut: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const progress = useResource<WorkflowProgress>('/status');
  const [expanded, setExpanded] = useState(false);
  const [version, setVersion] = useState(0);
  const page = location.pathname.startsWith('/insights') ? 'Insights' : location.pathname.startsWith('/analysis') ? 'Match analysis' : location.pathname.startsWith('/workflow') ? 'Workflow' : 'Overview';
  const workspaceName = clients.find(item => item.id === client)?.name || 'Main workspace';
  const onDataChanged = (_calls: unknown, destination?: ChangeDestination) => {
    refreshData(); setVersion(value => value + 1);
    if (typeof destination === 'number') navigate(`/workflow?step=${destination}`);
    else if (destination === 'follow-up') navigate('/analysis?tab=follow');
  };
  const highlight = ({ keys, note }: Highlight) => navigate(`/analysis?${new URLSearchParams({ tab: 'map', stage: 'l2', keys: keys.join(','), highlight: note })}`);
  return <div className={`app integration-app ${expanded ? 'nav-open' : ''}`}>
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <Link to="/" className="integration-brand" aria-label="KIRA home"><span aria-hidden="true">K</span>KIRA<span aria-hidden="true">.</span></Link>
      <div className="workspace"><label htmlFor="active-workspace">Workspace<select id="active-workspace" value={client} onChange={event => onClient(event.target.value)}>{clients.length ? clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Main workspace</option>}</select></label></div>
      <nav aria-label="Main navigation"><NavLink to={clientPath('/overview')} end onClick={() => setExpanded(false)}><LayoutDashboard size={18} />Overview</NavLink><NavLink to={clientPath('/workflow')} onClick={() => setExpanded(false)}><GitCompareArrows size={18} />Workflow</NavLink><NavLink to={clientPath('/analysis')} onClick={() => setExpanded(false)}><ChartNoAxesCombined size={18} />Match analysis</NavLink><NavLink to={clientPath('/insights')} onClick={() => setExpanded(false)}><ChartNoAxesCombined size={18} />Insights</NavLink></nav>
      <div className="sidebar-bottom"><div><strong>{user.user}</strong><small>Reconciliation workspace</small></div>{user.auth && <button className="integration-sign-out" type="button" onClick={async () => { await api('/logout', { method: 'POST' }); onSignOut(); }}>Sign out</button>}</div>
    </aside>
    <div className="workspace-body">
      <header className="topbar"><div><button className="button quiet nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Menu size={20} /></button><span>{workspaceName}</span><span aria-hidden="true">/</span><strong>{page}</strong></div></header>
      <main id="main"><div className="integration-layout"><div className="integration-page" key={`${client}:${version}`}><Routes>
        <Route path="/overview" element={<Overview progress={progress} />} />
        <Route path="/workflow/*" element={<Workflow />} />
        <Route path="/analysis" element={<AnalysisRoute progress={progress} />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="*" element={<Empty title="Page not found"><Link to={clientPath('/overview')}>Return to Overview</Link></Empty>} />
      </Routes></div><ChatPanel client={client} user={user.user} presentation="popup" context={{ page, workspace: workspaceName, outlet: new URLSearchParams(location.search).get('outlet') || '' }} onDataChanged={onDataChanged} onHighlight={highlight} onUnauthorized={onSignOut} /></div></main>
      <footer className="app-footer"><span>KIRA</span><span>POS → Settlement → Bank</span></footer>
    </div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState('');
  const [clientsVersion, setClientsVersion] = useState(0);
  const [selectedClient, setClient] = useState(localStorage.getItem('kira-client') || '');
  const navigate = useNavigate();
  const location = useLocation();
  const client = new URLSearchParams(location.search).get('c') ?? selectedClient;
  useEffect(() => { localStorage.setItem('kira-client', client); setClient(client); }, [client]);
  const signedIn = useCallback((identity: User) => {
    localStorage.setItem('kira-user', identity.user); setUser(identity);
    const next = new URLSearchParams(location.search).get('next');
    if (location.pathname === '/login') navigate(next?.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
  }, [location.pathname, location.search, navigate]);
  useEffect(() => {
    const abort = new AbortController();
    // The home page is public; checking identity must not redirect a visitor away from it.
    fetch('/api/me', { signal: abort.signal, credentials: 'include' })
      .then(async response => response.ok ? response.json() as Promise<{ user: string | null; auth: boolean }> : null)
      .then(value => { if (!abort.signal.aborted && value?.user) signedIn({ user: value.user, auth: value.auth }); })
      .catch(() => {}).finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController();
    setClientsLoading(true); setClientsError('');
    api<Client[]>('/clients', { signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) setClients(value); })
      .catch(error => { if (!abort.signal.aborted) setClientsError(error.message); })
      .finally(() => { if (!abort.signal.aborted) setClientsLoading(false); });
    return () => abort.abort();
  }, [user, clientsVersion]);
  if (checking) return <main className="kira-preview kira-preview-opening"><p role="status">Opening your workspace…</p></main>;
  if (location.pathname === '/') return <Landing user={user} clients={clients} clientsLoading={clientsLoading} clientsError={clientsError} onRetryClients={() => setClientsVersion(version => version + 1)} onSignIn={() => navigate('/login')} onEnter={id => {
    localStorage.setItem('kira-client', id); setClient(id);
    navigate({ pathname: '/overview', search: new URLSearchParams({ c: id }).toString() });
  }} />;
  if (!user) return <Preview onAuthenticated={signedIn} />;
  return <Workspace key={client} user={user} clients={clients} client={client} onClient={id => {
    localStorage.setItem('kira-client', id); setClient(id);
    const params = new URLSearchParams(location.search); params.set('c', id);
    navigate({ pathname: location.pathname, search: params.toString() });
  }} onSignOut={() => { setUser(null); navigate('/login'); }} />;
}
