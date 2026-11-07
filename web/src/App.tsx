import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, GitCompareArrows, ChartNoAxesCombined, Menu } from 'lucide-react';
const Overview = lazy(() => import('./pages/overview/Overview'));
const Analysis = lazy(() => import('./pages/analysis/Analysis'));
const Insights = lazy(() => import('./pages/insights/Insights'));
const Landing = lazy(() => import('./pages/landing/Landing'));
import { api, clientPath } from './lib/api';
import { invalidateMutation, prefetchPage, prefetchWorkspace, queryClient } from './lib/query';
import {useReveal} from './lib/motion';
import { useResource } from './lib/useResource';
const ChatPanel = lazy(() => import('./kira/ChatPanel').then(module => ({default: module.ChatPanel})));
const Login = lazy(() => import('./pages/Login'));
const Workflow = lazy(() => import('./pages/workflow/Workflow'));
const Components = lazy(() => import('./pages/dev/Components'));
import { WorkspaceStatus, type WorkflowProgress } from './kira/WorkspaceStatus';
import { Empty, ErrorState, Loading } from './components';
import type { ChangeDestination, Highlight, ToolCall } from './kira/protocol';

interface User { user: string; auth: boolean }
interface Client { id: string; name: string }


function AnalysisRoute({progress}: {progress: ReturnType<typeof useResource<WorkflowProgress>>}) {
  if (progress.loading && !progress.data) return <Loading />;
  if (progress.error) return <ErrorState message={progress.error} retry={progress.retry} />;
  if (progress.data && !(progress.data.matching.l1.done && progress.data.matching.l2.done)) return <><div className="page-head"><div><h1>Match analysis</h1></div></div><WorkspaceStatus view="analysis" status={progress.data} onRefresh={progress.retry}/></>;
  return <Analysis />;
}

function Workspace({ user, client, clients, onClient, onSignOut }: { user: User; client: string; clients: Client[]; onClient: (id: string) => void; onSignOut: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const progress = useResource<WorkflowProgress>('/status');
  const [expanded, setExpanded] = useState(false);
  const pageRef=useRef<HTMLDivElement>(null), navRef=useRef<HTMLElement>(null);
  const [navMarker,setNavMarker]=useState({top:0,height:44});
  useReveal(pageRef,location.pathname);
  useLayoutEffect(() => {
    const update=()=>{const active=navRef.current?.querySelector<HTMLElement>('a.active');if(active)setNavMarker({top:active.offsetTop,height:active.offsetHeight});};
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);
  },[location.pathname,expanded]);
  const page = location.pathname.startsWith('/insights') ? 'Insights' : location.pathname.startsWith('/analysis') ? 'Match analysis' : location.pathname.startsWith('/workflow') ? 'Workflow' : 'Overview';
  const workspaceName = clients.find(item => item.id === client)?.name || 'Main workspace';
  const onDataChanged = (calls: ToolCall[], destination?: ChangeDestination) => {
    for (const call of calls) { const path = ({convert_files:'/convert', save_upload_rule:'/upload-rules', save_cleaning:'/cleaning/save', save_matching_rule:'/matching/rules', run_matching:'/matching/run', save_follow_ups:'/analysis/follow-ups', add_sample_files:'/files/samples'} as Record<string,string>)[call.tool]; if (path) void invalidateMutation(path, 'POST', client); }
    if (typeof destination === 'number') navigate(`/workflow?step=${destination}`);
    else if (destination === 'follow-up') navigate('/analysis?tab=follow');
  };
  const highlight = ({ keys, note }: Highlight) => navigate(`/analysis?${new URLSearchParams({ tab: 'map', stage: 'l2', keys: keys.join(','), highlight: note })}`);
  return <div className={`app integration-app ${expanded ? 'nav-open' : ''}`}>
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <Link to={clientPath('/overview')} className="integration-brand" aria-label="KIRA home"><span aria-hidden="true">K</span>KIRA<span aria-hidden="true">.</span></Link>
      <div className="workspace"><label htmlFor="active-workspace">Workspace<select id="active-workspace" value={client} onChange={event => onClient(event.target.value)}>{clients.length ? clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">Main workspace</option>}</select></label><Link className="workspace-switch" to="/">Switch client</Link></div>
      <nav ref={navRef} aria-label="Main navigation"><span className="nav-marker" aria-hidden="true" style={{transform:`translateY(${navMarker.top}px)`,height:navMarker.height}}/><NavLink to={clientPath('/overview')} end onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><LayoutDashboard size={18} />Overview</NavLink><NavLink to={clientPath('/workflow')} onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><GitCompareArrows size={18} />Workflow</NavLink><NavLink to={clientPath('/analysis')} onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><ChartNoAxesCombined size={18} />Match analysis</NavLink><NavLink to={clientPath('/insights')} onClick={() => setExpanded(false)} onMouseEnter={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)} onFocus={event => void prefetchPage(new URL(event.currentTarget.href).pathname, client)}><ChartNoAxesCombined size={18} />Insights</NavLink></nav>
      <div className="sidebar-bottom"><div><strong>{user.user}</strong><small>Reconciliation workspace</small></div>{user.auth && <button className="integration-sign-out" type="button" onClick={async () => { await api('/logout', { method: 'POST' }); onSignOut(); }}>Sign out</button>}</div>
    </aside>
    <div className="workspace-body">
      <header className="topbar"><div><button className="button quiet nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Menu size={20} /></button><span>{workspaceName}</span><span aria-hidden="true">/</span><strong>{page}</strong></div></header>
      <main id="main"><div className="integration-layout"><div ref={pageRef} className="integration-page" key={client}><Suspense fallback={<Loading/>}><Routes>
        <Route path="/overview" element={<Overview progress={progress} />} />
        <Route path="/workflow/*" element={<Workflow />} />
        <Route path="/analysis" element={<AnalysisRoute progress={progress} />} />
        <Route path="/insights" element={<Insights />} />
        {import.meta.env.DEV && <Route path="/dev/components" element={<Components />} />}
        <Route path="*" element={<Empty title="Page not found"><Link to={clientPath('/overview')}>Return to Overview</Link></Empty>} />
      </Routes></Suspense></div><Suspense fallback={null}><ChatPanel client={client} user={user.user} presentation="popup" context={{ page, workspace: workspaceName, outlet: new URLSearchParams(location.search).get('outlet') || '' }} onDataChanged={onDataChanged} onHighlight={highlight} onUnauthorized={onSignOut} /></Suspense></div></main>
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
  useEffect(() => { localStorage.setItem('kira-client', client); setClient(client); if (user) void prefetchWorkspace(client); }, [client, user]);
  const signedIn = useCallback((identity: User) => {
    if (localStorage.getItem('kira-user') !== identity.user) queryClient.clear();
    localStorage.setItem('kira-user', identity.user); setUser(identity);
    const next = new URLSearchParams(location.search).get('next');
    if (location.pathname === '/login') navigate(next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/', { replace: true });
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
  if (checking) return <main className="workspace-opening"><p role="status">Opening your workspace…</p></main>;
  if (location.pathname === '/') return <Suspense fallback={<Loading/>}><Landing user={user} clients={clients} clientsLoading={clientsLoading} clientsError={clientsError} onRetryClients={() => setClientsVersion(version => version + 1)} onSignIn={() => navigate('/login')} onEnter={id => {
    localStorage.setItem('kira-client', id); setClient(id);
    navigate({ pathname: '/overview', search: new URLSearchParams({ c: id }).toString() });
  }} /></Suspense>;
  if (!user) return <Suspense fallback={<Loading/>}><Login onAuthenticated={signedIn} /></Suspense>;
  return <Workspace key={client} user={user} clients={clients} client={client} onClient={id => {
    localStorage.setItem('kira-client', id); setClient(id);
    const params = new URLSearchParams(location.search); params.set('c', id);
    navigate({ pathname: location.pathname, search: params.toString() });
  }} onSignOut={() => { queryClient.clear(); setUser(null); navigate('/login'); }} />;
}
